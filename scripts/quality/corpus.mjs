/**
 * Сбор всего, что проверяет качество контента, в одну структуру.
 *
 * Корпус делится на периметры, и это принципиально: к старому контенту, новому
 * учебному материалу и тестовым фикстурам применяются разные политики, а
 * покрытие требований вуза считается только по настоящему материалу.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Периметры корпуса.
 *
 * Разделены не для красоты отчёта. Учебные фикстуры доказывают, что движок
 * способен выразить экзаменационный билет, — но это не значит, что билет
 * разобран в программе. Если считать покрытие вуза по фикстурам, приложение
 * заявит готовность к вопросам, по которым не написано ни одного урока.
 */
export const SCOPE = {
  /** Старый контент курсов: политика «не хуже базовой линии». */
  LEGACY: 'legacy',
  /** Настоящий учебный материал новой модели. Только он даёт покрытие вуза. */
  PRODUCTION: 'production',
  /** Задания для тестов движка. Проверяются на корректность, покрытия не дают. */
  FIXTURE: 'fixture',
  /** Заведомо невалидные примеры. В корпус качества не входят вообще. */
  INVALID_FIXTURE: 'invalid-fixture',
}

/** Периметры, к которым применяется строгая политика нулевых ошибок. */
export const STRICT_SCOPES = [SCOPE.PRODUCTION, SCOPE.FIXTURE]

function scopeOfPath(path) {
  const normalized = path.split('\\').join('/')
  if (normalized.includes('/invalid-fixtures/')) return SCOPE.INVALID_FIXTURE
  if (normalized.includes('/fixtures/')) return SCOPE.FIXTURE
  return SCOPE.PRODUCTION
}

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

export function loadCorpus(root) {
  const knowledge = join(root, 'knowledge')

  const courses = walk(knowledge)
    .filter(path => path.endsWith('course.json'))
    .map(path => ({ path: path.slice(root.length + 1).replace(/\\/g, '/'), ...readJson(path) }))

  const legacyMissions = courses.flatMap(course =>
    (course.missions ?? []).map(mission => ({ course, mission })))

  const v2Tasks = walk(join(knowledge, 'tasks'))
    .filter(path => path.endsWith('.json'))
    .map(path => ({ path, scope: scopeOfPath(path) }))
    // Заведомо невалидные задания нарушают правила намеренно: их проверяет
    // отдельный прогон, в корпус качества они не попадают.
    .filter(entry => entry.scope !== SCOPE.INVALID_FIXTURE)
    .flatMap(entry => {
      const parsed = readJson(entry.path)
      const list = Array.isArray(parsed) ? parsed : parsed.tasks ?? []
      const path = entry.path.slice(root.length + 1).split('\\').join('/')
      return list.map(task => ({ path, scope: entry.scope, task }))
    })

  const skills = existsSync(join(knowledge, 'skills/registry.json'))
    ? readJson(join(knowledge, 'skills/registry.json')).skills
    : []

  const admissionDocs = existsSync(join(knowledge, 'admissions'))
    ? readdirSync(join(knowledge, 'admissions'))
        .filter(name => name.endsWith('.json') && name !== 'sources-ml-master.json')
        .map(name => readJson(join(knowledge, 'admissions', name)))
    : []

  // Официальные вопросы экзамена и структурные записи программ — разные вещи.
  // Знаменатель покрытия ИТМО считается по вопросам, а не по общему числу записей.
  const requirements = admissionDocs.flatMap(doc => [
    ...(doc.sections ?? []).flatMap(section =>
      section.questions.map(question => ({
        trackId: doc.id,
        university: doc.university,
        program: doc.program,
        id: question.id,
        ref: `${doc.id}:${question.id}`,
        text: question.question,
        topics: question.topics ?? [],
        official: true,
      }))),
    ...(doc.requirementAreas ?? []).map(area => ({
      trackId: doc.id,
      university: doc.university,
      program: doc.program,
      id: area.id,
      ref: `${doc.id}:${area.id}`,
      text: area.area,
      topics: area.topics ?? [],
      // Область программы — это структурная запись, а не отдельный вопрос
      // экзамена: у ИТМО AI Talent Hub и ФУ списка вопросов вуз не публикует.
      official: false,
    })),
  ])

  const sources = existsSync(join(knowledge, 'admissions/sources-ml-master.json'))
    ? readJson(join(knowledge, 'admissions/sources-ml-master.json')).sources
    : []

  return {
    root,
    courses,
    /** Только настоящий учебный материал: по нему считается покрытие вуза. */
    productionTasks: v2Tasks.filter(entry => entry.scope === SCOPE.PRODUCTION),
    legacyMissions,
    v2Tasks,
    skills,
    skillById: Object.fromEntries(skills.map(skill => [skill.id, skill])),
    admissionDocs,
    requirements,
    requirementRefs: new Set(requirements.map(item => item.ref)),
    sources,
  }
}

/* --------------------------------------------------------- нормализация */

/** Сравнение по смыслу записи, а не по оформлению. */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function tokens(text) {
  return normalize(text).split(' ').filter(word => word.length > 2)
}

/** Доля общих слов. Нужна там, где дословного совпадения нет, а пересказ есть. */
export function jaccard(left, right) {
  const a = new Set(tokens(left))
  const b = new Set(tokens(right))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / (a.size + b.size - shared)
}

export function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?…])\s+/)
    .map(item => item.trim())
    .filter(Boolean)
}
