import type { Character, StoryAct, StoryCase, StoryEnding } from './types'
import type { GameState } from '../core/game'
import type { Mission } from '../types'
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

const rolePreferences: Record<string, string[]> = {
  mira: ['mira', 'sonya', 'yana'],
  lena: ['lena', 'yana', 'alexey'],
  oleg: ['oleg', 'alexey', 'anton'],
  gleb: ['oleg', 'pavel', 'anton', 'artem', 'alexey'],
  sonya: ['sonya', 'yana', 'lena'],
  artem: ['artem', 'pavel', 'anton', 'gleb'],
  anton: ['anton', 'pavel', 'artem', 'gleb'],
  alexey: ['alexey', 'oleg', 'lena'],
}

/** Сопоставляет характер и роль, а не случайную позицию в массиве актёров. */
function mapCareerCharacter(sourceId: string, targetIds: string[]) {
  if (targetIds.includes(sourceId)) return sourceId
  return rolePreferences[sourceId]?.find(id => targetIds.includes(id)) ?? targetIds[0] ?? sourceId
}

function replaceCharacterNames(text: string | undefined, ids: Map<string, string>) {
  if (!text) return text
  let result = text
  const replacements: Array<{ marker: string; target: string }> = []
  let index = 0
  for (const [sourceId, targetId] of ids) {
    const sourceName = castById.get(sourceId)?.name
    const targetName = castById.get(targetId)?.name
    if (!sourceName || !targetName || sourceName === targetName) continue
    const marker = `__CAREER_NAME_${index++}__`
    result = result.replaceAll(sourceName, marker)
    replacements.push({ marker, target: targetName })
  }
  for (const replacement of replacements) result = result.replaceAll(replacement.marker, replacement.target)
  return result
}

