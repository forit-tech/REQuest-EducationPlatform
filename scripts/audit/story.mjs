/**
 * Аудитор сюжета.
 *
 * Держит сюжетную библию маршрута: где мы находимся, кто здесь есть, что уже
 * произошло и какие линии остались открытыми. Каждая следующая глава обязана
 * наследовать это состояние — иначе получается «вчера процесс ядра, сегодня без
 * единого упоминания вчерашнего сразу другое место и другие люди».
 *
 * Проверки построены вокруг четырёх вопросов:
 *   место     — совпадает ли названное в тексте место с тем, что показывает сцена;
 *   память    — помнит ли глава, что была предыдущая;
 *   механика  — доедет ли игрок до концовки, которую мы для него написали;
 *   объём     — есть ли в сцене завязка, развитие и завершение, а не три реплики.
 */
import { spokenBeats, caseText } from './corpus.mjs'
import { finding, contentWords, words } from './findings.mjs'

/**
 * Слова, по которым место действия узнаётся в тексте. Словарь намеренно узкий:
 * «терминал» бывает и в аэропорту, и на складе, и в консоли, поэтому таких слов
 * здесь нет. Ошибочная тревога по фону хуже, чем пропущенная.
 */
const LOCATION_WORDS = {
  // «Библиотека» без уточнения — чаще всего программная, поэтому её здесь нет.
  library: ['читальн', 'библиотечный зал'],
  train: ['поезд', 'вагон', 'купе', 'электричк', 'плацкарт'],
  airport: ['аэропорт', 'посадочн', 'рейс задерж'],
  cafe: ['кофейн', 'бариста'],
  restaurant: ['ресторан'],
  server: ['в серверной', 'серверная стойка', 'машинный зал'],
  lab: ['в лаборатории', 'лабораторный стол'],
  conference: ['конференци', 'доклад со сцены'],
  meeting: ['переговорн'],
  office: ['опенспейс', 'в офисе', 'офисе на'],
  industrial: ['на складе', 'в цеху', 'заводск', 'производственн'],
  coast: ['побережь', 'прибрежн', 'на берегу'],
  hackathon: ['хакатон'],
  backstage: ['закулис', 'за кулисами'],
  trip: ['на вокзале', 'вокзал'],
  operations: ['штаб реагирован', 'дежурн смен'],
}

/** Воспоминание или предположение: место в такой фразе не обязано совпадать с фоном. */
const NOT_HERE = /вчера|когда-то|раньше|в прошлый раз|однажды|представь|если бы|потом поедем|завтра|мечта|дома/i

/** Глава, которая начинается со знакомства, не может быть третьей по счёту. */
const FIRST_MEETING = /меня зовут|будем знакомы|как тебя зовут|первый день|новеньк|добро пожаловать в команду|только что пришл/i

const MIN_ACT_BEATS = 3
const MIN_CASE_WORDS = 350

/**
 * Отпечаток реплики без подставленных частей.
 *
 * Генератор собирает дело из одного скелета и подставляет в него название темы
 * и номера. Если убрать подстановки, реплики семидесяти дел совпадают дословно —
 * и это, а не длина, делает истории взаимозаменяемыми. Проверку на длину можно
 * закрыть, дописав по две строки в каждый акт; эту — только настоящим текстом.
 */
