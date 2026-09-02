/**
 * Модель учебного задания REQuest, версия 2.
 *
 * Главное отличие от первой версии: задание больше не сводится к одному полю
 * `answer: string` с тремя вариантами. Здесь разведены четыре независимые вещи:
 *
 *   Task        — что учебно требуется сделать;
 *   Response    — в какой форме человек отвечает (определяет renderer);
 *   Evaluation  — как ответ проверяется (определяет evaluator);
 *   Environment — какое рабочее окружение нужно.
 *
 * Разведены они потому, что одна и та же форма ответа проверяется по-разному
 * (число можно сверить точно, с допуском или как вектор), а одна и та же
 * проверка встречается у разных форм (рубрика годится и для устного ответа, и
 * для поля в составном задании). Из-за этого набор поддерживаемых заданий
 * растёт умножением, а не перечислением: новый тип задачи почти всегда
 * оказывается новой парой уже существующих Response и Evaluation.
 */

/** Ступень сложности внутри темы: от узнавания до составного испытания. */
export type DifficultyLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

/**
 * Измерения освоения темы. Считаются отдельно, потому что человек может
 * уверенно считать руками и не уметь объяснить, и наоборот.
 */
export type MasteryDimension =
  | 'recall'
  | 'understanding'
  | 'calculation'
  | 'coding'
  | 'reasoning'
  | 'examReadiness'

export const masteryDimensions: readonly MasteryDimension[] = [
  'recall', 'understanding', 'calculation', 'coding', 'reasoning', 'examReadiness',
]

/**
 * Учебный смысл задания. На выбор renderer и evaluator НЕ влияет — нужен для
 * формулировок в интерфейсе, отбора экзаменационных заданий и телеметрии.
 */
export type TaskIntent =
  | 'concept'
  | 'worked-example'
  | 'practice'
  | 'calculation'
  | 'coding'
  | 'debug'
  | 'output-prediction'
  | 'reasoning'
  | 'proof'
  | 'experiment'
  | 'data-analysis'
  | 'system-design'
  | 'oral-exam'
  | 'exam'
  | 'boss'

/** Рабочее окружение задания. */
export type TaskEnvironment =
  | 'none'
  | 'editor'
  | 'terminal'
  | 'editor+terminal'
  | 'dataset'
  | 'notebook'

export interface ChoiceOption {
  id: string
  text: string
  /** Разбор конкретного варианта. Показывается после проверки. */
  explanation?: string
}

export interface NumericField {
  id: string
  label?: string
  unit?: string
  placeholder?: string
}

export interface TaskFile {
  path: string
  language: string
  content: string
  editable: boolean
}

/** Поле составного ответа: у каждого своя форма и своя проверка. */
export interface FormField {
  id: string
  label: string
  help?: string
  response: Response
  evaluation: Evaluation
  weight?: number
  evidences?: MasteryDimension[]
}

/**
 * Форма ответа. Тег `kind` выбирает renderer.
 *
 * `form` и `composite` — рекурсивные: именно они позволяют выразить задания,
 * где нужно и посчитать, и объяснить, и написать код в одном шаге.
 */
export type Response =
  | { kind: 'choice'; options: ChoiceOption[]; select: 'one' | 'many'; shuffle?: boolean }
  | { kind: 'numeric'; fields: NumericField[] }
  | { kind: 'expression'; placeholder?: string; symbols?: string[] }
  | { kind: 'text'; multiline?: boolean; minWords?: number; placeholder?: string }
  | { kind: 'ordering'; items: ChoiceOption[] }
  | { kind: 'matching'; left: ChoiceOption[]; right: ChoiceOption[] }
  | { kind: 'code'; files: TaskFile[]; entry: string }
  | { kind: 'form'; fields: FormField[] }
  | { kind: 'composite'; steps: Task[] }

/** Ответ человека. Тег совпадает с тегом `Response`. */
export type ResponseValue =
  | { kind: 'choice'; selected: string[] }
  | { kind: 'numeric'; values: Record<string, string> }
  | { kind: 'expression'; value: string }
  | { kind: 'text'; value: string }
  | { kind: 'ordering'; order: string[] }
  | { kind: 'matching'; pairs: Record<string, string> }
  | { kind: 'code'; files: Record<string, string> }
  | { kind: 'form'; fields: Record<string, ResponseValue> }
  | { kind: 'composite'; steps: Record<string, ResponseValue> }
  /** Самооценка по ключевым пунктам рубрики: какие из них человек раскрыл. */
  | { kind: 'self-assessment'; text: string; covered: string[] }

export type Tolerance =
  | { kind: 'absolute'; value: number }
  | { kind: 'relative'; value: number }

export interface NumericExpectation {
  field: string
  /** Скаляр или вектор. Матрица разворачивается в вектор по строкам. */
  value: number | number[]
  tolerance?: Tolerance
  /** Равноправные альтернативы: например, знак собственного вектора. */
  accept?: Array<number | number[]>
}

export type TextPattern =
  | { kind: 'equals'; value: string }
  | { kind: 'one-of'; values: string[] }
  | { kind: 'regex'; value: string; flags?: string }

