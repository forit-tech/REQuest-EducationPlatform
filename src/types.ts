export type MissionType = 'story' | 'quiz' | 'code' | 'lab' | 'case' | 'boss'

export interface Mission {
  id: string
  title: string
  type: MissionType
  minutes: number
  xp: number
  termIds?: import('./glossary').GlossaryTermId[]
  difficulty?: 'основа' | 'начальный' | 'средний' | 'продвинутый'
  objectives?: string[]
  intro?: string
  productionContext?: string
  historicalFact?: {
    title: string
    text: string
    sourceLabel: string
    sourceUrl: string
  }
  task?: {
    prompt: string
    options?: string[]
    answer: string
    explanation: string
    starterCode?: string
    workspaceFile?: string
    codeChecks?: Array<{
      label: string
      includes: string
    }>
  }
  hints?: string[]
}

export interface Room {
  id: string
  index: string
  title: string
  description: string
  category: string
  level: 'Старт' | 'База' | 'Средний' | 'Продвинутый'
  accent: string
  locked?: boolean
  completed?: number
  missions: Mission[]
  skills: string[]
  prerequisites?: string[]
}

export type AppSection = 'home' | 'path' | 'practice' | 'projects' | 'achievements' | 'hq'

export type View =
  | { type: AppSection }
  | { type: 'room'; roomId: string }
  | { type: 'mission'; roomId: string; missionId: string }
  | { type: 'account' }
