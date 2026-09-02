import { masteryDimensions, skillWeight } from './types'
import type { EvaluationResult, EvidenceStrength, MasteryDimension, SkillEvidence, Task, TaskIntent } from './types'

/**
 * Освоение навыков.
 *
 * Два правила, ради которых всё это заведено.
 *
 * Первое: прохождение сюжета не является освоением. Здесь нет ни одной функции,
 * которую можно вызвать при просмотре сцены или закрытии эпизода — состояние
 * двигает только `recordAttempt`, то есть настоящая попытка выполнить задание.
 *
 * Второе: хранится сырой журнал попыток, а не готовые проценты. Формула
 * агрегации простая и наверняка изменится; журнал позволяет её заменить, не
 * теряя историю и не мигрируя сохранения. Поэтому балл попытки сохраняется как
 * число, а не сводится к «прошёл или нет»: попытка на 0.74 и полный провал —
 * разные события.
 */

/** Сколько последних попыток по навыку учитывается в оценке. */
export const RECENT_WINDOW = 8

/** Предел журнала. Старые записи вытесняются, чтобы сохранение не росло вечно. */
export const MAX_ATTEMPTS = 2000

export type Confidence = 'none' | 'low' | 'medium' | 'high'

export interface AttemptSkill {
  skillId: string
  role: SkillEvidence['role']
  weight: number
}

/** Сырая запись попытки. Ничего не агрегировано и ничего не потеряно. */
export interface AttemptRecord {
  taskId: string
  topicId: string
  skills: AttemptSkill[]
  dimensions: MasteryDimension[]
  score: number
  passed: boolean
  evidence: EvidenceStrength
  intent: TaskIntent
  /** Заполняется, только если ссылки прошли проверку по реестру требований. */
  admissionRefs: string[]
  at: string
}

export interface MasteryBook {
  version: 1
  attempts: AttemptRecord[]
  /**
   * Сколько попыток вытеснено пределом журнала.
   *
   * Усечение не должно быть невидимым: иначе через год по журналу нельзя будет
   * отличить «человек сделал 40 попыток» от «сохранились последние 40 из 3000».
   * Экспорт и аналитика обязаны показывать это число.
   */
  droppedAttempts: number
}

export function emptyMastery(): MasteryBook {
  return { version: 1, attempts: [], droppedAttempts: 0 }
}

export interface HistoryInfo {
  retained: number
  dropped: number
  truncated: boolean
  oldestRetainedAt?: string
  newestAt?: string
}

/** Что журнал знает о себе: вся ли это история или только её хвост. */
export function historyInfo(book: MasteryBook): HistoryInfo {
  return {
    retained: book.attempts.length,
    dropped: book.droppedAttempts ?? 0,
    truncated: (book.droppedAttempts ?? 0) > 0,
    oldestRetainedAt: book.attempts[0]?.at,
    newestAt: book.attempts[book.attempts.length - 1]?.at,
  }
}

/** Старое пустое состояние (объект без `attempts`) читается как пустой журнал. */
export function normalizeMastery(book: unknown): MasteryBook {
  if (book && typeof book === 'object' && Array.isArray((book as MasteryBook).attempts)) {
    const value = book as MasteryBook
    return { ...value, droppedAttempts: value.droppedAttempts ?? 0 }
  }
  return emptyMastery()
}

/**
 * Какие измерения подтверждает задание.
 *
 * Готовность к поступлению отсекается здесь: её нельзя объявить в содержании
 * задания. Условие проверяется дважды — сначала формат, потом ссылка на
 * официальное требование в `recordAttempt`.
 */
export function evidenceDimensions(task: Task): MasteryDimension[] {
  const declared = task.evidences.filter(dimension => masteryDimensions.includes(dimension))
  const examFormat = task.intent === 'exam' || task.intent === 'oral-exam'
  if (examFormat) return [...new Set([...declared, 'examReadiness' as const])]
  return declared.filter(dimension => dimension !== 'examReadiness')
}

export interface RecordOptions {
  at?: string
  /**
   * Идентификаторы официальных требований из `knowledge/admissions`. Ссылка,
   * которой здесь нет, отбрасывается вместе с влиянием на готовность.
   */
  admissionRegistry?: ReadonlySet<string>
}

