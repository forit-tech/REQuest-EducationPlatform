/**
 * Проверки аудита введения конструкций.
 *
 * Валидатор, который перестал ловить нарушение, снаружи выглядит точно так же,
 * как валидатор, у которого всё хорошо. Поэтому здесь на каждое правило есть
 * заведомо испорченный пример и заведомо правильный курс: если правило
 * перестанет срабатывать или начнёт срабатывать на нормальном контенте, эти
 * проверки упадут.
 *
 *   npm run api:audit:test
 */
import assert from 'node:assert/strict'
import {
  auditSkillCoverage,
  RULE_FIELDS, VIOLATIONS, analyzeCourse, checksSatisfiedByStarter, compareToBaseline,
  executableCode, extract, passesCodeCheck, requiredBy, teachingSurfaceOf,
} from './audit/introduction.mjs'

let passed = 0
const failures = []
function check(name, run) {
  try { run(); passed += 1 } catch (error) { failures.push(`${name}\n    ${error.message.split('\n')[0]}`) }
}

/* ------------------------------------------------------------ фикстуры */

const lab = (id, { starter = '', checks = [], hints = [], intro = 'Вводная.', prompt = 'Сделай.', stage } = {}) => ({
  id, title: id, type: 'lab', intro, stage,
  hints,
  task: {
    prompt, workspaceFile: 'work.py', starterCode: starter,
    codeChecks: checks.map((includes, index) => ({ label: `Проверка ${index + 1}`, includes })),
  },
})
const story = (id, { intro = 'Вводная.', prompt = 'Вопрос?' } = {}) => ({
  id, title: id, type: 'story', intro, task: { prompt, options: ['Да', 'Нет'], answer: 'Да', explanation: 'Разбор.' },
})
const run = missions => analyzeCourse({ course: { id: 'fixture', missions }, language: 'python' }).findings
const rules = findings => findings.map(item => item.rule)
const of = (findings, rule) => findings.filter(item => item.rule === rule)

/* ------------------------------------------------ исполняемый код */

check('строка с решёткой внутри не режется пополам', () => {
  const code = executableCode('print("# не комментарий")  # хвост', 'python')
  assert.ok(code.includes('print("# не комментарий")'), code)
  assert.ok(!code.includes('хвост'), code)
})

check('комментарий целой строкой исчезает', () => {
  assert.equal(executableCode('# for status in statuses:', 'python').trim(), '')
})

check('docstring не считается исполняемым кодом', () => {
  const code = executableCode('"""for item in items: print(item)"""\nx = 1', 'python')
  assert.ok(!code.includes('for'), code)
  assert.ok(code.includes('x = 1'), code)
})

check('в javascript вырезаются оба вида комментариев', () => {
  const code = executableCode('let a = 1 // for\n/* while */ let b = 2', 'javascript')
  assert.ok(!code.includes('for') && !code.includes('while'), code)
  assert.ok(code.includes('let a = 1') && code.includes('let b = 2'), code)
})

check('пустой стартовый файл из одних комментариев остаётся пустым', () => {
  assert.equal(executableCode('# Дело\n# TODO: собери решение\n', 'python').trim(), '')
})

/* --------------------------------------------- совместимость с игрой */

check('матчер проверок терпит пробелы так же, как игра', () => {
  // Послабление одностороннее: гибкими становятся пробелы фрагмента, а не кода.
  // Аудит обязан повторять эту асимметрию, иначе он отвечает не на тот вопрос.
  assert.equal(passesCodeCheck('per_day*7', 'per_day * 7'), true)
  assert.equal(passesCodeCheck('per_day * 7', 'per_day*7'), false)
  assert.equal(passesCodeCheck('importpandas', 'import pandas'), false)
})

/* ------------------------------------ 1. комментарий не выполняет требование */

check('комментарий в стартовом файле не снимает требование', () => {
  const mission = lab('B-001', {
    starter: 'statuses = ["paid"]\npaid = 0\n# Начало цикла выглядит так:\n# for status in statuses:',
    checks: ['for '],
  })
  assert.ok(requiredBy(mission, 'python').has('for'), 'for обязан остаться требованием')
})

