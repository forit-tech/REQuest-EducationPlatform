/**
 * Проверки учебного движка версии 2.
 *
 * Запускаются на скомпилированном выводе `tsconfig.engine.json`, поэтому
 * проверяют ровно тот код, который поедет в сборку, а не его пересказ.
 *
 *   npm run engine:test
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as corpusModule from './quality/corpus.mjs'
import * as rulesModule from './quality/rules.mjs'

const root = resolve(import.meta.dirname, '..')
const buildDir = join(root, 'build', 'engine')
mkdirSync(buildDir, { recursive: true })
writeFileSync(join(buildDir, "package.json"), JSON.stringify({ type: "module" }), "utf8")

const load = async path => import(pathToFileURL(join(buildDir, path)).href)
const engine = { ...(await load('core/task/index.js')), ...(await load('core/tasks.js')) }
const storage = await load('core/storage.js')

let passed = 0
const failures = []
async function check(name, run) {
  try {
    await run()
    passed += 1
  } catch (error) {
    failures.push(`${name}\n    ${error.message.split('\n')[0]}`)
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

/* ---------------------------------------- 1. совместимость со старым контентом */

const courseFiles = walk(join(root, 'knowledge')).filter(path => path.endsWith('course.json'))
let missionCount = 0
let converted = 0
const conversionProblems = []
const behaviourProblems = []

for (const file of courseFiles) {
  const course = JSON.parse(readFileSync(file, 'utf8'))
  for (const mission of course.missions ?? []) {
    if (!mission.task) continue
    missionCount += 1
    const task = engine.taskFromMission(mission, course.id)
    if (!task) { conversionProblems.push(mission.id); continue }
    converted += 1

    // Правильный ответ старой миссии обязан проходить и в новой модели.
    const correctIndex = (mission.task.options ?? []).findIndex(option => option.trim() === mission.task.answer.trim())
    const correctOption = correctIndex >= 0 ? [`option-${correctIndex + 1}`] : []
    const starter = mission.task.starterCode ?? ''
    const solved = (mission.task.codeChecks ?? []).reduce(
      (code, check) => code.includes(check.includes) ? code : `${code}\n${check.includes}`,
      starter,
    )

    let value
    if (task.response.kind === 'form') {
      const fields = {}
      for (const field of task.response.fields) {
        if (field.id === 'hypothesis') fields.hypothesis = { kind: 'choice', selected: correctOption }
        if (field.id === 'code') fields.code = { kind: 'code', files: { [mission.task.workspaceFile ?? 'solution.py']: solved } }
      }
      value = { kind: 'form', fields }
    } else if (task.response.kind === 'choice') {
      value = { kind: 'choice', selected: correctOption }
    } else {
      value = { kind: 'text', value: mission.task.answer }
    }

    const result = engine.evaluate(task, value)
    if (!result.passed) behaviourProblems.push(`${mission.id}: верный ответ не прошёл (${result.status})`)

    // И наоборот: заведомо неверный ответ проходить не должен.
    if (task.response.kind === 'choice' && task.response.options.length > 1) {
      const wrongId = task.response.options.map(option => option.id).find(id => !correctOption.includes(id))
      const wrong = engine.evaluate(task, { kind: 'choice', selected: [wrongId] })
      if (wrong.passed) behaviourProblems.push(`${mission.id}: неверный ответ засчитан`)
    }
  }
}

console.log(`Старый контент: курсов ${courseFiles.length}, заданий ${missionCount}, переведено ${converted}, расхождений поведения ${behaviourProblems.length}`)

await check(`адаптер переводит все старые задания (${missionCount})`, () => {
  assert.equal(conversionProblems.length, 0, `не переведены: ${conversionProblems.slice(0, 5).join(', ')}`)
  assert.equal(converted, missionCount)
})
await check('поведение проверки совпадает со старым на всём корпусе', () => {
  assert.deepEqual(behaviourProblems.slice(0, 5), [], `расхождений: ${behaviourProblems.length}`)
})

await check('кодовая миссия требует и гипотезу, и код — как раньше', () => {
  const mission = {
    id: 'TECH-015', title: 'Первый расчёт', type: 'lab', minutes: 1, xp: 1, difficulty: 'начальный',
    task: {
      prompt: 'Посчитай', answer: 'Умножение даёт число', explanation: '…',
      workspaceFile: 'solution.py', starterCode: 'per_day = 12500\n',
      options: ['Умножение даёт число', 'Числа в кавычках'],
      codeChecks: [{ label: 'умножение', includes: '*' }, { label: 'вывод', includes: 'print(' }],
    },
  }
  const task = engine.taskFromMission(mission, 'technical-foundations')
  const code = { kind: 'code', files: { 'solution.py': 'per_week = per_day*7\nprint(per_week)' } }
  const both = engine.evaluate(task, { kind: 'form', fields: { hypothesis: { kind: 'choice', selected: ['option-1'] }, code } })
  const onlyCode = engine.evaluate(task, { kind: 'form', fields: { hypothesis: { kind: 'choice', selected: ['option-2'] }, code } })
  assert.equal(both.passed, true)
  assert.equal(onlyCode.passed, false)
})

await check('идентификатор миссии уникален во всём корпусе', () => {
  const seen = new Map()
  const clashes = []
  for (const file of courseFiles) {
    const course = JSON.parse(readFileSync(file, 'utf8'))
    for (const mission of course.missions ?? []) {
      if (seen.has(mission.id)) clashes.push(`${mission.id}: ${seen.get(mission.id)} и ${course.id}`)
      else seen.set(mission.id, course.id)
    }
  }
  assert.deepEqual(clashes, [], 'прогресс хранится по идентификатору: совпадение засчитывает одну миссию вместо другой')
})

await check('прохождение одной миссии не засчитывает другую', () => {
  const byId = new Map()
  for (const file of courseFiles) {
    const course = JSON.parse(readFileSync(file, 'utf8'))
    for (const mission of course.missions ?? []) byId.set(mission.id, (byId.get(mission.id) ?? 0) + 1)
  }
  // Разведённые курсы: раньше оба использовали PDA-001.
  assert.equal(byId.get('PDA-001'), 1, 'PDA-001 должен принадлежать ровно одному курсу')
  assert.equal(byId.get('PDB-001'), 1, 'переименованная миссия должна существовать под новым идентификатором')
  const progress = ['PDA-001']
  const completed = [...byId.keys()].filter(id => progress.includes(id))
  assert.deepEqual(completed, ['PDA-001'], 'одна запись прогресса закрывает ровно одну миссию')
})

await check('карта переименований описывает, что произошло с прогрессом', () => {
  const aliases = JSON.parse(readFileSync(join(root, 'knowledge/migrations/mission-id-aliases.json'), 'utf8'))
  const rename = aliases.renames[0]
  assert.equal(Object.keys(rename.renamed.map).length, 13)
  assert.equal(rename.canonical.course, 'pandas')
  assert.ok(rename.progressMigration.why.length > 40, 'решение по прогрессу должно быть объяснено, а не просто выполнено')
})

/* ------------------------------------------------ 2. представительные задания */

const fixtures = JSON.parse(readFileSync(join(root, 'knowledge/tasks/fixtures/representative.json'), 'utf8'))

