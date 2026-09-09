/**
 * Проверка главного правила: нельзя требовать то, чего не показали.
 *
 * Миссия вправе требовать от человека написать конструкцию, функцию, метод или
 * вызов библиотеки только если он это уже видел. «Название технологии
 * упоминалось» обучением не считается: если студенту сказали, что NumPy нужен
 * для чисел, а потом попросили `np.sqrt`, он берёт решение не из курса.
 *
 * Что считается показом. Для функции, метода и вызова библиотеки — только
 * реальный пример синтаксиса: `int("12")`, а не фраза «преобразуй в int».
 * Для ключевого слова, оператора и пунктуации — появление в стартовом файле
 * или в тексте миссии. Подсказки в показ не входят: они приходят после того,
 * как человек столкнулся с заданием, и учить ими нельзя.
 *
 * Что считается требованием. Токен требуется, если он есть в автоматической
 * проверке `codeChecks` и при этом отсутствует в исполняемом коде стартового
 * файла: значит, написать его должен человек. Комментарий кодом не является.
 *
 * Порядок изучения берётся из маршрутов профессий, а не из алфавита каталога.
 * Токен считается известным, если он был показан раньше в этом же курсе или в
 * любом курсе, который хотя бы в одном маршруте стоит перед текущим.
 *
 * Разбор и правила лежат в `scripts/audit/introduction.mjs`, их проверки —
 * в `scripts/audit-tests.mjs` (`npm run api:audit:test`).
 *
 *   node ./scripts/audit-api-introduction.mjs
 *   node ./scripts/audit-api-introduction.mjs --course python-core
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadCorpus } from './quality/corpus.mjs'
import {
  KEYWORDS, RULE_FIELDS, RULE_TEXT, VIOLATIONS, analyzeCourse, auditSkillCoverage,
  compareToBaseline, countCritical, countRule,
} from './audit/introduction.mjs'

const root = resolve(import.meta.dirname, '..')
const reportsDir = join(root, 'knowledge', 'reports')
const reportPath = join(reportsDir, 'api-introduction.json')
const markdownPath = join(reportsDir, 'api-introduction.md')
const baselinePath = join(reportsDir, 'api-introduction-baseline.json')
const updating = process.argv.includes('--update-baseline')
const only = process.argv.includes('--course')
  ? process.argv[process.argv.indexOf('--course') + 1]
  : null

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

const languageByExtension = (() => {
  const registryPath = join(root, 'knowledge', 'skills-registry.json')
  const registry = existsSync(registryPath) ? readJson(registryPath) : {}
  return registry.languageByExtension ?? {
    '.py': 'python', '.js': 'javascript', '.jsx': 'javascript', '.ts': 'javascript',
    '.go': 'go', '.java': 'java', '.sql': 'sql', '.yaml': 'yaml', '.yml': 'yaml',
  }
})()

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

const courses = []
for (const course of corpus.courses) {
  if (only && course.id !== only) continue
  const language = courseLanguage(course)
  if (!language || !KEYWORDS[language]) continue

  const earlierCourses = precedingCourses(course.id)
    .map(id => courseById.get(id))
    .filter(earlier => courseLanguage(earlier) === language)
  const { findings, requiredTotal, inheritedTokens } = analyzeCourse({ course, language, earlierCourses })

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
    inheritedTokens,
    requiredTokens: requiredTotal,
    violations: findings.length,
    requiredBeforeShown: countRule(findings, VIOLATIONS.REQUIRED_BEFORE_SHOWN),
    firstUseSameMission: countRule(findings, VIOLATIONS.FIRST_USE_SAME_MISSION),
    multipleNewApis: countRule(findings, VIOLATIONS.MULTIPLE_NEW_APIS),
    blankEditor: countRule(findings, VIOLATIONS.BLANK_EDITOR),
    checkPassesOnStarter: countRule(findings, VIOLATIONS.CHECK_PASSES_ON_STARTER),
    checkPassesOnStarterCritical: countCritical(findings, VIOLATIONS.CHECK_PASSES_ON_STARTER),
    hintIsNotTeaching: countRule(findings, VIOLATIONS.HINT_IS_NOT_TEACHING),
    hintIsNotTeachingCritical: countCritical(findings, VIOLATIONS.HINT_IS_NOT_TEACHING),
    findings,
  })
}
/* ---------------------------------- покрытие объявленных навыков практикой */

