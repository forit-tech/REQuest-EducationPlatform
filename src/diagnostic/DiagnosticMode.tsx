import { useMemo, useState } from 'react'
import { ArrowRight, Check, CircleHelp, Compass, Minus, ShieldAlert, X } from 'lucide-react'
import { applyProbe, nextProbe, startSession, summarize } from '../core/diagnostic'
import type { DiagnosticContext, DiagnosticSession } from '../core/diagnostic'
import { evaluate } from '../core/task/evaluate'
import { emptyResponse } from '../core/task/renderers'
import { recordAttempt } from '../core/task/mastery'
import type { MasteryBook } from '../core/task/mastery'
import { skillGraph } from '../core/task/prerequisites'
import type { SkillNode } from '../core/task/prerequisites'
import type { EvaluationResult, ResponseValue, Task } from '../core/task/types'
import './diagnostic.css'

/**
 * Режим входной диагностики.
 *
 * Отдельный режим, а не глава истории: он ничего не проходит и никуда не
 * двигает сюжет. Его задача — выяснить, что человек уже умеет, и не спрашивать
 * лишнего.
 *
 * Прогресс намеренно показан числом проверенных навыков, а не «вопрос 7 из 87»:
 * число задач адаптивное, и обещать знаменатель, которого нет, — враньё.
 */

function ProbeAnswer({ task, value, onChange }: { task: Task; value: ResponseValue; onChange: (value: ResponseValue) => void }) {
  if (task.response.kind === 'choice' && value.kind === 'choice') {
    return <div className="dg-options" role="radiogroup" aria-label="Варианты ответа">
      {task.response.options.map(option => <button
        key={option.id}
        type="button"
        role="radio"
        aria-checked={value.selected.includes(option.id)}
        className={value.selected.includes(option.id) ? 'active' : ''}
        onClick={() => onChange({ kind: 'choice', selected: [option.id] })}
      >{option.text}</button>)}
    </div>
  }
  if (task.response.kind === 'numeric' && value.kind === 'numeric') {
    return <div className="dg-numeric">
      {task.response.fields.map(field => <label key={field.id}>
        <span>{field.label ?? field.id}</span>
        <input
          inputMode="decimal"
          value={value.values[field.id] ?? ''}
          onChange={event => onChange({ kind: 'numeric', values: { ...value.values, [field.id]: event.target.value } })}
        />
      </label>)}
    </div>
  }
  if (task.response.kind === 'text' && value.kind === 'text') {
    return <label className="dg-text">
      <span>Ответ</span>
      <input value={value.value} placeholder={task.response.placeholder} onChange={event => onChange({ kind: 'text', value: event.target.value })}/>
    </label>
  }
  return <p className="dg-unsupported">Эта форма ответа пока не поддерживается в диагностике.</p>
}