/**
 * Отбор ссылок на требования вуза.
 *
 * Пропускаются только ссылки заданий экзаменационного формата, и только те,
 * что действительно существуют в реестре. Профессиональное задание с ошибочно
 * выставленным `intent: exam` не поднимет готовность, потому что ссылки у него
 * нет; задание со ссылкой на несуществующий пункт — тоже.
 */
export function acceptedAdmissionRefs(task: Task, registry?: ReadonlySet<string>) {
  const examFormat = task.intent === 'exam' || task.intent === 'oral-exam'
  if (!examFormat) return []
  const refs = task.admissionRefs ?? []
  if (!registry) return []
  return refs.filter(ref => registry.has(ref))
}

/** Единственный вход, который двигает освоение. */
export function recordAttempt(book: MasteryBook, task: Task, result: EvaluationResult, options: RecordOptions = {}): MasteryBook {
  // Пока задание ждёт песочницу или самооценку, попытки ещё не было.
  if (result.status === 'needs-runtime' || result.status === 'awaiting-self-assessment') return book
  const dimensions = evidenceDimensions(task)
  if (!dimensions.length || !task.skills.length) return book

  const record: AttemptRecord = {
    taskId: task.id,
    topicId: task.topicId,
    skills: task.skills.map(evidence => ({ skillId: evidence.skillId, role: evidence.role, weight: skillWeight(evidence) })),
    dimensions,
    score: result.score,
    passed: result.passed,
    evidence: result.evidence,
    intent: task.intent,
    admissionRefs: acceptedAdmissionRefs(task, options.admissionRegistry),
    at: options.at ?? new Date().toISOString(),
  }
  const kept = [...book.attempts, record]
  const overflow = Math.max(0, kept.length - MAX_ATTEMPTS)
  return {
    ...book,
    attempts: overflow ? kept.slice(overflow) : kept,
    droppedAttempts: (book.droppedAttempts ?? 0) + overflow,
  }
}

/* ------------------------------------------------------------- агрегация */

function recentFor(book: MasteryBook, skillId: string, dimension?: MasteryDimension) {
  return book.attempts
    .filter(attempt => attempt.skills.some(skill => skill.skillId === skillId))
    .filter(attempt => !dimension || attempt.dimensions.includes(dimension))
    .slice(-RECENT_WINDOW)
}

function weightIn(attempt: AttemptRecord, skillId: string) {
  return attempt.skills.find(skill => skill.skillId === skillId)?.weight ?? 0
}

/**
 * Оценка навыка — взвешенное среднее баллов последних попыток.
 *
 * Вес попытки — вес навыка в задании: побочное свидетельство влияет слабее
 * прямого. Формула объясняется одной фразой намеренно: непрозрачному числу
 * нельзя верить, а журнал позволяет пересчитать иначе в любой момент.
 */
export function skillScore(book: MasteryBook, skillId: string, dimension?: MasteryDimension) {
  const recent = recentFor(book, skillId, dimension)
  const total = recent.reduce((sum, attempt) => sum + weightIn(attempt, skillId), 0)
  if (!total) return 0
  return recent.reduce((sum, attempt) => sum + attempt.score * weightIn(attempt, skillId), 0) / total
}

/**
 * Уверенность в оценке. Считается по накопленному весу свидетельств, поэтому
 * восемь побочных упоминаний навыка не равны восьми прямым проверкам. Если все
 * свидетельства слабые, уверенность не поднимается выше низкой.
 */
export function skillConfidence(book: MasteryBook, skillId: string, dimension?: MasteryDimension): Confidence {
  const recent = recentFor(book, skillId, dimension)
  if (!recent.length) return 'none'
  if (recent.every(attempt => attempt.evidence === 'weak')) return 'low'
  const weight = recent.reduce((sum, attempt) => sum + weightIn(attempt, skillId), 0)
  if (weight < 3) return 'low'
  if (weight < 6) return 'medium'
  return 'high'
}

/** Ниже этого значения навык считается непройденным. */
export const MASTERY_THRESHOLD = 0.75

export interface SkillReport {
  skillId: string
  score: number
  confidence: Confidence
  attempts: number
  /** Накопленный вес свидетельств: прямые проверки весят больше побочных. */
  weight: number
  dimensions: Array<{ dimension: MasteryDimension; score: number; attempts: number }>
  weak: boolean
}