await check(`представительных заданий загружено (${fixtures.length})`, () => {
  assert.ok(fixtures.length >= 10)
  const kinds = new Set(fixtures.map(task => task.response.kind))
  const evaluations = new Set(fixtures.map(task => task.evaluation.type))
  assert.ok(kinds.size >= 4, `форм ответа: ${[...kinds]}`)
  assert.ok(evaluations.size >= 4, `видов проверки: ${[...evaluations]}`)
})

await check('каждое задание объявляет измерения освоения и разбор', () => {
  for (const task of fixtures) {
    assert.ok(task.evidences?.length, `${task.id}: нет evidences`)
    assert.ok(task.explanation?.length > 20, `${task.id}: нет разбора`)
    assert.ok(task.topicId && task.skills?.length, `${task.id}: нет темы или навыков`)
  }
})

// Заведомо невалидные задания лежат отдельно: валидатор качества их не
// проверяет, но движок обязан вести себя с ними правильно.
const invalidFixtures = JSON.parse(readFileSync(join(root, 'knowledge/tasks/invalid-fixtures/expected-violations.json'), 'utf8')).tasks
const byId = Object.fromEntries([...fixtures, ...invalidFixtures].map(task => [task.id, task]))
console.log(`Представительные задания: ${fixtures.length}, форм ответа ${new Set(fixtures.map(t => t.response.kind)).size}, видов проверки ${new Set(fixtures.map(t => t.evaluation.type)).size}`)

await check('собственные числа: порядок не важен, допуск работает', () => {
  const task = byId['fx-eigenvalues']
  assert.equal(engine.evaluate(task, { kind: 'numeric', values: { lambda1: '3', lambda2: '1' } }).passed, true)
  assert.equal(engine.evaluate(task, { kind: 'numeric', values: { lambda1: '1', lambda2: '3' } }).passed, true)
  assert.equal(engine.evaluate(task, { kind: 'numeric', values: { lambda1: '2,9999', lambda2: '1' } }).passed, true)
  assert.equal(engine.evaluate(task, { kind: 'numeric', values: { lambda1: '4', lambda2: '0' } }).passed, false)
})

await check('дробь и запятая читаются как число', () => {
  assert.equal(engine.parseNumber('3/4'), 0.75)
  assert.equal(engine.parseNumber('0,75'), 0.75)
  assert.equal(engine.parseNumber('−0.75'), -0.75)
  assert.deepEqual(engine.parseVector('[1, 2, 3]'), [1, 2, 3])
})

await check('составное задание складывает поля с весами', () => {
  const task = byId['fx-viterbi-step']
  const full = engine.evaluate(task, {
    kind: 'form',
    fields: {
      delta: { kind: 'numeric', values: { rain: '0.54', sun: '0.08' } },
      argmax: { kind: 'choice', selected: ['rain'] },
    },
  })
  assert.equal(full.passed, true)
  const partial = engine.evaluate(task, {
    kind: 'form',
    fields: {
      delta: { kind: 'numeric', values: { rain: '0.54', sun: '0.9' } },
      argmax: { kind: 'choice', selected: ['rain'] },
    },
  })
  assert.equal(partial.passed, false)
  assert.ok(partial.score > 0 && partial.score < 1)
})

await check('ошибка в δ указывает на условную вероятность, а не на сам Витерби', () => {
  const task = byId['fx-viterbi-step']
  const result = engine.evaluate(task, {
    kind: 'form',
    fields: { delta: { kind: 'numeric', values: { rain: '0.1', sun: '0.1' } }, argmax: { kind: 'choice', selected: ['rain'] } },
  })
  assert.ok(result.diagnosedSkills.includes('conditional-probability'), JSON.stringify(result.diagnosedSkills))
})

await check('формула ELBO сверяется без оглядки на оформление', () => {
  assert.equal(
    engine.normalizeExpression('\\mathbb{E}_q[\\log p(x|z)] - D_{KL}(q(z|x)\\|p(z))', { '\\mathbb{E}': 'E', 'D_{KL}': 'KL', '\\|': '||' }),
    engine.normalizeExpression('E_q[\\log p(x|z)] - KL(q(z|x)||p(z))'),
  )
})

await check('порядок стадий MapReduce проверяется по местам', () => {
  const task = byId['fx-mapreduce-order']
  const order = ['split', 'map', 'combine', 'shuffle', 'reduce']
  const good = engine.evaluate(task, {
    kind: 'form',
    fields: { stages: { kind: 'ordering', order }, shuffle: { kind: 'text', value: 'Пары группируются по ключу и едут по сети к нужному узлу.' } },
  })
  assert.equal(good.passed, true)
  const swapped = ['split', 'map', 'shuffle', 'combine', 'reduce']
  const bad = engine.evaluate(task, {
    kind: 'form',
    fields: { stages: { kind: 'ordering', order: swapped }, shuffle: { kind: 'text', value: 'Пары группируются по ключу и едут по сети.' } },
  })
  assert.equal(bad.passed, false)
})

await check('предсказание вывода: одно значение, свободная запись', () => {
  const task = byId['fx-output-prediction']
  assert.equal(engine.evaluate(task, { kind: 'text', value: '104' }).passed, true)
  assert.equal(engine.evaluate(task, { kind: 'text', value: '6' }).passed, false)
  assert.ok(engine.evaluate(task, { kind: 'text', value: '6' }).diagnosedSkills.includes('references'))
})

/* -------------------------------------------------- 3. код и отсутствие песочницы */

await check('задание с тестами не засчитывается без песочницы', () => {
  const task = byId['fx-aho-corasick']
  const result = engine.evaluate(task, { kind: 'code', files: { 'solution.py': 'def find_all(text, patterns):\n    return []' } })
  assert.equal(result.status, 'needs-runtime')
  assert.equal(result.passed, false, 'статические проверки не должны выдаваться за тесты')
})

await check('скрытый тест не раскрывает вход', () => {
  const task = byId['fx-aho-corasick']
  const result = engine.evaluate(task, { kind: 'code', files: { 'solution.py': 'def find_all(t, p):\n    return []' } })
  const hidden = result.checks.filter(item => item.hidden)
  assert.ok(hidden.length >= 1)
  assert.ok(hidden.every(item => !item.label.includes('ahishers')))
})

await check('поиск ошибки: запрещённый фрагмент валит проверку', () => {
  const task = byId['fx-debug-gradient']
  const broken = engine.evaluate(task, { kind: 'code', files: { 'descent.py': 'x = x + lr * gradient' } })
  assert.equal(broken.checks.find(item => item.id === 'static-1').passed, false)
  const fixed = engine.evaluate(task, { kind: 'code', files: { 'descent.py': 'x = x - lr * gradient' } })
  assert.equal(fixed.checks.find(item => item.id === 'static-0').passed, true)
  assert.equal(fixed.checks.find(item => item.id === 'static-1').passed, true)
})

/* ------------------------------------------------------- 4. устный ответ и рубрика */

await check('устный билет: сначала ответ, потом сверка', () => {
  const task = byId['fx-oral-backprop']
  const waiting = engine.evaluate(task, { kind: 'text', value: 'Длинный ответ про сеть…' })
  assert.equal(waiting.status, 'awaiting-self-assessment')
  const assessed = engine.evaluate(task, {
    kind: 'self-assessment',
    text: 'Длинный ответ про сеть…',
    covered: ['forward', 'chain', 'graph', 'update'],
  })
  assert.equal(assessed.passed, true)
  assert.equal(assessed.evidence, 'weak', 'самооценка не может быть сильным свидетельством')
})

