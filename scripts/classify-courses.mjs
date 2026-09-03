/**
 * Классификация runtime-курсов по происхождению содержания.
 *
 * Отвечает на один вопрос: этот курс написан человеком или выдан генератором,
 * который умеет производить файлы, похожие на курс. Число миссий на этот вопрос
 * не отвечает — генератор выдаёт ровно 13 штук и выглядит убедительно.
 *
 * Политика намеренно мягкая. Скрипт ничего не чинит и почти ничего не валит:
 * сорок с лишним курсов уже в репозитории, и падающая на них сборка не сделает
 * их лучше, а работать помешает. Сборка падает только на ухудшении — когда
 * хороший курс стал плохим или в репозиторий приехал новый плохой.
 *
 * Разделение с validate-quality.mjs: там правила про качество формулировок
 * внутри миссии (утечка ответа, дубли, самый длинный вариант), и у них своя
 * базовая линия. Здесь — происхождение курса целиком. Метрики оттуда
 * дублируются в отчёт как справочные, но воротами тут не служат.
 *
 *   node ./scripts/classify-courses.mjs                    отчёт и проверка
 *   node ./scripts/classify-courses.mjs --update-baseline  зафиксировать линию
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadCorpus } from './quality/corpus.mjs'

const root = resolve(import.meta.dirname, '..')
const reportsDir = join(root, 'knowledge', 'reports')
const reportPath = join(reportsDir, 'course-quality.json')
const markdownPath = join(reportsDir, 'course-quality.md')
const baselinePath = join(reportsDir, 'course-quality-baseline.json')
const overridesPath = join(reportsDir, 'course-quality-overrides.json')
const updating = process.argv.includes('--update-baseline')

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const readJsonIf = (path, fallback) => (existsSync(path) ? readJson(path) : fallback)

export const CLASSES = {
  AUTHORED_REAL: 'AUTHORED_REAL',
  AUTHORED_NEEDS_REVIEW: 'AUTHORED_NEEDS_REVIEW',
  GENERATOR_SCAFFOLD: 'GENERATOR_SCAFFOLD',
  FAKE_PRACTICE: 'FAKE_PRACTICE',
  OUTLINE_ONLY: 'OUTLINE_ONLY',
}
const ORDER = [
  CLASSES.AUTHORED_REAL,
  CLASSES.AUTHORED_NEEDS_REVIEW,
  CLASSES.GENERATOR_SCAFFOLD,
  CLASSES.FAKE_PRACTICE,
  CLASSES.OUTLINE_ONLY,
]

/* ------------------------------------------------------------- признаки */

const TYPE_PREFIX = /^(Сцена|Код|Лаборатория|Разбор|Практика|Кейс):\s*/
const TEMPLATE_OBJECTIVE = /^(понять принцип «|применить его в рабочем решении$)/
/**
 * Русская строка как подменённое решение.
 *
 * Различать нужно два разных случая. `print("Москва")` и `city = "Казань"` —
 * нормальные задания для новичка: строка здесь данные, а проверяется код
 * вокруг неё. `artifact = "профиль дерева"` — подмена: человек не пишет код,
 * а вписывает формулировку под заранее известное имя.
 *
 * Отличает их не кириллица и не присваивание, а многословность: подменённое
 * решение — это всегда фраза, а не значение. Ловить присваивание нельзя: под
 * подозрение попадёт первая же миссия про переменные.
 */
const CYRILLIC_PHRASE = /"[^"]*[а-яёА-ЯЁ][^"]*\s[^"]*"/
const isCyrillicLiteral = fragment => CYRILLIC_PHRASE.test(fragment)
/** Заглушка «назови артефакт и перечисли шаги» во всех языковых вариантах. */
const PLAN_STUB = /\b(build_plan|buildPlan)\s*\(/
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]{2,}/g

const squash = text => String(text ?? '').replace(/\s+/g, ' ').trim()
/** Проверка считается выполненной, если фрагмент уже лежит в стартовом файле. */
const alreadyContains = (code, fragment) => squash(code).includes(squash(fragment))

