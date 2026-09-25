/**
 * Разбор учебного текста на абзацы, код и вывод программы.
 *
 * Курсы пишут объяснение одной строкой JSON, разделяя куски пустой строкой:
 *
 *   "Вот законченная программа:\n\nprint(\"Привет\")\n\nВ ней три части…"
 *
 * Данные при этом правильные — ломался только показ: весь текст уходил в один
 * абзац, а браузер схлопывал переводы строк. Двухстрочная программа
 * превращалась в `print("Начало") print("Готово")`, то есть в невозможный
 * Python, — и это в миссии, которая учит, что строки выполняются по порядку.
 *
 * Разделение на куски здесь, а не в JSON, намеренно: в JSON текст уже
 * размечен верно, чинить нужно рендер.
 */

export type ProseBlock =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'output'; value: string }

/**
 * Строка, которая выглядит кодом.
 *
 * Русский текст внутри строкового литерала кириллицей не выдаёт себя —
 * `print("Привет")` тоже кириллица, — поэтому решает не алфавит, а форма
 * начала строки: комментарий, ключевое слово, вызов или присваивание.
 */
const CODE_LINE = new RegExp(
  '^\\s*(?:'
  + '#'                                                   // комментарий
  + '|(?:def|class|for|while|if|elif|else|try|except|finally|with'
  + '|import|from|return|assert|break|continue|pass|lambda|yield|global)\\b'
  + '|[A-Za-z_][\\w.]*\\s*(?:\\(|\\[|=[^=]|\\.[A-Za-z_])'  // вызов, индекс, присваивание, метод
  + '|[A-Za-z_][\\w.]*\\s*=\\s*$'                          // присваивание с переносом
  + ')',
)

/** Строка вывода программы: числа, литералы, служебные сообщения без прозы. */
const OUTPUT_LINE = /^[\s\d.,:;+\-*/%()[\]{}'"_=<>|!?·—–…A-Za-z]*$/
const HAS_CYRILLIC = /[Ѐ-ӿ]/
const HAS_SIGNAL = /[\d[\](){}'"]/
/** `SyntaxError: expected ':'` — вывод без единой цифры и скобки, но всё ещё вывод. */
const ERROR_LINE = /^\s*[A-Z][A-Za-z]*(?:Error|Exception|Warning):/

const nonEmpty = (block: string) => block.split('\n').filter(line => line.trim())

/**
 * Кусок считается кодом, только если кодом выглядит каждая его строка.
 *
 * Порог намеренно строгий: абзац, где одна строка похожа на вызов, остаётся
 * абзацем. Ошибиться в сторону обычного текста дешевле — проза, набранная
 * моноширинным шрифтом, читается плохо, но остаётся прозой; код, набранный
 * прозой, перестаёт быть кодом.
 */
function classify(block: string): ProseBlock['kind'] {
  const lines = nonEmpty(block)
  if (!lines.length) return 'text'
  if (lines.every(line => CODE_LINE.test(line))) return 'code'
  // Вывод программы: короткий кусок без прозы, в котором есть числа или скобки.
  // Вывод узнаётся по трём приметам: цифры и скобки (`[1.4, 2.6]`), сообщение
  // об ошибке (`SyntaxError: …`) или короткие одиночные слова (`True`, `MSK`,
  // `M`). Третья примета нужна ровно потому, что программа печатает и такое,
  // а ни цифр, ни скобок в её выводе при этом нет.
  const singleTokens = lines.every(line => line.trim().length <= 24 && !/\s/.test(line.trim()))
  const looksLikeOutput = lines.length <= 8
    && lines.every(line => OUTPUT_LINE.test(line) && !HAS_CYRILLIC.test(line))
    && lines.some(line => HAS_SIGNAL.test(line) || ERROR_LINE.test(line) || singleTokens)
  return looksLikeOutput ? 'output' : 'text'
}

/** Учебный текст, разобранный на куски. Пустая строка отделяет кусок от куска. */
export function parseProse(source?: string | null): ProseBlock[] {
  const text = String(source ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) return []
  return text
    .split(/\n{2,}/)
    .map(block => block.replace(/\s+$/, ''))
    .filter(block => block.trim())
    .map(block => {
      const kind = classify(block)
      // У абзаца одиночные переводы строк значения не имеют и мешают вёрстке,
      // у кода и вывода они и есть содержание.
      return { kind, value: kind === 'text' ? block.replace(/\s*\n\s*/g, ' ') : block } as ProseBlock
    })
}

/** Есть ли в тексте хотя бы один пример кода. */
export const hasCode = (source?: string | null) => parseProse(source).some(block => block.kind === 'code')
