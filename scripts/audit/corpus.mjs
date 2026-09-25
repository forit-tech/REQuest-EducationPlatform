/**
 * Корпус для аудита курса: сюжет, персонажи, спрайты и учебные материалы в одной
 * структуре.
 *
 * Принцип: аудит не держит собственных копий данных. Всё, что решает поведение
 * приложения — словарь мест, набор эмоций, маршруты профессий, таблица кастинга,
 * каталог спрайтов, — читается из тех же файлов, что и движок. Скопированная в
 * проверку таблица расходится с приложением молча, и тогда зелёный отчёт не
 * означает ничего.
 */
import { readFileSync, readdirSync, existsSync, openSync, readSync, closeSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadCorpus } from '../quality/corpus.mjs'
import { castingBook, emotionIds } from './contracts.mjs'

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

/* ------------------------------------------------ словари из кода движка */

/**
 * Места действия пока вычитываются регуляркой из исходников: своего контракта,
 * как у эмоций и кастинга, у них ещё нет. Это следующий кандидат на вынос —
 * разбор кода переживает опечатку в нём молча.
 */
function readLocations(root) {
  const types = readFileSync(join(root, 'src/story/types.ts'), 'utf8')
  const list = /export const locationIds: readonly LocationId\[\] = \[([\s\S]*?)\]/.exec(types)?.[1] ?? ''
  const ids = [...list.matchAll(/'([a-z]+)'/g)].map(match => match[1])
  const engine = readFileSync(join(root, 'src/story/engine.ts'), 'utf8')
  const aliasBlock = /const legacyLocationAliases: Record<string, LocationId> = \{([\s\S]*?)\n\}/.exec(engine)?.[1] ?? ''
  const aliases = Object.fromEntries([...aliasBlock.matchAll(/'([a-z-]+)':\s*'([a-z]+)'/g)].map(match => [match[1], match[2]]))
  return { ids, aliases }
}

/* ------------------------------------------------------------- спрайты */

/** Размер PNG из заголовка IHDR: разбирать пиксели ради ширины и высоты не нужно. */
function pngSize(path) {
  const handle = openSync(path, 'r')
  try {
    const header = Buffer.alloc(24)
    readSync(handle, header, 0, 24, 0)
    if (header.toString('latin1', 1, 4) !== 'PNG') return null
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
  } finally {
    closeSync(handle)
  }
}

function readSprites(root) {
  const directory = join(root, 'assets/characters/generated')
  if (!existsSync(directory)) return new Map()
  const sprites = new Map()
  for (const name of readdirSync(directory)) {
    const match = /^([a-z]+)-([a-z]+)-v(\d+)\.png$/.exec(name)
    if (!match) continue
    const [, characterId, emotion, version] = match
    const key = characterId + ':' + emotion
    const previous = sprites.get(key)
    if (previous && previous.version > Number(version)) continue
    sprites.set(key, {
      characterId, emotion, version: Number(version), file: name,
      path: join(directory, name), changedAt: statSync(join(directory, name)).mtimeMs,
      ...(pngSize(join(directory, name)) ?? { width: 0, height: 0 }),
    })
  }
  return sprites
}

/* --------------------------------------------------------------- сюжет */

/**
 * Разворачивает дело в плоский список реплик. Аудиту нужен одинаковый доступ к
 * говорящему, эмоции и тексту независимо от того, реплика это, кадр комикса,
 * уведомление или вариант выбора.
 */
export function spokenBeats(story) {
  const out = []
  const acts = story.acts ?? []
  acts.forEach((act, actIndex) => {
    const beats = act.beats ?? []
    beats.forEach((beat, beatIndex) => {
      const at = { caseId: story.caseId, courseId: story.courseId, actId: act.id, actIndex, beatIndex }
      if (beat.kind === 'line') {
        out.push({ ...at, kind: 'line', speaker: beat.speaker, emotion: beat.emotion, text: beat.text ?? '' })
      } else if (beat.kind === 'comic') {
        beat.panels.forEach((panel, panelIndex) => out.push({
          ...at, kind: 'panel', panelIndex, speaker: panel.speaker, emotion: panel.emotion,
          text: panel.caption ?? '', location: panel.location,
        }))
      } else if (beat.kind === 'notification') {
        out.push({ ...at, kind: 'notification', text: (beat.title ?? '') + '. ' + (beat.text ?? ''), from: beat.from })
      } else if (beat.kind === 'choice') {
        out.push({ ...at, kind: 'prompt', choiceId: beat.id, text: beat.prompt ?? '' })
        beat.options.forEach(option => {
          out.push({ ...at, kind: 'option', choiceId: beat.id, optionId: option.id, text: option.text ?? '' })
          if (option.reply) out.push({ ...at, kind: 'reply', choiceId: beat.id, optionId: option.id, text: option.reply })
        })
      }
    })
  })
  return out
}

