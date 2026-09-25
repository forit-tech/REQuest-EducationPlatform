/**
 * Аудитор персонажей.
 *
 * Проверяет, что герой остаётся собой: говорит о себе в своём роде, называется
 * своим именем, появляется в составе дела и не превращается в набор из двух
 * эмоций на всю главу.
 *
 * Отдельный сюжет здесь — сквозная новелла. Один и тот же текст дела играется в
 * разных профессиях, и вместо авторского героя выходит тот, кто есть в команде
 * профессии. Правила замены аудит не пересказывает, а импортирует из собранного
 * движка (src/story/casting.ts): проверка обязана видеть ровно то, что увидит
 * игрок. Когда замена невозможна, отказ показывается адресом сцены — раньше на
 * его месте молча подставлялся первый попавшийся герой.
 */
import { spokenBeats, playerFacingText } from './corpus.mjs'
import { castCharacter, refusalReason } from './contracts.mjs'
import { finding, genderSlip, playerGender } from './findings.mjs'

const at = beat => `${beat.courseId}/${beat.actId}#${beat.beatIndex}${beat.panelIndex === undefined ? '' : '.' + beat.panelIndex}`

/** Реплики, которые персонаж произносит от своего лица. Выборы и уведомления — не его речь. */
const isSpeech = beat => beat.kind === 'line' || beat.kind === 'panel'