export function DiagnosticMode({ skills, context, book, session, onSession, onMastery, onExit }: {
  skills: SkillNode[]
  context: DiagnosticContext
  book: MasteryBook
  session?: DiagnosticSession
  onSession: (session: DiagnosticSession) => void
  onMastery: (book: MasteryBook) => void
  onExit: () => void
}) {
  const graph = useMemo(() => skillGraph(skills), [skills])
  const current = session ?? startSession(graph, context, book)
  const task = useMemo(() => nextProbe(graph, context, current), [graph, context, current])
  const [answer, setAnswer] = useState<ResponseValue | undefined>()
  const [feedback, setFeedback] = useState<EvaluationResult>()

  const summary = useMemo(() => summarize(graph, context, current), [graph, context, current])
  const checked = Object.values(current.states).filter(state => state.source === 'diagnostic').length

  function start() {
    onSession(startSession(graph, context, book))
  }

  function submit() {
    if (!task || !answer) return
    const result = evaluate(task, answer)
    setFeedback(result)
    // Освоение двигает именно проверка ответа — так же, как в рабочей станции.
    if (result.status !== 'needs-runtime' && result.status !== 'awaiting-self-assessment') {
      onMastery(recordAttempt(book, task, result))
    }
    onSession(applyProbe(graph, context, current, task, result))
    setAnswer(undefined)
  }

  const verdictLabel = { strong: 'уверенно', weak: 'слабо', unknown: 'не проверено', implied: 'следует из решённого', 'blocked-by-runtime': 'нужна среда' }

  return <div className="diagnostic-mode">
    <header className="dg-head">
      <div>
        <span className="dg-eyebrow"><Compass size={13}/>Входная диагностика</span>
        <strong>{context.trackId === 'itmo-deep-learning-genai-2026' ? 'ИТМО · Глубокое обучение и генеративный ИИ' : context.trackId}</strong>
      </div>
      <div className="dg-progress">
        <span>Проверено навыков: <b>{checked}</b></span>
        <span>Подтверждено: <b>{summary.strong.length}</b></span>
        <span>Требует работы: <b>{summary.weak.length}</b></span>
        <button type="button" onClick={onExit} aria-label="Выйти из диагностики"><X size={17}/></button>
      </div>
    </header>

    {!session && <section className="dg-intro">
      <h1>Сначала выясним, что вы уже умеете</h1>
      <p>
        Это не экзамен по всем 87 вопросам программы. Диагностика идёт по графу навыков:
        если вы уверенно решаете задачу сверху, основание под ней спрашивать незачем.
        Если задача не выходит, диагностика спустится ниже и найдёт, где именно пробел.
      </p>
      <p className="dg-note">
        Область проверки ограничена теми официальными требованиями, для которых уже размечены
        навыки, — сейчас это {Object.keys(context.requirementSkills).length} из 87. Остальные
        честно останутся непроверенными, а не будут засчитаны.
      </p>
      <button className="dg-start" type="button" onClick={start}>Начать диагностику<ArrowRight size={16}/></button>
    </section>}

    {session && task && <section className="dg-probe">
      <div className="dg-probe-body">
        <span className="dg-eyebrow">{graph[task.skills[0].skillId]?.title ?? task.skills[0].skillId}</span>
        <h2>{task.title}</h2>
        <p className="dg-prompt">{task.prompt}</p>
        {task.presentation?.readOnlyCode?.map(file => <pre className="dg-code" key={file.path}><code>{file.content}</code></pre>)}
        <ProbeAnswer task={task} value={answer ?? emptyResponse(task.response)} onChange={setAnswer}/>
        {feedback && <div className={`dg-feedback ${feedback.passed ? 'ok' : 'bad'}`}>
          <strong>{feedback.passed ? 'Верно' : 'Пока не так'}</strong>
          <p>{task.explanation}</p>
        </div>}
      </div>
      <footer className="dg-probe-foot">
        <span>Не знаете — это тоже ответ: пропуск честнее угадывания.</span>
        <div>
          <button type="button" className="dg-skip" onClick={() => {
            onSession(applyProbe(graph, context, current, task, { status: 'failed', passed: false, score: 0, evidence: 'strong', checks: [], diagnosedSkills: [] }))
            setAnswer(undefined); setFeedback(undefined)
          }}>Не знаю</button>
          <button type="button" className="dg-submit" disabled={!answer} onClick={() => { submit(); setFeedback(undefined) }}>Ответить</button>
        </div>
      </footer>
    </section>}

    {session && !task && <section className="dg-result">
      <h1>Диагностика закончена</h1>
      <p className="dg-note">Задано проб: {summary.probes}. Полного экзамена не потребовалось — вопросы подбирались по вашим ответам.</p>

      <div className="dg-columns">
        <div>
          <span className="dg-eyebrow"><Check size={13}/>Подтверждено</span>
          <ul className="dg-list ok">{summary.strong.map(id => <li key={id}>{graph[id]?.title ?? id}{current.states[id]?.verdict === 'implied' && <em>следует из решённого</em>}</li>)}</ul>
        </div>
        <div>
          <span className="dg-eyebrow"><Minus size={13}/>Требует работы</span>
          <ul className="dg-list bad">{summary.weak.map(id => <li key={id}>{graph[id]?.title ?? id}</li>)}</ul>
          {!summary.weak.length && <p className="dg-empty">Слабых мест не найдено.</p>}
        </div>
        <div>
          <span className="dg-eyebrow"><CircleHelp size={13}/>Не проверено</span>
          <ul className="dg-list muted">{summary.unknown.slice(0, 12).map(id => <li key={id}>{graph[id]?.title ?? id}</li>)}</ul>
          {summary.unknown.length > 12 && <p className="dg-empty">и ещё {summary.unknown.length - 12}</p>}
        </div>
      </div>

      {!!summary.blockedByRuntime.length && <div className="dg-runtime">
        <ShieldAlert size={16}/>
        <p>Навыки, которые не удалось проверить без среды выполнения: {summary.blockedByRuntime.map(id => graph[id]?.title ?? id).join(', ')}. Это не ошибка — просто песочница ещё не подключена.</p>
      </div>}

      {!!summary.plan.length && <div className="dg-plan">
        <span className="dg-eyebrow">С чего начинать</span>
        <ol>
          {summary.plan.map(step => <li key={step.skillId} className={step.actionable ? 'now' : 'later'}>
            <div>
              <strong>{step.title}</strong>
              <span>{verdictLabel[current.states[step.skillId]?.verdict ?? 'unknown']}</span>
            </div>
            <p>
              {step.actionable
                ? `Можно браться сразу: основание подтверждено. Разблокирует официальных вопросов: ${step.unblocks.length}.`
                : `Сначала нужно закрыть: ${step.blockedBy.map(id => graph[id]?.title ?? id).join(', ')}.`}
              {step.unverifiedFoundation.length > 0 && ` Не проверялось под ним: ${step.unverifiedFoundation.map(id => graph[id]?.title ?? id).join(', ')}.`}
            </p>
          </li>)}
        </ol>
      </div>}

      <div className="dg-result-actions">
        <button type="button" className="dg-skip" onClick={start}>Пройти заново</button>
        <button type="button" className="dg-submit" onClick={onExit}>Вернуться<ArrowRight size={15}/></button>
      </div>
    </section>}
  </div>
}
