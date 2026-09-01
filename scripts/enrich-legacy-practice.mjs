/**
 * Подбор практики для миссий, у которых её ещё нет.
 *
 * Прошлая версия скрипта добивала каждый курс до 65% кодовых миссий: брала любую
 * не-сюжетную миссию, назначала тип по чётности индекса и вешала универсальную заготовку
 * `def solve()` / `return` / `assert`. Из-за этого тема про процессор проверялась знанием
 * синтаксиса Python, которого у человека ещё не было.
 *
 * Здесь другой принцип:
 *   1. Квоты нет. Доля кода — следствие тем, а не цель.
 *   2. Тип практики выбирается по теме, а не по чётности индекса.
 *   3. Кодовая проверка ставится только на конструкции, уже введённые по реестру навыков.
 *   4. Курсы из auditedCourses не трогаются: они выверены вручную.
 *
 * Запуск: node scripts/enrich-legacy-practice.mjs [--dry]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const knowledgeRoot = resolve(root, 'knowledge')
const dryRun = process.argv.includes('--dry')
const report = process.argv.includes('--report')

const registry = JSON.parse(await readFile(resolve(knowledgeRoot, 'skills-registry.json'), 'utf8'))
const audited = new Set(registry.auditedCourses ?? [])

const usesToken = (fragment, token) => {
  if (!/^[A-Za-z0-9_]/.test(token)) return fragment.includes(token)
  let from = 0
  for (;;) {
    const at = fragment.indexOf(token, from)
    if (at === -1) return false
    if (at === 0 || !/[A-Za-z0-9_]/.test(fragment[at - 1])) return true
    from = at + 1
  }
}
const EXTENSION_LANGUAGE = registry.languageByExtension ?? {}
const extensionOf = file => (file ?? '').slice((file ?? '').lastIndexOf('.'))
/**
 * Язык миссии по цепочке: рабочий файл → явное поле миссии → технология курса.
 * Угадывания по содержимому нет: слово Promise внутри русского предложения
 * и «исключения» в описании SLI давали ложные срабатывания.
 */
const languageOf = (mission, course) =>
  EXTENSION_LANGUAGE[extensionOf(mission.task?.workspaceFile)]
  ?? mission.language
  ?? course?.technology
  ?? null

// Один файл может нести несколько слоёв знаний: .jsx — это язык, JSX и React API.
const EXTRA_LANGUAGES = registry.extraLanguagesByExtension ?? {}
const languagesOf = (mission, course) => {
  const primary = languageOf(mission, course)
  if (!primary) return []
  return [primary, ...(EXTRA_LANGUAGES[extensionOf(mission.task?.workspaceFile)] ?? [])]
}

const COMMENTS = { python: /#.*$/gm, sql: /--.*$/gm, yaml: /#.*$/gm,
  go: /\/\/.*$/gm, java: /\/\/.*$/gm, javascript: /\/\/.*$/gm }
const STRINGS = { python: /"[^"]*"|'[^']*'/g, sql: /'[^']*'/g, yaml: /"[^"]*"|'[^']*'/g,
  go: /"[^"]*"|`[^`]*`/g, java: /"[^"]*"/g, javascript: /"[^"]*"|'[^']*'|`[^`]*`/g }
/** Навык ищется только в коде: комментарии и содержимое строк убираются. */
const codeOnly = (fragment, language) => {
  const withoutComments = fragment.replace(COMMENTS[language] ?? /$^/g, ' ')
  return withoutComments.replace(STRINGS[language] ?? /$^/g, match => match[0] + match[0])
}
const skillsFor = (fragment, languages) => {
  const layers = Array.isArray(languages) ? languages : [languages].filter(Boolean)
  if (!layers.length) return []
  // Очистка от строк и комментариев идёт по правилам основного языка файла.
  const code = codeOnly(fragment, layers[0])
  return registry.skills.filter(skill =>
    layers.includes(skill.language) && skill.detect.some(token => usesToken(code, token)))
}