// Правило работает по всему каталогу сразу: навык может вводиться в одном курсе,
// а применяться в другом, и «нигде не требуется» доказывается только целиком.
const skillsRegistry = readJson(join(root, 'knowledge', 'skills-registry.json'))
const skillFindings = auditSkillCoverage({ skills: skillsRegistry.skills ?? [], courses: corpus.courses })
const byCourse = new Map(courses.map(course => [course.id, course]))
const outsideAnalysis = []
for (const finding of skillFindings) {
  const course = byCourse.get(finding.courseId)
  if (!course) { outsideAnalysis.push(finding); continue }
  course.findings.push(finding)
}
for (const course of courses) {
  course.violations = course.findings.length
  course.ladderGap = countRule(course.findings, VIOLATIONS.LADDER_GAP)
  course.declaredNeverRequired = countRule(course.findings, VIOLATIONS.DECLARED_NEVER_REQUIRED)
  course.noReinforcement = countRule(course.findings, VIOLATIONS.NO_REINFORCEMENT)
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
  checkPassesOnStarter: total(routed, 'checkPassesOnStarter'),
  checkPassesOnStarterCritical: total(routed, 'checkPassesOnStarterCritical'),
  hintIsNotTeaching: total(routed, 'hintIsNotTeaching'),
  hintIsNotTeachingCritical: total(routed, 'hintIsNotTeachingCritical'),
  ladderGap: total(routed, 'ladderGap'),
  declaredNeverRequired: total(routed, 'declaredNeverRequired'),
  noReinforcement: total(routed, 'noReinforcement'),
  skillsOutsideAnalysis: outsideAnalysis.length,
  outsideRoutes: {
    courses: orphans.map(course => course.id),
    requiredBeforeShown: total(orphans, 'requiredBeforeShown'),
  },
}
const report = {
  note: 'Нарушения правила «нельзя требовать то, чего не показали». Считается автоматически: '
    + 'npm run api:audit. Показом функции или метода считается только пример синтаксиса вызова; '
    + 'имя, названное в прозе, показом не является. Подсказки в показ не входят. Комментарий '
    + 'в стартовом файле не считается ни исполненным кодом, ни выполненным требованием.',
  rules: Object.fromEntries(Object.values(VIOLATIONS).map(rule => [rule, RULE_TEXT[rule]])),
  totals,
  courses,
}
mkdirSync(reportsDir, { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

const md = ['# Введение конструкций до требования', '',
  'Собирается автоматически: `npm run api:audit`.', '',
  'Правило: ни одна миссия не может требовать написать конструкцию, функцию, метод или вызов',
  'библиотеки, синтаксис которых человеку нигде не показывали. Для функций и методов показом',
  'считается только реальный пример вызова: имя, названное в прозе, показом не является.',
  'Подсказки в показ не входят, комментарий в стартовом файле кодом не считается.', '',
  `Курсов с кодом: ${totals.courses}. Из них с нарушениями: ${totals.coursesWithViolations}.`,
  `Требований без показа: ${totals.requiredBeforeShown}. Миссий с несколькими новыми сущностями сразу: ${totals.multipleNewApis}.`,
  `Проверок, выполненных стартовым файлом: ${totals.checkPassesOnStarter} (критических: ${totals.checkPassesOnStarterCritical}).`,
  `Подсказок, выдающих ответ: ${totals.hintIsNotTeaching} (критических: ${totals.hintIsNotTeachingCritical}).`,
  '', '| Курс | Язык | Кодовых миссий | Требуется без показа | Показ и требование сразу | Много нового сразу | Проверка на старте | Ответ в подсказке |',
  '|---|---|---:|---:|---:|---:|---:|---:|']
for (const course of courses) {
  md.push(`| \`${course.id}\` | ${course.language} | ${course.codeMissions} | ${course.requiredBeforeShown} `
    + `| ${course.firstUseSameMission} | ${course.multipleNewApis} | ${course.checkPassesOnStarter} | ${course.hintIsNotTeaching} |`)
}
md.push('', 'Полный список с миссиями и токенами: `knowledge/reports/api-introduction.json`.', '')
writeFileSync(markdownPath, md.join('\n'), 'utf8')

console.log(`Курсов с кодом: ${totals.courses} · в маршрутах: ${totals.coursesInRoutes} · с нарушениями: ${totals.coursesWithViolations}`)
console.log(`required-before-shown                     ${totals.requiredBeforeShown}`)
console.log(`independent-use-right-after-first-sight   ${totals.firstUseSameMission}`)
console.log(`multiple-new-apis-at-once                 ${totals.multipleNewApis}`)
console.log(`blank-editor-task                         ${totals.blankEditor}`)
console.log(`check-passes-on-starter                   ${totals.checkPassesOnStarter} (критических ${totals.checkPassesOnStarterCritical})`)
console.log(`hint-is-not-teaching                      ${totals.hintIsNotTeaching} (критических ${totals.hintIsNotTeachingCritical})`)
console.log(`ladder-gap                                ${totals.ladderGap}`)
console.log(`declared-but-never-required               ${totals.declaredNeverRequired}`)
console.log(`introduced-without-reinforcement          ${totals.noReinforcement}`)
console.log(`вне маршрутов, отдельно                   ${totals.outsideRoutes.requiredBeforeShown} в ${orphans.length} курсах\n`)
for (const course of routed.slice(0, 14)) {
  if (!course.requiredBeforeShown) continue
  console.log(`  ${course.id.padEnd(26)} ${String(course.requiredBeforeShown).padStart(4)} без показа  `
    + `${String(course.multipleNewApis).padStart(3)} перегруженных`)
  const sample = course.findings.find(item => item.rule === VIOLATIONS.REQUIRED_BEFORE_SHOWN)
  if (sample) console.log(`      ${sample.missionId}: требует ${sample.token} (${sample.kind}) — ${sample.evidence}`)
}
console.log(`\nОтчёты: knowledge/reports/api-introduction.json и .md`)

/* ------------------------------------------------------- базовая линия */

/**
 * Аудит становится воротами сборки, а не справкой.
 *
 * Полный запрет нарушений сборку сейчас не пропустит: старого долга больше
 * четырёхсот находок, и разбирать его придётся не одну неделю. Поэтому здесь
 * работает тот же приём, что у классификатора происхождения: долг фиксируется
 * как есть, а сборка падает на ухудшении — когда у курса выросло число находок
 * по какому-нибудь правилу или когда новый курс приезжает уже с нарушениями.
 *
 * Считается по курсам, а не по общему итогу: итог скрывает размен между
 * курсами. Сравнение вынесено в `scripts/audit/introduction.mjs`, чтобы у него
 * были собственные проверки в `npm run api:audit:test`.
 */
const snapshot = {
  note: 'Базовая линия аудита введения конструкций. Старый долг зафиксирован как есть и сборку '
    + 'не валит. Сборка падает на ухудшении: когда у курса выросло число находок по какому-нибудь '
    + 'правилу или когда новый курс приезжает уже с нарушениями. Считается по курсам, а не по '
    + 'общему итогу: итог скрывает размен между курсами. '
    + 'Перезаписывать после каждого исправления: npm run api:audit:baseline',
  totals: Object.fromEntries(Object.values(RULE_FIELDS).map(field => [field, totals[field]])),
  byCourse: Object.fromEntries(courses.map(course => [
    course.id,
    Object.fromEntries(Object.values(RULE_FIELDS).map(field => [field, course[field]])),
  ])),
}

if (updating) {
  writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Базовая линия зафиксирована: ${baselinePath.slice(root.length + 1)}`)
}

// Разбор одного курса не видит остальных, и сравнивать с линией по нему нельзя.
if (only) process.exit(0)

const baseline = existsSync(baselinePath) ? readJson(baselinePath) : null
if (!baseline) {
  console.log('\nБазовой линии ещё нет. Зафиксируйте текущее состояние: npm run api:audit:baseline')
  process.exit(0)
}

const { failures, improvements } = compareToBaseline(baseline, courses)
if (improvements.length) {
  console.log('\nСтало лучше базовой линии:')
  for (const item of improvements.slice(0, 12)) console.log(`  ${item}`)
  if (improvements.length > 12) console.log(`  … и ещё ${improvements.length - 12}`)
  console.log('  Перезапишите базовую линию: npm run api:audit:baseline')
}
if (failures.length && !updating) {
  console.error('\nПорядок введения конструкций ухудшился:')
  for (const item of failures) console.error(`  ✕ ${item}`)
  console.error('\nЕсли ухудшение осознанное, обновите линию: npm run api:audit:baseline')
  process.exit(1)
}
console.log('\nРегрессий нет: старый долг зафиксирован, новых нарушений не добавилось\n')
