import { isLocationId } from './types'
import type { Character, LocationId, StoryAct, StoryCase, StoryEnding } from './types'
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

/**
 * Один этап профессии — одна сюжетная арка с одним местом действия.
 * Курсы внутри этапа являются частями этой арки, а не отдельными новеллами.
 */
type RouteChapter = { location: LocationId; hook: string }

/** Старые названия мест из данных приводятся к словарю точным сравнением. */
const legacyLocationAliases: Record<string, LocationId> = {
  'trip-station': 'trip',
  'high-speed-train': 'train',
  'seaside-research-station': 'coast',
  'emergency-operations-storm': 'operations',
  'festival-backstage': 'backstage',
}

function toLocation(value: string | undefined, fallback: LocationId): LocationId {
  if (isLocationId(value)) return value
  if (value && legacyLocationAliases[value]) return legacyLocationAliases[value]
  return fallback
}
const careerRoutes: Record<string, RouteChapter[]> = {
  'data-scientist': [
    { location: 'office', hook: 'Дарья получает архив городских обращений и замечает, что часть районов почти исчезла из данных.' },
    { location: 'train', hook: 'Команда едет к диспетчерам соседнего региона, чтобы сверить таблицы с тем, что происходит на земле.' },
    { location: 'coast', hook: 'На прибрежной станции датчики спорят с журналами наблюдателей, и Дарье приходится заново собирать признаки.' },
    { location: 'operations', hook: 'Во время шторма модель впервые влияет на настоящее решение штаба — цена неверного прогноза становится реальной.' },
    { location: 'conference', hook: 'Дарья защищает итоговую систему перед городами-партнёрами и объясняет не только метрики, но и границы модели.' },
  ],
  'data-analyst': [
    { location: 'office', hook: 'Алина расследует падение продаж, которое разные отделы объясняют четырьмя несовместимыми версиями.' },
    { location: 'train', hook: 'В поезде к региональному складу она собирает воспроизводимый отчёт и находит пропущенный сегмент клиентов.' },
    { location: 'industrial', hook: 'На складе цифры встречаются с реальным процессом: причина скрыта между сканером, возвратом и ночной сменой.' },
    { location: 'restaurant', hook: 'За ужином с региональной командой Алина проверяет выводы на неудобных вопросах и договаривается о новом эксперименте.' },
    { location: 'conference', hook: 'На совете директоров она связывает всю цепочку доказательств и предлагает решение, которое можно измерить после запуска.' },
  ],
  'ml-engineer': [
    { location: 'lab', hook: 'Тимур принимает эффектный прототип, который пока умеет работать только на ноутбуке автора.' },
    { location: 'coast', hook: 'На полевой станции входные данные меняются быстрее документации, и модель начинает дрейфовать.' },
    { location: 'industrial', hook: 'Промышленный контур требует очередей, версий и отката — одной хорошей метрики больше недостаточно.' },
    { location: 'operations', hook: 'Под аварийной нагрузкой Тимур расследует деградацию и собирает безопасный путь восстановления.' },
    { location: 'conference', hook: 'На инженерном разборе он демонстрирует сервис, мониторинг и честный отчёт о неудачных экспериментах.' },
  ],
  'data-engineer': [
    { location: 'office', hook: 'Вера получает цепочку отчётов, где один и тот же заказ имеет три времени создания.' },
    { location: 'train', hook: 'По дороге в логистический хаб она восстанавливает контракт данных и список проверяемых допущений.' },
    { location: 'industrial', hook: 'На площадке выясняется, как терминалы, смены и ручные исправления меняют поток событий.' },
    { location: 'operations', hook: 'Ночной сбой обрывает конвейер, и Вера строит повторяемое восстановление без потери записей.' },
    { location: 'meeting', hook: 'Финальная встреча превращает временный ремонт в устойчивую платформу с владельцами и гарантиями качества.' },
  ],
  'ai-engineer': [
    { location: 'lab', hook: 'Илья собирает помощника для врачей и сразу сталкивается с опасной уверенностью красивых ответов.' },
    { location: 'train', hook: 'В дороге к пилотной клинике он готовит набор проверок, которые нельзя заменить демонстрацией.' },
    { location: 'coast', hook: 'Удалённая медицинская станция показывает редкие случаи и ограничения исходной базы знаний.' },
    { location: 'operations', hook: 'Во время перебоя связи помощник должен корректно отказать, сохранить контекст и не выдумать решение.' },
    { location: 'conference', hook: 'Илья защищает продукт перед экспертами, показывая оценку качества, безопасность и участие человека.' },
  ],
  'java-developer': [
    { location: 'office', hook: 'Максим получает старый платёжный сервис и первый баг без понятного владельца.' },
    { location: 'library', hook: 'На вечернем разборе команда восстанавливает доменную модель по тестам, логам и истории изменений.' },
    { location: 'industrial', hook: 'На терминалах партнёра проявляется конкуренция запросов, которую не удавалось воспроизвести в офисе.' },
    { location: 'operations', hook: 'Перед релизом нагрузка вскрывает узкое место, и Максим готовит исправление вместе с планом отката.' },
    { location: 'meeting', hook: 'После запуска он проводит разбор и превращает найденные риски в тесты и архитектурные ограничения.' },
  ],
  'python-backend': [
    { location: 'office', hook: 'Ника проектирует API доставки для нового города, где адреса и расписания живут по непривычным правилам.' },
    { location: 'train', hook: 'В командировке она поднимает локальный стенд и сверяет контракт с операционной командой.' },
    { location: 'industrial', hook: 'В сортировочном центре реальные сканеры создают дубли и запоздавшие события.' },
    { location: 'restaurant', hook: 'За поздним ужином курьеры помогают Нике найти сценарии, которых не было в техническом задании.' },
    { location: 'operations', hook: 'В первый вечер запуска сервис встречает пик заказов, а Ника удерживает очередь и данные в согласованном состоянии.' },
  ],
  'go-developer': [
    { location: 'office', hook: 'Денис принимает сетевой шлюз, который теряет сообщения только в самые неудобные минуты.' },
    { location: 'lab', hook: 'В лаборатории он строит нагрузочный стенд и делает проблему воспроизводимой.' },
    { location: 'train', hook: 'По пути на транспортный узел команда анализирует трассировки и готовит безопасное переключение.' },
    { location: 'industrial', hook: 'На узле новый сервис сталкивается с нестабильной сетью и настоящей конкуренцией соединений.' },
    { location: 'operations', hook: 'В час пик Денис управляет запуском, наблюдает систему и принимает решение об откате по данным.' },
  ],
  'frontend-developer': [
    { location: 'office', hook: 'Лера собирает первый интерфейс фестиваля из противоречивых макетов и реальных пользовательских задач.' },
    { location: 'train', hook: 'По дороге на площадку она чинит адаптивность и готовит сценарии полевого тестирования.' },
    { location: 'backstage', hook: 'За кулисами посетители, волонтёры и слабая сеть быстро показывают, что прототип упустил.' },
    { location: 'restaurant', hook: 'За ужином с организаторами Лера защищает доступность и сокращает путь до главного действия.' },
    { location: 'conference', hook: 'В вечер открытия интерфейс обслуживает живую аудиторию, а команда наблюдает метрики и исправляет проблемы без паники.' },
  ],
  'react-developer': [
    { location: 'office', hook: 'Кирилл наследует диспетчерский прототип, где одно действие неожиданно меняет пять экранов.' },
    { location: 'library', hook: 'На архитектурном воркшопе он отделяет состояние, события и визуальные компоненты.' },
    { location: 'industrial', hook: 'В диспетчерской реальные операторы проверяют скорость, клавиатурную навигацию и устойчивость интерфейса.' },
    { location: 'operations', hook: 'Во время аварии поток обновлений растёт, и приложение должно оставаться понятным и отзывчивым.' },
    { location: 'conference', hook: 'Кирилл показывает систему отраслевым экспертам и доказывает архитектуру работающим сценарием.' },
  ],
  'devops-engineer': [
    { location: 'server', hook: 'Ася выходит на первое дежурство и обнаруживает релиз, который можно повторить только по памяти коллеги.' },
    { location: 'train', hook: 'В поездке к резервному центру она превращает ручные шаги в проверяемый конвейер.' },
    { location: 'industrial', hook: 'На площадке команда инвентаризирует реальные зависимости и устраняет расхождения конфигурации.' },
    { location: 'operations', hook: 'Шторм отключает основной канал, и Ася проводит переключение с наблюдаемыми контрольными точками.' },
    { location: 'meeting', hook: 'На итоговом разборе она закрепляет автоматизацию, ответственность и план следующей тренировки.' },
  ],
  'sre-engineer': [
    { location: 'server', hook: 'Роман готовит платформу трансляций и переводит обещания бизнеса в измеримые цели надёжности.' },
    { location: 'airport', hook: 'В аэропорту задерживается команда, но репетиция инцидента начинается прямо с ноутбуков.' },
    { location: 'backstage', hook: 'За кулисами международного эфира он проверяет деградацию, резервирование и связь между командами.' },
    { location: 'operations', hook: 'Во время события растёт задержка, и Роман координирует инцидент по сигналам, а не догадкам.' },
    { location: 'restaurant', hook: 'После эфира команда проводит спокойный разбор и превращает пережитое в инженерные изменения.' },
  ],
  'cybersecurity-specialist': [
    { location: 'office', hook: 'Марина моделирует угрозы для новой производственной сети и замечает опасную зону доверия.' },
    { location: 'train', hook: 'В дороге на завод она готовит план проверки, не нарушающий работу линии.' },
    { location: 'industrial', hook: 'На объекте схема сети расходится с реальностью, а старый контроллер открывает неожиданный маршрут.' },
    { location: 'operations', hook: 'Признаки проникновения требуют изоляции, сбора артефактов и решения без остановки производства.' },
    { location: 'meeting', hook: 'Марина докладывает руководству доказанную цепочку атаки и план исправлений с приоритетами.' },
  ],
  'pentester': [
    { location: 'meeting', hook: 'Марк получает письменные границы первой проверки и учится отделять разрешённый эксперимент от риска.' },
    { location: 'train', hook: 'В поездке к клиенту он собирает пассивную разведку и журнал каждого допущения.' },
    { location: 'coast', hook: 'В удалённом филиале нестандартная инфраструктура открывает цепочку, которую нельзя проверять грубой силой.' },
    { location: 'industrial', hook: 'На производственной площадке Марк подтверждает влияние безопасным доказательством и сразу закрывает опасный путь.' },
    { location: 'conference', hook: 'Финальный отчёт превращает технические находки в понятный маршрут исправлений для разных команд.' },
  ],
  'soc-analyst': [
    { location: 'server', hook: 'Елизавета принимает ночную смену и замечает одиночный алерт, который слишком легко списать на шум.' },
    { location: 'train', hook: 'Мобильный штаб едет к площадке, пока она связывает события по времени, узлам и учётным записям.' },
    { location: 'industrial', hook: 'На объекте журналы и физическая картина помогают отделить ложный след от реального перемещения атакующего.' },
    { location: 'operations', hook: 'Атака затрагивает несколько площадок, и Елизавета ведёт приоритизацию, изоляцию и сохранение доказательств.' },
    { location: 'meeting', hook: 'На межкомандном разборе она восстанавливает хронологию и превращает наблюдения в новые правила обнаружения.' },
  ],
}

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
  oleg: ['oleg', 'alexey', 'vadim'],
  gleb: ['oleg', 'pavel', 'vadim', 'artem', 'alexey'],
  sonya: ['sonya', 'yana', 'lena'],
  artem: ['artem', 'pavel', 'vadim', 'gleb'],
  vadim: ['vadim', 'pavel', 'artem', 'gleb'],
  alexey: ['alexey', 'oleg', 'lena'],
  yana: ['yana', 'irina', 'mira', 'lena'],
  pavel: ['pavel', 'damir', 'gleb', 'artem'],
  irina: ['irina', 'yana', 'mira'],
  damir: ['damir', 'pavel', 'alexey'],
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
  if (['data-analyst', 'frontend-developer', 'react-developer'].includes(professionId)) return 'irina'
  if (['cybersecurity-specialist', 'pentester', 'soc-analyst'].includes(professionId)) return 'damir'
  return ['data-scientist', 'ai-engineer'].includes(professionId) ? 'yana' : 'pavel'
}