const facts = {
  python: { title: 'Python назван не в честь змеи', text: 'Гвидо ван Россум начал писать Python в конце 1989 года, а название выбрал под впечатлением от комедийного шоу Monty Python.', sourceLabel: 'Python Documentation', sourceUrl: 'https://docs.python.org/3/faq/general.html' },
  sql: { title: 'Реляционная модель появилась раньше SQL', text: 'В 1970 году Эдгар Кодд предложил хранить данные как отношения и отделить логическое представление от физического хранения.', sourceLabel: 'IBM Research', sourceUrl: 'https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks' },
  numpy: { title: 'NumPy вырос из двух конкурирующих библиотек', text: 'NumPy появился в 2005 году на основе Numeric и Numarray; открытая библиотека стала фундаментом научных вычислений на Python.', sourceLabel: 'NumPy Project', sourceUrl: 'https://numpy.org/about/' },
  pandas: { title: 'Pandas начинался внутри финансовой компании', text: 'Разработка pandas началась в AQR Capital Management в 2008 году, а к концу 2009 года проект открыли для сообщества.', sourceLabel: 'pandas Project', sourceUrl: 'https://pandas.pydata.org/about/index.html' },
  postgres: { title: 'История PostgreSQL началась в Беркли', text: 'Проект POSTGRES стартовал в Калифорнийском университете в Беркли в 1986 году; SQL-интерпретатор появился в наследнике Postgres95.', sourceLabel: 'PostgreSQL Documentation', sourceUrl: 'https://www.postgresql.org/docs/current/history.html' },
  statistics: { title: 'Статистика помогала спасать жизни до компьютеров', text: 'Флоренс Найтингейл использовала статистические диаграммы, чтобы показать причины смертности солдат и добиться санитарных реформ.', sourceLabel: 'Science Museum', sourceUrl: 'https://www.sciencemuseum.org.uk/objects-and-stories/florence-nightingale-pioneer-statistician' },
  data: { title: 'Данные стали независимы от способа хранения', text: 'Реляционная модель Кодда отделила логическую структуру данных от деталей их физического размещения — принцип, важный и для современных платформ.', sourceLabel: 'IBM Research', sourceUrl: 'https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks' },
}

const sqlCourses = new Set(['sql-foundations', 'advanced-sql', 'relational-databases', 'analytical-databases', 'clickhouse', 'duckdb', 'postgresql'])

function factFor(courseId) {
  if (courseId === 'numpy') return facts.numpy
  if (courseId === 'pandas' || courseId === 'polars') return facts.pandas
  if (courseId === 'postgresql' || courseId === 'production-incidents') return facts.postgres
  if (courseId === 'statistics' || courseId === 'exploratory-data-analysis' || courseId === 'data-visualization') return facts.statistics
  if (courseId === 'python-core' || courseId === 'technical-foundations') return facts.python
  if (sqlCourses.has(courseId)) return facts.sql
  return facts.data
}

/**
 * Тема миссии решает, какая практика уместна.
 * Понятийные темы проверяются выбором, работа со средой — исследованием, и только
 * инструментальные темы получают редактор кода.
 */
const CONCEPT = /процессор|ядр|память|диск|файл|путь|каталог|операционн|сет|протокол|архитектур|модель|принцип|зачем|что такое|различ|сравн|терминолог|метрик|этап|роль|обзор/i
const ENVIRONMENT = /терминал|команд|навигац|оболочк|git|репозитор|коммит|ветк|конфликт|окружени|логи|процесс|мониторинг|расследован|инцидент/i