const templateKey = text => String(text ?? '')
  .toLowerCase()
  .replace(/«[^»]*»/g, '«»')
  .replace(/[0-9]+/g, '')
  .replace(/[^а-яё«» ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/** Сколько дел используют одну и ту же реплику. */
function sharedLines(cases) {
  const uses = new Map()
  for (const story of cases) {
    const own = new Set(spokenBeats(story)
      .filter(beat => beat.kind === 'line' || beat.kind === 'panel')
      .map(beat => templateKey(beat.text))
      .filter(key => key.length > 20))
    for (const key of own) uses.set(key, (uses.get(key) ?? 0) + 1)
  }
  return uses
}

export function auditStories(corpus) {
  const out = []

  const lineUses = sharedLines(corpus.cases)
  const SHARED_BY = 5
  const TEMPLATE_SHARE = 0.6

  const routeCourses = new Set(corpus.chapters.map(chapter => chapter.courseId))
  for (const courseId of routeCourses) {
    if (!corpus.caseByCourse.has(courseId)) {
      out.push(finding('A4.case-missing', 'error', courseId,
        'курс входит в маршрут профессии, но не имеет сюжетного дела: глава пропадает из истории'))
    }
  }

  for (const story of corpus.cases) {
    const where = story.courseId
    const beats = spokenBeats(story)
    const chapters = corpus.chaptersByCourse.get(story.courseId) ?? []
    const course = corpus.courseById.get(story.courseId)
    const text = caseText(story)

    /* --------------------------------------------------------- механика */

    const missionIds = new Set((course?.missions ?? []).map(mission => mission.id))
    const triggers = (story.acts ?? []).map(act => act.trigger?.on)
    for (const act of story.acts ?? []) {
      const trigger = act.trigger ?? {}
      if (trigger.missionId && course && !missionIds.has(trigger.missionId)) {
        out.push(finding('A4.trigger-unknown-mission', 'error', `${where}/${act.id}`,
          `акт привязан к миссии ${trigger.missionId}, которой нет в курсе — сцена не покажется никогда`))
      }
      if ((act.beats ?? []).length < 2) {
        out.push(finding('A4.act-too-short', 'error', `${where}/${act.id}`,
          'в акте меньше двух реплик: это не сцена, а подпись под кадром'))
      }
    }
    // Сцены из двух реплик считаются на всё дело: 356 отдельных предупреждений
    // никто не прочитает, а «все акты по две реплики» — это один вывод.
    const thin = (story.acts ?? []).filter(act => (act.beats ?? []).length < MIN_ACT_BEATS).length
    if (thin && thin === (story.acts ?? []).length) {
      out.push(finding('A4.thin-scenes', 'warning', where,
        `все ${thin} актов состоят из двух реплик: диалог не успевает развернуться`))
    }
    if (!triggers.includes('caseStart')) out.push(finding('A4.arc-incomplete', 'error', where, 'у дела нет завязки: акта на caseStart'))
    if (!triggers.some(trigger => trigger === 'beforeMission' || trigger === 'afterMission')) {
      out.push(finding('A4.arc-incomplete', 'error', where, 'сюжет не связан ни с одной миссией: учебная работа идёт отдельно от истории'))
    }
    if (!triggers.some(trigger => trigger === 'afterMission')) {
      out.push(finding('A4.no-reaction', 'warning', where,
        'ни одна сцена не идёт после миссии: история не реагирует на сделанную работу'))
    }

    // Флаги и доверие: доедет ли игрок до написанной концовки.
    const setFlags = new Set()
    const trustCeiling = new Map()
    for (const act of story.acts ?? []) {
      for (const beat of act.beats ?? []) {
        if (beat.kind !== 'choice') continue
        const best = new Map()
        for (const option of beat.options ?? []) {
          for (const flag of option.flags ?? []) setFlags.add(flag)
          for (const [castId, value] of Object.entries(option.trust ?? {})) {
            if (value > 0) best.set(castId, Math.max(best.get(castId) ?? 0, value))
          }
        }
        for (const [castId, value] of best) trustCeiling.set(castId, (trustCeiling.get(castId) ?? 0) + value)
      }
    }
    const usedFlags = new Set()
    for (const act of story.acts ?? []) {
      for (const flag of [...(act.requiresFlags ?? []), ...(act.hiddenByFlags ?? [])]) usedFlags.add(flag)
    }
    for (const ending of story.endings ?? []) {
      for (const flag of ending.requiresFlags ?? []) {
        usedFlags.add(flag)
        if (!setFlags.has(flag)) {
          out.push(finding('A4.ending-unreachable', 'error', `${where}/${ending.id}`,
            `концовка требует флаг «${flag}», который не выдаётся ни одним выбором`))
        }
      }
      for (const [castId, needed] of Object.entries(ending.minTrust ?? {})) {
        const ceiling = trustCeiling.get(castId) ?? 0
        if (ceiling < needed) {
          out.push(finding('A4.ending-unreachable', 'error', `${where}/${ending.id}`,
            `концовка требует доверия ${castId} ≥ ${needed}, а максимум по всем выборам — ${ceiling}`))
        }
      }
    }
    for (const flag of setFlags) {
      if (!usedFlags.has(flag)) {
        out.push(finding('A4.flag-dangling', 'warning', where,
          `выбор выставляет флаг «${flag}», но его никто не читает: решение игрока ни на что не влияет`))
      }
    }

    /* ------------------------------------------------------------ место */

    const allowed = new Set(chapters.map(chapter => chapter.location))
    if (!chapters.length && !story.location) {
      out.push(finding('A4.location-unset', 'warning', where,
        'дело не входит в маршрут и не объявляет место действия: сцена покажет офис, что бы ни было в тексте'))
    }
    if (story.location) allowed.add(story.location)
    for (const beat of beats) {
      const local = beat.location ? new Set([beat.location]) : allowed
      if (!local.size) continue
      const lower = beat.text.toLowerCase()
      for (const [location, markers] of Object.entries(LOCATION_WORDS)) {
        if (local.has(location)) continue
        const marker = markers.find(item => lower.includes(item))
        if (!marker || NOT_HERE.test(beat.text)) continue
        out.push(finding('A4.location-contradiction', 'warning', `${where}/${beat.actId}#${beat.beatIndex}`,
          `текст называет место «${location}» (по слову «${marker}»), а сцена показывает ${[...local].join(' или ')}`, beat.text))
      }
    }

    /* ----------------------------------------------------------- память */

    const chapterNumbers = chapters.map(chapter => chapter.chapterIndex)
    const alwaysLater = chapterNumbers.length > 0 && Math.min(...chapterNumbers) > 0
    if (alwaysLater) {
      const meeting = beats.find(beat => FIRST_MEETING.test(beat.text))
      if (meeting) {
        out.push(finding('A4.reintroduction', 'error', `${where}/${meeting.actId}#${meeting.beatIndex}`,
          `глава идёт ${Math.min(...chapterNumbers) + 1}-й по маршруту, но начинается со знакомства с командой`, meeting.text))
      }
    }

    /* ------------------------------------------------------------ объём */

    const own = spokenBeats(story)
      .filter(beat => beat.kind === 'line' || beat.kind === 'panel')
      .map(beat => templateKey(beat.text))
      .filter(key => key.length > 20)
    const borrowed = own.filter(key => (lineUses.get(key) ?? 0) >= SHARED_BY)
    if (own.length && borrowed.length / own.length > TEMPLATE_SHARE) {
      out.push(finding('A4.template-story', 'warning', where,
        `${borrowed.length} реплик из ${own.length} дословно повторяются ещё в нескольких делах: это заготовка с подставленной темой, а не история`,
        beats.find(beat => borrowed.includes(templateKey(beat.text)))?.text))
    }

    const volume = words(text)
    if (volume < MIN_CASE_WORDS) {
      out.push(finding('A4.case-too-short', 'warning', where,
        `в деле ${volume} слов: этого мало на завязку, развитие и финал (норма от ${MIN_CASE_WORDS})`))
    }

    /* -------------------------------------------- связь истории и темы */

    if (course) {
      const topic = contentWords([course.title, ...(course.skills ?? [])].join(' '))
      const body = contentWords(text)
      const shared = [...topic].filter(word => body.has(word))
      if (topic.size && !shared.length) {
        out.push(finding('A4.topic-disconnected', 'warning', where,
          `история ни разу не касается темы курса «${course.title}»: учебная работа и сюжет живут отдельно`))
      }
    }

    /* ------------------------------------------------ связность диалога */

    const speech = beats.filter(beat => beat.kind === 'line')
    let broken = 0
    for (let index = 1; index < speech.length; index += 1) {
      const previous = speech[index - 1]
      const current = speech[index]
      const sameAct = previous.actId === current.actId
      if (!sameAct || previous.speaker === current.speaker) { broken = 0; continue }
      const before = contentWords(previous.text)
      const after = contentWords(current.text)
      const answers = [...after].some(word => before.has(word)) || /[?!]/.test(previous.text)
      broken = answers ? 0 : broken + 1
      if (broken >= 3) {
        out.push(finding('A4.dialogue-disconnected', 'info', `${where}/${current.actId}#${current.beatIndex}`,
          'три реплики подряд не отвечают друг другу: персонажи говорят каждый о своём', current.text))
        broken = 0
      }
    }
  }

  /* ---------------------------------------------- словарь мест в данных */

  for (const narrative of corpus.narratives) {
    for (const location of narrative.locations ?? []) {
      if (corpus.locationIds.includes(location)) continue
      const canonical = corpus.locationAliases[location]
      out.push(finding(canonical ? 'A4.legacy-location' : 'A4.unknown-location', canonical ? 'warning' : 'error',
        narrative.professionId,
        canonical
          ? `место «${location}» записано старым именем: движок читает его как «${canonical}»`
          : `место «${location}» отсутствует в словаре: сцена покажет офис`))
    }
  }

  return out
}
