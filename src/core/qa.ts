/**
 * Замечания, оставленные во время прохождения курса.
 *
 * Хранятся отдельно от прогресса и намеренно: замечание — это наблюдение о
 * содержании, а не учебный результат. Смешав их, легко получить запись,
 * которая и миссию засчитывает, и жалобу на неё содержит.
 *
 * Инструмент существует только в QA-сборке: обычный ученик этих элементов не
 * видит и очереди замечаний у него нет.
 */

export type IssueType = 'BUG' | 'COURSE_LOGIC' | 'IMPROVEMENT' | 'CONTENT_ERROR'
export type IssueSeverity = 'low' | 'medium' | 'high' | 'blocker'
export type IssueStatus = 'open' | 'in_progress' | 'fixed' | 'wont_fix'

export interface LearningIssue {
  id: string
  createdAt: string
  createdBy: string
  type: IssueType
  severity: IssueSeverity
  /** Мешает ли замечание продолжать обучение. */
  blocker: boolean
  courseId: string
  courseTitle: string
  missionId: string
  missionTitle: string
  missionStage?: string
  concept?: string
  /** Часть урока: теория, задание, проверка и так далее. */
  targetArea: string
  /** Выделенный в уроке фрагмент, если он был. */
  quote: string | null
  description: string
  appVersion: string
  status: IssueStatus
  resolution?: string
  resolvedAt?: string
}

export const ISSUE_TYPE_LABEL: Record<IssueType, string> = {
  BUG: 'Баг',
  COURSE_LOGIC: 'Некорректная логика курса',
  IMPROVEMENT: 'Возможность улучшения',
  CONTENT_ERROR: 'Ошибка контента',
}

export const ISSUE_SEVERITY_LABEL: Record<IssueSeverity, string> = {
  low: 'низкая', medium: 'средняя', high: 'высокая', blocker: 'блокирует',
}

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'открыто', in_progress: 'в работе', fixed: 'исправлено', wont_fix: 'не будем',
}

/** Части урока, на которые чаще всего показывают. */
export const ISSUE_AREAS = [
  'теория', 'пример кода', 'задание', 'стартовый код',
  'подсказка', 'проверка', 'вывод', 'навигация', 'сюжет', 'другое',
] as const

const KEY = 'request.qa-issues.v1'

const read = (): LearningIssue[] => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as LearningIssue[]) : []
  } catch { return [] }
}

const write = (issues: LearningIssue[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(issues)) } catch { /* хранилище недоступно */ }
}

/** Новые сверху: очередь разбирают с последнего наблюдения. */
export function listIssues() {
  return read().sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function addIssue(draft: Omit<LearningIssue, 'id' | 'createdAt' | 'status'>) {
  const issue: LearningIssue = {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'open',
  }
  write([issue, ...read()])
  return issue
}

export function updateIssue(id: string, patch: Partial<LearningIssue>) {
  const next = read().map(issue => {
    if (issue.id !== id) return issue
    const merged = { ...issue, ...patch }
    if (patch.status === 'fixed' && !merged.resolvedAt) merged.resolvedAt = new Date().toISOString()
    return merged
  })
  write(next)
  return next.find(issue => issue.id === id) ?? null
}

export function removeIssue(id: string) {
  write(read().filter(issue => issue.id !== id))
}

/** Текст одного замечания для передачи агенту: всё, что нужно, чтобы найти место. */
export function issueForAgent(issue: LearningIssue) {
  return [
    `Курс: ${issue.courseTitle} (${issue.courseId})`,
    `Миссия: ${issue.missionTitle} (${issue.missionId})`,
    `Тип: ${ISSUE_TYPE_LABEL[issue.type]}`,
    `Важность: ${ISSUE_SEVERITY_LABEL[issue.severity]}${issue.blocker ? ' · мешает продолжить' : ''}`,
    issue.missionStage ? `Ступень: ${issue.missionStage}` : null,
    issue.concept ? `Сущность: ${issue.concept}` : null,
    `Место: ${issue.targetArea}`,
    `Проблема: ${issue.description}`,
    issue.quote ? `Цитата: «${issue.quote}»` : null,
    `Состояние: ${ISSUE_STATUS_LABEL[issue.status]}`,
  ].filter(Boolean).join('\n')
}

/** Вся очередь одним файлом: важное и блокирующее идёт первым. */
export function issuesAsMarkdown(issues: LearningIssue[]) {
  const weight: Record<IssueSeverity, number> = { blocker: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...issues].sort((left, right) => weight[left.severity] - weight[right.severity])
  const lines = ['# Замечания по курсам REduQuest', '', `Всего: ${issues.length}`, '']
  for (const issue of sorted) {
    lines.push(`## ${ISSUE_SEVERITY_LABEL[issue.severity].toUpperCase()} — ${ISSUE_TYPE_LABEL[issue.type]}`, '')
    lines.push(`- Курс: \`${issue.courseId}\` — ${issue.courseTitle}`)
    lines.push(`- Миссия: \`${issue.missionId}\` — ${issue.missionTitle}`)
    if (issue.missionStage) lines.push(`- Ступень: ${issue.missionStage}`)
    if (issue.concept) lines.push(`- Сущность: ${issue.concept}`)
    lines.push(`- Место: ${issue.targetArea}`)
    lines.push(`- Состояние: ${ISSUE_STATUS_LABEL[issue.status]}`)
    lines.push('', issue.description, '')
    if (issue.quote) lines.push('> ' + issue.quote.replace(/\n/g, '\n> '), '')
    if (issue.resolution) lines.push(`Решение: ${issue.resolution}`, '')
  }
  return lines.join('\n')
}

/** Сколько открытых замечаний висит на миссии: отметка в оглавлении урока. */
export function openIssueCount(missionId: string) {
  return read().filter(issue => issue.missionId === missionId && issue.status === 'open').length
}
