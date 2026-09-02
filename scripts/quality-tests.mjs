/**
 * Проверки самого валидатора качества.
 *
 * Валидатор, который никогда не срабатывает, выглядит точно так же, как
 * валидатор, у которого всё хорошо. Поэтому здесь на каждый класс правил есть
 * заведомо испорченный пример: если правило перестанет ловить нарушение, эти
 * проверки упадут.
 *
 *   npm run quality:test
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runRules } from './quality/rules.mjs'
import { loadCorpus as loadCorpusReal } from './quality/corpus.mjs'
import { SCOPE, STRICT_SCOPES, jaccard, normalize } from './quality/corpus.mjs'
import { INTEGRITY_RULES } from './quality/rules.mjs'

const root = resolve(import.meta.dirname, '..')
const buildDir = join(root, 'build', 'engine')
const engine = {
  ...(await import(pathToFileURL(join(buildDir, 'core/task/index.js')).href)),
  ...(await import(pathToFileURL(join(buildDir, 'core/tasks.js')).href)),
}

let passed = 0
const failures = []
function check(name, run) {
  try { run(); passed += 1 } catch (error) { failures.push(`${name}\n    ${error.message.split('\n')[0]}`) }
}

const skills = JSON.parse(readFileSync(join(root, 'knowledge/skills/registry.json'), 'utf8')).skills
const requirementRefs = new Set(['itmo-deep-learning-genai-2026:ITMO-DL-ML-14'])

/** Минимальный корпус: только то, что нужно конкретной проверке. */
function corpusOf({ missions = [], tasks = [], production = [], sources = [], courses } = {}) {
  const course = { id: 'test-course', path: 'test/course.json', missions }
  const wrap = (list, scope) => list.map(task => ({ path: 'test/tasks.json', scope, task }))
  return {
    root,
    courses: courses ?? [course],
    legacyMissions: missions.map(mission => ({ course, mission })),
    v2Tasks: [...wrap(tasks, SCOPE.FIXTURE), ...wrap(production, SCOPE.PRODUCTION)],
    productionTasks: wrap(production, SCOPE.PRODUCTION),
    skills,
    skillById: Object.fromEntries(skills.map(skill => [skill.id, skill])),
    admissionDocs: [],
    requirements: [{ trackId: 'itmo-deep-learning-genai-2026', id: 'ITMO-DL-ML-14', ref: 'itmo-deep-learning-genai-2026:ITMO-DL-ML-14', text: 'backprop', topics: [], official: true }],
    requirementRefs,
    sources,
  }
}

const codesOf = corpus => runRules(corpus, engine).map(item => item.rule)
const legacyMission = extra => ({
  id: 'T-001', title: 'Тест', type: 'quiz', minutes: 1, xp: 1,
  intro: 'Обычное вступление без подсказок.',
  task: { prompt: 'Вопрос?', options: ['Верно', 'Неверно'], answer: 'Верно', explanation: 'Разбор.' },
  ...extra,
})

/* ------------------------------------------------------------ C1 структура */

check('C1 ловит повтор идентификатора', () => {
  const codes = codesOf(corpusOf({ missions: [legacyMission({}), legacyMission({})] }))
  assert.ok(codes.includes('C1.duplicate-id'), codes.join(', '))
})

check('C1 ловит отсутствие разбора и пустую формулировку', () => {
  const codes = codesOf(corpusOf({ missions: [legacyMission({ task: { prompt: '  ', options: ['a', 'b'], answer: 'a', explanation: '' } })] }))
  assert.ok(codes.includes('C1.missing-explanation'), codes.join(', '))
  assert.ok(codes.includes('C1.empty-prompt'), codes.join(', '))
})

check('C1 ловит несочетаемые форму ответа и проверку', () => {
  const task = {
    id: 'bad-1', intent: 'practice', difficulty: 'L1', prompt: 'Вопрос', explanation: 'Разбор длиннее двадцати символов',
    topicId: 't', skills: [{ skillId: 'matrices', role: 'primary' }], evidences: ['recall'],
    response: { kind: 'numeric', fields: [{ id: 'a' }] },
    evaluation: { type: 'choice', correct: ['x'] },
  }
  assert.ok(codesOf(corpusOf({ tasks: [task] })).includes('C1.evaluator-mismatch'))
})

