import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, Lightbulb, Play, RotateCcw, ShieldAlert, SquareCode, Terminal, X } from 'lucide-react'
import { CodeEditor } from './CodeEditor'
import { evaluateWithRuntime } from '../core/task/program'
import { DEFAULT_LIMITS } from '../core/runtime/types'
import type { CodeRunner, RunResult } from '../core/runtime/types'
import type { ChoiceOption, EvaluationResult, FormField, ResponseValue, Task, TaskFile } from '../core/task/types'
import './workspace.css'

/**
 * Рабочая станция кодового задания.
 *
 * Компоновка взята из эргономики учебных платформ и подчинена одной мысли:
 * условие, код и результат должны быть видны одновременно. Человек читает
 * слева, пишет справа сверху, смотрит результат справа снизу — и не прыгает
 * между экранами, теряя контекст.
 *
 * Три действия намеренно разведены. «Выполнить» показывает, что делает код, и
 * никогда не трогает освоение. «Проверить» — единственное, что создаёт попытку.
 * «Дальше» двигает историю, и она независима от освоения.
 */

const LAYOUT_KEY = 'request.workspace.layout.v1'
const draftKey = (taskId: string, path: string) => `request.draft.v1:${taskId}:${path}`

type Panel = 'output' | 'tests' | 'errors'
type Phase = 'idle' | 'running' | 'checking' | 'ran' | 'checked'

interface Layout { theory: number; editor: number; focus: boolean }
const DEFAULT_LAYOUT: Layout = { theory: 48, editor: 55, focus: false }

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT
    return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) as Partial<Layout> }
  } catch { return DEFAULT_LAYOUT }
}

function loadDraft(taskId: string, file: TaskFile) {
  try { return localStorage.getItem(draftKey(taskId, file.path)) ?? file.content } catch { return file.content }
}

