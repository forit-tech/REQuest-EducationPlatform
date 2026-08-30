import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Проверка учебного графа REduQuest.
 *
 * Модель: блок → профессия → этап → курс → модуль → тема → миссии.
 *
 * prerequisites — это «что стоит знать заранее», а не замок. Любой курс можно
 * начать в любой момент; граф зависимостей задаёт рекомендуемый порядок и
 * подсказывает, чего человеку будет не хватать. Поэтому курс раньше своей
 * зависимости — предупреждение, а не ошибка. Ошибки остаются только там, где
 * граф сломан: несуществующие ссылки, дубли, циклы.
 *
 * Тема с миссиями — нижний слой, он наполняется профессия за профессией. Пока у
 * модуля тем нет, плотность практики задаётся полем interactions.
 */

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const curriculumDir = join(root, 'knowledge', 'curriculum')
const coursesDir = join(curriculumDir, 'courses')

const read = path => JSON.parse(readFileSync(path, 'utf8'))

const blocks = read(join(curriculumDir, 'blocks.json'))
const { professions, compositePaths } = read(join(curriculumDir, 'professions.json'))
const courseFiles = readdirSync(coursesDir).filter(name => name.endsWith('.json'))
const courses = courseFiles.flatMap(name => read(join(coursesDir, name)).map(item => ({ ...item, file: name })))

const errors = []
const warnings = []
const fail = message => errors.push(message)
const warn = message => warnings.push(message)

const courseById = new Map()
for (const course of courses) {
  if (courseById.has(course.id)) fail(`Дубль курса "${course.id}" (${course.file} и ${courseById.get(course.id).file})`)
  courseById.set(course.id, course)
}

const moduleById = new Map()
const topicById = new Map()
for (const course of courses) {
  for (const item of course.modules ?? []) {
    if (moduleById.has(item.id)) fail(`Дубль модуля "${item.id}" (курсы ${moduleById.get(item.id).courseId} и ${course.id})`)
    moduleById.set(item.id, { ...item, courseId: course.id })
    for (const topic of item.topics ?? []) {
      if (topicById.has(topic.id)) fail(`Дубль темы "${topic.id}" (модули ${topicById.get(topic.id).moduleId} и ${item.id})`)
      topicById.set(topic.id, { ...topic, moduleId: item.id, courseId: course.id })
    }
  }
}

// 1. Ссылочная целостность курсов
for (const course of courses) {
  for (const dependency of course.prerequisites ?? []) {
    if (!courseById.has(dependency)) fail(`Курс "${course.id}": зависимость "${dependency}" не существует${moduleById.has(dependency) ? ' (это модуль, а не курс)' : ''}`)
  }
  if (!['authored', 'outline'].includes(course.status)) fail(`Курс "${course.id}": неизвестный статус "${course.status}"`)
  if (typeof course.level !== 'number' || course.level < 0 || course.level > 5) fail(`Курс "${course.id}": уровень вне шкалы 0..5`)
}

// 2. Циклы в графе курсов
const colour = new Map()
const walk = (id, trail) => {
  const state = colour.get(id)
  if (state === 'done') return
  if (state === 'open') { fail(`Цикл зависимостей: ${[...trail, id].join(' → ')}`); return }
  colour.set(id, 'open')
  for (const dependency of courseById.get(id)?.prerequisites ?? []) {
    if (courseById.has(dependency)) walk(dependency, [...trail, id])
  }
  colour.set(id, 'done')
}
for (const course of courses) walk(course.id, [])

// 3. Предки курса по графу зависимостей — для проверки модулей
const ancestorsOf = id => {
  const seen = new Set()
  const queue = [...(courseById.get(id)?.prerequisites ?? [])]
  while (queue.length) {
    const current = queue.pop()
    if (seen.has(current) || !courseById.has(current)) continue
    seen.add(current)
    queue.push(...(courseById.get(current).prerequisites ?? []))
  }
  return seen
}

const CLASS_LIMITS = { 'простая': [4, 6], 'важная': [6, 10], 'сложная': [10, 15] }

for (const course of courses) {
  const order = new Map((course.modules ?? []).map((item, index) => [item.id, index]))
  const ancestors = ancestorsOf(course.id)
  for (const [index, item] of (course.modules ?? []).entries()) {
    for (const dependency of item.prerequisites ?? []) {
      const target = moduleById.get(dependency)
      if (!target) { fail(`Модуль "${item.id}": зависимость "${dependency}" не существует`); continue }
      if (target.courseId === course.id) {
        if (order.get(dependency) >= index) fail(`Модуль "${item.id}" идёт раньше своей зависимости "${dependency}" внутри курса "${course.id}"`)
      } else if (!ancestors.has(target.courseId)) {
        warn(`Модуль "${item.id}" опирается на "${dependency}" из курса "${target.courseId}", который не заявлен базой курса "${course.id}"`)
      }
    }

    const limits = CLASS_LIMITS[item.class]
    if (!limits) fail(`Модуль "${item.id}": неизвестный класс "${item.class}"`)

    // 4. Нижний слой: темы и миссии. Пока тем нет — считаем интерактивы.
    if (item.topics?.length) {
      const missionTotal = item.topics.reduce((sum, topic) => sum + (topic.missions ?? 0), 0)
      for (const topic of item.topics) {
        if (!topic.title) fail(`Тема "${topic.id}" без названия`)
        if (typeof topic.missions !== 'number' || topic.missions < 1 || topic.missions > 8) {
          fail(`Тема "${topic.id}": ${topic.missions} миссий, норма 1..8`)
        } else if (topic.missions < 3 || topic.missions > 6) {
          warn(`Тема "${topic.id}": ${topic.missions} миссий, ожидается 3..6`)
        }
      }
      if (limits && (missionTotal < limits[0] || missionTotal > limits[1] * 2)) {
        warn(`Модуль "${item.id}" (${item.class}): ${missionTotal} миссий на ${item.topics.length} тем — проверь плотность`)
      }
    } else {
      if (item.interactions < 4 || item.interactions > 15) fail(`Модуль "${item.id}": ${item.interactions} интерактивов, норма 4..15`)
      else if (limits && (item.interactions < limits[0] || item.interactions > limits[1])) {
        warn(`Модуль "${item.id}" (${item.class}): ${item.interactions} интерактивов, ожидается ${limits[0]}..${limits[1]}`)
      }
    }
  }
}

