import { blockedRequirements, dependentsOf } from './planner'
import type { DiagnosticContext, DiagnosticSession, SkillState } from './types'
import type { SkillGraph } from '../task/prerequisites'

/**
 * План доработки после диагностики.
 *
 * Считается по простому и объяснимому правилу, а не по подобранным весам.
 * Порядок такой:
 *
 *   1. Сначала то, что можно чинить прямо сейчас: навык, всё основание которого
 *      уже подтверждено. Начинать с темы, под которой дыра, бессмысленно.
 *   2. Среди готовых к работе — тот, что разблокирует больше официальных
 *      вопросов программы.
 *   3. При равенстве — тот, где измеренная слабость сильнее.
 *
 * Непроверенное в план не попадает: чинить то, о чём мы ничего не знаем, нельзя.
 */

export interface RemediationStep {
  skillId: string
  title: string
  /** Готов ли навык к работе: всё ли его основание подтверждено. */
  actionable: boolean
  /** Предпосылки, где слабость измерена: они действительно мешают. */
  blockedBy: string[]
  /** Предпосылки, которые просто не проверялись. Работать они не мешают. */
  unverifiedFoundation: string[]
  /** Официальные вопросы, которые этот навык разблокирует. */
  unblocks: string[]
  score: number
  reason: 'measured-weakness' | 'blocked-foundation'
}

export interface DiagnosticSummary {
  trackId: string
  probes: number
  strong: string[]
  weak: string[]
  unknown: string[]
  implied: string[]
  blockedByRuntime: string[]
  /** Требования, где хотя бы один нужный навык оказался слабым. */
  requirementsAtRisk: string[]
  /** Требования, ни один навык которых не проверялся. */
  requirementsUnverified: string[]
  plan: RemediationStep[]
}

const byVerdict = (states: Record<string, SkillState>, verdict: SkillState['verdict']) =>
  Object.values(states).filter(state => state.verdict === verdict).map(state => state.skillId).sort()

export function summarize(graph: SkillGraph, context: DiagnosticContext, session: DiagnosticSession): DiagnosticSummary {
  const states = session.states
  const strong = new Set([...byVerdict(states, 'strong'), ...byVerdict(states, 'implied')])
  const weak = byVerdict(states, 'weak')

  const plan: RemediationStep[] = weak.map(skillId => {
    const foundation = graph[skillId]?.prerequisites ?? []
    // Блокирует только доказанная слабость. Непроверенное основание поводом не
    // является: у нас нет свидетельства проблемы, а закрывать белые пятна —
    // работа диагностики, а не плана доработки.
    const blockedBy = foundation.filter(id => states[id]?.verdict === 'weak')
    const unverifiedFoundation = foundation.filter(id => !states[id] || states[id].verdict === 'unknown')
    return {
      skillId,
      title: graph[skillId]?.title ?? skillId,
      actionable: blockedBy.length === 0,
      blockedBy,
      unverifiedFoundation,
      unblocks: blockedRequirements(graph, context, skillId),
      score: states[skillId]?.score ?? 0,
      reason: blockedBy.length ? 'blocked-foundation' as const : 'measured-weakness' as const,
    }
  }).sort((left, right) =>
    Number(right.actionable) - Number(left.actionable)
    || right.unblocks.length - left.unblocks.length
    || left.score - right.score
    || left.skillId.localeCompare(right.skillId))

  const requirementsAtRisk: string[] = []
  const requirementsUnverified: string[] = []
  for (const [requirementId, skills] of Object.entries(context.requirementSkills)) {
    const known = skills.filter(id => states[id] && states[id].verdict !== 'unknown')
    if (!known.length) { requirementsUnverified.push(requirementId); continue }
    if (skills.some(id => states[id]?.verdict === 'weak')) requirementsAtRisk.push(requirementId)
  }

  return {
    trackId: session.trackId,
    probes: session.outcomes.length,
    strong: [...strong].sort(),
    weak,
    unknown: byVerdict(states, 'unknown'),
    implied: byVerdict(states, 'implied'),
    blockedByRuntime: byVerdict(states, 'blocked-by-runtime'),
    requirementsAtRisk: requirementsAtRisk.sort(),
    requirementsUnverified: requirementsUnverified.sort(),
    plan,
  }
}

/** Навыки, которые этот навык откроет, если его подтянуть. Для объяснения плана. */
export function unlockedBy(graph: SkillGraph, session: DiagnosticSession, skillId: string) {
  return dependentsOf(graph, skillId, session.scope)
}
