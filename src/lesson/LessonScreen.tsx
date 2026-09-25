import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Clapperboard, Lightbulb, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import type { Mission, MissionStage, Room } from '../types'
import { missionEnvironment } from '../core/tasks'
import { taskFromMission } from '../core/task/legacy'
import { recordAttempt } from '../core/task/mastery'
import { defaultRunner } from '../core/runtime/runners'
import { CodeWorkspace } from '../workspace/CodeWorkspace'
import { activeAccount, adminSession, getMastery, isQaBuild, saveMastery } from '../core/storage'
import type { EvaluationResult } from '../core/task/types'
import { READING_STAGES, STAGE_HINT, STAGE_LABEL, blockTitle, blocksOf, outlineOf } from './outline'
import { Prose } from './Prose'
import './lesson.css'
import { QaFlag } from './QaFlag'

/**
 * Единственный учебный экран.
 *
 * До него экранов было два, и выбор между ними делала одна строчка: есть ли у
 * задания заготовка кода. У миссии с заготовкой открывалась рабочая станция, у
 * миссии без неё — трёхколоночный экран со спрайтами в полроста. Из-за этого
 * объяснение новой конструкции жило отдельно от места, где её пишут: человек
 * читал разбор `print("Привет")` в сцене, нажимал «дальше» и оставался с
 * пустым редактором и без единой строки того, что ему только что объяснили.
 *
 * Здесь объяснение и практика лежат рядом всегда. Что показать справа, решает
 * не наличие заготовки, а ступень лестницы: на «объяснении» и «показе» писать
 * нечего, и редактор не открывается вовсе.
 *
 * Редактор и среда выполнения не продублированы: справа стоит та же
 * `CodeWorkspace`, только без собственной колонки условия.
 */

const LAYOUT_KEY = 'request.lesson.layout.v1'
const NARROW = 1100
const RAIL_AUTO_HIDE = 1400

interface Layout { theory: number; rail: boolean }
const DEFAULT_LAYOUT: Layout = { theory: 46, rail: true }

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    return raw ? { ...DEFAULT_LAYOUT, ...JSON.parse(raw) as Partial<Layout> } : DEFAULT_LAYOUT
  } catch { return DEFAULT_LAYOUT }
}

/**
 * Лестница темы, свёрнутая по ступеням.
 *
 * Тема про `print()` проходит десять миссий, и три из них — «Измени». Десять
 * отметок подряд читаются как список заданий, а не как лестница, поэтому
 * соседние миссии одной ступени показываются одной отметкой с числом шагов.
 */
function ladderOf(missions: Mission[], currentId: string) {
  const steps: Array<{ id: string; label: string; count: number; current: boolean; done: boolean }> = []
  let passed = true
  for (const mission of missions) {
    const label = mission.stage ? STAGE_LABEL[mission.stage] : 'Шаг'
    const current = mission.id === currentId
    const last = steps[steps.length - 1]
    if (last && last.label === label) {
      last.count += 1
      last.current = last.current || current
      last.done = last.done && !current && passed
    } else {
      steps.push({ id: mission.id, label, count: 1, current, done: passed && !current })
    }
    if (current) passed = false
  }
  return steps
}