export function skillReport(book: MasteryBook, skillId: string): SkillReport {
  const recent = recentFor(book, skillId)
  const score = skillScore(book, skillId)
  return {
    skillId,
    score,
    confidence: skillConfidence(book, skillId),
    attempts: book.attempts.filter(attempt => attempt.skills.some(skill => skill.skillId === skillId)).length,
    weight: recent.reduce((sum, attempt) => sum + weightIn(attempt, skillId), 0),
    dimensions: masteryDimensions
      .map(dimension => ({ dimension, score: skillScore(book, skillId, dimension), attempts: recentFor(book, skillId, dimension).length }))
      .filter(item => item.attempts > 0),
    weak: score < MASTERY_THRESHOLD,
  }
}

/** Сводка по теме — среднее по её навыкам. Нужна только для навигации. */
export function topicReport(book: MasteryBook, topicId: string, skillsOfTopic: string[]) {
  const reports = skillsOfTopic.map(skillId => skillReport(book, skillId)).filter(report => report.attempts > 0)
  const score = reports.length ? reports.reduce((sum, report) => sum + report.score, 0) / reports.length : 0
  return { topicId, score, skills: reports, weak: reports.filter(report => report.weak).map(report => report.skillId) }
}

/* ---------------------------------------------- готовность к поступлению */

export interface RequirementCoverage {
  requirementId: string
  covered: boolean
  /** Покрыт только слабым свидетельством — самооценкой или совпадением понятий. */
  weakOnly: boolean
  attempts: number
  /**
   * Человек что-то решал по этому пункту, но в программе обучения его нет.
   * Готовностью это не считается: подтверждать можно только то, чему учат.
   */
  outsideCurriculum: boolean
}

export interface ReadinessOptions {
  /**
   * Пункты, по которым в программе есть настоящий учебный материал.
   *
   * Готовность человека и покрытие программы — разные величины. Программа может
   * закрывать вопрос, по которому человек ничего не решал, и наоборот: человек
   * мог случайно ответить на пункт, которому REQuest пока не учит. Второе
   * готовностью не является, иначе одно число «готовность к ИТМО 68%» перестаёт
   * что-либо значить. Без этого списка ограничение не применяется.
   */
  curriculumCovered?: ReadonlySet<string>
}

export interface ReadinessReport {
  trackId: string
  total: number
  covered: number
  /** Доля закрытых официальных требований, а не средний балл по заданиям. */
  score: number
  weakOnly: string[]
  uncovered: string[]
  /** Решал, но программа этому не учит: в готовность не засчитано. */
  outsideCurriculum: string[]
  requirements: RequirementCoverage[]
}

/**
 * Готовность к вступительному — это покрытие официальных требований, а не
 * средняя оценка по экзаменационным заданиям. Иначе десять успешных попыток по
 * одному вопросу выглядели бы как готовность ко всему списку.
 */
export function readinessFor(
  book: MasteryBook,
  trackId: string,
  requirementIds: readonly string[],
  options: ReadinessOptions = {},
): ReadinessReport {
  const requirements = requirementIds.map<RequirementCoverage>(requirementId => {
    const ref = `${trackId}:${requirementId}`
    const matching = book.attempts.filter(attempt => attempt.admissionRefs.includes(ref))
    const successful = matching.filter(attempt => attempt.passed)
    const inCurriculum = !options.curriculumCovered || options.curriculumCovered.has(ref)
    return {
      requirementId,
      covered: successful.length > 0 && inCurriculum,
      weakOnly: successful.length > 0 && inCurriculum && successful.every(attempt => attempt.evidence === 'weak'),
      attempts: matching.length,
      outsideCurriculum: successful.length > 0 && !inCurriculum,
    }
  })
  const covered = requirements.filter(item => item.covered)
  return {
    trackId,
    total: requirements.length,
    covered: covered.length,
    score: requirements.length ? covered.length / requirements.length : 0,
    weakOnly: covered.filter(item => item.weakOnly).map(item => item.requirementId),
    uncovered: requirements.filter(item => !item.covered).map(item => item.requirementId),
    outsideCurriculum: requirements.filter(item => item.outsideCurriculum).map(item => item.requirementId),
    requirements,
  }
}
