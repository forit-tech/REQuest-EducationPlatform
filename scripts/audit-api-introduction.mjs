/**
 * Проверка главного правила: нельзя требовать то, чего не показали.
 *
 * Миссия вправе требовать от человека написать конструкцию, функцию, метод или
 * вызов библиотеки только если он это уже видел. «Название технологии
 * упоминалось» обучением не считается: если студенту сказали, что NumPy нужен
 * для чисел, а потом попросили `np.sqrt`, он берёт решение не из курса.
 *
 * Что считается показом. Токен показан, если он встречается в стартовом файле
 * миссии либо в её тексте — вводной, производственном контексте, объяснении,
 * подсказках или формулировке задания. Это намеренно щедрое определение:
 * доказать, что конструкцию именно объяснили, а не просто упомянули, машина не
 * может. Поэтому найденные нарушения — нижняя граница, а не полный список.
 *
 * Что считается требованием. Токен требуется, если он есть в автоматической
 * проверке `codeChecks` и при этом отсутствует в стартовом файле: значит,
 * написать его должен человек.
 *
 * Порядок изучения берётся из маршрутов профессий, а не из алфавита каталога.
 * Токен считается известным, если он был показан раньше в этом же курсе или в
 * любом курсе, который хотя бы в одном маршруте стоит перед текущим.
 *
 *   node ./scripts/audit-api-introduction.mjs
 *   node ./scripts/audit-api-introduction.mjs --course python-core
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadCorpus } from './quality/corpus.mjs'

const root = resolve(import.meta.dirname, '..')
const reportsDir = join(root, 'knowledge', 'reports')
const reportPath = join(reportsDir, 'api-introduction.json')
const markdownPath = join(reportsDir, 'api-introduction.md')
const only = process.argv.includes('--course')
  ? process.argv[process.argv.indexOf('--course') + 1]
  : null

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

/* --------------------------------------------------------- словари языка */

/**
 * Ключевые слова, которые для новичка являются отдельными сущностями.
 *
 * Список намеренно короткий: сюда попадает только то, что нельзя понять из
 * контекста и что действительно нужно вводить отдельной миссией.
 */
const KEYWORDS = {
  python: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'import', 'from', 'as',
    'class', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'assert',
    'global', 'nonlocal', 'async', 'await'],
  javascript: ['function', 'return', 'if', 'else', 'for', 'while', 'const', 'let', 'var',
    'class', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'from',
    'async', 'await', 'new', 'this', 'yield'],
  go: ['func', 'return', 'if', 'else', 'for', 'range', 'var', 'const', 'type', 'struct',
    'interface', 'map', 'chan', 'go', 'select', 'defer', 'package', 'import', 'switch', 'case'],
  java: ['class', 'interface', 'public', 'private', 'protected', 'static', 'void', 'return',
    'if', 'else', 'for', 'while', 'new', 'try', 'catch', 'finally', 'throw', 'throws',
    'import', 'package', 'extends', 'implements', 'record', 'enum', 'switch', 'case'],
}

/**
 * Операторы и пунктуация, которые новичок не обязан понимать сам.
 *
 * Скобка и кавычка выглядят очевидными только тому, кто уже писал код.
 * Порядок важен: длинные записи проверяются раньше коротких, иначе `==`
 * распознаётся как два `=`.
 */
const OPERATORS = ['**=', '//=', '===', '!==', '<=>', '**', '//', '==', '!=', '<=', '>=',
  '+=', '-=', '*=', '/=', '%=', '=>', '->', ':=', '&&', '||', '<-',
  '+', '-', '*', '/', '%', '=', '<', '>', '!']