await check('совпадение понятий — тоже слабое свидетельство', () => {
  const task = byId['fx-post-completeness']
  const result = engine.evaluate(task, {
    kind: 'form',
    fields: {
      verdict: { kind: 'choice', selected: ['yes'] },
      classes: { kind: 'choice', selected: ['t0', 't1', 's', 'm', 'l'] },
      why: { kind: 'text', value: 'По критерию Поста нужно выйти из каждого замкнутого класса, и отрицание это обеспечивает.' },
    },
  })
  assert.equal(result.passed, true)
  assert.equal(result.evidence, 'weak')
})

/* --------------------------------------------- 5. граф навыков и реестр требований */

const registry = JSON.parse(readFileSync(join(root, 'knowledge/skills/registry.json'), 'utf8'))
const graph = engine.skillGraph(registry.skills)

const admissionFiles = readdirSync(join(root, 'knowledge/admissions')).filter(name => name.endsWith('.json'))
const admissionRefs = new Set()
const trackRequirements = {}
for (const name of admissionFiles) {
  const doc = JSON.parse(readFileSync(join(root, 'knowledge/admissions', name), 'utf8'))
  const ids = [
    ...(doc.sections ?? []).flatMap(section => section.questions.map(question => question.id)),
    ...(doc.requirementAreas ?? []).map(area => area.id),
  ]
  trackRequirements[doc.id] = ids
  for (const id of ids) admissionRefs.add(`${doc.id}:${id}`)
}
const ITMO = 'itmo-deep-learning-genai-2026'
console.log(`Навыки: ${registry.skills.length}, официальных требований в реестре: ${admissionRefs.size}`)

await check('граф навыков связный: все предпосылки существуют', () => {
  for (const node of registry.skills) {
    for (const id of node.prerequisites) assert.ok(graph[id], `${node.id}: предпосылка ${id} не найдена`)
  }
})

await check('граф навыков без циклов', () => {
  for (const node of registry.skills) {
    assert.ok(!engine.prerequisiteChain(graph, node.id).includes(node.id), `цикл через ${node.id}`)
  }
})

await check('знание — граф, а не дерево: у навыка бывает несколько оснований', () => {
  assert.deepEqual(graph['viterbi'].prerequisites.slice().sort(), ['dynamic-programming', 'hmm'])
  assert.deepEqual(graph['pca'].prerequisites.slice().sort(), ['covariance', 'eigenvalues'])
  assert.deepEqual(graph['aho-corasick'].prerequisites.slice().sort(), ['bfs', 'trie'])
  // Одно основание ведёт в два разных навыка — деревом это не выражается.
  const dependents = registry.skills.filter(node => node.prerequisites.includes('eigenvalues')).map(node => node.id)
  assert.deepEqual(dependents.slice().sort(), ['pca', 'svd'])
})

await check('одно задание проверяет несколько навыков с разной силой', () => {
  const task = byId['fx-viterbi-step']
  const ids = task.skills.map(item => item.skillId).slice().sort()
  assert.deepEqual(ids, ['conditional-probability', 'dynamic-programming', 'hmm', 'viterbi'])
  assert.equal(task.skills.find(item => item.skillId === 'viterbi').role, 'primary')
  assert.equal(task.skills.find(item => item.skillId === 'dynamic-programming').role, 'secondary')
})

await check('все навыки заданий есть в реестре, ссылки на требования валидны', () => {
  const problems = engine.validateTasks(
    fixtures.filter(task => !task.id.startsWith('fx-fake') && !task.id.startsWith('fx-invalid')),
    { skills: graph, admissionRefs },
  ).filter(problem => problem.severity === 'error')
  assert.deepEqual(problems, [], JSON.stringify(problems.slice(0, 3)))
})

/* ------------------------------------------------------------------ 6. освоение */

function correctAnswer(id) {
  switch (id) {
    case 'fx-eigenvalues': return { kind: 'numeric', values: { lambda1: '3', lambda2: '1' } }
    case 'fx-viterbi-step': return { kind: 'form', fields: { delta: { kind: 'numeric', values: { rain: '0.54', sun: '0.08' } }, argmax: { kind: 'choice', selected: ['rain'] } } }
    case 'fx-oral-backprop': return { kind: 'self-assessment', text: 'ответ', covered: ['forward', 'chain', 'graph', 'update'] }
    case 'fx-professional-rag': return { kind: 'choice', selected: ['rerank'] }
    case 'fx-fake-exam-no-ref': return { kind: 'text', value: 'Реестр хранит версии моделей.' }
    case 'fx-invalid-admission-ref': return { kind: 'self-assessment', text: 'ответ', covered: ['criteria'] }
    default: throw new Error(`нет эталонного ответа для ${id}`)
  }
}
const passOf = id => engine.evaluate(byId[id], correctAnswer(id))

await check('сюжет не двигает освоение', () => {
  const book = engine.emptyMastery()
  // Функции «отметить сцену просмотренной» не существует: единственный вход —
  // попытка задания. Пустой журнал остаётся пустым.
  assert.deepEqual(book.attempts, [])
  assert.equal(engine.skillScore(book, 'viterbi'), 0)
  assert.equal(engine.skillReport(book, 'viterbi').confidence, 'none')
})

await check('сырая попытка сохраняется целиком, а не как «прошёл или нет»', () => {
  const task = byId['fx-viterbi-step']
  const partial = engine.evaluate(task, {
    kind: 'form',
    fields: { delta: { kind: 'numeric', values: { rain: '0.54', sun: '0.9' } }, argmax: { kind: 'choice', selected: ['rain'] } },
  })
  const book = engine.recordAttempt(engine.emptyMastery(), task, partial, { at: '2026-09-02T10:00:00Z' })
  assert.equal(book.attempts.length, 1)
  const record = book.attempts[0]
  assert.equal(record.taskId, 'fx-viterbi-step')
  assert.equal(record.passed, false)
  assert.ok(record.score > 0 && record.score < 1, `частичный балл потерян: ${record.score}`)
  assert.equal(record.evidence, 'strong')
  assert.equal(record.intent, 'calculation')
  assert.deepEqual(record.dimensions.slice().sort(), ['calculation', 'understanding'])
  assert.equal(record.skills.length, 4)
  assert.equal(record.at, '2026-09-02T10:00:00Z')
})

await check('побочное свидетельство весит меньше прямого', () => {
  const book = engine.recordAttempt(engine.emptyMastery(), byId['fx-viterbi-step'], passOf('fx-viterbi-step'))
  assert.equal(engine.skillReport(book, 'viterbi').weight, 1)
  assert.equal(engine.skillReport(book, 'dynamic-programming').weight, 0.4)
  assert.equal(engine.skillReport(book, 'viterbi').confidence, 'low')
})

await check('уверенность растёт по накопленному весу свидетельств', () => {
  let book = engine.emptyMastery()
  for (let index = 0; index < 6; index += 1) book = engine.recordAttempt(book, byId['fx-viterbi-step'], passOf('fx-viterbi-step'))
  assert.equal(engine.skillReport(book, 'viterbi').confidence, 'high')
  // Шесть побочных упоминаний дают вес 2.4 — этого мало для высокой уверенности.
  assert.equal(engine.skillReport(book, 'dynamic-programming').confidence, 'low')
})

