import type { SkillGraph } from './prerequisites'
import type { Task } from './types'

/**
 * Проверка задания на границе схемы.
 *
 * Ловит то, что типы поймать не могут: ссылку на несуществующий навык, ссылку
 * на несуществующий пункт официальных требований, заявку на экзаменационную
 * готовность без такой ссылки и поле с нулевым весом, которое молча выпадает
 * из зачёта. Эти же правила пойдут в валидатор контента.
 */

export interface ValidationProblem {
  taskId: string
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface ValidationContext {
  skills: SkillGraph
  /** Все существующие ссылки вида `<файл>:<пункт>` из `knowledge/admissions`. */
  admissionRefs: ReadonlySet<string>
}

export function validateTask(task: Task, context: ValidationContext): ValidationProblem[] {
  const problems: ValidationProblem[] = []
  const add = (severity: ValidationProblem['severity'], code: string, message: string) =>
    problems.push({ taskId: task.id, severity, code, message })

  if (!task.skills.length) add('error', 'no-skills', 'Задание не объявляет ни одного навыка — освоение измерять нечем')
  for (const evidence of task.skills) {
    if (!context.skills[evidence.skillId]) add('error', 'unknown-skill', `Навык не найден в реестре: ${evidence.skillId}`)
    if (evidence.weight !== undefined && evidence.weight <= 0) {
      add('error', 'zero-skill-weight', `Нулевой вес свидетельства по навыку ${evidence.skillId}: он ни на что не влияет`)
    }
  }
  for (const skillId of task.prerequisites ?? []) {
    if (!context.skills[skillId]) add('error', 'unknown-prerequisite', `Предпосылка не найдена в реестре: ${skillId}`)
  }

  const examFormat = task.intent === 'exam' || task.intent === 'oral-exam'
  const refs = task.admissionRefs ?? []
  for (const ref of refs) {
    if (!context.admissionRefs.has(ref)) add('error', 'unknown-admission-ref', `Ссылка на требование не найдена в реестре: ${ref}`)
  }
  if (examFormat && !refs.length) {
    add('error', 'exam-without-ref', 'Экзаменационное задание без ссылки на официальное требование не может влиять на готовность')
  }
  if (!examFormat && refs.length) {
    add('warning', 'ref-without-exam-intent', 'Ссылка на требование есть, но формат не экзаменационный — на готовность задание не повлияет')
  }
  if (!examFormat && task.evidences.includes('examReadiness')) {
    add('warning', 'exam-readiness-claim', 'Задание заявляет готовность к экзамену, но не является экзаменационным форматом — заявка отброшена')
  }

  if (task.response.kind === 'form') {
    for (const field of task.response.fields) {
      if (field.weight !== undefined && field.weight <= 0) {
        add('error', 'zero-field-weight', `Поле «${field.label}» имеет нулевой вес и не влияет на зачёт`)
      }
    }
  }

  if (!task.explanation?.trim()) add('error', 'no-explanation', 'Нет разбора: без него ошибка ничему не учит')

  return problems
}

export function validateTasks(tasks: Task[], context: ValidationContext) {
  return tasks.flatMap(task => validateTask(task, context))
}