/**
 * Тройка «Сцена / Код / Лаборатория» на одну тему — подпись генератора.
 *
 * Один заголовок с префиксом уликой не является: «Сцена: смена, которая не
 * заканчивается» в go-core написана руками. Генератор выдаёт себя тем, что одна
 * и та же тема повторяется под несколькими типами подряд.
 */
function scaffoldTriplets(missions) {
  const byTopic = new Map()
  for (const mission of missions) {
    const match = TYPE_PREFIX.exec(mission.title ?? '')
    if (!match) continue
    const topic = mission.title.slice(match[0].length).trim()
    byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1)
  }
  let total = 0
  for (const count of byTopic.values()) if (count >= 2) total += count
  return total
}

/**
 * Разбор автоматических проверок кодовой миссии.
 *
 * Наличие codeChecks ещё ничего не говорит о качестве. Значение имеет то, что
 * именно проверка требует: поведение программы, уже готовый кусок стартового
 * файла или русскую фразу, вписанную в строковый литерал.
 */
function inspectChecks(mission) {
  const task = mission.task ?? {}
  const checks = task.codeChecks ?? []
  const starter = task.starterCode ?? ''
  const kinds = { behavioural: 0, literal: 0, preSatisfied: 0 }
  for (const check of checks) {
    const fragment = check.includes ?? ''
    if (alreadyContains(starter, fragment)) kinds.preSatisfied += 1
    else if (isCyrillicLiteral(fragment)) kinds.literal += 1
    else kinds.behavioural += 1
  }
  return { checks: checks.length, stub: PLAN_STUB.test(starter), ...kinds }
}

/**
 * Практика поддельна, если от студента требуется не поведение, а формулировка.
 *
 * Два случая. Либо среди проверок нет ни одной содержательной — только русские
 * литералы и куски, уже лежащие в стартовом файле. Либо задание построено на
 * заглушке «назови артефакт и перечисли шаги»: тогда добавленный генератором
 * `assert plan["steps"]` формально выглядит проверкой поведения, но проверяет
 * он ровно то, что студент вписал строкой, — и упражнение остаётся тем же.
 */
function isFakePractice(kinds) {
  if (kinds.literal === 0) return false
  return kinds.behavioural === 0 || kinds.stub
}

/**
 * Токены, которых студенту не показали.
 *
 * Считается как метрика и в классификацию не входит. Признак слишком шумный:
 * в pandas он срабатывает 336 раз, потому что проверка требует `groupby`, а в
 * тексте миссии написано «сгруппируй». Это нормальная авторская миссия, и
 * ставить ей диагноз по такому счётчику нельзя. Число полезно как ориентир,
 * куда смотреть глазами, — не более.
 */
function unknownRequiredTokens(mission) {
  const task = mission.task ?? {}
  const shown = [
    task.starterCode, task.prompt, task.explanation, mission.intro,
    mission.productionContext, (mission.hints ?? []).join(' '),
  ].join(' ')
  const unknown = new Set()
  for (const check of task.codeChecks ?? []) {
    for (const token of String(check.includes ?? '').match(IDENTIFIER) ?? []) {
      if (!shown.includes(token)) unknown.add(token)
    }
  }
  return [...unknown]
}

/* ------------------------------------------------ язык и порядок изучения */

const registry = readJsonIf(join(root, 'knowledge', 'skills-registry.json'), {})
const languageByExtension = registry.languageByExtension ?? {}

function missionLanguage(mission) {
  const file = mission.task?.workspaceFile
  if (!file) return undefined
  return languageByExtension[file.slice(file.lastIndexOf('.'))]
}

/**
 * Язык, который курс требует раньше, чем его где-либо преподают.
 *
 * Правило проекта — зависимости не блокируют, поэтому это не запрет, а
 * наблюдение: если в маршруте профессии человек пишет на языке, которому его в
 * этом маршруте ещё не учили, курс задаёт знание по факту использования.
 */