await check('слабое свидетельство не создаёт высокой уверенности', () => {
  let book = engine.emptyMastery()
  for (let index = 0; index < 8; index += 1) {
    book = engine.recordAttempt(book, byId['fx-oral-backprop'], passOf('fx-oral-backprop'), { admissionRegistry: admissionRefs })
  }
  const report = engine.skillReport(book, 'backprop')
  assert.equal(report.attempts, 8)
  assert.ok(report.score > 0.8, `балл ${report.score}`)
  assert.equal(report.confidence, 'low', 'восемь самооценок не делают освоение доказанным')
})

await check('сюжет пройден, а навык — нет: такое состояние выражается', () => {
  const task = byId['fx-eigenvalues']
  const fail = engine.evaluate(task, { kind: 'numeric', values: { lambda1: '4', lambda2: '0' } })
  let book = engine.emptyMastery()
  book = engine.recordAttempt(book, task, fail)
  book = engine.recordAttempt(book, task, fail)
  book = engine.recordAttempt(book, task, passOf('fx-eigenvalues'))
  const report = engine.skillReport(book, 'eigenvalues')
  assert.ok(report.score > 0 && report.score < 0.5, `освоение ${report.score}`)
  assert.equal(report.weak, true)
})

/* ------------------------------------------ 7. готовность к поступлению */

await check('устный билет со ссылкой закрывает требование ИТМО', () => {
  const book = engine.recordAttempt(engine.emptyMastery(), byId['fx-oral-backprop'], passOf('fx-oral-backprop'), { admissionRegistry: admissionRefs })
  const readiness = engine.readinessFor(book, ITMO, ['ITMO-DL-ML-14', 'ITMO-DL-ML-15', 'ITMO-DL-ML-22'])
  assert.equal(readiness.covered, 2)
  assert.equal(readiness.total, 3)
  assert.deepEqual(readiness.uncovered, ['ITMO-DL-ML-22'])
  assert.deepEqual(readiness.weakOnly, ['ITMO-DL-ML-14', 'ITMO-DL-ML-15'], 'самооценка должна быть помечена как слабое покрытие')
})

await check('профессиональная задача не поднимает готовность к ИТМО', () => {
  const book = engine.recordAttempt(engine.emptyMastery(), byId['fx-professional-rag'], passOf('fx-professional-rag'), { admissionRegistry: admissionRefs })
  assert.deepEqual(book.attempts[0].admissionRefs, [])
  assert.equal(engine.readinessFor(book, ITMO, trackRequirements[ITMO]).covered, 0)
})

await check('поддельный intent exam без ссылки готовность не поднимает', () => {
  const task = byId['fx-fake-exam-no-ref']
  const book = engine.recordAttempt(engine.emptyMastery(), task, passOf('fx-fake-exam-no-ref'), { admissionRegistry: admissionRefs })
  assert.deepEqual(engine.acceptedAdmissionRefs(task, admissionRefs), [])
  assert.deepEqual(book.attempts[0].admissionRefs, [])
  assert.equal(engine.readinessFor(book, ITMO, trackRequirements[ITMO]).covered, 0)
})

await check('несуществующая ссылка на требование отбрасывается и ловится валидатором', () => {
  const task = byId['fx-invalid-admission-ref']
  assert.deepEqual(engine.acceptedAdmissionRefs(task, admissionRefs), [])
  const problems = engine.validateTask(task, { skills: graph, admissionRefs })
  assert.ok(problems.some(problem => problem.code === 'unknown-admission-ref' && problem.severity === 'error'), JSON.stringify(problems))
})

await check('валидатор ругается на экзаменационное задание без ссылки', () => {
  const problems = engine.validateTask(byId['fx-fake-exam-no-ref'], { skills: graph, admissionRefs })
  assert.ok(problems.some(problem => problem.code === 'exam-without-ref' && problem.severity === 'error'), JSON.stringify(problems))
})

await check('валидатор ловит нулевой вес поля и неизвестный навык', () => {
  const broken = {
    ...byId['fx-eigenvalues'],
    skills: [{ skillId: 'skill-which-does-not-exist', role: 'primary' }],
    response: { kind: 'form', fields: [{ id: 'a', label: 'A', weight: 0, response: { kind: 'text' }, evaluation: { type: 'text', accept: [] } }] },
  }
  const codes = engine.validateTask(broken, { skills: graph, admissionRefs }).map(problem => problem.code)
  assert.ok(codes.includes('unknown-skill'), codes.join(', '))
  assert.ok(codes.includes('zero-field-weight'), codes.join(', '))
})

await check('готовность считается покрытием требований, а не средним баллом', () => {
  let book = engine.emptyMastery()
  // Десять успешных попыток по одному вопросу не закрывают весь список.
  for (let index = 0; index < 10; index += 1) {
    book = engine.recordAttempt(book, byId['fx-oral-backprop'], passOf('fx-oral-backprop'), { admissionRegistry: admissionRefs })
  }
  const readiness = engine.readinessFor(book, ITMO, trackRequirements[ITMO])
  assert.equal(readiness.covered, 2)
  assert.ok(readiness.score < 0.05, `готовность ${readiness.score} по 87 вопросам`)
})

/* --------------------------------------------- 8. предпосылки и адресная доработка */

await check('после ошибки предлагается основание, а не тот же вопрос', () => {
  const task = byId['fx-viterbi-step']
  const result = engine.evaluate(task, {
    kind: 'form',
    fields: { delta: { kind: 'numeric', values: { rain: '0.1', sun: '0.1' } }, argmax: { kind: 'choice', selected: ['rain'] } },
  })
  const plan = engine.remediationFor(task, result, graph, engine.emptyMastery())
  assert.equal(plan[0].skillId, 'conditional-probability')
  assert.equal(plan[0].reason, 'diagnosed')
  assert.ok(plan.every(item => item.skillId !== 'viterbi'), 'доработка не должна возвращать в тот же навык')
})

await check('диагностика отправляет в самое слабое основание, а не в тему целиком', () => {
  // Ровно сценарий: Витерби завален, но HMM и условная вероятность освоены,
  // а динамическое программирование — нет. Идти нужно в DP.
  let book = engine.emptyMastery()
  const strong = { status: 'passed', passed: true, score: 1, evidence: 'strong', checks: [], diagnosedSkills: [] }
  const weak = { status: 'failed', passed: false, score: 0.2, evidence: 'strong', checks: [], diagnosedSkills: [] }
  const fake = (id, skillId) => ({ ...byId['fx-eigenvalues'], id, intent: 'practice', skills: [{ skillId, role: 'primary' }] })
  for (let index = 0; index < 4; index += 1) {
    book = engine.recordAttempt(book, fake('t-hmm', 'hmm'), strong)
    book = engine.recordAttempt(book, fake('t-cond', 'conditional-probability'), strong)
    book = engine.recordAttempt(book, fake('t-dp', 'dynamic-programming'), weak)
  }
  assert.ok(engine.skillScore(book, 'hmm') > 0.9)
  assert.ok(engine.skillScore(book, 'conditional-probability') > 0.9)
  assert.ok(engine.skillScore(book, 'dynamic-programming') < 0.4)

  const failed = { status: 'failed', passed: false, score: 0, evidence: 'strong', checks: [], diagnosedSkills: [] }
  const plan = engine.remediationFor(byId['fx-viterbi-step'], failed, graph, book)
  assert.equal(plan[0].skillId, 'dynamic-programming', JSON.stringify(plan.map(item => [item.skillId, item.score])))
})

