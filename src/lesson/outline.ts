import type { Mission, MissionStage, Room } from '../types'

/**
 * Структура курса: блок → тема → ступень.
 *
 * В runtime у курса лежит плоский список миссий, и человек видит ленту из
 * двухсот карточек. Блоки и темы при этом существуют — просто не в модели, а в
 * двух других местах: блок закодирован в номере миссии, тема выражена
 * последовательностью учебных ступеней. Здесь и то, и другое достаётся.
 *
 * Почему тема выводится, а не хранится полем. Поле пришлось бы проставить в
 * 226 миссиях руками и поддерживать вручную при каждой вставке. Ступени же
 * автор и так расставляет — без них не работает аудит лестницы, — и порядок
 * ступеней однозначно говорит, где кончается одна тема и начинается другая.
 */

/** Подписи ступеней. Внутреннее имя — англоязычное, человеку показывается это. */
export const STAGE_LABEL: Record<MissionStage, string> = {
  explained: 'Объяснение',
  shown: 'Показ',
  guided: 'Попробуй',
  modified: 'Измени',
  filled: 'Дополни',
  independent: 'Напиши сам',
  debugged: 'Исправь',
  transferred: 'Примени',
}

/** Что человек делает на этой ступени — одной строкой, для подсказки над заданием. */
export const STAGE_HINT: Record<MissionStage, string> = {
  explained: 'Разбираемся, зачем это нужно. Писать код пока не нужно.',
  shown: 'Смотрим на готовый пример и разбираем его по частям.',
  guided: 'Пробуем на готовом коде, ничего не ломая.',
  modified: 'Правим готовый код: конструкция уже на месте.',
  filled: 'Дописываем недостающее в готовый код.',
  independent: 'Пишем с чистого места — всё нужное уже проходили.',
  debugged: 'Ищем и чиним ошибку в работающем коде.',
  transferred: 'Собираем задачу из всего, что прошли в блоке.',
}

/** Ступени, на которых человеку нечего писать: редактор на них не открывается. */
export const READING_STAGES: MissionStage[] = ['explained', 'shown']

export interface Topic {
  /** Номер темы внутри курса, с единицы. */
  index: number
  title: string
  blockNumber: number | null
  missions: Mission[]
  /**
   * Тема без разметки лестницы.
   *
   * Так выглядит хвост, оставшийся от генератора: у миссии нет ступени,
   * потому что ступеней у неё и не было. Интерфейс обязан показать это честно,
   * а не выдавать заготовку за готовую тему.
   */
  scaffold: boolean
}

export interface CourseOutline {
  topics: Topic[]
  /** Тема и место миссии в ней. Ключ — идентификатор миссии. */
  placeOf: Map<string, { topic: Topic; step: number }>
}

/** Номер блока из номера миссии: `PYC-425` → 4. У `PFS-002` блока нет. */
export function blockNumberOf(missionId: string): number | null {
  const digits = /-(\d{3,})$/.exec(missionId)?.[1]
  if (!digits || digits.length < 3) return null
  const block = Number(digits.slice(0, digits.length - 2))
  return block > 0 ? block : null
}

/**
 * Начинается ли новая тема.
 *
 * Тему открывает объяснение. Показ открывает её тоже, но только если перед ним
 * не было объяснения этой же темы: связка «объяснили → показали» — одна тема,
 * а показ после самостоятельной работы — уже следующая.
 */
function startsTopic(mission: Mission, previous?: Mission) {
  if (!previous) return true
  // Миссия без ступени лестницы не проходит: у шаблонного хвоста структуры нет,
  // и склеивать его в одну тему с размеченным содержанием нельзя.
  if (!mission.stage || !previous.stage) return true
  if (mission.stage === 'explained') return true
  // Два показа подряд — всё ещё одна тема: «объяснили → показали → показали
  // второй вид записи». Новую тему показ открывает только после работы руками.
  if (mission.stage === 'shown') return previous.stage !== 'explained' && previous.stage !== 'shown'
  // Кейс блока стоит особняком: он ничего не вводит и собирает пройденное.
  if (mission.stage === 'transferred') return true
  return false
}

/** Заголовок темы берётся у миссии, которая её открыла. */
const titleOf = (mission: Mission) => mission.title

export function outlineOf(room: Room): CourseOutline {
  const topics: Topic[] = []
  const placeOf = new Map<string, { topic: Topic; step: number }>()
  const missions = room.missions ?? []
  // Отсутствие ступени и отсутствие содержания — разные вещи. Курс, который
  // не размечали по лестнице, написан не хуже прочих, и подпись «Ещё не
  // написано» была на нём неправдой.
  // Размеченным считается курс, размеченный целиком: у «Технического
  // фундамента» ступень стоит у двух миссий из шестнадцати, и по одной такой
  // метке весь курс объявлялся ненаписанным. Педагогический контракт требует
  // от аудированного курса полной разметки, так что `every` его не теряет.
  const ladder = missions.length > 0 && missions.every(mission => mission.stage)
  let lastBlock: number | null = null
  for (const [index, mission] of missions.entries()) {
    const previous = missions[index - 1]
    if (startsTopic(mission, previous) || !topics.length) {
      // Кейс блока и вводные миссии номера блока в идентификаторе не несут:
      // `PYC-003` — это кейс первого блока, а не нулевой блок. Такая тема
      // остаётся в том блоке, за которым идёт.
      if (mission.stage) lastBlock = blockNumberOf(mission.id) ?? lastBlock
      topics.push({
        index: topics.length + 1,
        title: titleOf(mission),
        blockNumber: mission.stage ? lastBlock : null,
        missions: [],
        scaffold: ladder && !mission.stage,
      })
    }
    const topic = topics[topics.length - 1]
    topic.missions.push(mission)
    placeOf.set(mission.id, { topic, step: topic.missions.length })
  }
  return { topics, placeOf }
}

export interface Block {
  number: number | null
  topics: Topic[]
  /** Весь блок собран генератором: проходить в нём нечего. */
  scaffold: boolean
}

/** Блоки курса: соседние темы с одним номером блока. */
export function blocksOf(outline: CourseOutline): Block[] {
  const blocks: Block[] = []
  for (const topic of outline.topics) {
    const last = blocks[blocks.length - 1]
    if (last && last.number === topic.blockNumber && last.scaffold === topic.scaffold) last.topics.push(topic)
    else blocks.push({ number: topic.blockNumber, topics: [topic], scaffold: topic.scaffold })
  }
  return blocks
}

/** Заголовок блока для человека. */
export function blockTitle(block: Block, position: number) {
  if (block.scaffold) return 'Ещё не написано'
  if (block.number === null) return position === 0 ? 'Введение' : 'Дополнительно'
  return `Блок ${block.number}`
}