const SYNTAX = [
  ['f-строка', /\bf"/],
  ['срез', /\[[^\]]*:[^\]]*\]/],
  ['список', /\[[^\]]*\]/],
  ['словарь или блок', /\{/],
  ['обращение по точке', /\w\.\w/],
  ['двойные кавычки', /"/],
  ['одинарные кавычки', /'/],
  ['запятая-разделитель', /,/],
]

const CALL = /(?:([A-Za-z_][\w.]*)\s*\.\s*)?([A-Za-z_]\w*)\s*\(/g

const languageByExtension = (() => {
  const registryPath = join(root, 'knowledge', 'skills-registry.json')
  const registry = existsSync(registryPath) ? readJson(registryPath) : {}
  return registry.languageByExtension ?? {
    '.py': 'python', '.js': 'javascript', '.jsx': 'javascript', '.ts': 'javascript',
    '.go': 'go', '.java': 'java', '.sql': 'sql', '.yaml': 'yaml', '.yml': 'yaml',
  }
})()

/* ---------------------------------------------------------- извлечение */

/**
 * Разбор куска кода на сущности, каждую из которых нужно вводить отдельно.
 *
 * Категории различаются намеренно: встроенная функция, метод объекта и функция
 * библиотеки для новичка — три разных механизма, и знание одного не даёт
 * знания другого.
 */
function extract(code, language) {
  const found = new Map()
  const add = (kind, name) => { if (!found.has(name)) found.set(name, kind) }
  const text = String(code ?? '')
  if (!text.trim()) return found

  for (const match of text.matchAll(CALL)) {
    const [, qualifier, name] = match
    if (KEYWORDS[language]?.includes(name)) continue
    if (qualifier) add(qualifier.includes('.') ? 'вызов библиотеки' : 'метод или функция модуля', `${qualifier}.${name}()`)
    else add('функция', `${name}()`)
  }
  for (const keyword of KEYWORDS[language] ?? []) {
    if (new RegExp(`(^|[^\\w])${keyword}([^\\w]|$)`).test(text)) add('ключевое слово', keyword)
  }
  let rest = text
  for (const operator of OPERATORS) {
    if (rest.includes(operator)) {
      add('оператор', operator)
      rest = rest.split(operator).join(' ')
    }
  }
  for (const [name, pattern] of SYNTAX) if (pattern.test(text)) add('синтаксис', name)
  return found
}

/** Весь текст, который миссия показывает человеку, вместе со стартовым файлом. */
function surfaceOf(mission) {
  const task = mission.task ?? {}
  return [task.starterCode, mission.intro, mission.productionContext,
    task.prompt, task.explanation, (mission.hints ?? []).join(' '),
    (task.options ?? []).join(' ')].join('\n')
}

/** Всё, что миссия показывает: код в стартовом файле и текст вокруг него. */
function shownBy(mission, language) {
  return extract(surfaceOf(mission), language)
}

/**
 * Упоминание конструкции в прозе засчитывается наравне с показом в коде.
 *
 * «System.out.println добавляет перевод строки» — это показ, хотя скобок в
 * предложении нет и разбор кода такую запись не увидит. Поэтому имя ищется в
 * тексте напрямую, без синтаксиса.
 */
function mentionedIn(text, token) {
  const bare = token.replace(/\(\)$/, '')
  if (!/^[A-Za-z_][\w.]*$/.test(bare)) return false
  return new RegExp(`(^|[^\\w.])${bare.replace(/\./g, '\\.')}([^\\w]|$)`).test(text)
}

/** Всё, что миссия требует написать самостоятельно. */
function requiredBy(mission, language) {
  const task = mission.task ?? {}
  const starter = String(task.starterCode ?? '')
  const required = new Map()
  for (const check of task.codeChecks ?? []) {
    for (const [name, kind] of extract(check.includes, language)) {
      // Уже лежащее в стартовом файле человек не пишет — это подсказка, а не требование.
      const bare = name.replace(/\(\)$/, '')
      if (starter.includes(bare)) continue
      required.set(name, kind)
    }
  }
  return required
}

/* ------------------------------------------------- порядок прохождения */

const corpus = loadCorpus(root)
const programs = readJson(join(root, 'knowledge', 'professions', 'programs.json'))
const courseById = new Map(corpus.courses.map(course => [course.id, course]))

/** Курсы, которые хотя бы в одном маршруте стоят раньше данного. */
function precedingCourses(courseId) {
  const before = new Set()
  for (const program of programs) {
    const route = program.stages.flatMap(stage => stage.courseIds)
    const index = route.indexOf(courseId)
    if (index > 0) for (const id of route.slice(0, index)) before.add(id)
  }
  return [...before].filter(id => courseById.has(id))
}

const courseLanguage = course => {
  for (const mission of course.missions ?? []) {
    const file = mission.task?.workspaceFile
    if (file) return languageByExtension[file.slice(file.lastIndexOf('.'))]
  }
  return course.technology
}

/* ------------------------------------------------------------ проверка */

const VIOLATIONS = {
  REQUIRED_BEFORE_SHOWN: 'required-before-shown',
  FIRST_USE_SAME_MISSION: 'independent-use-right-after-first-sight',
  MULTIPLE_NEW_APIS: 'multiple-new-apis-at-once',
  BLANK_EDITOR: 'blank-editor-task',
}
const NEW_API_LIMIT = 1

/**
 * Пустой редактор: в стартовом файле нет ни одной исполняемой строки.
 *
 * Комментарий «TODO: собери массив и проверь форму результата» кодом не
 * является. Само по себе это не нарушение: PROGRAMMING_PEDAGOGY.md разрешает
 * писать с чистого места после того, как конструкция прошла show → modify →
 * fill. Нарушением становится пустой редактор с конструкцией, которой человек
 * ни разу не держал в собственном рабочем файле.
 */
function isBlankEditor(mission, language) {
  const starter = String(mission.task?.starterCode ?? '')
  const comment = language === 'python' ? '#' : '//'
  const code = starter.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith(comment))
  return code.length === 0
}

const courses = []
for (const course of corpus.courses) {
  if (only && course.id !== only) continue
  const language = courseLanguage(course)
  if (!language || !KEYWORDS[language]) continue

  // Всё, что человек мог увидеть в предыдущих курсах маршрута.
  const knownBefore = new Map()
  let seenText = ''
  // Отдельно от увиденного копится то, что человек держал в рабочем файле.
  // Хранится и текстом, и разобранным: `mentionedIn` умеет искать только
  // имена, а знак равенства или кавычка именем не являются и иначе всегда
  // считались бы неотработанными.
  let editedText = ''
  const editedTokens = new Set()
  const rememberEdited = (code) => {
    editedText += `\n${code ?? ''}`
    for (const name of extract(code, language).keys()) editedTokens.add(name)
  }
  for (const id of precedingCourses(course.id)) {
    const earlier = courseById.get(id)
    if (courseLanguage(earlier) !== language) continue
    for (const mission of earlier.missions ?? []) {
      seenText += `\n${surfaceOf(mission)}`
      rememberEdited(mission.task?.starterCode)
      for (const [name, kind] of shownBy(mission, language)) if (!knownBefore.has(name)) knownBefore.set(name, kind)
    }
  }

  const known = new Map(knownBefore)
  const findings = []
  let requiredTotal = 0
  for (const mission of course.missions ?? []) {
    const required = requiredBy(mission, language)
    requiredTotal += required.size
    // Миссия вправе объяснить конструкцию в собственной вводной и тут же дать
    // её применить: «объяснили — показали — примени» это нормальный шаг. Поэтому
    // показ этой же миссии учитывается наравне с предыдущими.
    const shownHere = shownBy(mission, language)
    const here = surfaceOf(mission)
    const isNew = name => !known.has(name) && !mentionedIn(seenText, name)
    const unseen = [...required].filter(([name]) => isNew(name) && !shownHere.has(name) && !mentionedIn(here, name))
    const freshlyShown = [...required].filter(([name]) => isNew(name) && (shownHere.has(name) || mentionedIn(here, name)))

    for (const [name, kind] of unseen) {
      findings.push({
        rule: VIOLATIONS.REQUIRED_BEFORE_SHOWN,
        missionId: mission.id, missionTitle: mission.title, token: name, kind,
      })
    }
    // Слабее предыдущего, но важно для новичка: конструкцию увидели первый раз
    // и сразу требуют написать, без промежуточных «измени» и «дополни».
    for (const [name, kind] of freshlyShown) {
      findings.push({
        rule: VIOLATIONS.FIRST_USE_SAME_MISSION,
        missionId: mission.id, missionTitle: mission.title, token: name, kind,
      })
    }

    // Конструкция считается отработанной руками, если человек уже видел её в
    // собственном рабочем файле: это и есть след стадий modify и fill.
    const untrained = [...required.keys()]
      .filter(name => !editedTokens.has(name) && !mentionedIn(editedText, name))
    if (untrained.length && isBlankEditor(mission, language)) {
      findings.push({
        rule: VIOLATIONS.BLANK_EDITOR,
        missionId: mission.id, missionTitle: mission.title,
        token: untrained.join(', '),
        kind: 'пустой стартовый файл, а конструкция ни разу не была в рабочем файле',
      })
    }
    rememberEdited(mission.task?.starterCode)

    seenText += `\n${here}`
    for (const [name, kind] of shownHere) if (!known.has(name)) known.set(name, kind)
    for (const [name, kind] of required) if (!known.has(name)) known.set(name, kind)

    const newHere = unseen.length + freshlyShown.length
    if (newHere > NEW_API_LIMIT) {
      findings.push({
        rule: VIOLATIONS.MULTIPLE_NEW_APIS,
        missionId: mission.id, missionTitle: mission.title,
        token: [...unseen, ...freshlyShown].map(([name]) => name).join(', '),
        kind: `${newHere} новых сущностей сразу`,
      })
    }
  }

  courses.push({
    id: course.id,
    title: course.title,
    language,
    // К курсу вне маршрутов не ведёт ни одна профессия, поэтому предшественников
    // у него нет и известным не считается ничего. Его находки отделяются: это
    // следствие сиротства курса, а не педагогики внутри него.
    noRoute: precedingCourses(course.id).length === 0,
    missions: (course.missions ?? []).length,
    codeMissions: (course.missions ?? []).filter(mission => (mission.task?.codeChecks ?? []).length).length,
    inheritedTokens: knownBefore.size,
    requiredTokens: requiredTotal,
    violations: findings.length,
    requiredBeforeShown: findings.filter(item => item.rule === VIOLATIONS.REQUIRED_BEFORE_SHOWN).length,
    firstUseSameMission: findings.filter(item => item.rule === VIOLATIONS.FIRST_USE_SAME_MISSION).length,
    multipleNewApis: findings.filter(item => item.rule === VIOLATIONS.MULTIPLE_NEW_APIS).length,
    blankEditor: findings.filter(item => item.rule === VIOLATIONS.BLANK_EDITOR).length,
    findings,
  })
}
courses.sort((left, right) => right.violations - left.violations || left.id.localeCompare(right.id))

/* -------------------------------------------------------------- отчёт */

const routed = courses.filter(course => !course.noRoute)
const orphans = courses.filter(course => course.noRoute)
const total = (list, field) => list.reduce((acc, course) => acc + course[field], 0)
const totals = {
  courses: courses.length,
  coursesInRoutes: routed.length,
  coursesOutsideRoutes: orphans.length,
  coursesWithViolations: routed.filter(course => course.requiredBeforeShown).length,
  requiredBeforeShown: total(routed, 'requiredBeforeShown'),
  firstUseSameMission: total(routed, 'firstUseSameMission'),
  multipleNewApis: total(routed, 'multipleNewApis'),
  blankEditor: total(routed, 'blankEditor'),
  outsideRoutes: {
    courses: orphans.map(course => course.id),
    requiredBeforeShown: total(orphans, 'requiredBeforeShown'),
  },
}
const report = {
  note: 'Нарушения правила «нельзя требовать то, чего не показали». Считается автоматически: '
    + 'npm run api:audit. Показом считается любое упоминание конструкции в стартовом файле или '
    + 'тексте миссии, поэтому числа ниже — нижняя граница: доказать, что конструкцию объяснили, '
    + 'а не просто показали, машина не может.',
  rules: {
    [VIOLATIONS.REQUIRED_BEFORE_SHOWN]: 'миссия требует написать конструкцию, которой человек ещё нигде не видел',
    [VIOLATIONS.MULTIPLE_NEW_APIS]: `в одной миссии впервые требуется больше ${NEW_API_LIMIT} новых сущностей`,
    [VIOLATIONS.BLANK_EDITOR]: 'человек начинает с пустого редактора: в стартовом файле нет ни одной исполняемой строки',
  },
  totals,
  courses,
}
mkdirSync(reportsDir, { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

const md = ['# Введение конструкций до требования', '',
  'Собирается автоматически: `npm run api:audit`.', '',
  'Правило: ни одна миссия не может требовать написать конструкцию, функцию, метод или вызов',
  'библиотеки, которых человек ещё нигде не видел. Показом считается появление в стартовом файле',
  'или в тексте миссии — определение щедрое, поэтому числа ниже занижены.', '',
  `Курсов с кодом: ${totals.courses}. Из них с нарушениями: ${totals.coursesWithViolations}.`,
  `Требований без показа: ${totals.requiredBeforeShown}. Миссий с несколькими новыми сущностями сразу: ${totals.multipleNewApis}.`,
  '', '| Курс | Язык | Кодовых миссий | Требуется без показа | Много нового сразу |', '|---|---|---:|---:|---:|']
for (const course of courses) {
  md.push(`| \`${course.id}\` | ${course.language} | ${course.codeMissions} | ${course.requiredBeforeShown} | ${course.multipleNewApis} |`)
}
md.push('', 'Полный список с миссиями и токенами: `knowledge/reports/api-introduction.json`.', '')
writeFileSync(markdownPath, md.join('\n'), 'utf8')

console.log(`Курсов с кодом: ${totals.courses} · в маршрутах: ${totals.coursesInRoutes} · с нарушениями: ${totals.coursesWithViolations}`)
console.log(`required-before-shown                     ${totals.requiredBeforeShown}`)
console.log(`independent-use-right-after-first-sight   ${totals.firstUseSameMission}`)
console.log(`multiple-new-apis-at-once                 ${totals.multipleNewApis}`)
console.log(`blank-editor-task                          ${totals.blankEditor}`)
console.log(`вне маршрутов, отдельно                   ${totals.outsideRoutes.requiredBeforeShown} в ${orphans.length} курсах\n`)
for (const course of routed.slice(0, 14)) {
  if (!course.requiredBeforeShown) continue
  console.log(`  ${course.id.padEnd(26)} ${String(course.requiredBeforeShown).padStart(4)} без показа  `
    + `${String(course.multipleNewApis).padStart(3)} перегруженных`)
  const sample = course.findings.find(item => item.rule === VIOLATIONS.REQUIRED_BEFORE_SHOWN)
  if (sample) console.log(`      ${sample.missionId}: требует ${sample.token} (${sample.kind}), нигде не показано`)
}
console.log(`\nОтчёты: knowledge/reports/api-introduction.json и .md`)
