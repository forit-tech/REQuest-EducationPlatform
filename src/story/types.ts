export type Emotion = 'neutral' | 'happy' | 'worried' | 'surprised' | 'tired' | 'determined'

export interface CharacterTraits {
  hair: 'bob' | 'short' | 'long' | 'buzz' | 'ponytail' | 'bald'
  glasses: boolean
  beard?: boolean
  freckles?: boolean
  headset?: boolean
  height?: 'short' | 'average' | 'tall'
  eyeColor?: string
  style?: string
  tattoo?: string
}

export interface Character {
  id: string
  name: string
  role: string
  domainId: string
  bio: string
  palette: { skin: string; hair: string; cloth: string; accent: string }
  traits: CharacterTraits
}

/** Реплика персонажа или рассказчика. */
export interface LineBeat {
  kind: 'line'
  speaker: string
  emotion?: Emotion
  text: string
}

/** Всплывающий кадр: сообщение в мессенджере, алерт мониторинга, письмо. */
export interface NotificationBeat {
  kind: 'notification'
  channel: 'chat' | 'alert' | 'mail' | 'ticket'
  from: string
  title: string
  text: string
}

/** Комикс-полоса из нескольких панелей. */
export interface ComicBeat {
  kind: 'comic'
  panels: Array<{ speaker?: string; emotion?: Emotion; caption: string; scene: string }>
}

export interface ChoiceOption {
  id: string
  text: string
  reply?: string
  /** Кому и сколько доверия. */
  trust?: Record<string, number>
  flags?: string[]
  /** Взаимоисключающие флаги, которые этот выбор отменяет. */
  clearFlags?: string[]
  items?: string[]
  xp?: number
}

export interface ChoiceBeat {
  kind: 'choice'
  id: string
  prompt: string
  options: ChoiceOption[]
}

export type StoryBeat = LineBeat | NotificationBeat | ComicBeat | ChoiceBeat

export type ActTrigger =
  | { on: 'caseStart' }
  | { on: 'beforeMission'; missionId: string }
  | { on: 'afterMission'; missionId: string }
  | { on: 'caseEnd' }

export interface StoryAct {
  id: string
  title: string
  trigger: ActTrigger
  /** Акт показывается, только если все флаги присутствуют. */
  requiresFlags?: string[]
  /** Акт скрывается, если присутствует любой из флагов. */
  hiddenByFlags?: string[]
  beats: StoryBeat[]
}

export interface StoryEnding {
  id: string
  title: string
  summary: string
  /** Условия: минимальное доверие и обязательные флаги. */
  minTrust?: Record<string, number>
  requiresFlags?: string[]
  rank: 'бронза' | 'серебро' | 'золото'
}

export interface StoryCase {
  caseId: string
  courseId: string
  number: string
  title: string
  logline: string
  setting: string
  cast: string[]
  career?: {
    professionId: string
    protagonistName: string
    protagonistDescription: string
    chapterNumber: number
    chapterCount: number
    stageTitle: string
    location: string
  }
  acts: StoryAct[]
  /** Проверяются сверху вниз, первая подходящая — итоговая. */
  endings: StoryEnding[]
}
