import { MASTERY_THRESHOLD, skillConfidence, skillScore } from '../task/mastery'
import type { MasteryBook } from '../task/mastery'
import { prerequisiteChain } from '../task/prerequisites'
import type { SkillGraph } from '../task/prerequisites'
import { probeLevelByDifficulty, PLANNER_VERSION } from './types'
import type { DiagnosticContext, DiagnosticSession, ProbeLevel, ProbeOutcome, SkillState } from './types'
import type { EvaluationResult, Task } from '../task/types'

/**
 * Планировщик диагностики.
 *
 * Логика полностью детерминированная и живёт отдельно от интерфейса: ветвление
 * диагностики — это то, что нужно уметь объяснить человеку и проверить тестом,
 * поэтому никакой языковой модели и никакой скрытой вероятностной подгонки
 * здесь нет.
 *
 * Идея простая. Сначала спрашиваем «верхние» навыки — те, от которых зависит
 * больше всего. Уверенное решение сверху снимает вопросы к основанию: если
 * человек считает шаг Витерби, спрашивать его про условную вероятность отдельно
 * незачем. Провал сверху, наоборот, разворачивает спуск по предпосылкам, чтобы
 * найти настоящее узкое место.
 */

/** Глубина навыка в графе: сколько уровней оснований под ним. */
export function skillDepth(graph: SkillGraph, skillId: string): number {
  const prerequisites = graph[skillId]?.prerequisites ?? []
  if (!prerequisites.length) return 0
  return 1 + Math.max(...prerequisites.map(id => skillDepth(graph, id)))
}

/** Навыки, которым этот навык служит основанием, в пределах области проверки. */
export function dependentsOf(graph: SkillGraph, skillId: string, scope: readonly string[]) {
  return scope.filter(id => prerequisiteChain(graph, id).includes(skillId))
}

/**
 * Область проверки: навыки требований программы плюс всё их основание.
 *
 * Профессиональные навыки, не связанные ни с одним официальным требованием,
 * сюда не попадают — незачем удлинять вступительную диагностику тем, чего на
 * вступительном не спрашивают.
 */
export function diagnosticScope(graph: SkillGraph, context: DiagnosticContext): string[] {
  const direct = new Set(Object.values(context.requirementSkills).flat())
  const withFoundations = new Set<string>()
  for (const skillId of direct) {
    if (!graph[skillId]) continue
    withFoundations.add(skillId)
    for (const id of prerequisiteChain(graph, skillId)) if (graph[id]) withFoundations.add(id)
  }
  return [...withFoundations].sort()
}

/** Сколько официальных требований зависит от навыка. */
export function blockedRequirements(graph: SkillGraph, context: DiagnosticContext, skillId: string) {
  return Object.entries(context.requirementSkills).filter(([, skills]) =>
    skills.some(id => id === skillId || prerequisiteChain(graph, id).includes(skillId))).map(([requirementId]) => requirementId)
}

function historyState(book: MasteryBook, skillId: string): SkillState {
  const score = skillScore(book, skillId)
  const confidence = skillConfidence(book, skillId)
  if (confidence === 'none') return { skillId, verdict: 'unknown', source: 'none', score: 0, probes: 0 }
  // Одной слабой проверки недостаточно, чтобы пропустить навык совсем: она
  // подтверждает знакомство с темой, но не владение ею.
  if (score >= MASTERY_THRESHOLD && (confidence === 'medium' || confidence === 'high')) {
    return { skillId, verdict: 'strong', source: 'history', score, probes: 0 }
  }
  if (score < MASTERY_THRESHOLD) return { skillId, verdict: 'weak', source: 'history', score, probes: 0 }
  return { skillId, verdict: 'unknown', source: 'history', score, probes: 0 }
}

export function startSession(graph: SkillGraph, context: DiagnosticContext, book: MasteryBook, at = new Date().toISOString()): DiagnosticSession {
  const scope = diagnosticScope(graph, context)
  const states: Record<string, SkillState> = {}
  for (const skillId of scope) states[skillId] = historyState(book, skillId)

  return {
    version: 1,
    plannerVersion: PLANNER_VERSION,
    trackId: context.trackId,
    startedAt: at,
    updatedAt: at,
    scope,
    pending: orderFrontier(graph, context, scope, states),
    outcomes: [],
    states,
    askedTaskIds: [],
  }
}

/**
 * Порядок опроса.
 *
 * Первыми идут навыки, от которых зависит больше всего: одна проба сверху
 * закрывает вопросы к целой ветке основания. При равенстве вперёд выходит тот,
 * что глубже в графе, — он приносит больше сведений за одну задачу.
 */
function orderFrontier(graph: SkillGraph, context: DiagnosticContext, scope: readonly string[], states: Record<string, SkillState>) {
  return scope
    .filter(skillId => states[skillId]?.verdict === 'unknown' || states[skillId]?.verdict === 'weak')
    .map(skillId => ({
      skillId,
      dependents: dependentsOf(graph, skillId, scope).length,
      depth: skillDepth(graph, skillId),
      requirements: blockedRequirements(graph, context, skillId).length,
    }))
    .sort((left, right) =>
      right.depth - left.depth
      || right.requirements - left.requirements
      || right.dependents - left.dependents
      || left.skillId.localeCompare(right.skillId))
    .map(item => item.skillId)
}