await check('непроверенное основание отмечается отдельно от слабого', () => {
  const failed = { status: 'failed', passed: false, score: 0, evidence: 'strong', checks: [], diagnosedSkills: [] }
  const plan = engine.remediationFor(byId['fx-aho-corasick'], failed, graph, engine.emptyMastery())
  assert.ok(plan.every(item => item.reason === 'unknown-prerequisite'), JSON.stringify(plan))
  assert.deepEqual(plan.map(item => item.skillId).slice().sort(), ['bfs', 'complexity', 'trie'])
})

await check('вводные ступени не запираются, продвинутые — запираются', () => {
  const book = engine.emptyMastery()
  assert.equal(engine.isUnlocked({ ...byId['fx-eigenvalues'], difficulty: 'L1' }, graph, book), true)
  assert.equal(engine.isUnlocked(byId['fx-viterbi-step'], graph, book), false)
})

await check('сокращённый путь открывается только уверенно освоенному навыку', () => {
  let book = engine.emptyMastery()
  assert.equal(engine.canSkipBasics(book, 'eigenvalues'), false)
  for (let index = 0; index < 6; index += 1) book = engine.recordAttempt(book, byId['fx-eigenvalues'], passOf('fx-eigenvalues'))
  assert.equal(engine.canSkipBasics(book, 'eigenvalues'), true)
})

/* ------------------------------------------------- 9. окружение и представление */

await check('окружение выводится из формы ответа, а не из типа миссии', () => {
  assert.equal(engine.resolveEnvironment({ ...byId['fx-eigenvalues'], environment: undefined }), 'none')
  assert.equal(engine.resolveEnvironment({ ...byId['fx-aho-corasick'], environment: undefined }), 'editor')
  assert.equal(engine.resolveEnvironment({ ...byId['fx-post-completeness'], environment: undefined }), 'none')
})

await check('составное задание с кодом внутри требует редактор', () => {
  const task = {
    ...byId['fx-post-completeness'],
    environment: undefined,
    response: {
      kind: 'form',
      fields: [
        { id: 'a', label: 'Выбор', response: { kind: 'choice', select: 'one', options: [{ id: 'x', text: 'x' }] }, evaluation: { type: 'choice', correct: ['x'] } },
        { id: 'b', label: 'Код', response: { kind: 'code', entry: 'a.py', files: [{ path: 'a.py', language: 'python', content: '', editable: true }] }, evaluation: { type: 'legacy-substring', checks: [] } },
      ],
    },
  }
  assert.equal(engine.resolveEnvironment(task), 'editor')
})

await check('у каждой формы ответа есть renderer и пустое значение нужной формы', () => {
  for (const task of fixtures) {
    assert.ok(engine.rendererFor[task.response.kind], `${task.id}: нет renderer`)
    assert.equal(engine.emptyResponse(task.response).kind, task.response.kind, `${task.id}: пустой ответ не той формы`)
  }
})

await check('пустой ввод не отправляется на проверку', () => {
  assert.equal(engine.isAnswered({ kind: 'choice', selected: [] }), false)
  assert.equal(engine.isAnswered({ kind: 'numeric', values: { a: '  ' } }), false)
  assert.equal(engine.isAnswered({ kind: 'text', value: '' }), false)
  assert.equal(engine.isAnswered({ kind: 'code', files: { 'a.py': '\n' } }), false)
  // Заготовка кода — уже ответ: человеку есть что отправить и что исправить.
  assert.equal(engine.isAnswered(engine.emptyResponse(byId['fx-aho-corasick'].response)), true)
})

/* ------------------------------------------------------------- 10. сохранения */

await check('сохранение первой версии открывается и получает пустой журнал освоения', () => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  }
  const old = {
    version: 1,
    users: [{ id: 'local-alex', displayName: 'Алексей', username: 'alex_data', email: 'a@b.c', passwordHash: 'x', emailNotifications: false, telegramNotifications: false, desktopNotifications: false, createdAt: '2026-01-01T00:00:00Z' }],
    sessionUserId: 'local-alex', rememberSession: true, sessionChosen: true, theme: 'future',
    progress: { 'local-alex': { xp: 2480, streak: 12, currentRoomId: 'technical-foundations', completedMissionIds: ['py-1', 'pd-2'], attempts: {}, updatedAt: '2026-01-01T00:00:00Z' } },
  }
  store.set('request.local-state.v1', JSON.stringify(old))

  const progress = storage.getProgress('local-alex')
  assert.deepEqual(progress.completedMissionIds, ['py-1', 'pd-2'], 'прохождение не должно теряться')
  assert.equal(progress.xp, 2480)
  assert.deepEqual(engine.normalizeMastery(storage.getMastery('local-alex')).attempts, [])

  const saved = JSON.parse(store.get('request.local-state.v1'))
  assert.equal(saved.version, storage.STATE_VERSION)
  assert.ok(saved.mastery, 'миграция должна создать раздел освоения')

  const book = engine.recordAttempt(engine.emptyMastery(), byId['fx-eigenvalues'], passOf('fx-eigenvalues'))
  storage.saveMastery('local-alex', book)
  assert.equal(storage.getMastery('local-alex').attempts.length, 1)
  assert.deepEqual(storage.getProgress('local-alex').completedMissionIds, ['py-1', 'pd-2'])
  delete globalThis.localStorage
})

await check('журнал ограничен, и усечение видно наружу', () => {
  let book = engine.emptyMastery()
  const record = passOf('fx-eigenvalues')
  for (let index = 0; index < engine.MAX_ATTEMPTS + 50; index += 1) book = engine.recordAttempt(book, byId['fx-eigenvalues'], record)
  assert.equal(book.attempts.length, engine.MAX_ATTEMPTS)
  assert.equal(book.droppedAttempts, 50, 'потерянные попытки обязаны быть посчитаны')
  const info = engine.historyInfo(book)
  assert.equal(info.truncated, true)
  assert.equal(info.dropped, 50)
  assert.equal(info.retained, engine.MAX_ATTEMPTS)
  assert.ok(info.oldestRetainedAt, 'должна быть видна граница сохранённой истории')
})

await check('нетронутый журнал не выдаёт себя за усечённый', () => {
  const book = engine.recordAttempt(engine.emptyMastery(), byId['fx-eigenvalues'], passOf('fx-eigenvalues'))
  const info = engine.historyInfo(book)
  assert.equal(info.truncated, false)
  assert.equal(info.dropped, 0)
  assert.equal(info.retained, 1)
})

/* ---------------------------------- C.1 целостность и разделение периметров */

await check('покрытие программы не считается по тестовым фикстурам', () => {
  const { loadCorpus } = corpusModule
  const { admissionCoverage } = rulesModule
  const corpus = loadCorpus(root)
  assert.equal(corpus.productionTasks.length, 0, 'настоящего учебного материала пока нет')
  assert.ok(corpus.v2Tasks.length > 0, 'фикстуры при этом загружены и проверяются')
  const covered = admissionCoverage(corpus).filter(item => item.status !== 'uncovered')
  assert.deepEqual(covered, [], 'фикстуры не должны закрывать ни одного требования вуза')
})

