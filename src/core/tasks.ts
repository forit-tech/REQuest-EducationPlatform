import type { Mission, TaskEnvironment } from '../types'

/**
 * Какое рабочее окружение открывать под задание.
 *
 * Раньше это выводилось из типа миссии, и `case`/`boss` открывали редактор кода
 * и терминал даже там, где заданием был выбор одного варианта из трёх. Теперь
 * окружение задаётся явно полем `task.environment`, а тип миссии участвует
 * только как совместимость для старого контента.
 *
 * Раньше старые кодовые задания получали ещё и терминал: `rq check` был
 * единственным местом, где было видно, какие проверки прошли. С появлением
 * панели результата в рабочей станции этот костыль убран — терминал остаётся
 * только там, где задание действительно про оболочку.
 */
export function missionEnvironment(mission: Mission): TaskEnvironment {
  if (mission.task?.environment) return mission.task.environment
  if (mission.task?.starterCode) return 'editor'
  if (mission.type === 'code' || mission.type === 'lab') return 'editor'
  return 'none'
}

const WORD = /[\p{L}\p{N}_]/u

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Обязательный фрагмент кода превращается в шаблон, нечувствительный к пробелам.
 *
 * Пробелы внутри фрагмента становятся «сколько угодно пробелов», а между двумя
 * буквенно-цифровыми символами — «хотя бы один». Поэтому `per_day*7` и
 * `per_day * 7` считаются одним и тем же, а `import pandas` не схлопывается в
 * `importpandas`.
 */
export function codeCheckPattern(fragment: string): RegExp {
  let source = ''
  for (let index = 0; index < fragment.length; index += 1) {
    const char = fragment[index]
    if (!/\s/.test(char)) { source += escapeRegExp(char); continue }
    let end = index
    while (end < fragment.length && /\s/.test(fragment[end])) end += 1
    const before = fragment[index - 1]
    const after = fragment[end]
    const glued = before !== undefined && after !== undefined && WORD.test(before) && WORD.test(after)
    source += glued ? '\\s+' : '\\s*'
    index = end - 1
  }
  return new RegExp(source)
}

/**
 * Совместимая проверка кода по подстроке.
 *
 * Это временный механизм: он проверяет форму записи, а не поведение программы.
 * Правило одно — новый матчер обязан пропускать всё, что пропускала прямая
 * подстрока, и дополнительно прощать форматирование. Настоящая проверка
 * поведения (тесты, сравнение вывода, численный допуск) приходит с моделью
 * заданий V2.
 */
export function passesCodeCheck(code: string, fragment: string) {
  if (!fragment) return true
  if (code.includes(fragment)) return true
  try {
    return codeCheckPattern(fragment).test(code)
  } catch {
    return false
  }
}
