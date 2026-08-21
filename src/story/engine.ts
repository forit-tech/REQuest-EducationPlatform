import type { Character, StoryAct, StoryCase, StoryEnding } from './types'
import type { GameState } from '../core/game'
import castData from '../../knowledge/story/cast.json'

export const cast = castData as unknown as Character[]
const caseModules = import.meta.glob('../../knowledge/story/cases/*.json', { eager: true, import: 'default' }) as Record<string, StoryCase>
export const cases = Object.entries(caseModules)
  .filter(([path]) => !path.endsWith('/prologue.json'))
  .map(([, story]) => story)

const castById = new Map(cast.map(character => [character.id, character]))

export function character(id: string): Character {
  return castById.get(id) ?? castById.get('narrator')!
}

export function caseForCourse(courseId: string) {
  return cases.find(item => item.courseId === courseId)
}

function actVisible(act: StoryAct, game: GameState) {
  if (act.requiresFlags?.some(flag => !game.flags.includes(flag))) return false
  if (act.hiddenByFlags?.some(flag => game.flags.includes(flag))) return false
  return true
}

/** Ближайший непросмотренный акт для конкретного момента. */
export function pendingAct(courseId: string, game: GameState, moment: { on: 'caseStart' } | { on: 'beforeMission' | 'afterMission'; missionId: string } | { on: 'caseEnd' }) {
  const story = caseForCourse(courseId)
  if (!story) return undefined
  return story.acts.find(act => {
    if (game.seenActs.includes(act.id)) return false
    if (act.trigger.on !== moment.on) return false
    if ('missionId' in act.trigger && 'missionId' in moment && act.trigger.missionId !== moment.missionId) return false
    return actVisible(act, game)
  })
}

export function resolveEnding(story: StoryCase, game: GameState): StoryEnding {
  const matched = story.endings.find(ending => {
    if (ending.requiresFlags?.some(flag => !game.flags.includes(flag))) return false
    for (const [id, minimum] of Object.entries(ending.minTrust ?? {})) {
      if ((game.trust[id] ?? 0) < minimum) return false
    }
    return true
  })
  return matched ?? story.endings[story.endings.length - 1]
}

export function caseProgress(story: StoryCase, game: GameState) {
  const total = story.acts.length
  const seen = story.acts.filter(act => game.seenActs.includes(act.id)).length
  return { total, seen, percent: total ? Math.round(seen / total * 100) : 0 }
}

export function caseChoiceIds(story: StoryCase) {
  return story.acts.flatMap(act => act.beats.filter(beat => beat.kind === 'choice').map(beat => (beat as { id: string }).id))
}

export function caseActIds(story: StoryCase) {
  return story.acts.map(act => act.id)
}
