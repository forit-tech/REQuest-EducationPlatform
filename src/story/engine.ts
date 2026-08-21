import type { Character, StoryAct, StoryCase, StoryEnding } from './types'
import type { GameState } from '../core/game'
import castData from '../../knowledge/story/cast.json'
import careerNarrativesData from '../../knowledge/professions/narratives.json'
import professionProgramsData from '../../knowledge/professions/programs.json'

export const cast = castData as unknown as Character[]
const caseModules = import.meta.glob('../../knowledge/story/cases/*.json', { eager: true, import: 'default' }) as Record<string, StoryCase>
export const cases = Object.entries(caseModules)
  .filter(([path]) => !path.endsWith('/prologue.json'))
  .map(([, story]) => story)

type CareerNarrative = {
  professionId: string
  protagonist: { name: string; description: string }
  premise: string
  cast: string[]
  locations: string[]
}

type ProfessionProgram = {
  professionId: string
  stages: Array<{ title: string; goal: string; courseIds: string[] }>
}

const careerNarratives = careerNarrativesData as CareerNarrative[]
const professionPrograms = professionProgramsData as ProfessionProgram[]

const castById = new Map(cast.map(character => [character.id, character]))

export function character(id: string): Character {
  return castById.get(id) ?? castById.get('narrator')!
}

function remapTrust(trust: Record<string, number> | undefined, ids: Map<string, string>) {
  if (!trust) return undefined
  return Object.fromEntries(Object.entries(trust).map(([id, value]) => [ids.get(id) ?? id, value]))
}

function careerCase(story: StoryCase, professionId: string): StoryCase {
  const narrative = careerNarratives.find(item => item.professionId === professionId)
  const program = professionPrograms.find(item => item.professionId === professionId)
  if (!narrative || !program) return story

  const chapters = program.stages.flatMap((stage, stageIndex) => stage.courseIds.map(courseId => ({ courseId, stage, stageIndex })))
  const chapterIndex = chapters.findIndex(chapter => chapter.courseId === story.courseId)
  if (chapterIndex < 0) return story
  const chapter = chapters[chapterIndex]
  const location = narrative.locations[chapter.stageIndex % narrative.locations.length] ?? 'office'
  const idMap = new Map(story.cast.map((id, index) => [id, narrative.cast[index] ?? id]))
  const prefix = `${professionId}:`
  const protagonistDescription = narrative.protagonist.description.charAt(0).toUpperCase() + narrative.protagonist.description.slice(1)
  const introduction = chapterIndex === 0
    ? `В этой профессии ты — ${narrative.protagonist.name}. ${protagonistDescription}. ${narrative.premise}`
    : `${narrative.protagonist.name} продолжает дело. После предыдущей главы команда отправляется в новую точку маршрута: ${chapter.stage.title.toLowerCase()}.`

  return {
    ...story,
    caseId: `${professionId}:${story.caseId}`,
    number: String(chapterIndex + 1).padStart(2, '0'),
    title: `${chapter.stage.title} · ${story.title}`,
    logline: `${introduction} Цель главы: ${chapter.stage.goal}`,
    setting: location,
    cast: narrative.cast,
    career: {
      professionId,
      protagonistName: narrative.protagonist.name,
      protagonistDescription: narrative.protagonist.description,
      chapterNumber: chapterIndex + 1,
      chapterCount: chapters.length,
      stageTitle: chapter.stage.title,
      location,
    },
    acts: story.acts.map((act, actIndex) => ({
      ...act,
      id: `${prefix}${act.id}`,
      requiresFlags: act.requiresFlags?.map(flag => `${prefix}${flag}`),
      hiddenByFlags: act.hiddenByFlags?.map(flag => `${prefix}${flag}`),
      beats: [
        ...(actIndex === 0 ? [{ kind: 'comic' as const, panels: [{ scene: location, caption: introduction }] }] : []),
        ...act.beats.map(beat => {
          if (beat.kind === 'line') return { ...beat, speaker: idMap.get(beat.speaker) ?? beat.speaker }
          if (beat.kind === 'comic') return {
            ...beat,
            panels: beat.panels.map(panel => ({ ...panel, scene: location, speaker: panel.speaker ? idMap.get(panel.speaker) ?? panel.speaker : undefined })),
          }
          if (beat.kind === 'choice') return {
            ...beat,
            id: `${prefix}${beat.id}`,
            options: beat.options.map(option => ({
              ...option,
              trust: remapTrust(option.trust, idMap),
              flags: option.flags?.map(flag => `${prefix}${flag}`),
            })),
          }
          return beat
        }),
      ],
    })),
    endings: story.endings.map(ending => ({
      ...ending,
      id: `${prefix}${ending.id}`,
      minTrust: remapTrust(ending.minTrust, idMap),
      requiresFlags: ending.requiresFlags?.map(flag => `${prefix}${flag}`),
    })),
  }
}

export function caseForCourse(courseId: string, professionId?: string) {
  const story = cases.find(item => item.courseId === courseId)
  return story && professionId ? careerCase(story, professionId) : story
}

function actVisible(act: StoryAct, game: GameState) {
  if (act.requiresFlags?.some(flag => !game.flags.includes(flag))) return false
  if (act.hiddenByFlags?.some(flag => game.flags.includes(flag))) return false
  return true
}

/** Ближайший непросмотренный акт для конкретного момента. */
export function pendingAct(courseId: string, game: GameState, moment: { on: 'caseStart' } | { on: 'beforeMission' | 'afterMission'; missionId: string } | { on: 'caseEnd' }, professionId?: string) {
  const story = caseForCourse(courseId, professionId)
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
