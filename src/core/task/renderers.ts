import type { Response, ResponseValue, Task, TaskEnvironment } from './types'

/**
 * Реестр представлений.
 *
 * Здесь нет ни одного React-компонента намеренно. Учебная модель не должна
 * знать, чем рисуется редактор кода: сегодня это textarea, завтра Monaco или
 * CodeMirror, и подмена не должна трогать схему заданий. Реестр отвечает только
 * на два вопроса — какой компонент отвечает за форму ответа и какое окружение
 * ему нужно. Привязка идентификаторов к компонентам живёт в слое интерфейса.
 */

export type RendererId =
  | 'choice'
  | 'numeric-fields'
  | 'expression'
  | 'text'
  | 'ordering'
  | 'matching'
  | 'code-workspace'
  | 'form'
  | 'composite'
  | 'self-assessment'

export const rendererFor: Record<Response['kind'], RendererId> = {
  choice: 'choice',
  numeric: 'numeric-fields',
  expression: 'expression',
  text: 'text',
  ordering: 'ordering',
  matching: 'matching',
  code: 'code-workspace',
  form: 'form',
  composite: 'composite',
}

/** Окружение по умолчанию для формы ответа, если задание не указало своё. */
const environmentFor: Record<Response['kind'], TaskEnvironment> = {
  choice: 'none',
  numeric: 'none',
  expression: 'none',
  text: 'none',
  ordering: 'none',
  matching: 'none',
  code: 'editor',
  form: 'none',
  composite: 'none',
}

function deepest(left: TaskEnvironment, right: TaskEnvironment): TaskEnvironment {
  const rank: Record<TaskEnvironment, number> = {
    none: 0, dataset: 1, terminal: 2, editor: 3, notebook: 4, 'editor+terminal': 5,
  }
  return rank[left] >= rank[right] ? left : right
}

/**
 * Какое окружение открыть под задание.
 *
 * Составные задания наследуют самое требовательное окружение своих частей:
 * если внутри есть код, редактор нужен всему заданию.
 */
export function resolveEnvironment(task: Task): TaskEnvironment {
  if (task.environment) return task.environment
  const response = task.response
  if (response.kind === 'form') {
    return response.fields.reduce<TaskEnvironment>(
      (current, field) => deepest(current, environmentFor[field.response.kind]),
      'none',
    )
  }
  if (response.kind === 'composite') {
    return response.steps.reduce<TaskEnvironment>((current, step) => deepest(current, resolveEnvironment(step)), 'none')
  }
  return environmentFor[response.kind]
}

/** Пустой ответ нужной формы: с него начинается попытка. */
export function emptyResponse(response: Response): ResponseValue {
  switch (response.kind) {
    case 'choice': return { kind: 'choice', selected: [] }
    case 'numeric': return { kind: 'numeric', values: Object.fromEntries(response.fields.map(field => [field.id, ''])) }
    case 'expression': return { kind: 'expression', value: '' }
    case 'text': return { kind: 'text', value: '' }
    case 'ordering': return { kind: 'ordering', order: response.items.map(item => item.id) }
    case 'matching': return { kind: 'matching', pairs: {} }
    case 'code': return { kind: 'code', files: Object.fromEntries(response.files.map(file => [file.path, file.content])) }
    case 'form': return { kind: 'form', fields: Object.fromEntries(response.fields.map(field => [field.id, emptyResponse(field.response)])) }
    case 'composite': return { kind: 'composite', steps: Object.fromEntries(response.steps.map(step => [step.id, emptyResponse(step.response)])) }
  }
}

/** Готов ли ответ к проверке: пустое отправлять незачем. */
export function isAnswered(value: ResponseValue): boolean {
  switch (value.kind) {
    case 'choice': return value.selected.length > 0
    case 'numeric': return Object.values(value.values).some(entry => entry.trim().length > 0)
    case 'expression': return value.value.trim().length > 0
    case 'text': return value.value.trim().length > 0
    case 'ordering': return value.order.length > 0
    case 'matching': return Object.keys(value.pairs).length > 0
    case 'code': return Object.values(value.files).some(content => content.trim().length > 0)
    case 'form': return Object.values(value.fields).every(isAnswered)
    case 'composite': return Object.values(value.steps).every(isAnswered)
    case 'self-assessment': return value.text.trim().length > 0
  }
}