function prerequisiteByUsage(courses, programs) {
  const teaches = new Map(courses.map(course => [course.id, course.technology ?? course.language]))
  const violations = new Map(courses.map(course => [course.id, []]))
  for (const program of programs) {
    const route = program.stages.flatMap(stage => stage.courseIds)
    route.forEach((courseId, index) => {
      const course = courses.find(item => item.id === courseId)
      if (!course) return
      const earlier = new Set(route.slice(0, index + 1).map(id => teaches.get(id)).filter(Boolean))
      const used = new Set((course.missions ?? []).map(missionLanguage).filter(Boolean))
      for (const language of used) {
        if (!earlier.has(language)) {
          violations.get(courseId).push({ professionId: program.professionId, language })
        }
      }
    })
  }
  return violations
}

/* ------------------------------------------------------------ покрытие */

const sourceCatalog = readJsonIf(join(root, 'knowledge', 'content-factory', 'sources.json'), { sources: [] })
const coverageByCourse = new Map()
for (const source of sourceCatalog.sources ?? []) {
  for (const courseId of source.coverage ?? []) {
    if (!coverageByCourse.has(courseId)) coverageByCourse.set(courseId, [])
    coverageByCourse.get(courseId).push({ id: source.id, class: source.class })
  }
}

/* --------------------------------------------------------- классификация */

/**
 * Решение принимается по совокупности признаков, а не по одному.
 *
 * Каждый отдельный признак ошибается: префикс «Сцена:» бывает авторским,
 * codeChecks бывают настоящими, самый длинный правильный ответ встречается и в
 * хороших курсах. Поэтому каждый класс требует либо двух независимых подписей
 * генератора, либо расхождения между учебной целью и требуемым действием.
 */
function classify(metrics) {
  const reasons = []
  const { missions, codeLab, fakePractice, triplets, templateObjectives, echo,
    starterSatisfies, literalAnswerLeak } = metrics

  if (missions === 0) return { classification: CLASSES.OUTLINE_ONLY, reasons: ['нет миссий'] }

  const share = value => value / missions
  const generatorSignatures = [
    share(triplets) >= 0.5 && `${triplets} из ${missions} заголовков — одна тема под несколькими типами`,
    share(templateObjectives) >= 0.5 && `${templateObjectives} из ${missions} миссий с шаблонной учебной целью`,
    share(echo) >= 0.3 && `${echo} миссий повторяют одну фразу в контексте, объяснении и подсказке`,
  ].filter(Boolean)

  // Практика считается поддельной там, где учебная цель и требуемое действие
  // разошлись: тема про модель, сеть или безопасность, а проверка требует
  // вписать русскую фразу в строку и вернуть нетронутую заготовку.
  if (fakePractice >= 2 && codeLab > 0 && fakePractice / codeLab >= 0.5) {
    reasons.push(`${fakePractice} из ${codeLab} практических миссий проверяют русский литерал, а не поведение`)
    reasons.push(...generatorSignatures)
    return { classification: CLASSES.FAKE_PRACTICE, reasons }
  }

  if (generatorSignatures.length >= 2) {
    return { classification: CLASSES.GENERATOR_SCAFFOLD, reasons: generatorSignatures }
  }

  if (fakePractice) reasons.push(`${fakePractice} миссий проверяют русский литерал вместо поведения`)
  if (starterSatisfies) reasons.push(`${starterSatisfies} миссий проходят проверку без единой правки файла`)
  if (literalAnswerLeak) reasons.push(`${literalAnswerLeak} миссий содержат ответ дословно в тексте задания`)
  reasons.push(...generatorSignatures)

  return {
    classification: reasons.length ? CLASSES.AUTHORED_NEEDS_REVIEW : CLASSES.AUTHORED_REAL,
    reasons,
  }
}

/* ------------------------------------------------------------- сборка */