function supportFor(professionId: string) {
  return ['data-scientist', 'data-analyst', 'ai-engineer', 'frontend-developer', 'react-developer'].includes(professionId) ? 'yana' : 'pavel'
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
  const supportId = supportFor(professionId)
  const idMap = new Map(story.cast.map(id => [id, mapCareerCharacter(id, narrative.cast)]))
  const prefix = `${professionId}:`
  const protagonistDescription = narrative.protagonist.description.charAt(0).toUpperCase() + narrative.protagonist.description.slice(1)
  const introduction = chapterIndex === 0
    ? `В этой профессии ты — ${narrative.protagonist.name}. ${protagonistDescription}. ${narrative.premise}`
    : `${narrative.protagonist.name} продолжает дело. После предыдущей главы команда отправляется в новую точку маршрута: ${chapter.stage.title.toLowerCase()}.`

  const mappedActs: StoryAct[] = story.acts.map((act, actIndex) => ({
    ...act,
    id: `${prefix}${act.id}`,
    title: replaceCharacterNames(act.title, idMap) ?? act.title,
    requiresFlags: act.requiresFlags?.map(flag => `${prefix}${flag}`),
    hiddenByFlags: act.hiddenByFlags?.map(flag => `${prefix}${flag}`),
    beats: [
      ...(actIndex === 0 ? [{ kind: 'comic' as const, panels: [{ scene: location, caption: introduction }] }] : []),
      ...act.beats.map(beat => {
        if (beat.kind === 'line') return {
          ...beat,
          speaker: idMap.get(beat.speaker) ?? beat.speaker,
          text: replaceCharacterNames(beat.text, idMap) ?? beat.text,
        }
        if (beat.kind === 'notification') return {
          ...beat,
          from: replaceCharacterNames(beat.from, idMap) ?? beat.from,
          title: replaceCharacterNames(beat.title, idMap) ?? beat.title,
          text: replaceCharacterNames(beat.text, idMap) ?? beat.text,
        }
        if (beat.kind === 'comic') return {
          ...beat,
          panels: beat.panels.map(panel => ({
            ...panel,
            scene: location,
            caption: replaceCharacterNames(panel.caption, idMap) ?? panel.caption,
            speaker: panel.speaker ? idMap.get(panel.speaker) ?? panel.speaker : undefined,
          })),
        }
        if (beat.kind === 'choice') return {
          ...beat,
          id: `${prefix}${beat.id}`,
          prompt: replaceCharacterNames(beat.prompt, idMap) ?? beat.prompt,
          options: beat.options.map(option => ({
            ...option,
            text: replaceCharacterNames(option.text, idMap) ?? option.text,
            reply: replaceCharacterNames(option.reply, idMap),
            trust: remapTrust(option.trust, idMap),
            flags: option.flags?.map(flag => `${prefix}${flag}`),
            clearFlags: option.clearFlags?.map(flag => `${prefix}${flag}`),
          })),
        }
        return beat
      }),
    ],
  }))

  const practicalTrigger = story.acts.map(act => act.trigger).find(trigger => trigger.on === 'beforeMission')
  const practicalMissionId = practicalTrigger?.on === 'beforeMission' ? practicalTrigger.missionId : undefined
  const helpFlag = `${prefix}relationship:helped-${supportId}`
  const soloFlag = `${prefix}relationship:worked-solo`
  const support = character(supportId)
  const careerActs: StoryAct[] = []

  if (chapterIndex === 0 && practicalMissionId) {
    careerActs.push({
      id: `${prefix}${story.courseId}:coffee-help`,
      title: 'Перерыв, который стал частью дела',
      trigger: { on: 'beforeMission', missionId: practicalMissionId },
      beats: [
        { kind: 'comic', panels: [{ scene: 'city-coffee-break', caption: 'Вы выходите за кофе. Ноутбук остаётся открытым: перерыв быстро превращается в маленькую рабочую экспедицию.' }] },
        { kind: 'line', speaker: supportId, emotion: 'worried', text: `У меня сломался рабочий пример перед встречей. Не выбирай ответ за меня — помоги восстановить его в следующем практическом задании.` },
        { kind: 'choice', id: `${prefix}${story.courseId}:help-choice`, prompt: `${support.name} просит не совет, а совместную работу. Что решишь?`, options: [
          { id: 'help', text: 'Разобрать проблему вместе и подтвердить решение кодом или данными.', reply: `Вы договариваетесь: сейчас формулируете гипотезу, а затем проверяете её в рабочей станции. ${support.name} это запомнит.`, trust: { [supportId]: 2 }, flags: [helpFlag], clearFlags: [soloFlag] },
          { id: 'solo', text: 'Сохранить время для своей задачи и работать отдельно.', reply: 'Решение рациональное, но общий контекст останется у каждого свой.', trust: { [supportId]: -1 }, flags: [soloFlag], clearFlags: [helpFlag] },
        ] },
      ],
    })
  }

  if (chapterIndex === 1) {
    careerActs.push({
      id: `${prefix}${story.courseId}:restaurant-break`,
      title: 'Разговор после мероприятия',
      trigger: { on: 'caseStart' },
      beats: [
        { kind: 'comic', panels: [{ scene: 'team-restaurant-dinner', caption: 'После мероприятия команда идёт ужинать. Но самый полезный разбор начинается не у доски, а между заказом и десертом.' }] },
        { kind: 'line', speaker: supportId, emotion: 'happy', text: 'За столом проще спросить то, что в переговорной кажется глупым. Давай разложим сегодняшний подход на предположение, проверку и вывод.' },
      ],
    })
  }

  if (chapterIndex === 2 && practicalMissionId) {
    careerActs.push({
      id: `${prefix}${story.courseId}:returned-help`,
      title: 'Долг из первой главы',
      trigger: { on: 'beforeMission', missionId: practicalMissionId },
      requiresFlags: [helpFlag],
      beats: [
        { kind: 'comic', panels: [{ scene: 'airport-departure-business-trip', caption: 'Через несколько глав вы встречаетесь в аэропорту перед новой командировкой. Старый выбор возвращается не репликой, а реальной возможностью.' }] },
        { kind: 'line', speaker: supportId, emotion: 'determined', text: `Ты тогда помог мне восстановить рабочий пример. Теперь у меня есть недостающий контекст для твоей задачи. Забирай — но результат всё равно придётся доказать в следующей практической миссии.` },
      ],
    }, {
      id: `${prefix}${story.courseId}:no-returned-help`,
      title: 'Контекст приходится собирать заново',
      trigger: { on: 'beforeMission', missionId: practicalMissionId },
      requiresFlags: [soloFlag],
      beats: [
        { kind: 'comic', panels: [{ scene: 'airport-departure-business-trip', caption: 'В аэропорту выясняется: у команды нет общей истории решения. Перед практической миссией контекст придётся восстановить самостоятельно.' }] },
        { kind: 'line', speaker: supportId, emotion: 'worried', text: 'Мы тогда разошлись каждый в свою задачу. Я не могу подтвердить твои допущения — начни с исходных данных и докажи цепочку самостоятельно.' },
      ],
    })
  }

  if (chapterIndex === 3) careerActs.push({
    id: `${prefix}${story.courseId}:library-workshop`, title: 'Воркшоп после закрытия', trigger: { on: 'caseStart' }, beats: [
      { kind: 'comic', panels: [{ scene: 'library-evening-workshop', caption: 'Городская библиотека закрылась для посетителей, но команда остаётся на вечерний воркшоп: здесь новая тема превращается в рабочую схему.' }] },
      { kind: 'line', speaker: supportId, emotion: 'determined', text: 'Не переписывай готовое решение. Сначала объясни его на доске, затем собери самостоятельно в практической части.' },
    ],
  })
  if (chapterIndex === 4) careerActs.push({
    id: `${prefix}${story.courseId}:night-hackathon`, title: 'Ночь до демонстрации', trigger: { on: 'caseStart' }, beats: [
      { kind: 'comic', panels: [{ scene: 'hackathon-night-loft', caption: 'На ночном хакатоне теория заканчивается быстро: к утру должен работать прототип, который выдержит чужие данные и неудобные вопросы.' }] },
      { kind: 'line', speaker: supportId, emotion: 'happy', text: 'Первый прототип может быть маленьким. Главное — чтобы его можно было запустить, проверить и улучшить, а не только красиво описать.' },
    ],
  })

  return {
    ...story,
    caseId: `${professionId}:${story.caseId}`,
    number: String(chapterIndex + 1).padStart(2, '0'),
    title: `${chapter.stage.title} · ${story.title}`,
    logline: `${introduction} Цель главы: ${chapter.stage.goal}`,
    setting: location,
    cast: [...new Set([...narrative.cast, supportId])],
    career: {
      professionId,
      protagonistName: narrative.protagonist.name,
      protagonistDescription: narrative.protagonist.description,
      chapterNumber: chapterIndex + 1,
      chapterCount: chapters.length,
      stageTitle: chapter.stage.title,
      location,
    },
    acts: [...careerActs, ...mappedActs],
    endings: story.endings.map(ending => ({
      ...ending,
      id: `${prefix}${ending.id}`,
      title: replaceCharacterNames(ending.title, idMap) ?? ending.title,
      summary: replaceCharacterNames(ending.summary, idMap) ?? ending.summary,
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

const briefQuestions = [
  'И что нам это даёт прямо сейчас?',
  'Подожди. А на практике это где всплывает?',
  'Я записываю. Главное здесь — что?',
  'А если сделать по-старому, что сломается?',
  'Понятно в теории. Покажешь на рабочем примере?',
]

/**
 * Сцена-бриф эпизода. Нужна там, где у миссии нет собственного авторского акта:
 * игрок всё равно входит в задание через историю, а не через пустой редактор.
 */
export function missionBriefAct(story: StoryCase, mission: Mission, episode: number, total: number): StoryAct | undefined {
  if (story.acts.some(act => act.trigger.on === 'beforeMission' && act.trigger.missionId === mission.id)) return undefined
  const scene = story.career?.location ?? story.setting
  const mentorId = story.cast[1] ?? story.cast[0] ?? 'narrator'
  const partnerId = story.cast[0] ?? 'narrator'
  const intro = mission.intro?.trim()
  const context = mission.productionContext?.trim()
  const prompt = mission.task?.prompt?.trim()
  const workspaceFile = mission.task?.workspaceFile
  const objective = mission.objectives?.[0]
  const beats: StoryAct['beats'] = [
    { kind: 'comic', panels: [{ scene, caption: `Эпизод ${episode} из ${total}. ${mission.title}.` }] },
  ]
  if (intro) beats.push({ kind: 'line', speaker: mentorId, emotion: 'neutral', text: intro })
  if (partnerId !== mentorId) beats.push({ kind: 'line', speaker: partnerId, emotion: 'surprised', text: briefQuestions[(episode - 1) % briefQuestions.length] })
  if (context) beats.push({ kind: 'line', speaker: mentorId, emotion: 'determined', text: context })
  if (objective) beats.push({ kind: 'line', speaker: 'narrator', text: `Цель эпизода: ${objective}.` })
  if (prompt) beats.push({ kind: 'line', speaker: 'narrator', text: workspaceFile ? `Что нужно сделать: ${prompt} Решение пишется в файле ${workspaceFile}.` : `Что нужно сделать: ${prompt}` })
  return { id: `${story.caseId}:brief:${mission.id}`, title: mission.title, trigger: { on: 'beforeMission', missionId: mission.id }, beats }
}

/** Сцена, которую можно показать перед эпизодом ещё раз — по кнопке «пересмотреть». */
export function missionSceneForReplay(courseId: string, mission: Mission, episode: number, total: number, professionId?: string) {
  const story = caseForCourse(courseId, professionId)
  if (!story) return undefined
  const authored = story.acts.find(act => act.trigger.on === 'beforeMission' && act.trigger.missionId === mission.id)
  if (authored) return authored
  return missionBriefAct(story, mission, episode, total) ?? story.acts.find(act => act.trigger.on === 'caseStart')
}
