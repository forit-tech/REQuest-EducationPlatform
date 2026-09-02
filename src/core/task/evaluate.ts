import { passesCodeCheck } from '../tasks'
import type {
  CheckResult, EvaluationResult, EvidenceStrength, NumericExpectation, ResponseValue, Task, TextPattern, Tolerance,
} from './types'

/* ------------------------------------------------------------------ разбор */

/**
 * Число из пользовательского ввода: принимает запятую как разделитель, дробь
 * `3/4`, знак минуса в любом из трёх юникодных начертаний и научную запись.
 * Требовать от человека каноничной записи числа — проверять оформление, а не
 * понимание.
 */
export function parseNumber(raw: string): number | undefined {
  const text = raw.trim().replace(/[−‒–—]/g, '-').replace(/\s+/g, '').replace(',', '.')
  if (!text) return undefined
  const fraction = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(text)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (!denominator) return undefined
    return Number(fraction[1]) / denominator
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/** Вектор из ввода: `1, 2, 3`, `[1 2 3]`, `(1; 2; 3)` — всё одно и то же. */
export function parseVector(raw: string): number[] | undefined {
  const inner = raw.trim().replace(/^[[({]/, '').replace(/[\])}]$/, '')
  if (!inner.trim()) return undefined
  const parts = inner.split(/[;,]|\s+/).map(part => part.trim()).filter(Boolean)
  const values = parts.map(parseNumber)
  return values.every((value): value is number => value !== undefined) ? values : undefined
}

function withinTolerance(actual: number, expected: number, tolerance?: Tolerance) {
  if (!tolerance) return Object.is(actual, expected) || Math.abs(actual - expected) < 1e-9
  if (tolerance.kind === 'absolute') return Math.abs(actual - expected) <= tolerance.value
  const scale = Math.abs(expected) || 1
  return Math.abs(actual - expected) / scale <= tolerance.value
}

function matchesExpectation(raw: string, expectation: NumericExpectation) {
  const candidates = [expectation.value, ...(expectation.accept ?? [])]
  return candidates.some(candidate => {
    if (Array.isArray(candidate)) {
      const actual = parseVector(raw)
      if (!actual || actual.length !== candidate.length) return false
      return actual.every((value, index) => withinTolerance(value, candidate[index], expectation.tolerance))
    }
    const actual = parseNumber(raw)
    return actual !== undefined && withinTolerance(actual, candidate, expectation.tolerance)
  })
}

/**
 * Приведение математической записи к сравнимому виду.
 *
 * Это НЕ система компьютерной алгебры: `x^2-1` и `(x-1)(x+1)` останутся разными.
 * Нормализуются только оформление и синонимы записи. Поэтому для формул, где
 * возможна алгебраически другая, но верная форма, правильный способ проверки —
 * рубрика, а не `symbolic`.
 */
export function normalizeExpression(raw: string, aliases: Record<string, string> = {}) {
  let text = raw.trim()
  for (const [from, to] of Object.entries(aliases)) text = text.split(from).join(to)
  return text
    .replace(/\\left|\\right|\\,|\\;|\\!/g, '')
    .replace(/[−‒–—]/g, '-')
    .replace(/[·×∙]/g, '*')
    .replace(/\*\*/g, '^')
    .replace(/\s+/g, '')
    .replace(/\{|\}/g, '')
}

function normalizeText(raw: string) {
  return raw.toLowerCase().replace(/[ё]/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function matchesTextPattern(raw: string, pattern: TextPattern) {
  if (pattern.kind === 'regex') return new RegExp(pattern.value, pattern.flags ?? 'iu').test(raw)
  const actual = normalizeText(raw)
  if (pattern.kind === 'equals') return actual === normalizeText(pattern.value)
  return pattern.values.some(value => actual === normalizeText(value))
}

/* ------------------------------------------------------------- результаты */

function build(
  checks: CheckResult[],
  evidence: EvidenceStrength,
  diagnosedSkills: string[],
  options: { passScore?: number; status?: EvaluationResult['status']; message?: string } = {},
): EvaluationResult {
  const total = checks.length || 1
  const score = checks.filter(check => check.passed).length / total
  const passScore = options.passScore ?? 1
  const passed = score >= passScore - 1e-9
  return {
    status: options.status ?? (passed ? 'passed' : score > 0 ? 'partial' : 'failed'),
    passed,
    score,
    evidence,
    checks,
    diagnosedSkills: [...new Set(diagnosedSkills)],
    message: options.message,
  }
}

function diagnoseFor(task: Task, keys: string[]) {
  return keys.flatMap(key => task.diagnoses?.[key] ?? [])
}

/**
 * Разбор ошибок составного задания пишется в одной таблице на всё задание, с
 * ключами вида `поле.проверка`. Вложенной проверке передаётся её часть таблицы,
 * иначе поле не увидит собственные записи.
 */
function scopedDiagnoses(task: Task, fieldId: string) {
  const entries = Object.entries(task.diagnoses ?? {})
  const prefix = `${fieldId}.`
  return Object.fromEntries([
    ...entries.filter(([key]) => !key.includes('.')),
    ...entries.filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]),
  ])
}

/* ------------------------------------------------------------- evaluators */

/**
 * Проверка ответа. Чистая функция: ничего не пишет, ничего не запускает.
 * Запуск пользовательского кода сюда не встроен намеренно — см. `program`.
 */
export function evaluate(task: Task, value: ResponseValue): EvaluationResult {
  const evaluation = task.evaluation

  if (evaluation.type === 'choice') {
    if (value.kind !== 'choice') return build([], 'strong', [], { message: 'Ответ не выбран' })
    const correct = new Set(evaluation.correct)
    const selected = new Set(value.selected)
    const options = task.response.kind === 'choice' ? task.response.options : []
    const single = task.response.kind === 'choice' && task.response.select === 'one'
    if (single) {
      // Одиночный выбор — это один факт, а не список из трёх. Раньше каждый
      // вариант становился отдельной проверкой, и невыбранный неверный вариант
      // показывался зелёной галочкой: формально верно, читается как «правильно».
      const chosen = options.find(option => selected.has(option.id))
      const ok = chosen ? correct.has(chosen.id) : false
      return build(
        [{ id: 'choice', label: chosen ? chosen.text : 'Вариант не выбран', passed: ok, detail: chosen?.explanation }],
        'strong',
        ok ? [] : diagnoseFor(task, chosen ? [chosen.id] : []),
      )
    }
    const checks: CheckResult[] = options.map(option => {
      const shouldSelect = correct.has(option.id)
      const didSelect = selected.has(option.id)
      return {
        id: option.id,
        label: option.text,
        passed: shouldSelect === didSelect,
        detail: option.explanation,
      }
    })
    const wrong = options.filter(option => correct.has(option.id) !== selected.has(option.id)).map(option => option.id)
    const passScore = evaluation.partialCredit ? 0.999 : 1
    const result = build(checks, 'strong', diagnoseFor(task, wrong), { passScore })
    if (evaluation.partialCredit && !result.passed) {
      const hits = [...selected].filter(id => correct.has(id)).length
      return { ...result, score: correct.size ? hits / correct.size : 0 }
    }
    return result
  }

  if (evaluation.type === 'numeric') {
    if (value.kind !== 'numeric') return build([], 'strong', [], { message: 'Ответ не введён' })
    const fields = task.response.kind === 'numeric' ? task.response.fields : []
    const label = (id: string) => fields.find(field => field.id === id)?.label ?? id
    if (evaluation.orderSensitive === false) {
      // Набор значений без привязки к полю: собственные числа, корни, центры кластеров.
      const provided = Object.values(value.values).map(raw => raw.trim()).filter(Boolean)
      const remaining = [...evaluation.expected]
      const checks: CheckResult[] = []
      for (const raw of provided) {
        const index = remaining.findIndex(expectation => matchesExpectation(raw, expectation))
        checks.push({ id: raw, label: raw, passed: index >= 0 })
        if (index >= 0) remaining.splice(index, 1)
      }
      for (const missed of remaining) checks.push({ id: missed.field, label: label(missed.field), passed: false, detail: 'значение не названо' })
      return build(checks, 'strong', diagnoseFor(task, checks.filter(check => !check.passed).map(check => check.id)))
    }
    const checks: CheckResult[] = evaluation.expected.map(expectation => ({
      id: expectation.field,
      label: label(expectation.field),
      passed: matchesExpectation(value.values[expectation.field] ?? '', expectation),
    }))
    return build(checks, 'strong', diagnoseFor(task, checks.filter(check => !check.passed).map(check => check.id)))
  }

  if (evaluation.type === 'symbolic') {
    if (value.kind !== 'expression') return build([], 'strong', [], { message: 'Формула не введена' })
    const actual = normalizeExpression(value.value, evaluation.aliases)
    const passed = evaluation.accept.some(candidate => normalizeExpression(candidate, evaluation.aliases) === actual)
    return build([{ id: 'expression', label: 'Формула совпадает с эталонной записью', passed }], 'strong', passed ? [] : diagnoseFor(task, ['expression']))
  }

  if (evaluation.type === 'text') {
    if (value.kind !== 'text') return build([], 'strong', [], { message: 'Ответ не введён' })
    const passed = evaluation.accept.some(pattern => matchesTextPattern(value.value, pattern))
    return build([{ id: 'text', label: 'Ответ совпадает с ожидаемым', passed }], 'strong', passed ? [] : diagnoseFor(task, ['text']))
  }

  if (evaluation.type === 'ordering') {
    if (value.kind !== 'ordering') return build([], 'strong', [], { message: 'Порядок не задан' })
    const items = task.response.kind === 'ordering' ? task.response.items : []
    const checks: CheckResult[] = evaluation.correct.map((id, index) => ({
      id,
      label: items.find(item => item.id === id)?.text ?? id,
      passed: value.order[index] === id,
      detail: `место ${index + 1}`,
    }))
    return build(checks, 'strong', diagnoseFor(task, checks.filter(check => !check.passed).map(check => check.id)))
  }

  if (evaluation.type === 'matching') {
    if (value.kind !== 'matching') return build([], 'strong', [], { message: 'Пары не составлены' })
    const left = task.response.kind === 'matching' ? task.response.left : []
    const checks: CheckResult[] = Object.entries(evaluation.pairs).map(([leftId, rightId]) => ({
      id: leftId,
      label: left.find(item => item.id === leftId)?.text ?? leftId,
      passed: value.pairs[leftId] === rightId,
    }))
    return build(checks, 'strong', diagnoseFor(task, checks.filter(check => !check.passed).map(check => check.id)))
  }

  if (evaluation.type === 'program') {
    if (value.kind !== 'code') return build([], 'strong', [], { message: 'Код не написан' })
    const source = Object.values(value.files).join('\n')
    const checks: CheckResult[] = (evaluation.staticChecks ?? []).map((check, index) => ({
      id: `static-${index}`,
      label: check.label,
      passed: check.kind === 'must-contain'
        ? passesCodeCheck(source, check.fragment)
        : !passesCodeCheck(source, check.fragment),
    }))
    // Тесты объявлены, но выполнять чужой код без песочницы нельзя. Пока её нет,
    // задание честно сообщает, что окончательная проверка ещё не выполнена, и
    // не выдаёт статические проверки за прохождение тестов.
    const staticPassed = checks.every(check => check.passed)
    const pending = evaluation.cases.map(testCase => ({
      id: testCase.id,
      label: testCase.hidden ? 'Скрытый тест' : testCase.name,
      passed: false,
      detail: 'ожидает песочницу',
      hidden: testCase.hidden,
    }))
    const failed = checks.filter(check => !check.passed).map(check => check.id)
    return {
      status: evaluation.cases.length ? 'needs-runtime' : staticPassed ? 'passed' : 'failed',
      passed: evaluation.cases.length ? false : staticPassed,
      score: checks.length ? checks.filter(check => check.passed).length / checks.length : 0,
      evidence: 'strong',
      checks: [...checks, ...pending],
      diagnosedSkills: diagnoseFor(task, failed),
      message: evaluation.cases.length ? 'Тесты будут запущены, когда появится песочница выполнения.' : undefined,
    }
  }

  if (evaluation.type === 'rubric') {
    if (evaluation.mode === 'self-assessment') {
      if (value.kind !== 'self-assessment') {
        return {
          status: 'awaiting-self-assessment', passed: false, score: 0, evidence: 'weak', checks: [], diagnosedSkills: [],
          message: 'Сначала ответьте, затем сверьтесь с ключевыми пунктами.',
        }
      }
      const covered = new Set(value.covered)
      const checks: CheckResult[] = evaluation.criteria.map(criterion => ({
        id: criterion.id,
        label: criterion.criterion,
        passed: covered.has(criterion.id),
        detail: criterion.requiredConcepts.join(', '),
      }))
      const weightTotal = evaluation.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) || 1
      const score = evaluation.criteria.filter(criterion => covered.has(criterion.id))
        .reduce((sum, criterion) => sum + criterion.weight, 0) / weightTotal
      return {
        status: score >= evaluation.passScore ? 'passed' : 'partial',
        passed: score >= evaluation.passScore,
        score,
        evidence: 'weak',
        checks,
        diagnosedSkills: diagnoseFor(task, checks.filter(check => !check.passed).map(check => check.id)),
        message: 'Это самооценка: она отмечается как слабое свидетельство освоения.',
      }
    }
    if (value.kind !== 'text') return build([], 'weak', [], { message: 'Ответ не введён' })
    // Совпадение понятий показывает, что человек назвал нужные вещи. Оно не
    // доказывает, что он их верно связал, поэтому свидетельство слабое.
    const checks: CheckResult[] = evaluation.criteria.map(criterion => ({
      id: criterion.id,
      label: criterion.criterion,
      passed: criterion.requiredConcepts.every(concept => normalizeText(value.value).includes(normalizeText(concept))),
      detail: criterion.requiredConcepts.join(', '),
    }))
    const weightTotal = evaluation.criteria.reduce((sum, criterion) => sum + criterion.weight, 0) || 1
    const score = evaluation.criteria.filter((_, index) => checks[index].passed)
      .reduce((sum, criterion) => sum + criterion.weight, 0) / weightTotal
    return {
      status: score >= evaluation.passScore ? 'passed' : score > 0 ? 'partial' : 'failed',
      passed: score >= evaluation.passScore,
      score,
      evidence: 'weak',
      checks,
      diagnosedSkills: diagnoseFor(task, checks.filter(check => !check.passed).map(check => check.id)),
    }
  }

  if (evaluation.type === 'form') {
    if (value.kind !== 'form') return build([], 'strong', [], { message: 'Ответ не заполнен' })
    const fields = task.response.kind === 'form' ? task.response.fields : []
    const results = fields.map(field => ({
      field,
      result: evaluate(
        { ...task, response: field.response, evaluation: field.evaluation, diagnoses: scopedDiagnoses(task, field.id) },
        value.fields[field.id] ?? { kind: 'text', value: '' },
      ),
    }))
    const weightTotal = fields.reduce((sum, field) => sum + (field.weight ?? 1), 0) || 1
    // Балл показывает, насколько человек близок; зачёт считается по выполненным
    // полям. Иначе наполовину верный порядок стадий вытягивался бы за счёт
    // соседнего поля, и задание засчитывалось бы при неверном ответе.
    const score = results.reduce((sum, item) => sum + item.result.score * (item.field.weight ?? 1), 0) / weightTotal
    const completed = results.reduce((sum, item) => sum + (item.result.passed ? item.field.weight ?? 1 : 0), 0) / weightTotal
    const passScore = evaluation.passScore ?? 1
    return {
      status: results.some(item => item.result.status === 'needs-runtime') ? 'needs-runtime'
        : completed >= passScore - 1e-9 ? 'passed' : score > 0 ? 'partial' : 'failed',
      passed: completed >= passScore - 1e-9 && !results.some(item => item.result.status === 'needs-runtime'),
      score,
      evidence: results.every(item => item.result.evidence === 'strong') ? 'strong' : 'weak',
      checks: results.flatMap(item => item.result.checks.map(check => ({ ...check, id: `${item.field.id}.${check.id}`, label: `${item.field.label}: ${check.label}` }))),
      diagnosedSkills: [...new Set(results.flatMap(item => item.result.diagnosedSkills))],
    }
  }

  if (evaluation.type === 'composite') {
    if (value.kind !== 'composite') return build([], 'strong', [], { message: 'Шаги не выполнены' })
    const steps = task.response.kind === 'composite' ? task.response.steps : []
    const results = steps.map(step => ({ step, result: evaluate(step, value.steps[step.id] ?? { kind: 'text', value: '' }) }))
    const score = results.length ? results.reduce((sum, item) => sum + item.result.score, 0) / results.length : 0
    const completed = results.length ? results.filter(item => item.result.passed).length / results.length : 0
    const passScore = evaluation.passScore ?? 1
    return {
      status: results.some(item => item.result.status === 'needs-runtime') ? 'needs-runtime'
        : completed >= passScore - 1e-9 ? 'passed' : score > 0 ? 'partial' : 'failed',
      passed: completed >= passScore - 1e-9 && !results.some(item => item.result.status === 'needs-runtime'),
      score,
      evidence: results.every(item => item.result.evidence === 'strong') ? 'strong' : 'weak',
      checks: results.map((item, index) => ({
        id: item.step.id,
        label: `Шаг ${index + 1}. ${item.step.title ?? item.step.prompt.slice(0, 60)}`,
        passed: item.result.passed,
      })),
      diagnosedSkills: [...new Set(results.flatMap(item => item.result.diagnosedSkills))],
    }
  }

  // Совместимость со старым контентом: проверка обязательных фрагментов кода.
  if (value.kind !== 'code') return build([], 'weak', [], { message: 'Код не написан' })
  const source = Object.values(value.files).join('\n')
  const checks: CheckResult[] = evaluation.checks.map((check, index) => ({
    id: `legacy-${index}`,
    label: check.label,
    passed: passesCodeCheck(source, check.fragment),
    detail: check.fragment.trim(),
  }))
  return build(checks, 'weak', diagnoseFor(task, checks.filter(check => !check.passed).map(check => check.id)))
}
