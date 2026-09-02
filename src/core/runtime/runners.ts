import type { CodeRunner, RunRequest, RunResult } from './types'

/**
 * Среда, которой нет.
 *
 * Это реализация по умолчанию и она правильная: настоящей изоляции в REQuest
 * пока не построено, а выполнять чужой код без изоляции нельзя. Каждый вызов
 * возвращает `executed: false` — интерфейс обязан показать это как «среда
 * недоступна», а проверка задания не имеет права засчитать такой результат.
 */
export const unavailableRunner: CodeRunner = {
  id: 'unavailable',
  title: 'Среда выполнения не подключена',
  available: false,
  capabilities: { languages: [], stdin: false, timeouts: false },
  async run(request: RunRequest): Promise<RunResult> {
    return {
      stdout: '',
      stderr: '',
      exitCode: -1,
      durationMs: 0,
      timedOut: false,
      executed: false,
      structuredErrors: [{
        kind: 'unavailable',
        message: `Код на ${request.language} не выполнен: изолированная среда выполнения ещё не подключена.`,
      }],
      unavailableReason: 'Запуск чужого кода без настоящей изоляции небезопасен, поэтому его нет.',
    }
  },
}

/** Сценарий подделанного запуска: только для фикстур и разработки. */
export interface MockScript {
  taskId: string
  match?: (request: RunRequest) => boolean
  stdout?: string
  stderr?: string
  exitCode?: number
  timedOut?: boolean
  durationMs?: number
}

/**
 * Поддельная среда для фикстур и демонстраций.
 *
 * Ничего не выполняет — отдаёт заранее записанный вывод. Каждый её результат
 * помечен `simulated: true`, интерфейс обязан это показывать, а собираться в
 * production она не должна: создаётся только явным вызовом из кода разработки.
 */
export function createMockRunner(scripts: MockScript[]): CodeRunner {
  return {
    id: 'mock',
    title: 'Имитация среды (только для разработки)',
    available: true,
    capabilities: { languages: ['python', 'sql', 'javascript', 'bash'], stdin: true, timeouts: true },
    async run(request: RunRequest): Promise<RunResult> {
      const script = scripts.find(item => item.taskId === request.taskId && (!item.match || item.match(request)))
      if (!script) {
        return {
          stdout: '', stderr: '', exitCode: -1, durationMs: 0, timedOut: false, executed: false, simulated: true,
          structuredErrors: [{ kind: 'unavailable', message: 'Для этой задачи нет записанного сценария имитации.' }],
          unavailableReason: 'Имитация покрывает только заранее описанные случаи.',
        }
      }
      return {
        stdout: script.stdout ?? '',
        stderr: script.stderr ?? '',
        exitCode: script.exitCode ?? 0,
        durationMs: script.durationMs ?? 12,
        timedOut: Boolean(script.timedOut),
        executed: true,
        simulated: true,
        structuredErrors: script.stderr
          ? [{ kind: 'runtime', message: script.stderr.split('\n').slice(-1)[0] ?? script.stderr }]
          : [],
      }
    },
  }
}

/**
 * Какая среда используется приложением.
 *
 * Возвращает недоступную намеренно: подмена происходит только в тестах и
 * демонстрациях, явной передачей другой реализации.
 */
export function defaultRunner(): CodeRunner {
  return unavailableRunner
}
