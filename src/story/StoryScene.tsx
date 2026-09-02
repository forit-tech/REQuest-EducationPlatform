import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Home, Mail, MessageSquare, SkipForward, Ticket } from 'lucide-react'
import officeMorning from '../../assets/scenes/office-morning-v1.png'
import meetingRoom from '../../assets/scenes/meeting-room-v1.png'
import serverRoom from '../../assets/scenes/server-room-night-v1.png'
import dataLab from '../../assets/scenes/data-lab-rain-v1.png'
import conferenceHall from '../../assets/scenes/tech-conference-v1.png'
import tripStation from '../../assets/scenes/business-trip-station-v1.png'
import industrialHub from '../../assets/scenes/industrial-hub-v1.png'
import cityCoffeeShop from '../../assets/scenes/city-coffee-shop-v1.png'
import teamRestaurant from '../../assets/scenes/team-restaurant-v1.png'
import airportLounge from '../../assets/scenes/airport-lounge-rain-v1.png'
import libraryWorkshop from '../../assets/scenes/library-workshop-v1.png'
import hackathonNight from '../../assets/scenes/hackathon-night-v1.png'
import highSpeedTrain from '../../assets/scenes/high-speed-train-v1.png'
import seasideResearchStation from '../../assets/scenes/seaside-research-station-v1.png'
import festivalBackstage from '../../assets/scenes/festival-backstage-v1.png'
import emergencyOperationsStorm from '../../assets/scenes/emergency-operations-storm-v1.png'
import { Portrait } from './Portrait'
import { Sprite } from './Sprite'
import { character } from './engine'
import { isLocationId } from './types'
import type { ChoiceBeat, Emotion, LocationId, NotificationBeat, StoryAct, StoryCase } from './types'
import type { BeatEffects } from '../core/game'

const channelIcons = { chat: MessageSquare, alert: AlertTriangle, mail: Mail, ticket: Ticket }
const channelLabels = { chat: 'СООБЩЕНИЕ', alert: 'АЛЕРТ', mail: 'ПИСЬМО', ticket: 'ЗАДАЧА' }

type StoryMoment =
  | { kind: 'line'; speaker: string; emotion?: Emotion; text: string; scene: string; location?: LocationId; fromPanel?: boolean }
  | { kind: 'notification'; beat: NotificationBeat; scene: string; location?: LocationId }
  | { kind: 'choice'; beat: ChoiceBeat; scene: string; location?: LocationId }

const locationNames = {
  office: 'Открытый офис',
  meeting: 'Переговорная',
  server: 'Серверная',
  lab: 'Лаборатория данных',
  conference: 'Технологическая конференция',
  trip: 'Командировка',
  industrial: 'Площадка клиента',
  cafe: 'Кофейня',
  restaurant: 'Ресторан',
  airport: 'Аэропорт',
  library: 'Вечерний воркшоп',
  hackathon: 'Ночной хакатон',
  train: 'Скоростной поезд',
  coast: 'Прибрежная станция',
  backstage: 'Закулисье фестиваля',
  operations: 'Штаб реагирования',
} as const

/**
 * Метка кадра совпала с идентификатором места — значит, автор действительно
 * назвал место. Это точное сравнение по закрытому словарю, а не разбор текста:
 * `terminal`, `pipeline-green` и заголовок акта фоном больше не управляют.
 */
function locationFromScene(scene: string | undefined) {
  return isLocationId(scene) ? scene : undefined
}

const locationImages = { office: officeMorning, meeting: meetingRoom, server: serverRoom, lab: dataLab, conference: conferenceHall, trip: tripStation, industrial: industrialHub, cafe: cityCoffeeShop, restaurant: teamRestaurant, airport: airportLounge, library: libraryWorkshop, hackathon: hackathonNight, train: highSpeedTrain, coast: seasideResearchStation, backstage: festivalBackstage, operations: emergencyOperationsStorm }

function expandAct(act: StoryAct): StoryMoment[] {
  let scene = act.title
  // Место действия тянется по акту вперёд: смена кадра не сбрасывает его, пока
  // очередная панель не назовёт другое место явно.
  let location = act.location
  return act.beats.flatMap<StoryMoment>(beat => {
    if (beat.kind === 'comic') {
      return beat.panels.map(panel => {
        scene = panel.scene || scene
        location = panel.location ?? locationFromScene(panel.scene) ?? location
        return {
          kind: 'line',
          speaker: panel.speaker ?? 'narrator',
          emotion: panel.emotion,
          text: panel.caption,
          scene,
          location,
          fromPanel: true,
        }
      })
    }
    if (beat.kind === 'line') return [{ ...beat, scene, location }]
    if (beat.kind === 'notification') return [{ kind: 'notification', beat, scene, location }]
    return [{ kind: 'choice', beat, scene, location }]
  })
}

function useTypewriter(text: string) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setShown(0)
    const timer = window.setInterval(() => setShown(value => {
      if (value >= text.length) {
        window.clearInterval(timer)
        return value
      }
      return value + 2
    }), 12)
    return () => window.clearInterval(timer)
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