function levelOf(task: Task): ProbeLevel {
  return probeLevelByDifficulty[task.difficulty]
}

/**
 * Какую пробу дать дальше.
 *
 * Возвращает `undefined`, когда спрашивать больше нечего: либо очередь пуста,
 * либо исчерпан бюджет проб. Диагностика не обязана трогать каждый навык.
 */
export function nextProbe(graph: SkillGraph, context: DiagnosticContext, session: DiagnosticSession): Task | undefined {
  if (session.outcomes.length >= context.maxProbes) return undefined
  const asked = new Set(session.askedTaskIds)

  for (const skillId of session.pending) {
    const state = session.states[skillId]
    if (state && (state.verdict === 'strong' || state.verdict === 'implied')) continue
    const candidates = context.probes
      .filter(task => !asked.has(task.id))
      .filter(task => task.skills.some(evidence => evidence.role === 'primary' && evidence.skillId === skillId))
      // Задание, которое нельзя проверить без среды выполнения, для диагностики
      // бесполезно: его провал ничего не доказывает.
      .filter(task => task.evaluation.type !== 'program' || (task.evaluation.cases ?? []).length === 0)
    if (!candidates.length) continue

    // Первая проба навыка — самая содержательная из доступных: если человек её
    // решает, спускаться ниже не нужно. Повторная — на ступень проще.
    const order: ProbeLevel[] = state && state.probes > 0
      ? ['understanding', 'calculation', 'recognition', 'application', 'exam']
      : ['application', 'calculation', 'exam', 'understanding', 'recognition']
    for (const level of order) {
      const found = candidates.find(task => levelOf(task) === level)
      if (found) return found
    }
    return candidates[0]
  }
  return undefined
}

/**
 * Учитывает результат пробы и перестраивает очередь.
 *
 * Три исхода. Успех — навык подтверждён, а его основание помечается как
 * следствие и больше не спрашивается. Неудача — в очередь встают прямые
 * предпосылки, чтобы найти, где именно провал. Среда недоступна — не
 * записывается ничего: отсутствие песочницы не является ошибкой человека.
 */
export function applyProbe(
  graph: SkillGraph,
  context: DiagnosticContext,
  session: DiagnosticSession,
  task: Task,
  result: EvaluationResult,
  at = new Date().toISOString(),
): DiagnosticSession {
  const skillId = task.skills.find(evidence => evidence.role === 'primary')?.skillId ?? task.skills[0]?.skillId
  if (!skillId) return session

  const blocked = result.status === 'needs-runtime' || result.status === 'awaiting-self-assessment'
  const outcome: ProbeOutcome = {
    taskId: task.id,
    skillId,
    level: levelOf(task),
    passed: blocked ? undefined : result.passed,
    score: blocked ? 0 : result.score,
    weak: result.evidence === 'weak',
    blockedByRuntime: blocked,
    at,
  }

  const states = { ...session.states }
  const previous = states[skillId] ?? { skillId, verdict: 'unknown' as const, source: 'none' as const, score: 0, probes: 0 }

  if (blocked) {
    states[skillId] = { ...previous, verdict: 'blocked-by-runtime', source: 'diagnostic' }
  } else if (result.passed) {
    states[skillId] = { skillId, verdict: 'strong', source: 'diagnostic', score: result.score, probes: previous.probes + 1 }
    // Уверенное решение сверху снимает вопросы к основанию — но только к тому,
    // которое ещё не проверялось: измеренную слабость следствие не отменяет.
    for (const id of prerequisiteChain(graph, skillId)) {
      const current = states[id]
      if (!current || current.verdict === 'unknown') {
        states[id] = { skillId: id, verdict: 'implied', source: 'implied', score: result.score, probes: 0, impliedBy: skillId }
      }
    }
  } else {
    states[skillId] = { skillId, verdict: 'weak', source: 'diagnostic', score: result.score, probes: previous.probes + 1 }
  }

  // После провала спускаемся к прямым предпосылкам: они встают в начало очереди.
  const descend = !blocked && !result.passed
    ? (graph[skillId]?.prerequisites ?? []).filter(id => session.scope.includes(id) && states[id]?.verdict !== 'strong')
    : []

  const rest = session.pending.filter(id => id !== skillId && !descend.includes(id))
    .filter(id => states[id]?.verdict !== 'strong' && states[id]?.verdict !== 'implied')
  const stillPending = blocked ? [...rest] : [...descend, ...rest]

  return {
    ...session,
    updatedAt: at,
    outcomes: [...session.outcomes, outcome],
    states,
    askedTaskIds: [...session.askedTaskIds, task.id],
    pending: stillPending,
  }
}

export function isFinished(graph: SkillGraph, context: DiagnosticContext, session: DiagnosticSession) {
  return !nextProbe(graph, context, session)
}