check('C1 ловит обещанный редактор там, где кода нет', () => {
  const task = {
    id: 'bad-2', intent: 'practice', difficulty: 'L1', prompt: 'Вопрос', explanation: 'Разбор длиннее двадцати символов',
    topicId: 't', skills: [{ skillId: 'matrices', role: 'primary' }], evidences: ['recall'],
    environment: 'editor',
    response: { kind: 'text' }, evaluation: { type: 'text', accept: [{ kind: 'equals', value: 'x' }] },
  }
  assert.ok(codesOf(corpusOf({ tasks: [task] })).includes('C1.environment-mismatch'))
})

/* ------------------------------------------------------- C2 подсказанный ответ */

check('C2 ловит ответ, лежащий в тексте перед вопросом', () => {
  const mission = legacyMission({
    intro: 'Оперативная память держит активные данные программы.',
    task: { prompt: 'Где данные?', options: ['Оперативная память держит активные данные программы', 'На мониторе'], answer: 'Оперативная память держит активные данные программы', explanation: 'Разбор.' },
  })
  assert.ok(codesOf(corpusOf({ missions: [mission] })).includes('C2.exact-answer-in-theory'))
})

check('C2 ловит ответ с точностью до оформления', () => {
  const mission = legacyMission({
    intro: 'Оперативная  ПАМЯТЬ держит активные данные программы!',
    task: { prompt: 'Где данные?', options: ['Оперативная память держит активные данные программы', 'На мониторе'], answer: 'Оперативная память держит активные данные программы', explanation: 'Разбор.' },
  })
  const codes = codesOf(corpusOf({ missions: [mission] }))
  assert.ok(codes.includes('C2.normalized-answer-in-theory'), codes.join(', '))
})

check('C2 не ругается на честное задание', () => {
  const mission = legacyMission({
    intro: 'Процессор выполняет инструкции, а диск хранит файлы долговременно.',
    task: { prompt: 'Где активные данные?', options: ['В оперативной памяти', 'В сетевом кабеле'], answer: 'В оперативной памяти', explanation: 'Разбор.' },
  })
  const codes = codesOf(corpusOf({ missions: [mission] }))
  assert.ok(!codes.some(code => code.startsWith('C2.')), codes.join(', '))
})

check('C2 ловит заготовку, которая уже решает задание', () => {
  const mission = legacyMission({
    type: 'lab',
    task: { prompt: 'Напиши', options: ['a', 'b'], answer: 'a', explanation: 'Разбор.', starterCode: 'x = 1\nprint(x)\n', codeChecks: [{ label: 'вывод', includes: 'print(' }] },
  })
  assert.ok(codesOf(corpusOf({ missions: [mission] })).includes('C2.starter-already-passes'))
})

/* ------------------------------------------------------------- C3 повторы */

check('C3 ловит дословный повтор формулировки', () => {
  const missions = [legacyMission({ id: 'A-1' }), legacyMission({ id: 'A-2' })]
  assert.ok(codesOf(corpusOf({ missions })).includes('C3.duplicate-prompt'))
})

check('C3 ловит повтор с точностью до оформления', () => {
  const missions = [
    legacyMission({ id: 'B-1', task: { prompt: 'Что такое индекс?', options: ['a', 'b'], answer: 'a', explanation: 'Разбор.' } }),
    legacyMission({ id: 'B-2', task: { prompt: 'что  такое ИНДЕКС', options: ['c', 'd'], answer: 'c', explanation: 'Разбор.' } }),
  ]
  assert.ok(codesOf(corpusOf({ missions })).includes('C3.near-duplicate-prompt'))
})

/* --------------------------------------------------------- C4 варианты */

check('C4 ловит отсутствие верного ответа среди вариантов', () => {
  const mission = legacyMission({ task: { prompt: 'Вопрос?', options: ['a', 'b'], answer: 'c', explanation: 'Разбор.' } })
  assert.ok(codesOf(corpusOf({ missions: [mission] })).includes('C4.answer-not-in-options'))
})

