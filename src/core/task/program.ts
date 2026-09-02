import { passesCodeCheck } from '../tasks'
import { evaluate } from './evaluate'
import { DEFAULT_LIMITS } from '../runtime/types'
import type { CodeRunner, RunResult } from '../runtime/types'
import type { CheckResult, EvaluationResult, ResponseValue, Task } from './types'

/**
 * Проверка кодового задания через среду выполнения.
 *
 * Правило, ради которого это вынесено отдельно: статические проверки не могут
 * сами по себе засчитать задание, если оно требует запуска. Наличие в коде
 * нужной строки не доказывает, что программа работает. Пока среда недоступна,
 * задание остаётся незачтённым — и честно об этом говорит.
 */

function normalizeOutput(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim()
}

function staticResults(task: Task, source: string): CheckResult[] {
  if (task.evaluation.type !== 'program') return []
  return (task.evaluation.staticChecks ?? []).map((check, index) => ({
    id: `static-${index}`,
    label: check.label,
    passed: check.kind === 'must-contain'
      ? passesCodeCheck(source, check.fragment)
      : !passesCodeCheck(source, check.fragment),
  }))
}

export interface ProgramRun {
  caseId: string
  result: RunResult
}

/**
 * Прогоняет тесты задания и собирает результат.
 *
 * Скрытый тест никогда не отдаёт наружу ни вход, ни ожидаемое, ни полученное:
 * иначе решение подгоняется под тест вместо того, чтобы быть написанным.
 */
export async function evaluateProgram(
  task: Task,
  value: ResponseValue,
  runner: CodeRunner,
): Promise<EvaluationResult> {
  if (task.evaluation.type !== 'program') throw new Error('evaluateProgram вызван для другого типа проверки')
  if (value.kind !== 'code') {
    return { status: 'failed', passed: false, score: 0, evidence: 'strong', checks: [], diagnosedSkills: [], message: 'Код не написан' }
  }

  const evaluation = task.evaluation
  const files = Object.entries(value.files).map(([path, content]) => ({ path, content }))
  const source = files.map(file => file.content).join('\n')
  const statics = staticResults(task, source)
  const entry = task.response.kind === 'code' ? task.response.entry : files[0]?.path ?? 'main'

  if (!evaluation.cases.length) {
    // Задание без тестов проверяется только структурно — это допустимо лишь
    // там, где от кода не требуется поведения.
    const passed = statics.every(check => check.passed)
    return {
      status: passed ? 'passed' : 'failed',
      passed,
      score: statics.length ? statics.filter(check => check.passed).length / statics.length : 0,
      evidence: 'strong',
      checks: statics,
      diagnosedSkills: passed ? [] : (statics.filter(check => !check.passed).flatMap(check => task.diagnoses?.[check.id] ?? [])),
    }
  }

  if (!runner.available) {
    return {
      status: 'needs-runtime',
      passed: false,
      score: 0,
      evidence: 'strong',
      checks: [
        ...statics,
        ...evaluation.cases.map(testCase => ({
          id: testCase.id,
          label: testCase.hidden ? 'Скрытый тест' : testCase.name,
          passed: false,
          detail: 'среда выполнения недоступна',
          hidden: testCase.hidden,
        })),
      ],
      diagnosedSkills: [],
      message: `${runner.title}. Пока её нет, задание нельзя зачесть по одному виду кода.`,
    }
  }

  const runs: ProgramRun[] = []
  for (const testCase of evaluation.cases) {
    const result = await runner.run({
      language: evaluation.language,
      files,
      entry,
      stdin: testCase.input,
      limits: { ...DEFAULT_LIMITS, timeoutMs: evaluation.timeoutMs ?? DEFAULT_LIMITS.timeoutMs },
      taskId: task.id,
    })
    runs.push({ caseId: testCase.id, result })
  }

  const executed = runs.every(run => run.result.executed)
  const caseChecks: CheckResult[] = evaluation.cases.map((testCase, index) => {
    const run = runs[index].result
    const ok = run.executed && !run.timedOut && normalizeOutput(run.stdout) === normalizeOutput(testCase.expected)
    if (testCase.hidden) {
      // Ни входа, ни ожидаемого, ни полученного — только факт.
      return {
        id: testCase.id,
        label: 'Скрытый тест',
        passed: ok,
        hidden: true,
        detail: run.timedOut ? 'превышено время' : run.executed ? undefined : 'не выполнен',
      }
    }
    return {
      id: testCase.id,
      label: testCase.name,
      passed: ok,
      hidden: false,
      detail: ok ? undefined : run.timedOut
        ? 'превышено время выполнения'
        : `ожидалось: ${normalizeOutput(testCase.expected) || '(пусто)'} · получено: ${normalizeOutput(run.stdout) || '(пусто)'}`,
    }
  })

  const checks = [...statics, ...caseChecks]
  const allPassed = executed && checks.every(check => check.passed)
  const failed = checks.filter(check => !check.passed)
  return {
    status: !executed ? 'needs-runtime' : allPassed ? 'passed' : checks.some(check => check.passed) ? 'partial' : 'failed',
    passed: allPassed,
    score: checks.length ? checks.filter(check => check.passed).length / checks.length : 0,
    evidence: 'strong',
    checks,
    diagnosedSkills: [...new Set(failed.flatMap(check => task.diagnoses?.[check.id] ?? []))],
    message: runs.some(run => run.result.simulated)
      ? 'Результат получен имитацией среды и не является доказательством работы программы.'
      : undefined,
  }
}

/**
 * Единая точка проверки ответа.
 *
 * Всё, кроме кода, проверяется чистой синхронной функцией. Код уходит в среду
 * выполнения — и только он, поэтому асинхронность не расползается по модели.
 */
export async function evaluateWithRuntime(task: Task, value: ResponseValue, runner: CodeRunner): Promise<EvaluationResult> {
  if (task.evaluation.type === 'program') return evaluateProgram(task, value, runner)
  return evaluate(task, value)
}