function careerCase(story: StoryCase, professionId: string): StoryCase {
  const narrative = careerNarratives.find(item => item.professionId === professionId)
  const program = professionPrograms.find(item => item.professionId === professionId)
  if (!narrative || !program) return story

  const chapters = program.stages.flatMap((stage, stageIndex) => stage.courseIds.map(courseId => ({ courseId, stage, stageIndex })))
  const chapterIndex = chapters.findIndex(chapter => chapter.courseId === story.courseId)
  if (chapterIndex < 0) return story
  const chapter = chapters[chapterIndex]
  const route = careerRoutes[professionId]?.[chapter.stageIndex]
  const location = route?.location ?? toLocation(narrative.locations[chapter.stageIndex % narrative.locations.length], 'office')
  const supportId = supportFor(professionId)
  const idMap = new Map(story.cast.map(id => [id, mapCareerCharacter(id, narrative.cast)]))
  const prefix = `${professionId}:`
  const protagonistDescription = narrative.protagonist.description.charAt(0).toUpperCase() + narrative.protagonist.description.slice(1)
  const introduction = chapterIndex === 0
    ? `В этой профессии ты — ${narrative.protagonist.name}. ${protagonistDescription}. ${narrative.premise}`
    : `${narrative.protagonist.name} продолжает то же дело. ${route?.hook ?? `Команда переходит к этапу «${chapter.stage.title}».`} В этой главе нужно освоить «${story.title}» и применить это к общей задаче.`

  const mappedActs: StoryAct[] = story.acts.map((act, actIndex) => ({
    ...act,
    id: `${prefix}${act.id}`,
    title: replaceCharacterNames(act.title, idMap) ?? act.title,
    // Все акты главы происходят в месте своего этапа. Дальше это место
    // наследуют кадры, и заголовок акта на фон уже не влияет.
    location,
    requiresFlags: act.requiresFlags?.map(flag => `${prefix}${flag}`),
    hiddenByFlags: act.hiddenByFlags?.map(flag => `${prefix}${flag}`),
    beats: [
      ...(actIndex === 0 ? [{ kind: 'comic' as const, panels: [{ scene: 'chapter-open', location, caption: introduction }] }] : []),
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
            // Авторская метка кадра сохраняется: по ней группируются реплики.
            // Затирается только место действия, и то лишь если автор его не назвал.
            location: panel.location ?? location,
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

  const isStageOpening = chapter.courseId === chapter.stage.courseIds[0]
  const stage = chapter.stageIndex
  /**
   * Интерлюдии привязаны к этапу, а не к номеру курса.
   *
   * Раньше они выбирались по индексу курса среди всех курсов профессии: у Data
   * Scientist их больше двадцати, а сценок написано пять, поэтому на четвёртом
   * курсе включалась библиотека, на пятом — хакатон, а дальше не было ничего.
   * Теперь одна сценка приходится на один этап и открывается вместе с ним.
   */
  const openingOfStage = (index: number) => isStageOpening && stage === index

  if (isStageOpening && stage > 0 && route) careerActs.push({
    id: `${prefix}${story.courseId}:route-stage-${stage}`,
    title: chapter.stage.title,
    trigger: { on: 'caseStart' },
    location,
    beats: [
      { kind: 'comic', panels: [{ scene: 'route-open', location, caption: route.hook }] },
      { kind: 'line', speaker: supportId, emotion: 'determined', text: `Это продолжение нашего дела, а не отдельная учебная комната. Осваиваем новый инструмент и сразу применяем его к общей задаче.` },
    ],
  })

  if (openingOfStage(0) && practicalMissionId) {
    careerActs.push({
      id: `${prefix}${story.courseId}:coffee-help`,
      title: 'Перерыв, который стал частью дела',
      trigger: { on: 'beforeMission', missionId: practicalMissionId },
      location: 'cafe',
      beats: [
        { kind: 'comic', panels: [{ scene: 'coffee-break', location: 'cafe', caption: 'Вы выходите за кофе. Ноутбук остаётся открытым: перерыв быстро превращается в маленькую рабочую экспедицию.' }] },
        { kind: 'line', speaker: supportId, emotion: 'worried', text: `У меня сломался рабочий пример перед встречей. Не выбирай ответ за меня — помоги восстановить его в следующем практическом задании.` },
        { kind: 'choice', id: `${prefix}${story.courseId}:help-choice`, prompt: `${support.name} просит не совет, а совместную работу. Что решишь?`, options: [
          { id: 'help', text: 'Разобрать проблему вместе и подтвердить решение кодом или данными.', reply: `Вы договариваетесь: сейчас формулируете гипотезу, а затем проверяете её в рабочей станции. ${support.name} это запомнит.`, trust: { [supportId]: 2 }, flags: [helpFlag], clearFlags: [soloFlag] },
          { id: 'solo', text: 'Сохранить время для своей задачи и работать отдельно.', reply: 'Решение рациональное, но общий контекст останется у каждого свой.', trust: { [supportId]: -1 }, flags: [soloFlag], clearFlags: [helpFlag] },
        ] },
      ],
    })
  }

  if (openingOfStage(1)) {
    careerActs.push({
      id: `${prefix}${story.courseId}:restaurant-break`,
      title: 'Разговор после смены',
      trigger: { on: 'caseStart' },
      location: 'restaurant',
      beats: [
        { kind: 'comic', panels: [{ scene: 'team-dinner', location: 'restaurant', caption: 'Вечером команда садится ужинать. Самый полезный разбор дня начинается не у доски, а между заказом и десертом.' }] },
        { kind: 'line', speaker: supportId, emotion: 'happy', text: 'За столом проще спросить то, что в переговорной кажется глупым. Давай разложим сегодняшний подход на предположение, проверку и вывод.' },
      ],
    })
  }

  if (openingOfStage(2) && practicalMissionId) {
    careerActs.push({
      id: `${prefix}${story.courseId}:returned-help`,
      title: 'Долг из первого этапа',
      trigger: { on: 'beforeMission', missionId: practicalMissionId },
      requiresFlags: [helpFlag],
      location,
      beats: [
        { kind: 'comic', panels: [{ scene: 'debt-returned', location, caption: 'Старый выбор возвращается не репликой, а реальной возможностью: у тебя появляется контекст, которого не было.' }] },
        { kind: 'line', speaker: supportId, emotion: 'determined', text: `Ты тогда помог мне восстановить рабочий пример. Теперь у меня есть недостающий контекст для твоей задачи. Забирай — но результат всё равно придётся доказать в следующей практической миссии.` },
      ],
    }, {
      id: `${prefix}${story.courseId}:no-returned-help`,
      title: 'Контекст приходится собирать заново',
      trigger: { on: 'beforeMission', missionId: practicalMissionId },
      requiresFlags: [soloFlag],
      location,
      beats: [
        { kind: 'comic', panels: [{ scene: 'debt-unpaid', location, caption: 'Выясняется: у команды нет общей истории решения. Перед практической миссией контекст придётся восстановить самостоятельно.' }] },
        { kind: 'line', speaker: supportId, emotion: 'worried', text: 'Мы тогда разошлись каждый в свою задачу. Я не могу подтвердить твои допущения — начни с исходных данных и докажи цепочку самостоятельно.' },
      ],
    })
  }

  if (openingOfStage(3)) careerActs.push({
    id: `${prefix}${story.courseId}:evening-workshop`, title: 'Разбор после смены', trigger: { on: 'caseStart' }, location, beats: [
      { kind: 'comic', panels: [{ scene: 'evening-workshop', location, caption: 'Рабочий день закончился, но команда остаётся на вечерний разбор: здесь новая тема превращается в рабочую схему.' }] },
      { kind: 'line', speaker: supportId, emotion: 'determined', text: 'Не переписывай готовое решение. Сначала объясни его на доске, затем собери самостоятельно в практической части.' },
    ],
  })
  if (openingOfStage(4)) careerActs.push({
    id: `${prefix}${story.courseId}:night-before-demo`, title: 'Ночь до демонстрации', trigger: { on: 'caseStart' }, location, beats: [
      { kind: 'comic', panels: [{ scene: 'night-before-demo', location, caption: 'До показа остаётся ночь. Теория заканчивается быстро: к утру должен работать прототип, который выдержит чужие данные и неудобные вопросы.' }] },
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
    location,
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
  const location = story.location ?? story.career?.location
  const mentorId = story.cast[1] ?? story.cast[0] ?? 'narrator'
  const partnerId = story.cast[0] ?? 'narrator'
  const intro = mission.intro?.trim()
  const context = mission.productionContext?.trim()
  const prompt = mission.task?.prompt?.trim()
  const workspaceFile = mission.task?.workspaceFile
  const objective = mission.objectives?.[0]
  const beats: StoryAct['beats'] = [
    { kind: 'comic', panels: [{ scene: 'episode-brief', location, caption: `Эпизод ${episode} из ${total}. ${mission.title}.` }] },
  ]
  if (intro) beats.push({ kind: 'line', speaker: mentorId, emotion: 'neutral', text: intro })
  if (partnerId !== mentorId) beats.push({ kind: 'line', speaker: partnerId, emotion: 'surprised', text: briefQuestions[(episode - 1) % briefQuestions.length] })
  if (context) beats.push({ kind: 'line', speaker: mentorId, emotion: 'determined', text: context })
  if (objective) beats.push({ kind: 'line', speaker: 'narrator', text: `Цель эпизода: ${objective}.` })
  if (prompt) beats.push({ kind: 'line', speaker: 'narrator', text: workspaceFile ? `Что нужно сделать: ${prompt} Решение пишется в файле ${workspaceFile}.` : `Что нужно сделать: ${prompt}` })
  return { id: `${story.caseId}:brief:${mission.id}`, title: mission.title, trigger: { on: 'beforeMission', missionId: mission.id }, location, beats }
}

/** Сцена, которую можно показать перед эпизодом ещё раз — по кнопке «пересмотреть». */
export function missionSceneForReplay(courseId: string, mission: Mission, episode: number, total: number, professionId?: string) {
  const story = caseForCourse(courseId, professionId)
  if (!story) return undefined
  const authored = story.acts.find(act => act.trigger.on === 'beforeMission' && act.trigger.missionId === mission.id)
  if (authored) return authored
  return missionBriefAct(story, mission, episode, total) ?? story.acts.find(act => act.trigger.on === 'caseStart')
}