/**
 * Текст, обращённый к игроку помимо диалогов: завязка, обстановка и итоги.
 *
 * Концовку читает тот же человек, что и реплики, и род в ней значит ровно
 * столько же. Проверка, смотревшая только на диалоги, восемь таких обращений
 * не видела.
 */
export function playerFacingText(story) {
  const out = [
    { where: story.courseId + '/logline', text: story.logline },
    { where: story.courseId + '/setting', text: story.setting },
  ]
  for (const ending of story.endings ?? []) {
    out.push({ where: story.courseId + '/ending:' + ending.id, text: [ending.title, ending.summary].filter(Boolean).join('. ') })
  }
  return out.filter(item => item.text)
}

/** Весь текст дела одной строкой: для проверок объёма сцены и связи с темой. */
export function caseText(story) {
  return [story.logline, story.setting, ...spokenBeats(story).map(beat => beat.text)].filter(Boolean).join(' ')
}

/**
 * Главы профессии в порядке прохождения: курс, этап, место действия и завязка.
 * Это и есть сюжетная библия маршрута — состояние, которое каждая следующая
 * глава обязана наследовать.
 */
function buildChapters(corpus) {
  const chapters = []
  for (const program of corpus.professionPrograms) {
    const narrative = corpus.narrativeByProfession.get(program.professionId)
    if (!narrative) continue
    const route = corpus.routes[program.professionId] ?? []
    let chapterIndex = 0
    for (const [stageIndex, stage] of (program.stages ?? []).entries()) {
      for (const courseId of stage.courseIds ?? []) {
        const locations = narrative.locations ?? []
        const declared = route[stageIndex]?.location
          ?? (locations.length ? locations[stageIndex % locations.length] : undefined)
        const location = corpus.locationIds.includes(declared)
          ? declared
          : corpus.locationAliases[declared] ?? 'office'
        chapters.push({
          professionId: program.professionId,
          courseId, stageIndex, stageTitle: stage.title,
          chapterIndex: chapterIndex++,
          location,
          declaredLocation: declared,
          hook: route[stageIndex]?.hook,
          teamIds: narrative.cast ?? [],
          protagonist: narrative.protagonist,
        })
      }
    }
  }
  return chapters
}

export function loadAuditCorpus(root) {
  const knowledge = join(root, 'knowledge')
  const quality = loadCorpus(root)
  const cast = readJson(join(knowledge, 'story/cast.json'))
  const casesDirectory = join(knowledge, 'story/cases')
  const cases = readdirSync(casesDirectory)
    .filter(name => name.endsWith('.json') && name !== 'prologue.json')
    .map(name => ({ file: 'knowledge/story/cases/' + name, ...readJson(join(casesDirectory, name)) }))
  // Зависимости курса живут в programs.json домена, а не в course.json.
  const programs = readdirSync(knowledge, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(join(knowledge, entry.name, 'programs.json')))
    .flatMap(entry => readJson(join(knowledge, entry.name, 'programs.json')))
  const narratives = readJson(join(knowledge, 'professions/narratives.json'))
  const professionPrograms = readJson(join(knowledge, 'professions/programs.json'))
  const routes = readJson(join(knowledge, 'professions/routes.json')).routes
  const casting = readJson(join(knowledge, 'story/casting.json'))
  const skillsRegistry = readJson(join(knowledge, 'skills-registry.json'))
  const { ids: locationIds, aliases: locationAliases } = readLocations(root)
  const sprites = readSprites(root)
  const posesByCharacter = new Map()
  for (const sprite of sprites.values()) {
    if (!posesByCharacter.has(sprite.characterId)) posesByCharacter.set(sprite.characterId, new Map())
    posesByCharacter.get(sprite.characterId).set(sprite.emotion, sprite)
  }

  const corpus = {
    root,
    courses: quality.courses,
    courseById: new Map(quality.courses.map(course => [course.id, course])),
    programs,
    prerequisitesByCourse: new Map(programs.map(program => [program.id, program.prerequisites ?? []])),
    cast,
    castById: new Map(cast.map(member => [member.id, member])),
    cases,
    caseByCourse: new Map(cases.map(story => [story.courseId, story])),
    narratives,
    narrativeByProfession: new Map(narratives.map(item => [item.professionId, item])),
    professionPrograms,
    routes,
    casting,
    castingBook: castingBook(cast, casting),
    skillsRegistry,
    skillById: new Map(skillsRegistry.skills.map(skill => [skill.id, skill])),
    emotions: emotionIds,
    locationIds,
    locationAliases,
    sprites,
    // Позы по героям в том же виде, в каком их собирает сцена (src/story/Sprite.tsx):
    // одно имя файла — одно объявление, самая свежая версия побеждает.
    posesByCharacter,
  }
  corpus.chapters = buildChapters(corpus)
  corpus.chaptersByCourse = new Map()
  for (const chapter of corpus.chapters) {
    if (!corpus.chaptersByCourse.has(chapter.courseId)) corpus.chaptersByCourse.set(chapter.courseId, [])
    corpus.chaptersByCourse.get(chapter.courseId).push(chapter)
  }
  return corpus
}