const corpus = loadCorpus(root)
const programs = readJson(join(root, 'knowledge', 'professions', 'programs.json'))
const overrides = readJsonIf(overridesPath, {})
const usageViolations = prerequisiteByUsage(corpus.courses, programs)

const courses = corpus.courses.map(course => {
  const missions = course.missions ?? []
  const codeLabMissions = missions.filter(mission => (mission.task?.codeChecks ?? []).length)

  let fakePractice = 0
  let starterSatisfies = 0
  let planStubs = 0
  let unknownTokens = 0
  const unknownSamples = new Set()
  for (const mission of codeLabMissions) {
    const kinds = inspectChecks(mission)
    if (isFakePractice(kinds)) fakePractice += 1
    if (kinds.checks > 0 && kinds.preSatisfied === kinds.checks) starterSatisfies += 1
    if (PLAN_STUB.test(mission.task?.starterCode ?? '')) planStubs += 1
    const tokens = unknownRequiredTokens(mission)
    unknownTokens += tokens.length
    for (const token of tokens.slice(0, 2)) unknownSamples.add(token)
  }

  let templateObjectives = 0
  let echo = 0
  let optionMissions = 0
  let longestIsCorrect = 0
  let literalAnswerLeak = 0
  for (const mission of missions) {
    if ((mission.objectives ?? []).some(item => TEMPLATE_OBJECTIVE.test(item))) templateObjectives += 1

    const lead = String(mission.productionContext ?? '').split('.')[0].trim()
    const hints = (mission.hints ?? []).join(' ')
    if (lead.length >= 25 && (mission.task?.explanation ?? '').includes(lead) && hints.includes(lead)) echo += 1

    const options = mission.task?.options ?? []
    const answer = String(mission.task?.answer ?? '').trim()
    if (options.length && answer) {
      optionMissions += 1
      if (options.every(option => option === answer || option.length < answer.length)) longestIsCorrect += 1
      const before = `${mission.intro ?? ''} ${mission.productionContext ?? ''}`
      if (answer.length > 12 && before.includes(answer)) literalAnswerLeak += 1
    }
  }

  const metrics = {
    missions: missions.length,
    codeLab: codeLabMissions.length,
    fakePractice,
    triplets: scaffoldTriplets(missions),
    templateObjectives,
    echo,
    starterSatisfies,
    literalAnswerLeak,
  }
  const verdict = overrides[course.id]
    ? { classification: overrides[course.id].classification, reasons: [`ручное решение: ${overrides[course.id].why}`] }
    : classify(metrics)

  return {
    id: course.id,
    path: course.path,
    title: course.title,
    level: course.level,
    technology: course.technology ?? null,
    ...verdict,
    overridden: Boolean(overrides[course.id]),
    missions: metrics.missions,
    codeLabMissions: metrics.codeLab,
    fakePracticeMissions: fakePractice,
    planStubMissions: planStubs,
    scaffoldTripletTitles: metrics.triplets,
    templateObjectiveMissions: templateObjectives,
    echoPhraseMissions: echo,
    starterAlreadySatisfies: starterSatisfies,
    optionMissions,
    longestAnswerRatio: optionMissions ? Number((longestIsCorrect / optionMissions).toFixed(3)) : 0,
    literalAnswerLeak,
    unknownRequiredTokens: unknownTokens,
    unknownTokenSamples: [...unknownSamples].slice(0, 5),
    prerequisiteByUsage: usageViolations.get(course.id) ?? [],
    sourceCoverage: coverageByCourse.get(course.id) ?? [],
  }
})
courses.sort((left, right) => ORDER.indexOf(left.classification) - ORDER.indexOf(right.classification)
  || left.id.localeCompare(right.id))

/* ------------------------------- проектный граф: отдельный слой outline */

const curriculumDir = join(root, 'knowledge', 'curriculum', 'courses')
const graphCourses = existsSync(curriculumDir)
  ? readdirSync(curriculumDir).filter(name => name.endsWith('.json'))
      .flatMap(name => readJson(join(curriculumDir, name)))
  : []
