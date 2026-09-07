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
 * Матчер прощает форматирование, но не засчитывает ожидаемую запись внутри
 * комментария. Настоящая проверка поведения (тесты, сравнение вывода,
 * численный допуск) приходит с моделью заданий V2.
 */
export interface LegacyCodeCheck {
  includes: string
  notIncludes?: string
  minOccurrences?: number
}

/** Убирает Python-комментарий, сохраняя `#` внутри строковых литералов. */
function stripHashComment(line: string) {
  let quote = ''
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (quote && character === '\\') {
      escaped = true
      continue
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = quote === character ? '' : quote || character
      continue
    }
    if (!quote && character === '#') return line.slice(0, index)
  }
  return line
}

/** Убирает комментарии: ожидаемый фрагмент в подсказке не является решением. */
function executableCode(code: string) {
  return code.split('\n').map(line => {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) return ''
    // В Python `//` — оператор, поэтому без языка задания безопасно удалять
    // только целую JS-комментарий-строку, но не хвост после исполняемого кода.
    return stripHashComment(line)
  }).join('\n')
}

export function passesCodeCheck(code: string, fragmentOrCheck: string | LegacyCodeCheck) {
  const check = typeof fragmentOrCheck === 'string' ? { includes: fragmentOrCheck } : fragmentOrCheck
  const fragment = check.includes
  if (!fragment) return true
  const source = executableCode(code)
  if (check.notIncludes && source.includes(check.notIncludes)) return false
  const exactOccurrences = source.split(fragment).length - 1
  if (check.minOccurrences && exactOccurrences >= check.minOccurrences) return true
  if (!check.minOccurrences && exactOccurrences > 0) return true
  try {
    const pattern = codeCheckPattern(fragment)
    if (!check.minOccurrences) return pattern.test(source)
    return [...source.matchAll(new RegExp(pattern.source, 'g'))].length >= check.minOccurrences
  } catch {
    return false
  }
}