await check('сто безупречных экзаменационных фикстур не двигают покрытие программы', () => {
  const { admissionCoverage } = rulesModule
  const { loadCorpus } = corpusModule
  const corpus = loadCorpus(root)
  const official = corpus.requirements.filter(item => item.official).slice(0, 100)
  const perfect = official.map((requirement, index) => ({
    path: 'knowledge/tasks/fixtures/synthetic.json',
    scope: 'fixture',
    task: {
      id: `synthetic-${index}`, intent: 'oral-exam', difficulty: 'L4', prompt: 'Раскройте вопрос',
      explanation: 'Разбор достаточной длины для валидатора',
      topicId: 'synthetic', skills: [{ skillId: 'backprop', role: 'primary' }], evidences: ['reasoning'],
      admissionRefs: [requirement.ref],
      response: { kind: 'text', multiline: true },
      evaluation: { type: 'rubric', mode: 'self-assessment', passScore: 0.5, criteria: [{ id: 'a', criterion: 'A', weight: 1, requiredConcepts: ['x'] }] },
    },
  }))
  const withFixtures = { ...corpus, v2Tasks: [...corpus.v2Tasks, ...perfect], productionTasks: corpus.productionTasks }
  const covered = admissionCoverage(withFixtures).filter(item => item.status !== 'uncovered')
  assert.equal(covered.length, 0, `фикстуры закрыли ${covered.length} требований, а должны ноль`)

  // И обратное: тот же материал в периметре production покрытие даёт.
  const asProduction = { ...corpus, productionTasks: perfect.map(entry => ({ ...entry, scope: 'production' })) }
  const realCoverage = admissionCoverage(asProduction).filter(item => item.status === 'exam-ready')
  assert.equal(realCoverage.length, official.length, 'тот же материал в периметре production обязан закрывать требования')
  assert.ok(official.length >= 87, `официальных вопросов ${official.length}`)
})

await check('готовность человека не засчитывается вне программы обучения', () => {
  const task = byId['fx-oral-backprop']
  const book = engine.recordAttempt(engine.emptyMastery(), task, passOf('fx-oral-backprop'), { admissionRegistry: admissionRefs })

  // Программа этому пункту пока не учит: подтверждать нечего.
  const withoutCurriculum = engine.readinessFor(book, ITMO, ['ITMO-DL-ML-14'], { curriculumCovered: new Set() })
  assert.equal(withoutCurriculum.covered, 0)
  assert.deepEqual(withoutCurriculum.outsideCurriculum, ['ITMO-DL-ML-14'])

  // Как только в программе появляется материал, та же попытка засчитывается.
  const withCurriculum = engine.readinessFor(book, ITMO, ['ITMO-DL-ML-14'], { curriculumCovered: new Set([`${ITMO}:ITMO-DL-ML-14`]) })
  assert.equal(withCurriculum.covered, 1)
  assert.deepEqual(withCurriculum.outsideCurriculum, [])
})

await check('покрытие программы и готовность человека — разные величины', () => {
  const curriculum = new Set([`${ITMO}:ITMO-DL-ML-14`, `${ITMO}:ITMO-DL-ML-22`])
  const empty = engine.emptyMastery()
  // Программа закрывает два пункта, человек не решал ничего.
  const readiness = engine.readinessFor(empty, ITMO, ['ITMO-DL-ML-14', 'ITMO-DL-ML-22'], { curriculumCovered: curriculum })
  assert.equal(readiness.covered, 0, 'наличие уроков не делает человека готовым')
  assert.equal(curriculum.size, 2, 'при этом программа их закрывает')
})

await check('C6 не заявляет гарантий, которых пока не даёт', () => {
  // Известный пробел: без упорядоченной программы нельзя проверить, что навык
  // объяснён до того, как его потребовали. Здесь задание опирается на навык,
  // которому нигде не учат, и валидатор этого НЕ ловит — и не притворяется.
  const { runRules } = rulesModule
  const corpus = corpusModule.loadCorpus(root)
  const task = {
    id: 'requires-untaught', intent: 'practice', difficulty: 'L2',
    prompt: 'Реализуйте свёртку', explanation: 'Разбор достаточной длины для валидатора',
    topicId: 'cv', skills: [{ skillId: 'aho-corasick', role: 'primary' }], evidences: ['coding'],
    response: { kind: 'text' }, evaluation: { type: 'text', accept: [{ kind: 'equals', value: 'x' }] },
  }
  const withTask = { ...corpus, v2Tasks: [{ path: 'p', scope: 'production', task }], productionTasks: [] }
  const codes = runRules(withTask, engine).map(item => item.rule)
  assert.ok(!codes.includes('C6.requires-untaught-skill'), 'такого правила ещё нет — и отчёт не должен его обещать')
  assert.ok(codes.some(code => code.startsWith('C7.')), 'что C6/C7 умеют сегодня — это ступени сложности')
})

/* ------------------------------------------- 11. рабочая станция и среда */

const runtime = await load('core/runtime/runners.js')
const program = await load('core/task/program.js')

await check('среда по умолчанию ничего не выполняет и говорит об этом', async () => {
  const result = await runtime.unavailableRunner.run({ language: 'python', files: [], entry: 'a.py', limits: { timeoutMs: 1000 }, taskId: 't' })
  assert.equal(result.executed, false)
  assert.equal(runtime.unavailableRunner.available, false)
  assert.ok(result.unavailableReason.length > 10, 'причина должна быть человекочитаемой')
  assert.equal(result.structuredErrors[0].kind, 'unavailable')
})

await check('без среды кодовое задание нельзя зачесть одними статическими проверками', async () => {
  const task = byId['fx-aho-corasick']
  // Код, который проходит все статические проверки, но ничего не доказывает.
  const files = { 'solution.py': 'def find_all(text, patterns):\n    return []\n' }
  const result = await program.evaluateProgram(task, { kind: 'code', files }, runtime.unavailableRunner)
  assert.equal(result.status, 'needs-runtime')
  assert.equal(result.passed, false, 'статические проверки не заменяют выполнение')
  assert.ok(result.message.includes('нельзя зачесть'), result.message)
})

await check('скрытый тест не раскрывает ни вход, ни ожидаемое, ни полученное', async () => {
  const task = {
    ...byId['fx-aho-corasick'],
    evaluation: {
      type: 'program', language: 'python', timeoutMs: 1000,
      staticChecks: [],
      cases: [
        { id: 'open', name: 'Открытый тест', input: 'aaa', expected: 'ОТКРЫТОЕ-ЗНАЧЕНИЕ' },
        { id: 'secret', name: 'Скрытый', input: 'СЕКРЕТНЫЙ-ВХОД', expected: 'СЕКРЕТНОЕ-ЗНАЧЕНИЕ', hidden: true },
      ],
    },
  }
  const mock = runtime.createMockRunner([{ taskId: task.id, stdout: 'что-то другое' }])
  const result = await program.evaluateProgram(task, { kind: 'code', files: { 'solution.py': 'x' } }, mock)
  const dump = JSON.stringify(result)
  assert.ok(!dump.includes('СЕКРЕТНЫЙ-ВХОД'), 'вход скрытого теста утёк наружу')
  assert.ok(!dump.includes('СЕКРЕТНОЕ-ЗНАЧЕНИЕ'), 'ожидаемое значение скрытого теста утекло наружу')
  // У открытого теста показывать ожидаемое можно и нужно.
  assert.ok(dump.includes('ОТКРЫТОЕ-ЗНАЧЕНИЕ'), 'открытый тест должен объяснять расхождение')
})