export function StoryScene({ act, career, chosenByChoiceId, onChoose, onFinish, onHome, campaign = false }: {
  act: StoryAct
  career?: StoryCase['career']
  chosenByChoiceId: Record<string, string>
  onChoose: (choiceId: string, optionId: string, effects: BeatEffects) => void
  onFinish: () => void
  onHome?: () => void
  campaign?: boolean
}) {
  const moments = useMemo(() => expandAct(act), [act])
  const [step, setStep] = useState(0)
  const [replyShown, setReplyShown] = useState(false)
  const moment = moments[step]
  const line = moment?.kind === 'line' ? moment : undefined
  const isNarrator = line?.speaker === 'narrator'
  const activeId = line && !isNarrator ? line.speaker : undefined
  const activeCharacter = activeId ? character(activeId) : undefined
  const typed = useTypewriter(line?.text ?? '')
  // Единственный источник правды по фону: кадр → акт → глава профессии → офис.
  const location: LocationId = moment?.location ?? act.location ?? career?.location ?? 'office'

  const visibleIds = useMemo(() => {
    // Смена кадра очищает сцену: персонажи из старых реплик больше не «висят»
    // рядом с письмом или сообщением, в котором их физически нет.
    if (moment?.kind === 'notification') return []
    const ids: string[] = []
    const scene = moment?.scene
    for (let index = step; index >= 0 && ids.length < 2; index -= 1) {
      const candidate = moments[index]
      if (candidate.kind !== 'line' || candidate.scene !== scene || (index !== step && candidate.fromPanel)) break
      if (candidate.speaker !== 'narrator' && !ids.includes(candidate.speaker)) ids.unshift(candidate.speaker)
    }
    return ids
  }, [moments, step])

  const slots = visibleIds.length === 1 ? ['center'] : visibleIds.length === 2 ? ['left', 'right'] : ['left', 'center', 'right']
  const activeSlot = activeId ? slots[visibleIds.indexOf(activeId)] : undefined
  const choice = moment?.kind === 'choice' ? moment.beat : undefined
  const chosen = choice ? chosenByChoiceId[choice.id] : undefined
  const picked = choice?.options.find(option => option.id === chosen)
  const blocked = Boolean(choice && (!chosen || !replyShown))
  const last = step >= moments.length - 1

  function advance() {
    if (blocked) return
    if (line && !typed.done) { typed.finish(); return }
    if (last) { onFinish(); return }
    setStep(value => value + 1)
    setReplyShown(false)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance() }
      if (event.key === 'Escape' && !campaign) onFinish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return <div className={`vn-overlay ${campaign ? 'campaign' : ''}`} role="dialog" aria-label={act.title}>
    <main className="vn-stage">
      <img className="vn-location" src={locationImages[location]} alt="" aria-hidden="true"/>
      <div className="vn-light" aria-hidden="true"/>

      {onHome && <button className="vn-home" onClick={onHome} aria-label="На главную">
        <ChevronLeft size={20}/><Home size={15}/><span>На главную</span>
      </button>}

      <header className="vn-head">
        <div><span className="story-kicker">{career ? `${career.protagonistName} · глава ${career.chapterNumber}/${career.chapterCount} · ${locationNames[location]}` : locationNames[location]}</span><strong>{act.title}</strong></div>
        {!campaign && <button className="story-skip" onClick={onFinish}><SkipForward size={15}/>Пропустить сцену</button>}
      </header>

      <section className="vn-scene" onClick={advance}>
        <div className="vn-ensemble" aria-live="polite">
          {visibleIds.map((id, index) => {
            const actor = character(id)
            const isActive = id === activeId
            return <div className={`vn-actor slot-${slots[index]} ${isActive ? 'is-active' : 'is-idle'}`} key={id}>
              <Sprite character={actor} emotion={isActive ? line?.emotion ?? 'neutral' : 'neutral'} height={660} dimmed={!isActive && Boolean(activeId)} side={slots[index] === 'right' ? 'right' : 'left'}/>
            </div>
          })}
        </div>

        {line && <div className={`vn-speech ${isNarrator ? 'is-narrator' : `from-${activeSlot ?? 'center'}`}`}>
          {!isNarrator && activeCharacter && <div className="vn-speaker">
            <Portrait character={activeCharacter} emotion={line.emotion} size={76} speaking/>
            <div><strong>{activeCharacter.name}</strong><span>{activeCharacter.role}</span></div>
          </div>}
          <p>{typed.visible}<span className={`caret ${typed.done ? 'done' : ''}`}/></p>
        </div>}

        {moment?.kind === 'notification' && <div className="vn-event"><NotificationCard beat={moment.beat}/></div>}

        {choice && <div className="vn-choice" onClick={event => event.stopPropagation()}>
          <span className="choice-kicker">ТВОЙ ХОД</span>
          <p className="choice-prompt">{choice.prompt}</p>
          <div className="choice-options">{choice.options.map(option => (
            <button key={option.id} className={chosen === option.id ? 'picked' : ''} disabled={Boolean(chosen)}
              onClick={() => {
                onChoose(choice.id, option.id, { trust: option.trust, flags: option.flags, clearFlags: option.clearFlags, items: option.items })
                setReplyShown(true)
              }}>
              <span>{option.text}</span>{chosen === option.id && <em>выбрано</em>}
            </button>
          ))}</div>
          {picked?.reply && <div className="choice-reply"><ChevronRight size={15}/><p>{picked.reply}</p></div>}
        </div>}
      </section>

      <footer className="vn-foot">
        <div className="story-dots">{moments.map((_, index) => <i key={index} className={index <= step ? 'on' : ''}/>)}</div>
        <span className="vn-hint">Пробел или Enter — дальше</span>
        <button className="story-next" onClick={advance} disabled={blocked}>
          {blocked ? 'Выбери вариант' : last ? 'Продолжить к заданию' : 'Дальше'}<ChevronRight size={16}/>
        </button>
      </footer>
    </main>
  </div>
}
