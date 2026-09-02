/**
 * Граница выполнения пользовательского кода.
 *
 * Здесь описан только договор. Ни одна реализация в этом файле код не
 * выполняет, и это осознанно: запустить чужой код безопасно нельзя ни через
 * `eval`, ни через `new Function`, ни через `child_process` без настоящей
 * изоляции. Пока изоляции нет, приложение обязано честно говорить, что среда
 * недоступна, а не изображать выполнение.
 *
 * Проверка заданий зависит от этого интерфейса, а не от конкретной песочницы:
 * когда появится настоящая изоляция, поменяется одна реализация.
 */

export interface RunFile {
  path: string
  content: string
}

export interface RunLimits {
  timeoutMs: number
  memoryMb?: number
  /** Разрешён ли коду выход в сеть. По умолчанию — нет. */
  network?: boolean
}

export interface RunRequest {
  language: string
  files: RunFile[]
  /** Файл, с которого начинается выполнение. */
  entry: string
  stdin?: string
  limits: RunLimits
  /** Для журналов и ограничений по задаче. */
  taskId: string
}

export type RuntimeErrorKind = 'syntax' | 'runtime' | 'assertion' | 'timeout' | 'unavailable'

export interface RuntimeError {
  kind: RuntimeErrorKind
  message: string
  file?: string
  /** Строка в файле: по ней интерфейс ставит курсор в редакторе. */
  line?: number
  column?: number
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
  durationMs: number
  timedOut: boolean
  structuredErrors: RuntimeError[]
  /** Ложь означает, что код не выполнялся: результат ничего не доказывает. */
  executed: boolean
  /**
   * Результат получен подделкой, а не выполнением. Такой результат разрешён
   * только в фикстурах и разработке и обязан быть виден в интерфейсе.
   */
  simulated?: boolean
  /** Понятная человеку причина, если выполнить не удалось. */
  unavailableReason?: string
}

export interface RunnerCapabilities {
  languages: string[]
  /** Умеет ли среда принимать stdin. */
  stdin: boolean
  /** Умеет ли среда прерывать зависший код. */
  timeouts: boolean
}

export interface CodeRunner {
  id: string
  title: string
  available: boolean
  capabilities: RunnerCapabilities
  run(request: RunRequest): Promise<RunResult>
}

export const DEFAULT_LIMITS: RunLimits = { timeoutMs: 5000, memoryMb: 256, network: false }