export function LessonScreen({
  room, mission, completed, onExit, onComplete, nextMission, onNext, onReplayScene, onOpenMission, caseNote, canOpen,
}: {
  room: Room
  mission: Mission
  completed: boolean
  onExit: () => void
  onComplete: () => void
  nextMission?: Mission
  onNext?: () => void
  onReplayScene?: () => void
  /**
   * Сюжетная линия дела одной строкой.
   *
   * Полноэкранная сцена теперь открывает только новую тему, и без этой полоски
   * внутри лестницы терялся бы контекст: непонятно, чьё это дело и какая глава
   * идёт. Полоска не повторяет объяснение — она называет дело и даёт вернуться
   * к сцене, если нужно.
   */
  caseNote?: { chapter: string; title: string }
  /** Переход к другой миссии курса из рельса тем. */
  onOpenMission?: (missionId: string) => void
  /**
   * Доступна ли миссия.
   *
   * Рельс показывает весь курс, включая то, до чего человек ещё не дошёл.
   * Без этой проверки клик по недоступной теме молча выбрасывал из урока
   * обратно в каталог: экран миссии просто не отрисовывался.
   */
  canOpen?: (missionId: string) => boolean
}) {
  const [layout, setLayout] = useState<Layout>(loadLayout)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < NARROW)
  const [roomy, setRoomy] = useState(() => typeof window !== 'undefined' && window.innerWidth >= RAIL_AUTO_HIDE)
  const [pane, setPane] = useState<'theory' | 'practice'>('theory')
  const [choice, setChoice] = useState('')
  const [checked, setChecked] = useState(false)
  const [finished, setFinished] = useState(completed)
  const [hintOpen, setHintOpen] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const activeTopic = useRef<HTMLLIElement>(null)
  const theoryScroll = useRef<HTMLDivElement>(null)

  const outline = useMemo(() => outlineOf(room), [room])
  const blocks = useMemo(() => blocksOf(outline), [outline])
  const place = outline.placeOf.get(mission.id)
  const topic = place?.topic
  const block = blocks.find(item => item.topics.includes(topic!))
  const blockIndex = block ? blocks.indexOf(block) : -1
  // Курс из одного безымянного блока делить в крошках не на что.
  const showBlockCrumb = blocks.length > 1

  const environment = missionEnvironment(mission)
  const stage = mission.stage
  // Ступень решает, открывается ли редактор. Заготовка кода на «показе» бывает
  // — её показывают, — но писать в ней нечего, и открывать её вредно.
  const reading = Boolean(stage && READING_STAGES.includes(stage))
  const wantsEditor = (environment === 'editor' || environment === 'editor+terminal') && !reading
  const options = mission.task?.options ?? []

  useEffect(() => {
    function onResize() {
      setNarrow(window.innerWidth < NARROW)
      setRoomy(window.innerWidth >= RAIL_AUTO_HIDE)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* приватный режим */ }
  }, [layout])

  // Новая миссия — чистый лист ответа и прокрутка теории наверх.
  useEffect(() => {
    setChoice(''); setChecked(false); setHintOpen(false); setPane('theory')
    setFinished(completed)
    theoryScroll.current?.scrollTo({ top: 0 })
    // Рельс открывается там, где человек находится. В курсе на девяносто пять
    // тем список иначе всегда показывает начало курса, и найти себя в нём
    // можно только прокруткой.
    activeTopic.current?.scrollIntoView({ block: 'nearest' })
  }, [mission.id, completed])

  const runner = useMemo(() => defaultRunner(), [])
  const workspaceTask = useMemo(() => (wantsEditor ? taskFromMission(mission, room.id) : undefined), [wantsEditor, mission, room.id])

  const finish = useCallback(() => {
    if (!finished) onComplete()
    setFinished(true)
  }, [finished, onComplete])

  const handleChecked = useCallback((result: EvaluationResult) => {
    setChecked(true)
    const account = activeAccount()
    if (account && workspaceTask) saveMastery(account.id, recordAttempt(getMastery(account.id), workspaceTask, result))
    if (result.passed) finish()
  }, [workspaceTask, finish])

  const answer = mission.task?.answer?.trim() ?? ''
  const correct = Boolean(choice) && choice.trim() === answer

  function checkChoice() {
    setChecked(true)
    if (choice.trim() === answer) finish()
  }

  function dragTheory(event: React.PointerEvent) {
    const box = body.current?.getBoundingClientRect()
    if (!box) return
    const railWidth = layout.rail && roomy ? 248 : 0
    const move = (moveEvent: PointerEvent) => {
      const share = ((moveEvent.clientX - box.left - railWidth) / (box.width - railWidth)) * 100
      setLayout(current => ({ ...current, theory: Math.min(70, Math.max(28, share)) }))
    }
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    event.preventDefault()
  }

  const railVisible = layout.rail && roomy && !narrow
  const ladder = topic ? ladderOf(topic.missions, mission.id) : []

  /* ---------------------------------------------------------------- теория */

  const theory = <section className="ln-theory" aria-label="Объяснение и задание">
    <div className="ln-theory-scroll" ref={theoryScroll}>
      {caseNote && <div className="ln-case">
        <span className="ln-case-chapter">{caseNote.chapter}</span>
        <span className="ln-case-title">{caseNote.title}</span>
        {onReplayScene && <button type="button" onClick={onReplayScene}>
          <Clapperboard size={13} aria-hidden="true"/>Сцена
        </button>}
      </div>}

      {stage && <div className="ln-stage-note">
        <span className="ln-stage-name">{STAGE_LABEL[stage]}</span>
        <span>{STAGE_HINT[stage]}</span>
      </div>}

      <h1 className="ln-title">{mission.title}</h1>

      <Prose source={mission.intro} className="ln-lead"/>

      {mission.historicalFact && <aside className="ln-fact">
        <span className="ln-eyebrow">История и наука</span>
        <strong>{mission.historicalFact.title}</strong>
        <p>{mission.historicalFact.text}</p>
        <a href={mission.historicalFact.sourceUrl} target="_blank" rel="noreferrer">{mission.historicalFact.sourceLabel}</a>
      </aside>}

      {mission.productionContext && <div className="ln-context">
        <span className="ln-eyebrow">Зачем это в работе</span>
        <Prose source={mission.productionContext}/>
      </div>}

      {!!mission.objectives?.length && <div className="ln-goals">
        <span className="ln-eyebrow">После этого шага ты сможешь</span>
        <ul>{mission.objectives.map(item => <li key={item}>{item}</li>)}</ul>
      </div>}

      {/* У вопроса с вариантами формулировка стоит над вариантами и повторять её
          в объяснении незачем. У кодового задания вариантов нет, и формулировка
          обязана лежать рядом с объяснением — иначе редактор снова останется
          единственным местом, где сказано, что делать. */}
      {wantsEditor && mission.task?.prompt && <div className="ln-task">
        <span className="ln-eyebrow">Что сделать</span>
        <p>{mission.task.prompt}</p>
      </div>}

      {!!mission.hints?.length && <div className="ln-hints">
        <button type="button" aria-expanded={hintOpen} onClick={() => setHintOpen(value => !value)}>
          <Lightbulb size={15} aria-hidden="true"/>{hintOpen ? 'Скрыть подсказку' : 'Показать подсказку'}
        </button>
        {hintOpen && <ul>{mission.hints.map(hint => <li key={hint}>{hint}</li>)}</ul>}
      </div>}

      {onReplayScene && !caseNote && <button type="button" className="ln-replay" onClick={onReplayScene}>
        <Clapperboard size={14} aria-hidden="true"/>Пересмотреть сцену эпизода
      </button>}
    </div>
  </section>

  /* -------------------------------------------------------------- практика */

  const quiz = <section className="ln-practice-pane" aria-label="Ответ">
    <div className="ln-quiz-scroll">
      <span className="ln-eyebrow">{options.length ? 'Выбери ответ' : 'Ответ'}</span>
      <p className="ln-question">{mission.task?.prompt}</p>
      <div className="ln-options" role="radiogroup" aria-label="Варианты ответа">
        {options.map(option => {
          const chosen = choice === option
          const state = checked && chosen ? (correct ? ' ok' : ' bad') : ''
          return <button
            key={option}
            type="button"
            role="radio"
            aria-checked={chosen}
            className={`ln-option${chosen ? ' chosen' : ''}${state}`}
            onClick={() => { setChoice(option); setChecked(false) }}
          >
            <i aria-hidden="true">{checked && chosen ? (correct ? <Check size={13}/> : <X size={13}/>) : null}</i>
            <span>{option}</span>
          </button>
        })}
      </div>

      {checked && <div className={`ln-verdict ${correct ? 'ok' : 'bad'}`}>
        <strong>{correct ? 'Верно' : 'Пока нет'}</strong>
        <Prose source={mission.task?.explanation}/>
      </div>}
    </div>
  </section>

  const practice = workspaceTask
    ? <CodeWorkspace
      key={mission.id}
      task={workspaceTask}
      runner={runner}
      chrome="practice"
      completed={finished}
      onChecked={handleChecked}
      nextLabel={nextMission ? 'Следующий шаг' : undefined}
      onNext={nextMission && onNext ? () => { finish(); onNext() } : undefined}
    />
    : quiz

  /* ------------------------------------------------------------------ шапка */

  return <div className={`lesson-screen${narrow ? ' is-narrow' : ''}`}>
    <header className="ln-top">
      <button type="button" className="ln-back" onClick={onExit} aria-label="Выйти к курсу"><ArrowLeft size={17}/></button>
      <div className="ln-where">
        <nav className="ln-crumbs" aria-label="Где я нахожусь">
          <span>{room.title}</span>
          {block && showBlockCrumb && <><ChevronRight size={13} aria-hidden="true"/><span>{blockTitle(block, blockIndex)}</span></>}
          {topic && <><ChevronRight size={13} aria-hidden="true"/><b>{topic.title}</b></>}
        </nav>
        {topic && <div className="ln-step">Шаг {place?.step} из {topic.missions.length}</div>}
      </div>
      {/* Разметка замечаний живёт только в QA-сборке: ученик её не видит. */}
      {isQaBuild() && adminSession()
        && <QaFlag room={room} mission={mission} author={activeAccount()?.username ?? 'admin'}/>}

      {ladder.length > 1 && <ol className="ln-ladder" aria-label="Ступени темы">
        {ladder.map(step => <li key={step.id} className={`${step.current ? 'current' : ''} ${step.done ? 'done' : ''}`}>
          <button
            type="button"
            onClick={() => onOpenMission?.(step.id)}
            disabled={!onOpenMission || !(canOpen?.(step.id) ?? true)}
            aria-current={step.current ? 'step' : undefined}
          >{step.label}{step.count > 1 && <em> ×{step.count}</em>}</button>
        </li>)}
      </ol>}

      <div className="ln-top-right">
        {roomy && !narrow && <button
          type="button"
          className="ln-rail-toggle"
          onClick={() => setLayout(current => ({ ...current, rail: !current.rail }))}
          aria-label={railVisible ? 'Скрыть список тем' : 'Показать список тем'}
        >{railVisible ? <PanelLeftClose size={16}/> : <PanelLeftOpen size={16}/>}</button>}
        <span className="ln-xp">+{mission.xp} XP</span>
      </div>
    </header>

    {narrow && <nav className="ln-tabs" aria-label="Разделы урока">
      <button type="button" className={pane === 'theory' ? 'active' : ''} onClick={() => setPane('theory')}>Объяснение</button>
      <button type="button" className={pane === 'practice' ? 'active' : ''} onClick={() => setPane('practice')}>{wantsEditor ? 'Код' : 'Задание'}</button>
    </nav>}

    <div
      className="ln-body"
      ref={body}
      style={narrow ? undefined : { gridTemplateColumns: `${railVisible ? '248px ' : ''}${layout.theory}fr 6px ${100 - layout.theory}fr` }}
    >
      {railVisible && <aside className="ln-rail" aria-label="Темы блока">
        <div className="ln-rail-scroll">
          {blocks.map((item, index) => <div className="ln-rail-block" key={`${item.number ?? 'none'}-${index}`}>
            <div className={`ln-rail-head${item.scaffold ? ' scaffold' : ''}`}>
              {blockTitle(item, index)}
              {item.scaffold && <span className="ln-rail-flag">в работе</span>}
            </div>
            <ul>
              {item.topics.map(entry => {
                const active = entry === topic
                const reachable = entry.missions.some(step => canOpen?.(step.id) ?? true)
                const target = entry.missions.find(step => canOpen?.(step.id) ?? true) ?? entry.missions[0]
                return <li key={entry.index} className={`${active ? 'active' : ''}${reachable ? '' : ' locked'}`} ref={active ? activeTopic : undefined}>
                  <button
                    type="button"
                    onClick={() => onOpenMission?.(target.id)}
                    disabled={!onOpenMission || !reachable}
                    title={reachable ? undefined : 'Тема откроется, когда дойдёшь до неё по порядку'}
                  >
                    <span className="ln-rail-title">{entry.title}</span>
                    <span className="ln-rail-steps">
                      {entry.missions.map(item2 => <i key={item2.id} className={item2.id === mission.id ? 'now' : ''} aria-hidden="true"/>)}
                    </span>
                  </button>
                </li>
              })}
            </ul>
          </div>)}
        </div>
      </aside>}

      {(!narrow || pane === 'theory') && theory}

      {!narrow && <div
        className="ln-split"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ширина объяснения"
        tabIndex={0}
        onPointerDown={dragTheory}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') setLayout(current => ({ ...current, theory: Math.max(28, current.theory - 3) }))
          if (event.key === 'ArrowRight') setLayout(current => ({ ...current, theory: Math.min(70, current.theory + 3) }))
        }}
      />}

      {(!narrow || pane === 'practice') && <div className={`ln-practice${workspaceTask ? ' has-editor' : ''}`}>{practice}</div>}
    </div>

    {!workspaceTask && <footer className="ln-actions">
      <span className="ln-shortcut">{finished ? 'Шаг пройден' : 'Ответ засчитывается один раз'}</span>
      <div className="ln-actions-right">
        <button type="button" className="ln-check" onClick={checkChoice} disabled={!choice}>
          <Check size={15} aria-hidden="true"/>Проверить
        </button>
        {nextMission && onNext && <button type="button" className="ln-next" onClick={onNext} disabled={!finished}>
          Следующий шаг<ChevronRight size={15} aria-hidden="true"/>
        </button>}
      </div>
    </footer>}
  </div>
}

export type { MissionStage }