// Хвост, который приписывал прежний генератор поверх готового вопроса.
const APPENDED = /\s*Реализуй решение в рабочем файле[^.]*\.\s*$/
// Глаголы производства: человек что-то создаёт, значит нужен редактор.
const PRODUCTION = /написа|реализ|посчита|вычисл|собра|постро|преобраз|отфильтр|сгенерир|запрос|выгруз|агрегир|соедин|оптимизир|разбер[её]шь код/i
// Половина миссий названа по шаблону «Тема: аспект». Аспект прямо говорит, чему учит
// миссия, поэтому он определяет форму практики точнее любой регулярки по словам.
const BY_ASPECT = new Map([
  ['основная идея', 'quiz'],        // понять смысл — узнавание
  ['практический выбор', 'quiz'],   // выбрать между вариантами — решение
  ['компромиссы', 'quiz'],          // взвесить стороны — решение
  ['типичная ловушка', 'lab'],      // воспроизвести ошибку и увидеть её — производство
  ['механика', 'lab'],              // выполнить операцию — производство
  ['проверка результата', 'lab'],   // убедиться в результате — производство
  ['диагностика', 'lab'],           // найти причину в данных — производство
  ['производственный контур', 'lab'],
  ['контроль качества', 'lab'],
])

// Глаголы узнавания: человек различает и объясняет, значит нужен выбор ответа.
const RECOGNITION = /узнава|определя|различа|замеча|объясня|выбира|сравнива|чита|понима|прослежива|оценива|описыва|называ|отлича/i

/** Явно названный аспект темы — уверенное решение о форме практики, а не догадка. */
function aspectTypeOf(mission) {
  if (mission.type === 'story' || mission.type === 'boss') return null
  if (!mission.title.includes(': ')) return null
  return BY_ASPECT.get(mission.title.slice(mission.title.lastIndexOf(': ') + 2).toLowerCase()) ?? null
}

function interactionFor(course, mission) {
  const text = `${mission.title} ${(mission.objectives ?? []).join(' ')}`
  const prompt = (mission.task?.prompt ?? '').replace(APPENDED, '').trim()
  if (mission.type === 'story' || mission.type === 'boss') return mission.type
  const byAspect = aspectTypeOf(mission)
  if (byAspect === 'quiz') return 'quiz'
  // Тема про терминал, логи и инциденты: «руками» здесь значит консоль, а не редактор.
  if (ENVIRONMENT.test(text)) return 'case'
  if (byAspect) return byAspect
  if (PRODUCTION.test(text)) return 'lab'
  // Задание сформулировано вопросом, а цель — различить или объяснить: это узнавание.
  if (prompt.endsWith('?') && (RECOGNITION.test(text) || !PRODUCTION.test(text))) return 'quiz'
  if (CONCEPT.test(text)) return 'quiz'
  return 'lab'
}

/**
 * Навык считается доступным, только если во ВСЕХ маршрутах, где встречается этот курс,
 * он введён не позже текущей миссии. Порядок между курсами берём из программ профессий:
 * без этого «SELECT» проскакивает в курс, который в маршруте идёт раньше sql-foundations.
 */
const programs = JSON.parse(await readFile(resolve(knowledgeRoot, 'professions/programs.json'), 'utf8'))
const programList = Array.isArray(programs) ? programs : (programs.programs ?? Object.values(programs)[0])
const allCourses = new Map()

function buildRoutePositions() {
  const perRoute = []
  for (const program of programList) {
    const route = program.stages.flatMap(stage => stage.courseIds ?? [])
    const sequence = []
    for (const courseId of route) {
      const course = allCourses.get(courseId)
      if (!course) continue
      for (const mission of course.missions ?? []) sequence.push({ courseId, missionId: mission.id })
    }
    const introducedAt = new Map()
    sequence.forEach((item, index) => {
      for (const skill of registry.skills) {
        if (introducedAt.has(skill.id)) continue
        if (skill.introducedIn.course === item.courseId && skill.introducedIn.mission === item.missionId) introducedAt.set(skill.id, index)
      }
    })
    const positionOf = new Map()
    sequence.forEach((item, index) => positionOf.set(`${item.courseId}/${item.missionId}`, index))
    perRoute.push({ id: program.professionId, introducedAt, positionOf })
  }
  return perRoute
}

let routes = []