export function auditCharacters(corpus) {
  const out = []
  const genderOf = id => corpus.castById.get(id)?.gender
  const named = corpus.cast.filter(member => member.name && member.gender !== 'neutral')

  const minCast = corpus.casting.minCastPerProfession ?? 0
  for (const narrative of corpus.narratives) {
    if (!narrative.protagonist?.gender) {
      out.push(finding('A1.protagonist-gender-missing', 'error', narrative.professionId,
        'у главного героя профессии не указан род — проверить обращения к игроку невозможно'))
    }
    // Состав из трёх человек не закрывает ни роли, ни пол: женскую напарницу в
    // мужской команде заменить некем, и кастинг честно отказывает. Порог снимает
    // не правка кода, а живые персонажи.
    const team = narrative.cast ?? []
    if (minCast && team.length < minCast) {
      const genders = new Set(team.map(id => corpus.castById.get(id)?.gender))
      const archetypes = new Set(team.map(id => corpus.castById.get(id)?.archetype))
      out.push(finding('A1.cast-too-small', 'error', narrative.professionId,
        `в составе профессии ${team.length} персонаж${team.length === 1 ? '' : 'ей'} из ${minCast}: ${genders.size} род(а) и ${archetypes.size} сюжетн(ых) рол(и) — заменить авторского героя чаще всего некем`))
    }
  }

  /* --------------------------------------------- профессии, играющие дело */

  const professionsByCourse = new Map()
  for (const chapter of corpus.chapters) {
    if (!professionsByCourse.has(chapter.courseId)) professionsByCourse.set(chapter.courseId, [])
    professionsByCourse.get(chapter.courseId).push(chapter)
  }

  for (const story of corpus.cases) {
    const beats = spokenBeats(story)
    const cast = new Set(story.cast ?? [])

    /**
     * Обращение к игроку. Героя выбирает профессия, и род у героев разный:
     * одна и та же глава достаётся и Дарье, и Тимуру.
     */
    const checkPlayerGender = (where, text) => {
      const player = playerGender(text)
      if (!player) return
      const chapters = professionsByCourse.get(story.courseId) ?? []
      const genders = new Set(chapters.map(chapter => chapter.protagonist?.gender).filter(Boolean))
      if (!chapters.length) {
        out.push(finding('A1.player-gender', 'warning', where,
          `к игроку обращаются в ${player.gender === 'female' ? 'женском' : 'мужском'} роде («${player.word}»), а дело не привязано ни к одной профессии`, text))
      } else if (genders.size > 1 || !genders.has(player.gender)) {
        const names = [...new Set(chapters.map(chapter => `${chapter.protagonist?.name} (${chapter.professionId})`))]
        out.push(finding('A1.player-gender', 'error', where,
          `к игроку обращаются в ${player.gender === 'female' ? 'женском' : 'мужском'} роде («${player.word}»), но эту главу играют: ${names.join(', ')}`, text))
      }
    }
    const emotionsByCharacter = new Map()
    const linesByCharacter = new Map()

    for (const beat of beats) {
      const where = at(beat)

      if (beat.speaker !== undefined) {
        if (!corpus.castById.has(beat.speaker)) {
          out.push(finding('A1.unknown-speaker', 'error', where, `реплику произносит неизвестный персонаж: ${beat.speaker}`, beat.text))
        } else if (beat.speaker !== 'narrator' && !cast.has(beat.speaker)) {
          out.push(finding('A1.speaker-not-in-cast', 'error', where, `${beat.speaker} говорит, но не заявлен в составе дела`, beat.text))
        }
      }

      if (beat.emotion && !corpus.emotions.includes(beat.emotion)) {
        out.push(finding('A1.unknown-emotion', 'error', where, `эмоция «${beat.emotion}» не существует в сцене`, beat.text))
      }

      if (isSpeech(beat) && beat.speaker && beat.speaker !== 'narrator') {
        linesByCharacter.set(beat.speaker, (linesByCharacter.get(beat.speaker) ?? 0) + 1)
        if (beat.emotion) {
          if (!emotionsByCharacter.has(beat.speaker)) emotionsByCharacter.set(beat.speaker, new Set())
          emotionsByCharacter.get(beat.speaker).add(beat.emotion)
        }

        // Речь от первого лица: род говорящего.
        const slip = genderSlip(beat.text, ['я'], genderOf(beat.speaker))
        if (slip) {
          out.push(finding('A1.self-gender', 'error', where,
            `${corpus.castById.get(beat.speaker)?.name ?? beat.speaker} говорит о себе в чужом роде: «${slip.word}»`, beat.text))
        }
      }

      // Речь о третьем лице: «Мира кивнул».
      for (const member of named) {
        if (!beat.text?.includes(member.name)) continue
        const slip = genderSlip(beat.text, [member.name], member.gender, { requireCapital: true })
        if (slip) {
          out.push(finding('A1.named-gender', 'error', where,
            `о персонаже ${member.name} сказано в чужом роде: «${slip.word}»`, beat.text))
        }
        if (!cast.has(member.id) && beat.speaker !== member.id) {
          out.push(finding('A1.unlisted-mention', 'warning', where,
            `упомянут ${member.name}, которого нет в составе дела`, beat.text))
        }
      }

      checkPlayerGender(where, beat.text)
    }

    for (const item of playerFacingText(story)) checkPlayerGender(item.where, item.text)

    for (const castId of cast) {
      if (castId === 'narrator') continue
      if (!linesByCharacter.has(castId)) {
        out.push(finding('A1.silent-cast', 'warning', story.courseId,
          `${corpus.castById.get(castId)?.name ?? castId} заявлен в составе дела, но не произносит ни одной реплики`))
      }
    }

    // Одна эмоция на всю главу — это не характер, а статичный портрет.
    for (const [castId, count] of linesByCharacter) {
      if (count < 6) continue
      const palette = emotionsByCharacter.get(castId) ?? new Set()
      if (palette.size <= 2) {
        out.push(finding('A1.emotion-flat', 'warning', story.courseId,
          `${corpus.castById.get(castId)?.name ?? castId}: ${count} реплик и всего ${palette.size} эмоц${palette.size === 1 ? 'ия' : 'ии'} (${[...palette].join(', ') || 'ни одной'})`))
      }
    }

    /* ------------------------------------- подстановка героев в профессиях */

    for (const chapter of professionsByCourse.get(story.courseId) ?? []) {
      // Два героя дела могут получить одного и того же исполнителя: роли разные,
      // а подходящий человек в команде один. На экране это не замена, а склейка —
      // персонаж задаёт вопрос и сам на него отвечает.
      const takenBy = new Map()
      for (const sourceId of story.cast ?? []) {
        if (sourceId === 'narrator') continue
        const result = castCharacter(sourceId, chapter.teamIds, corpus.castingBook)
        const targetId = result.ok ? result.id : sourceId
        if (!takenBy.has(targetId)) takenBy.set(targetId, [])
        takenBy.get(targetId).push(sourceId)
      }
      for (const [targetId, sources] of takenBy) {
        if (sources.length < 2) continue
        const names = sources.map(id => corpus.castById.get(id)?.name ?? id)
        const scene = beats.find(beat => isSpeech(beat) && sources.includes(beat.speaker))
        out.push(finding('A1.recast-collision', 'error',
          scene ? `${chapter.professionId}/${at(scene)}` : `${chapter.professionId}/${story.courseId}`,
          `в профессии ${chapter.professionId} ${names.join(' и ')} выходят одним человеком (${corpus.castById.get(targetId)?.name ?? targetId}): их диалог превращается в разговор с собой`,
          scene?.text))
      }

      for (const sourceId of story.cast ?? []) {
        if (sourceId === 'narrator') continue
        const source = corpus.castById.get(sourceId)
        const result = castCharacter(sourceId, chapter.teamIds, corpus.castingBook)

        if (!result.ok) {
          // Отказ кастинга — это не абстракция: в этой сцене на экране останется
          // герой, которого в команде профессии нет. Поэтому в отчёте адрес
          // сцены, миссия и весь доступный состав, а не одно имя.
          const actById = new Map((story.acts ?? []).map(item => [item.id, item]))
          const spoken = beats.filter(beat => isSpeech(beat) && beat.speaker === sourceId)
          // Сцену для адреса берём ту, что привязана к миссии: так находка ведёт
          // прямо в учебный шаг, а не в общий пролог дела.
          const scene = spoken.find(beat => actById.get(beat.actId)?.trigger?.missionId) ?? spoken[0]
          const mission = actById.get(scene?.actId)?.trigger?.missionId
          const team = result.candidates.map(member => `${member.name ?? member.id} (${member.gender}, ${member.archetype})`)
          out.push(finding('A1.no-compatible-cast', 'error',
            scene ? `${chapter.professionId}/${at(scene)}` : `${chapter.professionId}/${story.courseId}`,
            `${source?.name ?? sourceId} (${source?.gender}, ${source?.archetype}) остаётся в главе профессии ${chapter.professionId}: ${refusalReason(result, source)}`
            + `${mission ? `; миссия ${mission}` : ''}; доступный состав: ${team.join(', ') || 'пусто'}`,
            scene?.text))
          continue
        }
        if (result.kept) continue

        // Замена состоялась. Правила кастинга обещают совпадение рода —
        // проверка ниже сторожит само обещание, а не текст.
        const target = corpus.castById.get(result.id)
        if (source && target && source.gender !== target.gender) {
          for (const beat of beats) {
            if (!isSpeech(beat) || beat.speaker !== sourceId) continue
            const slip = genderSlip(beat.text, ['я'], target.gender)
            if (!slip) continue
            out.push(finding('A1.recast-gender-line', 'error', at(beat),
              `в профессии ${chapter.professionId} эту реплику произносит ${target.name}, и она звучит в чужом роде: «${slip.word}»`, beat.text))
          }
        }
      }
    }
  }

  return out
}