await check('результат имитации помечен как поддельный', async () => {
  const mock = runtime.createMockRunner([{ taskId: 'demo', stdout: '42' }])
  const result = await mock.run({ language: 'python', files: [], entry: 'a.py', limits: { timeoutMs: 100 }, taskId: 'demo' })
  assert.equal(result.simulated, true)
  assert.equal(result.stdout, '42')
})

await check('проверка создаёт ровно одну попытку, повторный показ экрана — ноль', () => {
  const task = byId['fx-eigenvalues']
  const before = engine.emptyMastery()
  // Запуск кода возвращает RunResult, а не результат проверки: попытку из него
  // создать нечем. Попытку рождает только результат evaluate.
  const after = engine.recordAttempt(before, task, passOf('fx-eigenvalues'))
  assert.equal(after.attempts.length, 1)
  assert.equal(before.attempts.length, 0, 'исходный журнал не мутируется')
  // Никакого «показали экран» вызова не существует: журнал меняет только запись.
  assert.equal(engine.recordAttempt(after, task, { status: 'needs-runtime', passed: false, score: 0, evidence: 'strong', checks: [], diagnosedSkills: [] }).attempts.length, 1)
})

await check('кодовые миссии открывают редактор без терминала', () => {
  const lab = { id: 'L-1', title: '', type: 'lab', minutes: 1, xp: 1, task: { prompt: '', answer: 'a', explanation: '', starterCode: 'x = 1\n' } }
  const cli = { id: 'L-2', title: '', type: 'quiz', minutes: 1, xp: 1, task: { prompt: '', answer: 'a', explanation: '', environment: 'terminal' } }
  assert.equal(engine.missionEnvironment(lab), 'editor', 'панель результата заменила терминал-заглушку')
  assert.equal(engine.missionEnvironment(cli), 'terminal', 'настоящая задача про оболочку остаётся с терминалом')
})

await check('форма «гипотеза и код» сохраняет прежнее правило зачёта', () => {
  const mission = {
    id: 'W-1', title: '', type: 'lab', minutes: 1, xp: 1, difficulty: 'начальный',
    task: {
      prompt: '', answer: 'верно', explanation: 'Разбор.', workspaceFile: 'solution.py', starterCode: '',
      options: ['верно', 'неверно'],
      codeChecks: [{ label: 'вывод', includes: 'print(' }],
    },
  }
  const task = engine.taskFromMission(mission, 'course')
  assert.equal(task.response.kind, 'form')
  const code = { kind: 'code', files: { 'solution.py': 'print(1)' } }
  const good = engine.evaluate(task, { kind: 'form', fields: { hypothesis: { kind: 'choice', selected: ['option-1'] }, code } })
  const bad = engine.evaluate(task, { kind: 'form', fields: { hypothesis: { kind: 'choice', selected: ['option-2'] }, code } })
  assert.equal(good.passed, true)
  assert.equal(bad.passed, false)
})

await check('одиночный выбор даёт одну проверку, а не список вариантов', () => {
  const task = byId['fx-professional-rag']
  const wrong = engine.evaluate(task, { kind: 'choice', selected: ['index'] })
  assert.equal(wrong.checks.length, 1, 'невыбранный неверный вариант не должен показываться зелёной галочкой')
  assert.equal(wrong.checks[0].passed, false)
  const right = engine.evaluate(task, { kind: 'choice', selected: ['rerank'] })
  assert.equal(right.checks.length, 1)
  assert.equal(right.passed, true)
})

/* ------------------------------------------------- 12. входная диагностика */

const diag = await load('core/diagnostic/index.js')
const probes = JSON.parse(readFileSync(join(root, 'knowledge/tasks/fixtures/diagnostic.json'), 'utf8'))
const skillMap = JSON.parse(readFileSync(join(root, 'knowledge/admissions/itmo-skill-map.json'), 'utf8'))
const requirementSkills = Object.fromEntries(skillMap.map.map(item => [item.requirementId, item.skills]))
const context = { trackId: ITMO, requirementSkills, probes, maxProbes: 24 }
const probeById = Object.fromEntries(probes.map(task => [task.id, task]))

/** Прогон диагностики с заданным поведением человека. */
function runDiagnostic(knows, book = engine.emptyMastery()) {
  let session = diag.startSession(graph, context, book)
  const asked = []
  for (let step = 0; step < 40; step += 1) {
    const task = diag.nextProbe(graph, context, session)
    if (!task) break
    asked.push(task.id)
    const skillId = task.skills.find(item => item.role === 'primary').skillId
    const verdict = knows(skillId, task)
    const result = verdict === 'runtime'
      ? { status: 'needs-runtime', passed: false, score: 0, evidence: 'strong', checks: [], diagnosedSkills: [] }
      : { status: verdict ? 'passed' : 'failed', passed: Boolean(verdict), score: verdict ? 1 : 0.1, evidence: 'strong', checks: [], diagnosedSkills: [] }
    session = diag.applyProbe(graph, context, session, task, result)
  }
  return { session, asked, summary: diag.summarize(graph, context, session) }
}

console.log(`Диагностика: проб ${probes.length}, размечено требований ${Object.keys(requirementSkills).length} из 87`)

await check('область диагностики строится по требованиям программы и их основанию', () => {
  const scope = diag.diagnosticScope(graph, context)
  assert.ok(scope.includes('viterbi'), 'навык требования должен войти')
  assert.ok(scope.includes('dynamic-programming'), 'основание навыка требования должно войти')
  assert.ok(scope.includes('arithmetic'), 'основание уходит вглубь до фундамента')
  assert.ok(!scope.includes('llm-rag'), 'профессиональный навык вне официальных требований не должен удлинять диагностику')
})

await check('профессиональная проба не попадает во вступительную диагностику', () => {
  const { asked } = runDiagnostic(() => true)
  assert.ok(!asked.includes('dg-sql-negative-control'), 'контрольная проба вне области не должна задаваться')
})

await check('уверенное решение сверху снимает вопросы к основанию', () => {
  const { session, asked, summary } = runDiagnostic(() => true)
  assert.ok(asked.includes('dg-viterbi-app'), 'начинать надо с верхнего навыка')
  assert.ok(!asked.includes('dg-hmm-understanding'), 'после верного Витерби спрашивать HMM отдельно незачем')
  assert.equal(session.states['hmm'].verdict, 'implied')
  assert.equal(session.states['hmm'].impliedBy, 'viterbi')
  assert.ok(summary.strong.includes('dynamic-programming'), 'основание засчитано по следствию')
})

await check('провал сложного навыка разворачивает спуск к предпосылкам', () => {
  // Умеет всё, кроме динамического программирования: узкое место должно найтись.
  const { session, asked, summary } = runDiagnostic(skillId => skillId !== 'viterbi' && skillId !== 'dynamic-programming')
  assert.ok(asked.includes('dg-viterbi-app'))
  assert.ok(asked.includes('dg-dp-calc') || asked.includes('dg-dp-understanding'), `спуск не дошёл до DP: ${asked.join(', ')}`)
  assert.equal(session.states['viterbi'].verdict, 'weak')
  assert.equal(session.states['dynamic-programming'].verdict, 'weak')
  assert.equal(session.states['hmm'].verdict, 'strong', 'HMM проверен отдельно и подтверждён')
  assert.ok(summary.plan.some(step => step.skillId === 'dynamic-programming'))
})