check('C4 ловит повторяющиеся и пустые варианты', () => {
  const duplicated = legacyMission({ id: 'D-1', task: { prompt: 'Q1?', options: ['a', 'a'], answer: 'a', explanation: 'Разбор.' } })
  const empty = legacyMission({ id: 'D-2', task: { prompt: 'Q2?', options: ['a', '  '], answer: 'a', explanation: 'Разбор.' } })
  const codes = codesOf(corpusOf({ missions: [duplicated, empty] }))
  assert.ok(codes.includes('C4.duplicate-options'), codes.join(', '))
  assert.ok(codes.includes('C4.empty-option'), codes.join(', '))
})

check('C4 не требует ровно трёх вариантов', () => {
  const two = legacyMission({ id: 'E-1', task: { prompt: 'Q1?', options: ['a', 'b'], answer: 'a', explanation: 'Разбор.' } })
  const five = legacyMission({ id: 'E-2', task: { prompt: 'Q2?', options: ['a', 'b', 'c', 'd', 'e'], answer: 'a', explanation: 'Разбор.' } })
  const codes = codesOf(corpusOf({ missions: [two, five] }))
  assert.ok(!codes.includes('C4.too-few-options'), codes.join(', '))
})

check('C4 замечает, что верный вариант систематически самый длинный', () => {
  const missions = Array.from({ length: 10 }, (_, index) => legacyMission({
    id: `F-${index}`,
    task: { prompt: `Вопрос ${index}?`, options: ['Очень подробный и потому верный вариант ответа', 'Нет'], answer: 'Очень подробный и потому верный вариант ответа', explanation: 'Разбор.' },
  }))
  assert.ok(codesOf(corpusOf({ missions })).includes('C4.longest-is-correct'))
})

/* ---------------------------------------------------------- C5 код */

check('C5 ловит хрупкую проверку по подстроке', () => {
  const mission = legacyMission({
    type: 'lab',
    task: { prompt: 'Напиши', options: ['a', 'b'], answer: 'a', explanation: 'Разбор.', starterCode: 'x = 1\n', codeChecks: [{ label: 'умножение', includes: ' * ' }] },
  })
  assert.ok(codesOf(corpusOf({ missions: [mission] })).includes('C5.fragile-substring'))
})

check('C5 запрещает подстрочную проверку в новой модели', () => {
  const task = {
    id: 'bad-3', intent: 'coding', difficulty: 'L2', prompt: 'Напиши', explanation: 'Разбор длиннее двадцати символов',
    topicId: 't', skills: [{ skillId: 'recursion', role: 'primary' }], evidences: ['coding'],
    response: { kind: 'code', entry: 'a.py', files: [{ path: 'a.py', language: 'python', content: '', editable: true }] },
    evaluation: { type: 'legacy-substring', checks: [] },
  }
  assert.ok(codesOf(corpusOf({ tasks: [task] })).includes('C5.legacy-evaluator'))
})

/* ------------------------------------------------- C8 требования вузов */

check('C8 запрещает непрофильному заданию ссылаться на требование', () => {
  const task = {
    id: 'bad-4', intent: 'practice', difficulty: 'L2', prompt: 'Вопрос', explanation: 'Разбор длиннее двадцати символов',
    topicId: 't', skills: [{ skillId: 'backprop', role: 'primary' }], evidences: ['understanding'],
    admissionRefs: ['itmo-deep-learning-genai-2026:ITMO-DL-ML-14'],
    response: { kind: 'text' }, evaluation: { type: 'text', accept: [{ kind: 'equals', value: 'x' }] },
  }
  assert.ok(codesOf(corpusOf({ tasks: [task] })).includes('C8.professional-claims-admission'))
})

/* -------------------------------------------------- C9 источники и лицензии */

check('C9 не даёт непроверенной лицензии стать разрешительной', () => {
  const sources = [{ id: 's1', title: 'X', url: 'https://x', class: 'ADAPTABLE_OER', license: 'Apache-2.0', licenseVerification: 'required', allowedUses: ['adaptation'] }]
  assert.ok(codesOf(corpusOf({ sources })).includes('C9.unverified-adaptation'))
})