function introducedBefore(course, index) {
  const mission = course.missions[index]
  const key = `${course.id}/${mission.id}`
  const allowed = new Set()
  for (const skill of registry.skills) {
    const relevant = routes.filter(route => route.positionOf.has(key))
    // Курс вне всех маршрутов ограничиваем только порядком внутри самого курса.
    if (!relevant.length) {
      if (skill.introducedIn.course !== course.id) { allowed.add(skill.id); continue }
      const at = course.missions.findIndex(item => item.id === skill.introducedIn.mission)
      if (at !== -1 && at <= index) allowed.add(skill.id)
      continue
    }
    const safeEverywhere = relevant.every(route => {
      const introduced = route.introducedAt.get(skill.id)
      return introduced !== undefined && introduced <= route.positionOf.get(key)
    })
    if (safeEverywhere) allowed.add(skill.id)
  }
  return allowed
}

/** Набор проверок под курс, отфильтрованный по уже введённым конструкциям. */
function codeChecks(course, mission, index) {
  const allowed = introducedBefore(course, index)
  const candidates = sqlCourses.has(course.id)
    ? [
        { label: 'Запрос выбирает данные', includes: 'SELECT ' },
        { label: 'Есть условие отбора', includes: 'WHERE' },
        { label: 'Запрос завершён', includes: ';' },
      ]
    : course.id === 'numpy'
      ? [
          { label: 'NumPy подключён явно', includes: 'import numpy as np' },
          { label: 'Создан массив', includes: 'np.array(' },
          { label: 'Результат виден в выводе', includes: 'print(' },
        ]
      : course.id === 'pandas' || course.id === 'polars'
        ? [
            { label: 'Библиотека подключена', includes: course.id === 'pandas' ? 'import pandas as pd' : 'import polars as pl' },
            { label: 'Результат виден в выводе', includes: 'print(' },
          ]
        : [
            { label: 'Значение сохранено в переменную', includes: '=' },
            { label: 'Результат виден в выводе', includes: 'print(' },
          ]
  const language = course.technology ?? (sqlCourses.has(course.id) ? 'sql' : 'python')
  const usable = candidates.filter(check => skillsFor(check.includes, language).every(skill => allowed.has(skill.id)))
  return usable.length >= 2 ? usable : null
}

let touchedCourses = 0
let addedCode = 0
let repairedCode = 0
let demoted = 0
let retyped = 0
let deduped = 0
const skipped = []
const courseFiles = []
const journal = []

