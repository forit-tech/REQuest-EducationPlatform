export * from './types'
export { evaluate, normalizeExpression, parseNumber, parseVector } from './evaluate'
export { evaluateProgram, evaluateWithRuntime } from './program'
export { taskFromMission } from './legacy'
export {
  MASTERY_THRESHOLD, MAX_ATTEMPTS, RECENT_WINDOW, acceptedAdmissionRefs, emptyMastery,
  evidenceDimensions, historyInfo, normalizeMastery, readinessFor, recordAttempt, skillConfidence,
  skillReport, skillScore, topicReport,
} from './mastery'
export type {
  AttemptRecord, AttemptSkill, Confidence, HistoryInfo, MasteryBook, ReadinessReport,
  RequirementCoverage, SkillReport,
} from './mastery'
export {
  canSkipBasics, directPrerequisites, isUnlocked, prerequisiteChain, remediationFor, skillGraph,
} from './prerequisites'
export type { Remediation, SkillGraph, SkillNode } from './prerequisites'
export { emptyResponse, isAnswered, rendererFor, resolveEnvironment } from './renderers'
export type { RendererId } from './renderers'
export { validateTask, validateTasks } from './validate'
export type { ValidationContext, ValidationProblem } from './validate'