check('код в стартовом файле требование снимает', () => {
  const mission = lab('B-002', { starter: 'for status in statuses:\n    print(status)', checks: ['for '] })
  assert.ok(!requiredBy(mission, 'python').has('for'))
})

check('конструкция, показанная только комментарием, ловится как первый показ', () => {
  const findings = run([lab('B-003', {
    starter: 'statuses = ["paid"]\n# for status in statuses:',
    checks: ['for '],
  })])
  assert.ok(rules(findings).includes(VIOLATIONS.FIRST_USE_SAME_MISSION), rules(findings).join(','))
})

/* -------------------------------------- 2. упоминание в прозе не есть показ */

check('имя функции в прозе показом не считается', () => {
  const findings = run([
    story('C-001', { intro: 'Перед расчётом цену нужно явно преобразовать в int.' }),
    lab('C-002', { starter: 'price_raw = "3490"\n# TODO', checks: ['price = int(price_raw)'] }),
  ])
  const unseen = of(findings, VIOLATIONS.REQUIRED_BEFORE_SHOWN).find(item => item.token === 'int()')
  assert.ok(unseen, rules(findings).join(','))
  assert.match(unseen.evidence, /названо словом/)
})

check('пример синтаксиса вызова показом считается', () => {
  const findings = run([
    story('C-003', { intro: 'Преобразование выглядит так: int("12").' }),
    lab('C-004', { starter: 'price_raw = "3490"\nprice = 0', checks: ['int(price_raw)'] }),
  ])
  assert.ok(!of(findings, VIOLATIONS.REQUIRED_BEFORE_SHOWN).some(item => item.token === 'int()'),
    JSON.stringify(findings))
})

check('подсказка не входит в обучающую поверхность миссии', () => {
  const mission = lab('C-005', { hints: ['Начни со строки price = int(price_raw)'] })
  assert.ok(!extract(teachingSurfaceOf(mission), 'python').has('int()'))
})

/* ----------------------------------------- 3. проверка, выполненная стартом */

check('одна проверка из двух выполнена стартовым файлом', () => {
  const mission = lab('D-001', { starter: 'order = "A-1"', checks: ['=', 'print('] })
  const state = checksSatisfiedByStarter(mission, 'python')
  assert.deepEqual(state.map(item => item.byCode), [true, false])
  const finding = of(run([mission]), VIOLATIONS.CHECK_PASSES_ON_STARTER)
  assert.equal(finding.length, 1)
  assert.equal(finding[0].severity, 'warning')
})

check('стартовый файл, проходящий все проверки, — критическое нарушение', () => {
  const finding = of(run([lab('D-002', { starter: 'order = "A-1"\nprint(order)', checks: ['=', 'print('] })]),
    VIOLATIONS.CHECK_PASSES_ON_STARTER)
  assert.equal(finding.length, 1)
  assert.equal(finding[0].severity, 'critical')
})

check('проверка, выполненная комментарием, отмечается отдельно', () => {
  const mission = lab('D-003', { starter: 'items = [1]\n# for item in items:', checks: ['for ', 'print('] })
  const state = checksSatisfiedByStarter(mission, 'python')
  assert.deepEqual(state.map(item => item.byCode), [false, false])
  assert.deepEqual(state.map(item => item.byCommentOnly), [true, false])
  const finding = of(run([mission]), VIOLATIONS.CHECK_PASSES_ON_STARTER)
  assert.equal(finding.length, 1)
  assert.match(finding[0].kind, /комментарием/)
})

check('честная проверка стартовым файлом не выполняется', () => {
  const mission = lab('D-004', { starter: 'items = [1]\nfor item in items:\n    print(item)', checks: ['len(items)'] })
  assert.deepEqual(checksSatisfiedByStarter(mission, 'python').map(item => item.byCode), [false])
})

/* -------------------------------------------- 4. подсказка не есть обучение */

