import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, defaultHighlightStyle, StreamLanguage } from '@codemirror/language'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { javascript } from '@codemirror/lang-javascript'

/**
 * Редактор кода рабочей станции.
 *
 * Выбран CodeMirror 6, а не Monaco. Monaco тянет несколько мегабайт, требует
 * настройки веб-воркеров под Vite и приносит с собой полноценный языковой
 * сервис TypeScript, который учебной задаче не нужен. CodeMirror собирается из
 * нужных частей, весит на порядок меньше, красится токенами REQuest и
 * подключает языки по отдельности — а языков здесь будет не только Python.
 *
 * Это учебная рабочая станция, а не среда разработки: подсветка, нумерация,
 * отступы, парные скобки, текущая строка и нормальные горячие клавиши — всё,
 * что нужно, и ничего сверх того.
 */

/** Простейшая подсветка оболочки: отдельного пакета ради неё тянуть незачем. */
const shellLike = StreamLanguage.define({
  token(stream) {
    if (stream.match(/^#.*/)) return 'comment'
    if (stream.match(/^"(?:[^"\\]|\\.)*"?|^'(?:[^'\\]|\\.)*'?/)) return 'string'
    if (stream.match(/^\b(cd|ls|pwd|cat|grep|git|mkdir|rm|echo|export|python|pip)\b/)) return 'keyword'
    stream.next()
    return null
  },
})

function languageExtension(language: string) {
  switch (language) {
    case 'python': return python()
    case 'sql': return sql()
    case 'javascript':
    case 'typescript': return javascript({ typescript: language === 'typescript' })
    case 'bash':
    case 'shell': return shellLike
    default: return []
  }
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--workspace-code-size, 13.5px)', backgroundColor: 'transparent', color: 'var(--code-text)' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace', lineHeight: '1.65' },
  '.cm-content': { padding: '14px 0', caretColor: 'var(--signal)' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--code-gutter)', paddingRight: '10px' },
  '.cm-activeLine': { backgroundColor: 'var(--code-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--code-text)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--code-selection)' },
  '.cm-cursor': { borderLeftColor: 'var(--signal)', borderLeftWidth: '2px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-matchingBracket': { backgroundColor: 'var(--code-bracket)', outline: 'none' },
}, { dark: true })

export function CodeEditor({ value, language, editable = true, onChange, onRun, onCheck }: {
  value: string
  language: string
  editable?: boolean
  onChange: (value: string) => void
  onRun?: () => void
  onCheck?: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView>(null)
  const languageSlot = useRef(new Compartment())
  const editableSlot = useRef(new Compartment())
  // Обработчики держим в ссылке: пересоздавать редактор из-за смены колбэка
  // нельзя — вместе с ним потеряются курсор, выделение и история отмен.
  const handlers = useRef({ onChange, onRun, onCheck })
  handlers.current = { onChange, onRun, onCheck }

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        rectangularSelection(),
        bracketMatching(),
        indentOnInput(),
        indentUnit.of('    '),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        languageSlot.current.of(languageExtension(language)),
        editableSlot.current.of(EditorView.editable.of(editable)),
        keymap.of([
          { key: 'Mod-Enter', preventDefault: true, run: () => { handlers.current.onRun?.(); return true } },
          { key: 'Mod-Shift-Enter', preventDefault: true, run: () => { handlers.current.onCheck?.(); return true } },
          indentWithTab,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        editorTheme,
        EditorView.updateListener.of(update => {
          if (update.docChanged) handlers.current.onChange(update.state.doc.toString())
        }),
      ],
    })
    const instance = new EditorView({ state, parent: host.current })
    view.current = instance
    return () => { instance.destroy(); view.current = null }
    // Редактор создаётся один раз на файл; содержимое и язык меняются ниже.
  }, [])

  useEffect(() => {
    const instance = view.current
    if (!instance) return
    instance.dispatch({ effects: languageSlot.current.reconfigure(languageExtension(language)) })
  }, [language])

  useEffect(() => {
    const instance = view.current
    if (!instance) return
    instance.dispatch({ effects: editableSlot.current.reconfigure(EditorView.editable.of(editable)) })
  }, [editable])

  useEffect(() => {
    const instance = view.current
    if (!instance) return
    const current = instance.state.doc.toString()
    // Внешнее значение применяется, только если оно действительно другое:
    // иначе каждый ввод символа сбрасывал бы позицию курсора.
    if (current === value) return
    instance.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div className="code-editor" ref={host} data-language={language}/>
}

/** Ставит курсор на строку: по ней кликают в списке ошибок. */
export function focusLine(view: EditorView | null, line: number) {
  if (!view || line < 1 || line > view.state.doc.lines) return
  const position = view.state.doc.line(line).from
  view.dispatch({ selection: { anchor: position }, scrollIntoView: true })
  view.focus()
}