// 5. Главная проверка: порядок курсов в маршруте профессии
const blockIds = new Set(blocks.map(item => item.id))
const professionIds = new Set(professions.map(item => item.id))
const trackReport = []
const earlyStarts = []

for (const profession of professions) {
  if (!blockIds.has(profession.blockId)) fail(`Профессия "${profession.id}": блок "${profession.blockId}" не существует`)
  for (const required of profession.requiresProfessionAny ?? []) {
    if (!professionIds.has(required)) fail(`Профессия "${profession.id}": требуемая профессия "${required}" не существует`)
  }
  const track = profession.stages.flatMap(stage => stage.courseIds)
  const seen = new Set()
  const duplicates = []
  for (const courseId of track) {
    const course = courseById.get(courseId)
    if (!course) { fail(`Профессия "${profession.id}": курс "${courseId}" не существует`); continue }
    if (seen.has(courseId)) duplicates.push(courseId)
    for (const dependency of course.prerequisites ?? []) {
      // Не блокируем: курс доступен всегда, но порядок в маршруте стоит поправить.
      if (!seen.has(dependency)) earlyStarts.push(`${profession.id}: "${courseId}" раньше своей базы "${dependency}"`)
    }
    seen.add(courseId)
  }
  if (duplicates.length) warn(`Профессия "${profession.id}": курс повторяется в маршруте — ${[...new Set(duplicates)].join(', ')}`)

  const authored = track.filter(id => courseById.get(id)?.status === 'authored')
  const modules = track.reduce((sum, id) => sum + (courseById.get(id)?.modules?.length ?? 0), 0)
  trackReport.push({
    id: profession.id,
    block: profession.blockId,
    courses: track.length,
    authored: authored.length,
    modules,
  })
}

for (const path of compositePaths ?? []) {
  for (const id of path.professionIds) {
    if (!professionIds.has(id)) fail(`Составной путь "${path.id}": профессия "${id}" не существует`)
  }
}

// 6. Пропорция практики
const interactiveKinds = new Set(['modify', 'fill', 'write', 'fix', 'case'])
const allModules = [...moduleById.values()]
const withCode = allModules.filter(item => (item.practice ?? []).some(kind => interactiveKinds.has(kind))).length
const codeShare = allModules.length ? Math.round(withCode / allModules.length * 100) : 0
if (allModules.length && codeShare < 70) warn(`Практики с кодом ${codeShare}% — стандарт требует не меньше 70%`)

// Отчёт
const authoredCourses = courses.filter(item => item.status === 'authored')
const orphanCourses = courses.filter(item => !professions.some(profession => profession.stages.some(stage => stage.courseIds.includes(item.id))))
const missions = [...topicById.values()].reduce((sum, topic) => sum + (topic.missions ?? 0), 0)

console.log('Учебный граф REduQuest')
console.log('  модель: блок → профессия → этап → курс → модуль → тема → миссии')
console.log(`  блоков: ${blocks.length} · профессий: ${professions.length} · составных путей: ${compositePaths?.length ?? 0}`)
console.log(`  курсов: ${courses.length} (с модулями: ${authoredCourses.length}, план: ${courses.length - authoredCourses.length})`)
console.log(`  модулей: ${allModules.length} · интерактивов: ${allModules.reduce((sum, item) => sum + (item.interactions ?? 0), 0)} · доля практики с кодом: ${codeShare}%`)
console.log(`  тем: ${topicById.size} · миссий: ${missions}`)
console.log('')
console.log('  профессия                 блок          курсов  с модулями  модулей')
for (const row of trackReport) {
  console.log(`  ${row.id.padEnd(24)}  ${row.block.padEnd(12)}  ${String(row.courses).padStart(6)}  ${String(row.authored).padStart(10)}  ${String(row.modules).padStart(7)}`)
}

if (orphanCourses.length) {
  console.log('')
  console.log(`  курсы вне маршрутов (${orphanCourses.length}): ${orphanCourses.map(item => item.id).join(', ')}`)
}

if (warnings.length) {
  console.log('')
  console.log('Предупреждения:')
  for (const message of warnings) console.log('  · ' + message)
}

if (errors.length) {
  console.log('')
  console.log('Ошибки:')
  for (const message of errors) console.log('  ✕ ' + message)
  process.exit(1)
}

if (earlyStarts.length) {
  console.log('')
  console.log(`Курсы, стоящие раньше своей базы (${earlyStarts.length}) — не блокируем, но порядок стоит проверить:`)
  for (const message of earlyStarts.slice(0, 12)) console.log('  · ' + message)
  if (earlyStarts.length > 12) console.log(`  · … и ещё ${earlyStarts.length - 12}`)
}

console.log('')
console.log('Проверка пройдена: граф связный, циклов и битых ссылок нет.')
