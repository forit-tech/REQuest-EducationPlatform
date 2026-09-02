import type { DifficultyLevel, Task } from '../task/types'

/**
 * Входная диагностика.
 *
 * Смысл режима: до того как человек начнёт готовиться, выяснить, что он уже
 * умеет, чего не умеет и что вообще не проверялось. Это не экзамен по всем
 * официальным вопросам: проверяется граф навыков, а не список уроков.
 *
 * Ключевое различие, которое проходит через весь модуль: «не знает» и
 * «не проверяли» — разные состояния. Смешивать их значит врать человеку о нём
 * самом и строить план подготовки на выдуманных данных.
 */

export type SkillVerdict =
  /** Проверено и подтверждено. */
  | 'strong'
  /** Проверено и не подтверждено. */
  | 'weak'
  /** Не проверялось. Это не то же самое, что «не знает». */
  | 'unknown'
  /** Не проверялось напрямую, но следует из уверенного решения зависимой задачи. */
  | 'implied'
  /** Проверить не удалось: задание требует среды выполнения, а её нет. */
  | 'blocked-by-runtime'

/** Ступень пробы. Выводится из сложности задания, отдельного поля не нужно. */
export type ProbeLevel = 'recognition' | 'understanding' | 'calculation' | 'application' | 'exam'

export const probeLevelByDifficulty: Record<DifficultyLevel, ProbeLevel> = {
  L0: 'recognition',
  L1: 'understanding',
  L2: 'calculation',
  L3: 'application',
  L4: 'exam',
  L5: 'exam',
}

export interface ProbeOutcome {
  taskId: string
  skillId: string
  level: ProbeLevel
  /** `undefined` означает, что попытки не было: среда не дала выполнить. */
  passed?: boolean
  score: number
  /** Слабое свидетельство — самооценка или совпадение понятий. */
  weak: boolean
  blockedByRuntime: boolean
  at: string
}

export interface SkillState {
  skillId: string
  verdict: SkillVerdict
  /** Откуда взялся вердикт: из диагностики, из прошлых попыток или по следствию. */
  source: 'diagnostic' | 'history' | 'implied' | 'none'
  score: number
  probes: number
  /** Навык, уверенное решение которого позволило не спрашивать этот. */
  impliedBy?: string
}

export interface DiagnosticSession {
  version: 1
  /** Планировщик, которым собрана сессия. Меняется — сессия начинается заново. */
  plannerVersion: number
  trackId: string
  startedAt: string
  updatedAt: string
  finishedAt?: string
  /** Навыки, входящие в область проверки для этой программы. */
  scope: string[]
  /** Очередь навыков к проверке, ближайший первым. */
  pending: string[]
  outcomes: ProbeOutcome[]
  states: Record<string, SkillState>
  askedTaskIds: string[]
}

export interface DiagnosticContext {
  trackId: string
  /** Навыки, нужные каждому официальному требованию программы. */
  requirementSkills: Record<string, string[]>
  /** Пробы, сгруппированные по навыку. */
  probes: Task[]
  maxProbes: number
}

export const PLANNER_VERSION = 1

/** Сколько проб максимум задаёт диагностика, если её не остановить раньше. */
export const DEFAULT_PROBE_BUDGET = 24
