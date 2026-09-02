import { MASTERY_THRESHOLD, skillConfidence, skillReport, skillScore } from './mastery'
import type { MasteryBook } from './mastery'
import type { EvaluationResult, Task } from './types'

/**
 * Граф навыков и адресная доработка.
 *
 * Знания не выстраиваются в дерево: у Витерби два независимых основания —
 * скрытые марковские модели и динамическое программирование, — а собственные
 * числа нужны и для PCA, и для сингулярного разложения. Поэтому здесь граф.
 *
 * Смысл доработки: после ошибки не повторять тот же вопрос, а посмотреть,
 * какое основание просело, и отправить именно туда.
 */

export interface SkillNode {
  id: string
  title: string
  topicId: string
  prerequisites: string[]
}

export type SkillGraph = Record<string, SkillNode>

export function skillGraph(nodes: SkillNode[]): SkillGraph {
  return Object.fromEntries(nodes.map(node => [node.id, node]))
}

/**
 * Все предпосылки навыка вглубь, от ближайших к дальним.
 *
 * Начальный навык намеренно не помечается просмотренным заранее: если граф
 * зациклен, он вернётся в цепочку, и именно по этому цикл и обнаруживается.
 * В корректном графе вернуться к самому себе нельзя, поэтому поведение для
 * здоровых данных не меняется.
 */
export function prerequisiteChain(graph: SkillGraph, skillId: string): string[] {
  const seen = new Set<string>()
  const chain: string[] = []
  let frontier = graph[skillId]?.prerequisites ?? []
  while (frontier.length) {
    const next: string[] = []
    for (const id of frontier) {
      if (seen.has(id)) continue
      seen.add(id)
      chain.push(id)
      next.push(...(graph[id]?.prerequisites ?? []))
    }
    frontier = next
  }
  return chain
}

/** Прямые предпосылки задания: явные, иначе из графа по его навыкам. */
export function directPrerequisites(task: Task, graph: SkillGraph) {
  if (task.prerequisites?.length) return task.prerequisites
  const own = new Set(task.skills.map(evidence => evidence.skillId))
  return [...new Set(task.skills.flatMap(evidence => graph[evidence.skillId]?.prerequisites ?? []))]
    .filter(skillId => !own.has(skillId))
}

export interface Remediation {
  skillId: string
  title: string
  topicId: string
  score: number
  confidence: ReturnType<typeof skillConfidence>
  reason: 'diagnosed' | 'weak-prerequisite' | 'unknown-prerequisite' | 'task-skill'
}

/**
 * Что дать после неудачи.
 *
 * Порядок: сначала навыки, на которые прямо указала ошибка; затем самые слабые
 * основания задания; и только если всё основание освоено — сама тема задания.
 * Именно это позволяет после провала Витерби отправить человека на пару задач
 * по динамическому программированию, а не перечитывать марковские модели.
 */
export function remediationFor(task: Task, result: EvaluationResult, graph: SkillGraph, book: MasteryBook): Remediation[] {
  const entry = (skillId: string, reason: Remediation['reason']): Remediation | undefined => {
    const node = graph[skillId]
    if (!node) return undefined
    return {
      skillId,
      title: node.title,
      topicId: node.topicId,
      score: skillScore(book, skillId),
      confidence: skillConfidence(book, skillId),
      reason,
    }
  }

  const diagnosed = result.diagnosedSkills
    .map(skillId => entry(skillId, 'diagnosed'))
    .filter((item): item is Remediation => Boolean(item))

  const seen = new Set(diagnosed.map(item => item.skillId))
  const candidates = [...new Set(directPrerequisites(task, graph).flatMap(skillId => [skillId, ...prerequisiteChain(graph, skillId)]))]
    .filter(skillId => !seen.has(skillId))
    .map(skillId => entry(skillId, 'weak-prerequisite'))
    .filter((item): item is Remediation => Boolean(item))

  // Измеренная слабость важнее непроверенного основания: про первое у нас есть
  // доказательство, про второе — только незнание. Непроверенные предпосылки
  // остаются в конце списка и по-настоящему закрываются входной диагностикой.
  const measured = candidates
    .filter(item => item.confidence !== 'none' && item.score < MASTERY_THRESHOLD)
    .sort((left, right) => left.score - right.score)
  const unknown = candidates
    .filter(item => item.confidence === 'none')
    .map(item => ({ ...item, reason: 'unknown-prerequisite' as const }))

  const foundation = [...measured, ...unknown]
  if (diagnosed.length || foundation.length) return [...diagnosed, ...foundation]

  return task.skills
    .map(evidence => entry(evidence.skillId, 'task-skill'))
    .filter((item): item is Remediation => Boolean(item))
}

/**
 * Доступно ли продвинутое задание.
 *
 * Ступени L0–L2 не запираются никогда: закрывать вход в тему — это ровно то,
 * от чего REQuest отказался в графе курсов. Запираются только L3 и выше, где
 * без основания задание превращается в угадывание.
 */
export function isUnlocked(task: Task, graph: SkillGraph, book: MasteryBook) {
  if (task.difficulty === 'L0' || task.difficulty === 'L1' || task.difficulty === 'L2') return true
  return directPrerequisites(task, graph).every(skillId => skillScore(book, skillId) >= MASTERY_THRESHOLD)
}

/**
 * Можно ли сократить путь: навык уверенно освоен, значит вводные ступени
 * человеку показывать незачем.
 */
export function canSkipBasics(book: MasteryBook, skillId: string) {
  const report = skillReport(book, skillId)
  if (!report.attempts) return false
  return report.score >= 0.9 && report.confidence === 'high'
}