// Сначала читаем всё: порядок навыков считается по маршрутам, а значит нужны все курсы.
for (const domain of await readdir(knowledgeRoot, { withFileTypes: true })) {
  if (!domain.isDirectory() || ['story', 'professions', 'content-factory', 'curriculum'].includes(domain.name)) continue
  const domainRoot = resolve(knowledgeRoot, domain.name)
  for (const entry of await readdir(domainRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const coursePath = resolve(domainRoot, entry.name, 'course.json')
    try {
      const course = JSON.parse(await readFile(coursePath, 'utf8'))
      allCourses.set(course.id, course)
      courseFiles.push({ course, coursePath })
    } catch { /* каталог без course.json курсом не считается */ }
  }
}
routes = buildRoutePositions()

for (const { course, coursePath } of courseFiles) {
  if (audited.has(course.id)) { skipped.push(course.id); continue }

  let changed = false
  const log = []
  if (!course.missions.some(mission => mission.historicalFact?.sourceUrl)) {
    course.missions[0].historicalFact = factFor(course.id)
    changed = true
  }

  course.missions.forEach((mission, index) => {
    const type = interactionFor(course, mission)
    if (mission.task?.prompt && APPENDED.test(mission.task.prompt)) {
      mission.task.prompt = mission.task.prompt.replace(APPENDED, '')
      changed = true
    }

    // Одинаковые проверки создают вид трёх требований там, где требование одно.
    if (mission.task?.codeChecks?.length) {
      const unique = []
      for (const check of mission.task.codeChecks) {
        if (!unique.some(kept => kept.includes === check.includes)) unique.push(check)
      }
      if (unique.length !== mission.task.codeChecks.length) {
        mission.task.codeChecks = unique.length >= 2 ? unique : (codeChecks(course, mission, index) ?? unique)
        log.push(`убраны дубли      ${mission.id} → ${mission.task.codeChecks.map(c => c.includes.trim()).join(' | ')}`)
        deduped += 1
        changed = true
      }
    }

    if (mission.task?.codeChecks?.length) {
      // Проверки уже есть: оставляем только те, что опираются на введённые конструкции.
      const allowed = introducedBefore(course, index)
      const language = languagesOf(mission, course)
      const safe = mission.task.codeChecks.filter(check => skillsFor(check.includes, language).every(skill => allowed.has(skill.id)))
      // Проверки исправны, но тема названа узнаванием: редактор здесь проверяет не ту
      // компетенцию, которой учит миссия. Такой код навешен квотой, его надо снять.
      if (safe.length === mission.task.codeChecks.length && !(aspectTypeOf(mission) === 'quiz')) return
      // Тип решает цель обучения. Если тема — узнавание, сломанные проверки чинить нечем:
      // код здесь навешен поверх вопроса, его надо снять, а не подбирать безопасный.
      const replacement = type === 'lab' || type === 'code'
        ? (safe.length >= 2 ? safe : codeChecks(course, mission, index))
        : null
      if (replacement) {
        mission.task.codeChecks = replacement
        log.push(`починены проверки  ${mission.id} → ${replacement.map(c => c.includes.trim()).join(' | ')}`)
        repairedCode += 1
      } else {
        // Ни одной допустимой проверки: тема разбирается без кода.
        mission.type = type === 'lab' || type === 'code' ? 'quiz' : type
        delete mission.task.workspaceFile
        delete mission.task.starterCode
        delete mission.task.codeChecks
        log.push(`СНЯТ КОД          ${mission.id} «${mission.title}» → ${mission.type}`)
        demoted += 1
      }
      changed = true
      return
    }

    if (mission.type !== type) { log.push(`сменён тип        ${mission.id} «${mission.title}» ${mission.type} → ${type}`); mission.type = type; retyped += 1; changed = true }
    if (type !== 'lab') return
    const checks = codeChecks(course, mission, index)
    if (!checks) { mission.type = 'quiz'; log.push(`без кода          ${mission.id} «${mission.title}»`); changed = true; return }
    mission.task = {
      ...mission.task,
      workspaceFile: sqlCourses.has(course.id) ? 'solution.sql' : 'solution.py',
      starterCode: `${sqlCourses.has(course.id) ? '--' : '#'} Дело: ${course.title}
${sqlCourses.has(course.id) ? '--' : '#'} Эпизод: ${mission.title}

`,
      codeChecks: checks,
    }
    log.push(`добавлен код      ${mission.id} → ${checks.map(c => c.includes.trim()).join(' | ')}`)
    addedCode += 1
    changed = true
  })

  if (changed && !dryRun) await writeFile(coursePath, `${JSON.stringify(course, null, 2)}
`, 'utf8')
  if (changed) touchedCourses += 1
  if (log.length) {
    const mix = {}
    for (const mission of course.missions) mix[mission.type] = (mix[mission.type] ?? 0) + 1
    const withCode = course.missions.filter(mission => mission.task?.codeChecks?.length).length
    journal.push({ course: course.id, log, mix: `${Object.entries(mix).map(([k, v]) => `${k} ${v}`).join(', ')} · с кодом ${withCode}/${course.missions.length}` })
  }
}

console.log(`Практика пересобрана${dryRun ? ' (пробный запуск, файлы не тронуты)' : ''}`)
console.log(`  курсов затронуто:            ${touchedCourses}`)
console.log(`  проверки исправлены:         ${repairedCode}`)
console.log(`  код снят, тема без кода:     ${demoted}`)
console.log(`  код добавлен впервые:        ${addedCode}`)
console.log(`  сменился тип практики:       ${retyped}`)
console.log(`  убраны одинаковые проверки:  ${deduped}`)
console.log(`  проверенные вручную курсы:   ${skipped.join(', ') || 'нет'}`)
if (report) for (const item of journal) {
  console.log(`
── ${item.course}  [${item.mix}]`)
  for (const line of item.log) console.log(`   ${line}`)
}