export interface RubricCriterion {
  id: string
  criterion: string
  weight: number
  /** Понятия, без которых ответ не считается раскрытым. */
  requiredConcepts: string[]
  /** Типичные ошибки: показываются в разборе, на балл не влияют. */
  commonErrors?: string[]
}

export interface TestCase {
  id: string
  name: string
  input?: string
  expected: string
  /** Скрытый тест не показывает вход, чтобы решение нельзя было захардкодить. */
  hidden?: boolean
}

export type StaticCheck =
  | { kind: 'must-contain'; label: string; fragment: string }
  | { kind: 'must-not-contain'; label: string; fragment: string }

/** Способ проверки. Тег `type` выбирает evaluator. */
export type Evaluation =
  | { type: 'choice'; correct: string[]; partialCredit?: boolean }
  | { type: 'numeric'; expected: NumericExpectation[]; orderSensitive?: boolean }
  | { type: 'symbolic'; accept: string[]; aliases?: Record<string, string> }
  | { type: 'text'; accept: TextPattern[] }
  | { type: 'ordering'; correct: string[] }
  | { type: 'matching'; pairs: Record<string, string> }
  | { type: 'program'; language: string; cases: TestCase[]; staticChecks?: StaticCheck[]; timeoutMs?: number }
  | { type: 'rubric'; criteria: RubricCriterion[]; passScore: number; mode: 'self-assessment' | 'concept-match' }
  | { type: 'form'; passScore?: number }
  | { type: 'composite'; passScore?: number }
  | { type: 'legacy-substring'; checks: Array<{ label: string; fragment: string }> }

/**
 * Насколько результату можно верить как доказательству освоения.
 *
 * `strong` — проверка детерминированная и по существу (варианты, число,
 * порядок, тесты программы). `weak` — проверка косвенная: совпадение понятий в
 * свободном тексте или самооценка. Слабое свидетельство поднимает освоение
 * медленнее и не даёт высокой уверенности.
 */
export type EvidenceStrength = 'strong' | 'weak'

export interface CheckResult {
  id: string
  label: string
  passed: boolean
  detail?: string
  hidden?: boolean
}

export interface EvaluationResult {
  /** `needs-runtime` — задание требует запуска кода, а песочницы пока нет. */
  status: 'passed' | 'failed' | 'partial' | 'needs-runtime' | 'awaiting-self-assessment'
  passed: boolean
  /** Доля выполненного, 0..1. */
  score: number
  evidence: EvidenceStrength
  checks: CheckResult[]
  /** Навыки, которые просели судя по конкретным ошибкам. */
  diagnosedSkills: string[]
  message?: string
}

/**
 * Свидетельство по навыку.
 *
 * Одно задание почти всегда задействует несколько навыков и с разной силой:
 * задача на Витерби прямо проверяет сам алгоритм, но попутно опирается на
 * условную вероятность и динамическое программирование. Роль и вес позволяют
 * это выразить, не превращая всё в один общий процент.
 */
export interface SkillEvidence {
  skillId: string
  /** `primary` — задание проверяет навык; `secondary` — задействует попутно. */
  role: 'primary' | 'secondary'
  /** Вес свидетельства. По умолчанию 1 для primary и 0.4 для secondary. */
  weight?: number
  /** Какие измерения этого навыка подтверждает. По умолчанию — измерения задания. */
  dimensions?: MasteryDimension[]
}

export const SECONDARY_WEIGHT = 0.4

export function skillWeight(evidence: SkillEvidence) {
  return evidence.weight ?? (evidence.role === 'primary' ? 1 : SECONDARY_WEIGHT)
}

export interface Task {
  id: string
  title?: string
  intent: TaskIntent
  difficulty: DifficultyLevel
  prompt: string
  instructions?: string[]
  environment?: TaskEnvironment
  presentation?: {
    /** Код, который нельзя править: для предсказания вывода и поиска ошибки. */
    readOnlyCode?: TaskFile[]
    datasetId?: string
    expectedFormat?: string
  }
  response: Response
  evaluation: Evaluation
  /** Какие измерения освоения подтверждает успешное выполнение. */
  evidences: MasteryDimension[]
  /** Тема нужна для навигации по программе, но не является единицей освоения. */
  topicId: string
  /** Навыки, которые подтверждает задание. Именно по ним считается освоение. */
  skills: SkillEvidence[]
  /** Явные предпосылки. Если не заданы, берутся из графа навыков. */
  prerequisites?: string[]
  /**
   * Разбор ошибок: идентификатор варианта или проверки → навыки, которые
   * этот конкретный промах выдаёт. Основа адресной доработки.
   */
  diagnoses?: Record<string, string[]>
  hints?: string[]
  explanation: string
  sources?: Array<{ id: string; note?: string }>
  /**
   * Ссылки на официальные требования вуза в виде `<файл>:<пункт>`, например
   * `itmo-deep-learning-genai-2026:ITMO-DL-ML-14`.
   *
   * Готовность к поступлению поднимает только задание, у которого одновременно
   * экзаменационный `intent` и хотя бы одна ссылка, существующая в реестре
   * `knowledge/admissions`. Без этого профессиональное задание с ошибочно
   * выставленным `intent: exam` раздувало бы готовность к вступительному.
   */
  admissionRefs?: string[]
  /** Откуда пришло задание, если оно построено адаптером из старой миссии. */
  legacy?: { missionId: string }
}
