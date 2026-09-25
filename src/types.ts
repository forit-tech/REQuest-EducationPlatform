export type MissionType = 'story' | 'quiz' | 'code' | 'lab' | 'case' | 'boss'

/**
 * Ступень учебной лестницы.
 *
 * Порядок значим и задан `knowledge/curriculum/PROGRAMMING_PEDAGOGY.md`: новая
 * конструкция проходит его сверху вниз, и самостоятельная запись не может
 * стоять раньше правки и дополнения. Поле приезжает из `course.json`, где его
 * расставляет автор курса, и до сих пор терялось на границе JSON → TS: аудит
 * лестницу знал, интерфейс — нет.
 */
export type MissionStage =
  | 'explained' | 'shown' | 'guided' | 'modified'
  | 'filled' | 'independent' | 'debugged' | 'transferred'

/**
 * Рабочее окружение задания. Определяет, что показывает раннер, и задаётся
 * заданием, а не типом миссии: викторина не должна открывать редактор кода.
 */
export type TaskEnvironment = 'none' | 'editor' | 'terminal' | 'editor+terminal'

export interface Mission {
  id: string
  title: string
  type: MissionType
  /** Ступень лестницы. Нет у курсов, которые ещё не размечены. */
  stage?: MissionStage
  minutes: number
  xp: number
  termIds?: import('./glossary').GlossaryTermId[]
  difficulty?: 'основа' | 'начальный' | 'средний' | 'продвинутый'
  /** Одна сущность, которую эта миссия отрабатывает. */
  concept?: string
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
    /** Явное окружение задания. Без него выводится из наличия заготовки кода. */
    environment?: TaskEnvironment
    starterCode?: string
    workspaceFile?: string
    codeChecks?: Array<{
      label: string
      includes: string
      /** Фрагмент обязан исчезнуть из решения. */
      notIncludes?: string
      /** Минимальное число появлений includes в исполняемом коде. */
      minOccurrences?: number
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

export type AppSection = 'home' | 'path' | 'practice' | 'projects' | 'achievements' | 'hq' | 'qa'

export type View =
  | { type: AppSection }
  | { type: 'room'; roomId: string }
  | { type: 'mission'; roomId: string; missionId: string }
  | { type: 'account' }
  | { type: 'diagnostic' }
