import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronRight, Mail, MessageSquare, SkipForward, Ticket } from 'lucide-react'
import { Sprite } from './Sprite'
import { character } from './engine'
import type { ChoiceBeat, ComicBeat, LineBeat, NotificationBeat, StoryAct, StoryBeat } from './types'
import type { BeatEffects } from '../core/game'

const channelIcons = { chat: MessageSquare, alert: AlertTriangle, mail: Mail, ticket: Ticket }
const channelLabels = { chat: 'СООБЩЕНИЕ', alert: 'АЛЕРТ', mail: 'ПИСЬМО', ticket: 'ЗАДАЧА' }

function useTypewriter(text: string) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    const timer = setInterval(() => setShown(value => (value >= text.length ? (clearInterval(timer), value) : value + 2)), 12)
    return () => clearInterval(timer)
  }, [text])
  return { visible: text.slice(0, shown), done: shown >= text.length, finish: () => setShown(text.length) }
}

function NotificationCard({ beat }: { beat: NotificationBeat }) {
  const Icon = channelIcons[beat.channel]
  return <div className={`story-notification channel-${beat.channel}`}>
    <div className="notification-head"><Icon size={16}/><span>{channelLabels[beat.channel]}</span><small>{beat.from}</small></div>
    <strong>{beat.title}</strong>
    <p>{beat.text}</p>
  </div>
}

function ComicCard({ beat }: { beat: ComicBeat }) {
  return <div className="story-comic">{beat.panels.map((panel, index) => {
    const who = panel.speaker ? character(panel.speaker) : undefined
    return <figure className="comic-panel" key={index} style={{ animationDelay: `${index * 140}ms` }}>
      <div className="comic-art" data-scene={panel.scene}>
        {who ? <Sprite character={who} emotion={panel.emotion ?? 'neutral'} height={150}/> : <div className="comic-establishing"><i/><i/><i/></div>}
      </div>
      <figcaption>{who && <b>{who.name}: </b>}{panel.caption}</figcaption>
    </figure>
  })}</div>
}

export function StoryScene({ act, chosenByChoiceId, onChoose, onFinish }: {
  act: StoryAct
  chosenByChoiceId: Record<string, string>
  onChoose: (choiceId: string, optionId: string, effects: BeatEffects) => void
  onFinish: () => void
}) {
  const [step, setStep] = useState(0)
  const [replyShown, setReplyShown] = useState(false)
  const beat: StoryBeat | undefined = act.beats[step]
  const isLine = beat?.kind === 'line'
  const lineBeat = isLine ? (beat as LineBeat) : undefined
  const speaker = lineBeat ? character(lineBeat.speaker) : undefined
  const isNarrator = lineBeat?.speaker === 'narrator'
  const bodyText = lineBeat?.text ?? ''
  const typed = useTypewriter(bodyText)

  /** Кто стоит на сцене: последний говоривший персонаж остаётся, пока не сменится. */
  const staged = useMemo(() => {
    for (let index = step; index >= 0; index -= 1) {
      const candidate = act.beats[index]
      if (candidate.kind === 'line' && candidate.speaker !== 'narrator') return character(candidate.speaker)
    }
    return undefined
  }, [act, step])

  const isChoice = beat?.kind === 'choice'
  const choiceBeat = isChoice ? (beat as ChoiceBeat) : undefined
  const chosen = choiceBeat ? chosenByChoiceId[choiceBeat.id] : undefined
  const picked = choiceBeat?.options.find(option => option.id === chosen)
  const blocked = Boolean(isChoice && (!chosen || !replyShown))
  const last = step >= act.beats.length - 1

  function advance() {
    if (blocked) return
    if (isLine && !typed.done) { typed.finish(); return }
    if (last) { onFinish(); return }
    setStep(value => value + 1)
    setReplyShown(false)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance() }
      if (event.key === 'Escape') onFinish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return <div className="vn-overlay" role="dialog" aria-label={act.title}>
    <div className="vn-stage">
      <header className="vn-head">
        <div><span className="story-kicker">СЦЕНА</span><strong>{act.title}</strong></div>
        <button className="story-skip" onClick={onFinish}><SkipForward size={15}/>Пропустить</button>
      </header>

      <div className={`vn-scene ${isNarrator ? 'is-narration' : ''}`} onClick={advance}>
        <div className="vn-backdrop" aria-hidden="true"><i/><i/><i/></div>

        {staged && !isChoice && beat?.kind !== 'comic' && (
          <div className="vn-actor" key={staged.id}>
            <Sprite character={staged} emotion={lineBeat?.emotion ?? 'neutral'} height={380} dimmed={isNarrator}/>
          </div>
        )}

        <div className="vn-inserts">
          {beat?.kind === 'notification' && <NotificationCard beat={beat as NotificationBeat}/>}
          {beat?.kind === 'comic' && <ComicCard beat={beat as ComicBeat}/>}
        </div>

        {isChoice && choiceBeat && <div className="vn-choice">
          <span className="choice-kicker">ТВОЙ ХОД</span>
          <p className="choice-prompt">{choiceBeat.prompt}</p>
          <div className="choice-options">{choiceBeat.options.map(option => (
            <button key={option.id} className={chosen === option.id ? 'picked' : ''} disabled={Boolean(chosen)}
              onClick={event => {
                event.stopPropagation()
                onChoose(choiceBeat.id, option.id, { trust: option.trust, flags: option.flags, items: option.items })
                setReplyShown(true)
              }}>
              <span>{option.text}</span>{chosen === option.id && <em>выбрано</em>}
            </button>
          ))}</div>
          {picked?.reply && <div className="choice-reply"><ChevronRight size={15}/><p>{picked.reply}</p></div>}
        </div>}
      </div>

      {(isLine || beat?.kind === 'notification' || beat?.kind === 'comic') && (
        <div className="vn-dialogue" onClick={advance}>
          {isLine && !isNarrator && speaker && (
            <div className="vn-nameplate"><strong>{speaker.name}</strong><span>{speaker.role}</span></div>
          )}
          <p className={`vn-text ${isNarrator ? 'narration' : ''}`}>
            {isLine ? typed.visible : beat?.kind === 'notification' ? 'Входящее сообщение.' : 'Кадры сцены.'}
            {isLine && !typed.done && <span className="caret"/>}
          </p>
        </div>
      )}

      <footer className="vn-foot">
        <div className="story-dots">{act.beats.map((_, index) => <i key={index} className={index <= step ? 'on' : ''}/>)}</div>
        <span className="vn-hint">Пробел или Enter — дальше, Esc — пропустить</span>
        <button className="story-next" onClick={advance} disabled={blocked}>
          {blocked ? 'Выбери вариант' : last ? 'Продолжить' : 'Дальше'}<ChevronRight size={16}/>
        </button>
      </footer>
    </div>
  </div>
}