check('подсказка, выдающая фрагмент проверки, — нарушение', () => {
  const findings = of(run([lab('E-001', {
    starter: 'price_raw = "3490"\n# TODO',
    checks: ['price = int(price_raw)'],
    hints: ['Начни со строки price = int(price_raw), затем используй числовую переменную.'],
  })]), VIOLATIONS.HINT_IS_NOT_TEACHING)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].severity, 'critical', findings[0].kind)
})

check('подсказка словами нарушением не является', () => {
  const findings = of(run([
    story('E-002', { intro: 'Преобразование выглядит так: int("12").' }),
    lab('E-003', {
      starter: 'price_raw = "3490"\nprice = 0',
      checks: ['int(price_raw)'],
      hints: ['Вспомни функцию преобразования строки в целое число.'],
    }),
  ]), VIOLATIONS.HINT_IS_NOT_TEACHING)
  assert.equal(findings.length, 0, JSON.stringify(findings))
})

check('подсказка с пройденной конструкцией отмечается мягче', () => {
  const findings = of(run([
    lab('E-004', { starter: 'total = int("12")\nprint(total)' }),
    lab('E-005', { starter: 'raw = "34"\ntotal = int("12")', checks: ['int(raw)'], hints: ['Напиши int(raw).'] }),
  ]), VIOLATIONS.HINT_IS_NOT_TEACHING)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].severity, 'warning')
})

/* --------------------------------------------------- отрицательный контроль */

check('правильная лестница не даёт ни одной находки', () => {
  const findings = run([
    lab('G-001', { intro: 'Смотри: int("3490") превращает текст в число.', starter: 'price = int("3490")\nprint(price)' }),
    lab('G-002', { starter: 'price = int("3490")\nprint(price)', checks: ['int("120")'] }),
    lab('G-003', { starter: 'raw = "120"\nprice = 0\nprint(price)', checks: ['int(raw)'] }),
  ])
  assert.equal(findings.length, 0, JSON.stringify(findings, null, 1))
})

check('миссия без задания разбор не ломает', () => {
  assert.doesNotThrow(() => run([{ id: 'H-001', title: 'H-001', type: 'story' }]))
})

/* --------------------------------------------- сравнение с базовой линией */

// Ворота сборки. Здесь важны обе стороны: линия обязана ловить ухудшение и
// обязана молчать на исправлении. Молчаливо сломавшиеся ворота хуже, чем их
// отсутствие: они создают ощущение защиты, которой нет.

const line = (byCourse) => ({ byCourse })
const stats = (id, fields) => ({
  id,
  requiredBeforeShown: 0, firstUseSameMission: 0, multipleNewApis: 0,
  blankEditor: 0, checkPassesOnStarter: 0, hintIsNotTeaching: 0,
  ...fields,
})

check('рост находок у курса валит сборку', () => {
  const { failures: found } = compareToBaseline(
    line({ numpy: { requiredBeforeShown: 4 } }),
    [stats('numpy', { requiredBeforeShown: 5 })],
  )
  assert.deepEqual(found, ['numpy/requiredBeforeShown: было 4, стало 5'])
})

check('исправление сборку не валит и попадает в улучшения', () => {
  const { failures: found, improvements } = compareToBaseline(
    line({ numpy: { requiredBeforeShown: 4 } }),
    [stats('numpy', { requiredBeforeShown: 1 })],
  )
  assert.deepEqual(found, [])
  assert.deepEqual(improvements, ['numpy/requiredBeforeShown: 4 → 1'])
})

check('новый курс с нарушениями валит сборку', () => {
  const { failures: found } = compareToBaseline(
    line({}),
    [stats('java-first-steps', { multipleNewApis: 2 })],
  )
  assert.deepEqual(found, ['java-first-steps: новый курс сразу с находками, multipleNewApis = 2'])
})

check('новый чистый курс проходит', () => {
  const { failures: found } = compareToBaseline(line({}), [stats('python-first-steps', {})])
  assert.deepEqual(found, [])
})