await check('план ставит вперёд то, что можно чинить прямо сейчас', () => {
  const { summary } = runDiagnostic(skillId => skillId !== 'viterbi' && skillId !== 'dynamic-programming')
  const dp = summary.plan.find(step => step.skillId === 'dynamic-programming')
  const viterbi = summary.plan.find(step => step.skillId === 'viterbi')
  assert.ok(dp, 'DP должен быть в плане')
  assert.equal(dp.actionable, true, 'основание DP подтверждено, значит им можно заняться')
  assert.equal(viterbi.actionable, false, 'Витерби заблокирован просевшим DP')
  assert.deepEqual(viterbi.blockedBy, ['dynamic-programming'])
  assert.ok(summary.plan.indexOf(dp) < summary.plan.indexOf(viterbi), 'сначала основание, потом зависимый навык')
})

await check('измеренная слабость важнее непроверенного', () => {
  const { summary } = runDiagnostic(skillId => skillId !== 'dynamic-programming')
  for (const step of summary.plan) {
    assert.ok(!summary.unknown.includes(step.skillId), `${step.skillId} не проверялся, ему нечего чинить`)
  }
})

await check('непроверенное и проваленное — разные состояния', () => {
  const { session, summary } = runDiagnostic(() => true)
  assert.ok(summary.unknown.every(skillId => session.states[skillId].verdict === 'unknown'))
  assert.equal(summary.weak.length, 0, 'человек решил всё: слабых навыков быть не должно')
  assert.ok(summary.requirementsUnverified.length > 0, 'непроверенные требования обязаны быть видны отдельно')
  assert.ok(!summary.requirementsUnverified.some(id => summary.requirementsAtRisk.includes(id)))
})

await check('недоступная среда не создаёт отрицательного свидетельства', () => {
  const { session } = runDiagnostic(skillId => (skillId === 'viterbi' ? 'runtime' : true))
  assert.equal(session.states['viterbi'].verdict, 'blocked-by-runtime')
  assert.notEqual(session.states['viterbi'].verdict, 'weak', 'отсутствие песочницы — не ошибка человека')
  const outcome = session.outcomes.find(item => item.skillId === 'viterbi')
  assert.equal(outcome.passed, undefined, 'у несостоявшейся попытки нет результата')
  assert.equal(outcome.blockedByRuntime, true)
})

await check('задание, требующее среды, в диагностику не выдаётся', () => {
  const withCode = { ...context, probes: [...probes, byId['fx-aho-corasick']] }
  let session = diag.startSession(graph, withCode, engine.emptyMastery())
  const asked = []
  for (let step = 0; step < 40; step += 1) {
    const task = diag.nextProbe(graph, withCode, session)
    if (!task) break
    asked.push(task.id)
    session = diag.applyProbe(graph, withCode, session, task, { status: 'passed', passed: true, score: 1, evidence: 'strong', checks: [], diagnosedSkills: [] })
  }
  assert.ok(!asked.includes('fx-aho-corasick'), 'провал такого задания ничего не доказал бы')
})

await check('подтверждённый прошлыми попытками навык не переспрашивается', () => {
  let book = engine.emptyMastery()
  const strong = { status: 'passed', passed: true, score: 1, evidence: 'strong', checks: [], diagnosedSkills: [] }
  const fake = skillId => ({ ...byId['fx-eigenvalues'], id: `hist-${skillId}`, intent: 'practice', skills: [{ skillId, role: 'primary' }] })
  for (let index = 0; index < 4; index += 1) book = engine.recordAttempt(book, fake('eigenvalues'), strong)
  const { asked } = runDiagnostic(() => false, book)
  assert.ok(!asked.includes('dg-eigenvalues-app'), 'подтверждённое прошлыми попытками спрашивать заново незачем')
})

await check('одной слабой проверки недостаточно, чтобы пропустить навык', () => {
  let book = engine.emptyMastery()
  const weak = { status: 'passed', passed: true, score: 1, evidence: 'weak', checks: [], diagnosedSkills: [] }
  const fake = skillId => ({ ...byId['fx-eigenvalues'], id: `soft-${skillId}`, intent: 'practice', skills: [{ skillId, role: 'primary' }] })
  for (let index = 0; index < 8; index += 1) book = engine.recordAttempt(book, fake('eigenvalues'), weak)
  const session = diag.startSession(graph, context, book)
  assert.notEqual(session.states['eigenvalues'].verdict, 'strong', 'самооценка не заменяет проверку')
  assert.ok(session.pending.includes('eigenvalues'))
})

await check('диагностика не трогает сюжет и не двигает освоение сама по себе', () => {
  const { session } = runDiagnostic(() => true)
  // В модуле нет ни одной функции, работающей с прохождением миссий, и
  // recordAttempt отсюда не вызывается: освоение обновляет только проверка.
  assert.ok(!Object.keys(diag).some(name => /mission|story|xp|progress/i.test(name)), Object.keys(diag).join(', '))
  assert.ok(session.outcomes.length > 0)
})

await check('циклический граф навыков не проходит валидатор', () => {
  const cyclic = engine.skillGraph([
    { id: 'a', title: 'A', topicId: 't', prerequisites: ['b'] },
    { id: 'b', title: 'B', topicId: 't', prerequisites: ['a'] },
  ])
  assert.ok(engine.prerequisiteChain(cyclic, 'a').includes('a'), 'цикл обнаруживается обходом')
  const corpus = corpusModule.loadCorpus(root)
  const broken = { ...corpus, skills: [{ id: 'a', title: 'A', topicId: 't', prerequisites: ['b'] }, { id: 'b', title: 'B', topicId: 't', prerequisites: ['a'] }] }
  broken.skillById = Object.fromEntries(broken.skills.map(skill => [skill.id, skill]))
  const codes = rulesModule.runRules(broken, engine).map(item => item.rule)
  assert.ok(codes.includes('C1.skill-cycle'), 'ворота качества обязаны ловить цикл до диагностики')
})

/* ----------------------------------------- сколько проб нужно на самом деле */

const profiles = [
  ['всё знает', () => true],
  ['ничего не знает', () => false],
  ['провал только в динамическом программировании', skillId => skillId !== 'viterbi' && skillId !== 'dynamic-programming'],
  ['слаб в вероятности', skillId => !['conditional-probability', 'probability', 'viterbi'].includes(skillId)],
]
const measured = profiles.map(([name, knows]) => {
  const { asked, summary } = runDiagnostic(knows)
  return { name, probes: asked.length, weak: summary.weak.length, unknown: summary.unknown.length, plan: summary.plan.length }
})
console.log('Профили диагностики:')
for (const item of measured) {
  console.log(`  ${item.name.padEnd(46)} проб ${String(item.probes).padStart(2)} · слабых ${item.weak} · непроверенных ${item.unknown} · шагов плана ${item.plan}`)
}

await check('диагностика короче полного экзамена по всем вопросам', () => {
  for (const item of measured) {
    assert.ok(item.probes <= 24, `${item.name}: ${item.probes} проб — это уже экзамен, а не диагностика`)
  }
  const knowsAll = measured.find(item => item.name === 'всё знает')
  assert.ok(knowsAll.probes < 12, `знающему человеку задано ${knowsAll.probes} проб`)
})

/* ---------------------------------------------------------------------- итог */

console.log(`\nПройдено проверок: ${passed}`)
if (failures.length) {
  console.error(`Упало: ${failures.length}\n`)
  for (const failure of failures) console.error(`  ✕ ${failure}`)
  process.exit(1)
}
console.log('Учебный движок V2: все проверки пройдены\n')