const runtimeIds = new Set(courses.map(course => course.id))
// Курс проектного графа без модулей — это план, а не программа. Он попадает в
// отчёт отдельным слоем: приложение его не читает, но заявленной профессией он
// выглядит, и путать эти два состояния нельзя.
const outline = graphCourses
  .filter(course => !(course.modules ?? []).length)
  .map(course => ({
    id: course.id,
    classification: CLASSES.OUTLINE_ONLY,
    layer: 'curriculum',
    inRuntime: runtimeIds.has(course.id),
    status: course.status ?? null,
    title: course.title,
    domain: course.domain ?? null,
  }))

/* -------------------------------------------------------------- отчёт */

const totals = Object.fromEntries(ORDER.map(name => [name, courses.filter(item => item.classification === name).length]))
totals[CLASSES.OUTLINE_ONLY] = outline.length

const report = {
  note: 'Классификация runtime-курсов по происхождению содержания. Считается автоматически: npm run quality:report. '
    + 'Время сборки в файл не пишется намеренно — отчёт лежит в репозитории, и метка времени давала бы изменение в diff при каждом прогоне.',
  totals,
  missionsByClass: Object.fromEntries(ORDER.map(name =>
    [name, courses.filter(item => item.classification === name).reduce((sum, item) => sum + item.missions, 0)])),
  runtime: { courses: courses.length, missions: courses.reduce((sum, item) => sum + item.missions, 0) },
  curriculumLayer: { courses: graphCourses.length, outline: outline.length },
  courses,
  outline,
}
mkdirSync(reportsDir, { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

const md = ['# Происхождение содержания курсов', '',
  'Собирается автоматически: `npm run quality:report`. Классифицирует не качество формулировок',
  '(это делает `validate-quality.mjs`), а происхождение курса: написан он человеком или выдан генератором.', '',
  '| Класс | Курсов | Миссий |', '|---|---:|---:|']
for (const name of ORDER) {
  if (name === CLASSES.OUTLINE_ONLY) continue
  md.push(`| ${name} | ${totals[name]} | ${report.missionsByClass[name]} |`)
}
md.push(`| ${CLASSES.OUTLINE_ONLY} (проектный граф) | ${outline.length} | — |`, '',
  `Runtime: ${report.runtime.courses} курсов, ${report.runtime.missions} миссий. `
  + `Проектный граф: ${report.curriculumLayer.courses} курсов, из них ${outline.length} без модулей.`, '',
  '## Курсы', '', '| Курс | Класс | Миссий | Практики | Подделок | Длинный ответ | Источников | Почему |',
  '|---|---|---:|---:|---:|---:|---:|---|')
for (const course of courses) {
  md.push(`| \`${course.id}\` | ${course.classification} | ${course.missions} | ${course.codeLabMissions} `
    + `| ${course.fakePracticeMissions} | ${Math.round(course.longestAnswerRatio * 100)}% `
    + `| ${course.sourceCoverage.length} | ${course.reasons.join('; ') || '—'} |`)
}
md.push('', 'Полный отчёт с метриками: `knowledge/reports/course-quality.json`.', '')
writeFileSync(markdownPath, md.join('\n'), 'utf8')

/* ------------------------------------------------------- базовая линия */

const snapshot = {
  note: 'Базовая линия происхождения курсов. Старый долг зафиксирован как есть и сборку не валит. '
    + 'Сборка падает только на ухудшении: когда классов GENERATOR_SCAFFOLD или FAKE_PRACTICE стало больше, '
    + 'когда AUTHORED_REAL стало меньше, когда уже хороший курс деградировал или когда новый курс приезжает плохим. '
    + 'Перезаписывать после каждого исправления: npm run quality:report:baseline',
  totals: Object.fromEntries(ORDER.map(name => [name, totals[name]])),
  planStubMissions: courses.reduce((sum, item) => sum + item.planStubMissions, 0),
  classificationById: Object.fromEntries(courses.map(item => [item.id, item.classification])),
}

if (updating) {
  writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  console.log(`Базовая линия зафиксирована: ${baselinePath.slice(root.length + 1)}`)
}

/* -------------------------------------------------------------- вывод */

for (const name of ORDER) {
  const list = courses.filter(item => item.classification === name)
  if (name === CLASSES.OUTLINE_ONLY) continue
  console.log(`${name.padEnd(23)} ${String(list.length).padStart(3)} курсов  `
    + `${String(list.reduce((sum, item) => sum + item.missions, 0)).padStart(5)} миссий`)
}
console.log(`${'OUTLINE_ONLY'.padEnd(23)} ${String(outline.length).padStart(3)} курсов проектного графа без модулей`)
console.log(`\nОтчёты: knowledge/reports/course-quality.json и .md`)

const baseline = readJsonIf(baselinePath, null)
if (!baseline) {
  console.log('\nБазовой линии ещё нет. Зафиксируйте текущее состояние: npm run quality:report:baseline')
  process.exit(0)
}

const failures = []
const grew = (name) => {
  const was = baseline.totals?.[name] ?? 0
  if (totals[name] > was) failures.push(`${name}: было ${was}, стало ${totals[name]}`)
}
grew(CLASSES.GENERATOR_SCAFFOLD)
grew(CLASSES.FAKE_PRACTICE)

const wasReal = baseline.totals?.[CLASSES.AUTHORED_REAL] ?? 0
if (totals[CLASSES.AUTHORED_REAL] < wasReal) {
  failures.push(`${CLASSES.AUTHORED_REAL}: было ${wasReal}, стало ${totals[CLASSES.AUTHORED_REAL]}`)
}

const bad = [CLASSES.GENERATOR_SCAFFOLD, CLASSES.FAKE_PRACTICE]
for (const course of courses) {
  const before = baseline.classificationById?.[course.id]
  if (before === CLASSES.AUTHORED_REAL && bad.includes(course.classification)) {
    failures.push(`${course.id}: был ${before}, стал ${course.classification}`)
  }
  // Новый курс приезжает уже классифицированным. Требование одно: не в плохом
  // классе. Хороший новый курс сборку не валит — базовую линию просто обновляют.
  if (!before && bad.includes(course.classification)) {
    failures.push(`${course.id}: новый курс сразу ${course.classification}`)
  }
  if (!before && course.planStubMissions) {
    failures.push(`${course.id}: новый курс использует заглушку build_plan/artifact/steps`)
  }
}

const stubsWere = baseline.planStubMissions ?? 0
if (snapshot.planStubMissions > stubsWere) {
  failures.push(`заглушек build_plan: было ${stubsWere}, стало ${snapshot.planStubMissions}`)
}

const improvements = []
for (const name of [CLASSES.GENERATOR_SCAFFOLD, CLASSES.FAKE_PRACTICE]) {
  const was = baseline.totals?.[name] ?? 0
  if (totals[name] < was) improvements.push(`${name}: ${was} → ${totals[name]}`)
}
if (totals[CLASSES.AUTHORED_REAL] > wasReal) {
  improvements.push(`${CLASSES.AUTHORED_REAL}: ${wasReal} → ${totals[CLASSES.AUTHORED_REAL]}`)
}
if (improvements.length) {
  console.log('\nСтало лучше базовой линии:')
  for (const item of improvements) console.log(`  ${item}`)
  console.log('  Перезапишите базовую линию: npm run quality:report:baseline')
}

if (failures.length && !updating) {
  console.error('\nПроисхождение содержания ухудшилось:')
  for (const item of failures) console.error(`  ✕ ${item}`)
  console.error('\nЕсли ухудшение осознанное, обновите линию: npm run quality:report:baseline')
  process.exit(1)
}
console.log('\nРегрессий нет: старый долг зафиксирован, новых плохих курсов не добавилось\n')