export function CodeWorkspace({ task, runner, context, onChecked, onNext, nextLabel, completed }: {
  task: Task
  runner: CodeRunner
  /** Сюжетный контекст эпизода: показывается над условием, не заменяя его. */
  context?: React.ReactNode
  /** Вызывается только после «Проверить»: именно здесь рождается попытка. */
  onChecked: (result: EvaluationResult) => void
  onNext?: () => void
  nextLabel?: string
  completed?: boolean
}) {
  /**
   * Старое кодовое задание засчитывалось только вместе с верной гипотезой,
   * поэтому адаптер отдаёт его формой из двух полей. Рабочая станция обязана
   * сохранить это правило: гипотеза показывается рядом с условием, а не
   * выбрасывается ради красивой раскладки.
   */
  const formFields: FormField[] = task.response.kind === 'form' ? task.response.fields : []
  const codeField = formFields.find(field => field.response.kind === 'code')
  const choiceFields = formFields.filter(field => field.response.kind === 'choice')
  const codeResponse = task.response.kind === 'code'
    ? task.response
    : codeField?.response.kind === 'code' ? codeField.response : undefined
  const files = useMemo(() => codeResponse?.files ?? [], [codeResponse])
  const entry = codeResponse?.entry ?? files[0]?.path ?? 'main'
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [contents, setContents] = useState<Record<string, string>>(() =>
    Object.fromEntries(files.map(file => [file.path, loadDraft(task.id, file)])))
  const [activePath, setActivePath] = useState(entry)
  const [layout, setLayout] = useState<Layout>(loadLayout)
  const [phase, setPhase] = useState<Phase>('idle')
  const [panel, setPanel] = useState<Panel>('output')
  const [run, setRun] = useState<RunResult>()
  const [result, setResult] = useState<EvaluationResult>()
  const [resetting, setResetting] = useState(false)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1100)
  const [mobilePane, setMobilePane] = useState<'task' | 'code' | 'result'>('task')
  const shell = useRef<HTMLDivElement>(null)

  const activeFile = files.find(file => file.path === activePath) ?? files[0]
  const language = activeFile?.language ?? 'python'
  const isTerminal = task.environment === 'terminal' || task.environment === 'editor+terminal'

  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* приватный режим */ }
  }, [layout])

  useEffect(() => {
    function onResize() { setNarrow(window.innerWidth < 1100) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /** Черновик живёт по паре «задание + файл» и переживает перезагрузку. */
  const updateFile = useCallback((path: string, value: string) => {
    setContents(current => ({ ...current, [path]: value }))
    try { localStorage.setItem(draftKey(task.id, path), value) } catch { /* приватный режим */ }
  }, [task.id])

  function resetDraft() {
    for (const file of files) {
      try { localStorage.removeItem(draftKey(task.id, file.path)) } catch { /* приватный режим */ }
    }
    setContents(Object.fromEntries(files.map(file => [file.path, file.content])))
    setResetting(false)
  }

  const doRun = useCallback(async () => {
    setPhase('running')
    setPanel('output')
    const outcome = await runner.run({
      language: task.evaluation.type === 'program' ? task.evaluation.language : language,
      files: files.map(file => ({ path: file.path, content: contents[file.path] ?? '' })),
      entry,
      limits: DEFAULT_LIMITS,
      taskId: task.id,
    })
    setRun(outcome)
    setPhase('ran')
    if (outcome.structuredErrors.length) setPanel('errors')
  }, [runner, task, language, files, contents, entry])

  const answerValue = useCallback((): ResponseValue => {
    if (task.response.kind !== 'form') return { kind: 'code', files: contents }
    const fields: Record<string, ResponseValue> = {}
    for (const field of formFields) {
      if (field.response.kind === 'code') fields[field.id] = { kind: 'code', files: contents }
      else if (field.response.kind === 'choice') fields[field.id] = { kind: 'choice', selected: choices[field.id] ? [choices[field.id]] : [] }
    }
    return { kind: 'form', fields }
  }, [task, contents, formFields, choices])

  const doCheck = useCallback(async () => {
    setPhase('checking')
    const outcome = await evaluateWithRuntime(task, answerValue(), runner)
    setResult(outcome)
    setPhase('checked')
    setPanel('tests')
    onChecked(outcome)
  }, [task, answerValue, runner, onChecked])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return
      event.preventDefault()
      if (event.shiftKey) void doCheck()
      else void doRun()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doRun, doCheck])

  function dragVertical(event: React.PointerEvent) {
    const box = shell.current?.getBoundingClientRect()
    if (!box) return
    const move = (moveEvent: PointerEvent) => {
      const share = ((moveEvent.clientX - box.left) / box.width) * 100
      setLayout(current => ({ ...current, theory: Math.min(72, Math.max(24, share)) }))
    }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    event.preventDefault()
  }

  function dragHorizontal(event: React.PointerEvent) {
    const column = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect()
    if (!column) return
    const move = (moveEvent: PointerEvent) => {
      const share = ((moveEvent.clientY - column.top) / column.height) * 100
      setLayout(current => ({ ...current, editor: Math.min(82, Math.max(25, share)) }))
    }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    event.preventDefault()
  }

  const runtimeMissing = !runner.available
  const passed = result?.passed === true
  const visibleChecks = result?.checks ?? []

  const theory = <section className="ws-theory" aria-label="Условие задания">
    <div className="ws-theory-scroll">
      {context}
      <span className="ws-eyebrow">{task.intent === 'debug' ? 'Поиск ошибки' : 'Задание'} · {task.difficulty}</span>
      {/* У старого контента заголовок задания повторяет заголовок эпизода. */}
      {task.title && !context && <h2>{task.title}</h2>}
      {task.instructions?.length ? <ol className="ws-steps">{task.instructions.map(step => <li key={step}>{step}</li>)}</ol> : null}
      <p className="ws-statement">{task.prompt}</p>

      {task.presentation?.readOnlyCode?.map(file => <figure className="ws-snippet" key={file.path}>
        <figcaption><SquareCode size={13}/>{file.path}<button type="button" onClick={() => navigator.clipboard?.writeText(file.content)}>Скопировать</button></figcaption>
        <pre><code>{file.content}</code></pre>
      </figure>)}

      {task.presentation?.expectedFormat && <div className="ws-note"><strong>Формат ответа.</strong> {task.presentation.expectedFormat}</div>}

      {task.evaluation.type === 'program' && !!task.evaluation.cases.filter(item => !item.hidden).length && <div className="ws-cases">
        <span className="ws-eyebrow">Примеры</span>
        {task.evaluation.cases.filter(item => !item.hidden).map(item => <div className="ws-case" key={item.id}>
          <strong>{item.name}</strong>
          {item.input && <div><em>вход</em><pre>{item.input}</pre></div>}
          <div><em>ожидается</em><pre>{item.expected}</pre></div>
        </div>)}
      </div>}

      {choiceFields.map(field => <div className="ws-choice" key={field.id}>
        <span className="ws-eyebrow">{field.label}</span>
        <div className="ws-choice-options" role="radiogroup" aria-label={field.label}>
          {(field.response.kind === 'choice' ? field.response.options : [] as ChoiceOption[]).map(option => <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={choices[field.id] === option.id}
            className={choices[field.id] === option.id ? 'active' : ''}
            onClick={() => setChoices(current => ({ ...current, [field.id]: option.id }))}
          >{option.text}</button>)}
        </div>
      </div>)}

      {!!task.hints?.length && <details className="ws-hints">
        <summary><Lightbulb size={14}/>Подсказка</summary>
        <ul>{task.hints.map(hint => <li key={hint}>{hint}</li>)}</ul>
      </details>}
    </div>
  </section>

  const workspace = <section className="ws-work" style={narrow ? undefined : { gridTemplateRows: `${layout.editor}% 6px 1fr` }}>
    <div className="ws-editor-block">
      <header className="ws-panel-head">
        <div className="ws-tabs" role="tablist" aria-label="Файлы задания">
          {files.map(file => <button
            key={file.path}
            role="tab"
            aria-selected={file.path === activePath}
            className={file.path === activePath ? 'active' : ''}
            onClick={() => setActivePath(file.path)}
          >{isTerminal ? <Terminal size={13}/> : <SquareCode size={13}/>}{file.path}</button>)}
        </div>
        <div className="ws-panel-tools">
          <span className="ws-language">{language}</span>
          <button type="button" onClick={() => setResetting(true)}><RotateCcw size={13}/>Вернуть начальный код</button>
        </div>
      </header>
      {activeFile && <CodeEditor
        key={activeFile.path}
        value={contents[activeFile.path] ?? ''}
        language={activeFile.language}
        editable={activeFile.editable}
        onChange={value => updateFile(activeFile.path, value)}
        onRun={() => void doRun()}
        onCheck={() => void doCheck()}
      />}
    </div>

    {!narrow && <div className="ws-split-h" role="separator" aria-orientation="horizontal" aria-label="Высота редактора" tabIndex={0}
      onPointerDown={dragHorizontal}
      onKeyDown={event => {
        if (event.key === 'ArrowUp') setLayout(current => ({ ...current, editor: Math.max(25, current.editor - 4) }))
        if (event.key === 'ArrowDown') setLayout(current => ({ ...current, editor: Math.min(82, current.editor + 4) }))
      }}
    />}

    <div className="ws-result-block">
      <header className="ws-panel-head">
        <div className="ws-tabs" role="tablist" aria-label="Результат">
          {(['output', 'tests', 'errors'] as Panel[]).map(item => <button
            key={item}
            role="tab"
            aria-selected={panel === item}
            className={panel === item ? 'active' : ''}
            onClick={() => setPanel(item)}
          >{item === 'output' ? 'Вывод' : item === 'tests' ? 'Проверки' : 'Ошибки'}</button>)}
        </div>
        <div className="ws-panel-tools">
          {phase === 'running' && <span className="ws-state running">выполняется…</span>}
          {phase === 'checking' && <span className="ws-state running">проверяется…</span>}
          {runtimeMissing && <span className="ws-state unavailable"><ShieldAlert size={13}/>среда недоступна</span>}
          {run?.simulated && <span className="ws-state simulated">имитация</span>}
        </div>
      </header>

      <div className="ws-result-body">
        {panel === 'output' && <>
          {phase === 'idle' && <p className="ws-empty">Нажмите «Выполнить», чтобы увидеть, что делает код. На освоение это не влияет.</p>}
          {runtimeMissing && phase !== 'idle' && <div className="ws-unavailable">
            <ShieldAlert size={18}/>
            <div>
              <strong>Среда выполнения не подключена</strong>
              <p>{run?.unavailableReason ?? 'Запуск чужого кода без настоящей изоляции небезопасен, поэтому его нет.'} Задание останется незачтённым, пока среду не подключат.</p>
            </div>
          </div>}
          {run?.executed && <>
            <pre className="ws-stdout">{run.stdout || '(вывод пуст)'}</pre>
            {run.stderr && <pre className="ws-stderr">{run.stderr}</pre>}
            <div className="ws-runmeta">
              <span>код возврата {run.exitCode}</span>
              <span>{run.durationMs} мс</span>
              {run.timedOut && <span className="bad">превышено время</span>}
            </div>
          </>}
        </>}

        {panel === 'tests' && <>
          {!result && <p className="ws-empty">Нажмите «Проверить», чтобы прогнать проверки задания.</p>}
          {result && <>
            {result.status === 'needs-runtime' && <div className="ws-unavailable">
              <ShieldAlert size={18}/>
              <div><strong>Проверить нельзя</strong><p>{result.message}</p></div>
            </div>}
            <ul className="ws-checks">
              {visibleChecks.map(check => <li className={check.passed ? 'ok' : 'bad'} key={check.id}>
                <i>{check.passed ? <Check size={13}/> : <X size={13}/>}</i>
                <div>
                  <span>{check.label}{check.hidden && <em className="ws-hidden-flag">скрытый</em>}</span>
                  {check.detail && <small>{check.detail}</small>}
                </div>
              </li>)}
            </ul>
            {passed && <div className="ws-success">
              <Check size={16}/>
              <div><strong>Все проверки пройдены</strong><span>{task.explanation}</span></div>
            </div>}
            {result.message && result.status !== 'needs-runtime' && <p className="ws-note">{result.message}</p>}
          </>}
        </>}

        {panel === 'errors' && <>
          {!run?.structuredErrors.length && <p className="ws-empty">Ошибок нет.</p>}
          <ul className="ws-errors">
            {run?.structuredErrors.map((error, index) => <li key={index}>
              <AlertTriangle size={14}/>
              <div>
                <strong>{error.kind === 'timeout' ? 'Превышено время' : error.kind === 'syntax' ? 'Синтаксическая ошибка' : error.kind === 'unavailable' ? 'Среда недоступна' : 'Ошибка выполнения'}</strong>
                <p>{error.message}</p>
                {error.line && <button type="button" onClick={() => setActivePath(error.file ?? activePath)}>строка {error.line}</button>}
              </div>
            </li>)}
          </ul>
        </>}
      </div>
    </div>
  </section>

  return <div className={`code-workspace ${layout.focus ? 'is-focused' : ''} ${narrow ? 'is-narrow' : ''}`}>
    {narrow && <nav className="ws-mobile-tabs" aria-label="Разделы рабочей станции">
      {(['task', 'code', 'result'] as const).map(pane => <button key={pane} className={mobilePane === pane ? 'active' : ''} onClick={() => setMobilePane(pane)}>
        {pane === 'task' ? 'Задание' : pane === 'code' ? 'Код' : 'Результат'}
      </button>)}
    </nav>}

    <div className="ws-shell" ref={shell} style={narrow || layout.focus ? undefined : { gridTemplateColumns: `${layout.theory}% 6px 1fr` }}>
      {(!narrow || mobilePane === 'task') && !layout.focus && theory}
      {!narrow && !layout.focus && <div className="ws-split-v" role="separator" aria-orientation="vertical" aria-label="Ширина условия" tabIndex={0}
        onPointerDown={dragVertical}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') setLayout(current => ({ ...current, theory: Math.max(24, current.theory - 3) }))
          if (event.key === 'ArrowRight') setLayout(current => ({ ...current, theory: Math.min(72, current.theory + 3) }))
        }}
      />}
      {(!narrow || mobilePane !== 'task') && workspace}
    </div>

    <footer className="ws-actions">
      <div className="ws-actions-left">
        <button type="button" className="ws-focus" onClick={() => setLayout(current => ({ ...current, focus: !current.focus }))}>
          {layout.focus ? 'Показать условие' : 'Скрыть условие'}
        </button>
        <span className="ws-shortcut">Ctrl+Enter — выполнить · Ctrl+Shift+Enter — проверить</span>
      </div>
      <div className="ws-actions-right">
        <button type="button" className="ws-run" onClick={() => void doRun()} disabled={phase === 'running' || phase === 'checking'}>
          <Play size={14} fill="currentColor"/>Выполнить
        </button>
        <button type="button" className="ws-check" onClick={() => void doCheck()} disabled={phase === 'checking'}>
          <Check size={15}/>Проверить
        </button>
        {onNext && <button type="button" className="ws-next" onClick={onNext} disabled={!passed && !completed}>
          {nextLabel ?? 'Дальше'}<ChevronRight size={15}/>
        </button>}
      </div>
    </footer>

    {resetting && <div className="ws-confirm" role="dialog" aria-label="Вернуть начальный код">
      <div>
        <strong>Вернуть начальный код?</strong>
        <p>Ваш вариант для этого задания будет удалён. Черновики других заданий не тронутся.</p>
        <div>
          <button type="button" onClick={() => setResetting(false)}>Отмена</button>
          <button type="button" className="danger" onClick={resetDraft}>Вернуть</button>
        </div>
      </div>
    </div>}
  </div>
}