check('размен между курсами не прячется за общим итогом', () => {
  // Сумма та же: минус десять в одном курсе, плюс десять в другом.
  const { failures: found } = compareToBaseline(
    line({ 'python-core': { blankEditor: 10 }, pandas: { blankEditor: 60 } }),
    [stats('python-core', { blankEditor: 0 }), stats('pandas', { blankEditor: 70 })],
  )
  assert.deepEqual(found, ['pandas/blankEditor: было 60, стало 70'])
})

check('линия покрывает все шесть правил', () => {
  assert.equal(Object.keys(RULE_FIELDS).length, Object.keys(VIOLATIONS).length)
  for (const rule of Object.values(VIOLATIONS)) assert.ok(RULE_FIELDS[rule], `нет поля для ${rule}`)
})

/* ------------------------------------------- пропущенные ступени лестницы */

check('имя не считается написанным из-за буквенного совпадения', () => {
  // «print» содержит «int»: наивная подстрока прятала требование целиком.
  const mission = lab('L-000', { starter: 'raw = "12"\nprint(raw)', checks: ['int(raw)'] })
  assert.ok(requiredBy(mission, 'python').has('int()'), 'int() обязан остаться требованием')
})

check('самостоятельная запись без ступеней между показом и ею — находка', () => {
  const findings = of(run([
    lab('L-001', { stage: 'shown', starter: 'total = 9 // 2\nprint(total)' }),
    lab('L-002', { stage: 'independent', starter: 'a = 9\nb = 2', checks: ['a // b'] }),
  ]), VIOLATIONS.LADDER_GAP)
  assert.equal(findings.length, 1, JSON.stringify(findings))
  assert.equal(findings[0].token, '//')
})

check('ступень «измени» засчитывается по рабочему файлу, а не по проверке', () => {
  // На «измени» человек правит значение внутри готовой конструкции и саму
  // конструкцию не набирает — ступень при этом пройдена.
  const findings = of(run([
    lab('L-003', { stage: 'shown', starter: 'total = 9 // 2\nprint(total)' }),
    lab('L-004', { stage: 'modified', starter: 'a = 9 // 2\nprint(a)', checks: ['a = 14 // 2'] }),
    lab('L-005', { stage: 'independent', starter: 'a = 9\nb = 2', checks: ['a // b'] }),
  ]), VIOLATIONS.LADDER_GAP)
  assert.deepEqual(findings, [])
})

check('без поля stage правило молчит', () => {
  const findings = of(run([
    lab('L-006', { starter: 'a = 9\nb = 2', checks: ['a // b'] }),
  ]), VIOLATIONS.LADDER_GAP)
  assert.deepEqual(findings, [])
})

/* ------------------------------------------ покрытие объявленных навыков */

const skillOf = (id, mission, detect) => ({
  id, title: id, detect, language: 'python',
  introducedIn: { course: 'fixture', mission },
})
const courseOf = missions => [{ id: 'fixture', missions }]

check('навык, которого не требует ни одна проверка, — находка', () => {
  const findings = auditSkillCoverage({
    skills: [skillOf('py-files', 'F-001', ['open('])],
    courses: courseOf([lab('F-001', { checks: ['print(x)'] })]),
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rule, VIOLATIONS.DECLARED_NEVER_REQUIRED)
})

check('навык, требуемый только в своей же миссии, — находка помягче', () => {
  const findings = auditSkillCoverage({
    skills: [skillOf('py-open', 'F-002', ['open('])],
    courses: courseOf([lab('F-002', { checks: ['open(path)'] })]),
  })
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rule, VIOLATIONS.NO_REINFORCEMENT)
})

check('закреплённый навык находкой не является', () => {
  const findings = auditSkillCoverage({
    skills: [skillOf('py-open', 'F-003', ['open('])],
    courses: courseOf([
      lab('F-003', { checks: ['open(path)'] }),
      lab('F-004', { checks: ['open(other)'] }),
    ]),
  })
  assert.deepEqual(findings, [])
})

/* ------------------------------------------------------------- итог */

if (failures.length) {
  console.error(`Проверок аудита: ${passed + failures.length}, упало ${failures.length}\n`)
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  process.exit(1)
}
console.log(`Проверок аудита: ${passed}, все прошли`)