check('C9 не даёт REFERENCE_ONLY переносить содержание', () => {
  const sources = [{ id: 's2', title: 'X', url: 'https://x', class: 'REFERENCE_ONLY', license: 'проприетарная', allowedUses: ['code'] }]
  assert.ok(codesOf(corpusOf({ sources })).includes('C9.reference-overreach'))
})

check('C9 ловит источник без лицензии', () => {
  const sources = [{ id: 's3', title: 'X', url: 'https://x', class: 'REFERENCE_ONLY', allowedUses: ['curriculum-patterns'] }]
  assert.ok(codesOf(corpusOf({ sources })).includes('C9.missing-license'))
})

/* ------------------------------------- заведомо невалидные задания из корпуса */

check('заведомо невалидные задания продолжают нарушать свои правила', () => {
  const file = JSON.parse(readFileSync(join(root, 'knowledge/tasks/invalid-fixtures/expected-violations.json'), 'utf8'))
  const graph = engine.skillGraph(skills)
  const allRefs = new Set(['itmo-deep-learning-genai-2026:ITMO-DL-ML-14', 'itmo-deep-learning-genai-2026:ITMO-DL-ML-15'])
  for (const expectation of file.cases) {
    const task = file.tasks.find(item => item.id === expectation.taskId)
    assert.ok(task, `нет задания ${expectation.taskId}`)
    const codes = engine.validateTask(task, { skills: graph, admissionRefs: allRefs }).map(problem => problem.code)
    for (const code of expectation.expect) {
      assert.ok(codes.includes(code), `${expectation.taskId}: ожидалось нарушение ${code}, получено ${codes.join(', ')}`)
    }
  }
})

/* ------------------------------------------------------- вспомогательное */

check('нормализация и близость текста работают предсказуемо', () => {
  assert.equal(normalize('Ёлка,  ПРИВЕТ!'), 'елка привет')
  assert.equal(jaccard('кот сидит на окне', 'кот сидит на окне'), 1)
  assert.ok(jaccard('машинное обучение это круто', 'полностью другое предложение здесь') < 0.2)
})

check('периметры разведены и строгая политика применяется не ко всем', () => {
  assert.equal(SCOPE.LEGACY, 'legacy')
  assert.equal(SCOPE.PRODUCTION, 'production')
  assert.equal(SCOPE.FIXTURE, 'fixture')
  assert.equal(SCOPE.INVALID_FIXTURE, 'invalid-fixture')
  assert.ok(STRICT_SCOPES.includes(SCOPE.PRODUCTION))
  assert.ok(STRICT_SCOPES.includes(SCOPE.FIXTURE))
  assert.ok(!STRICT_SCOPES.includes(SCOPE.LEGACY), 'к старому контенту строгая политика не применяется')
})

check('дефекты целостности не попадают в базовую линию', () => {
  const baseline = JSON.parse(readFileSync(join(root, 'knowledge/reports/quality-baseline.json'), 'utf8'))
  for (const rule of Object.keys(baseline.legacyErrors)) {
    assert.ok(!INTEGRITY_RULES.has(rule), `${rule} — дефект целостности, ему нельзя быть в базовой линии`)
  }
  // И наоборот: набор целостности не пуст, иначе правило ничего не защищает.
  assert.ok(INTEGRITY_RULES.size >= 8, `правил целостности всего ${INTEGRITY_RULES.size}`)
  assert.ok(INTEGRITY_RULES.has('C1.duplicate-id'))
  assert.ok(INTEGRITY_RULES.has('C2.starter-already-passes'))
})

check('в корпусе нет ни одного дефекта целостности', () => {
  const corpus = loadCorpusReal(root)
  const defects = runRules(corpus, engine).filter(item => item.severity === 'error' && INTEGRITY_RULES.has(item.rule))
  assert.deepEqual(defects.map(item => `${item.rule} · ${item.where}`), [])
})

console.log(`\nПройдено проверок валидатора: ${passed}`)
if (failures.length) {
  console.error(`Упало: ${failures.length}\n`)
  for (const failure of failures) console.error(`  ✕ ${failure}`)
  process.exit(1)
}
console.log('Валидатор качества: все проверки пройдены\n')
