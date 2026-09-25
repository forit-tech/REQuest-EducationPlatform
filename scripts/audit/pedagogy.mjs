/**
 * Аудитор педагогики.
 *
 * Курс проверяется как граф зависимостей, а не как список красиво написанных
 * глав. Главный вопрос один: к моменту, когда человека просят что-то сделать,
 * было ли это объяснено — и объяснено ли именно здесь, а не «где-то в другом
 * маршруте».
 *
 * Порядок выдачи знаний считается по маршруту профессии: курс сам по себе не
 * знает, что было до него. Реестр навыков (knowledge/skills-registry.json)
 * говорит, где каждая конструкция вводится, а проверки задания показывают, что
 * от человека требуют на самом деле.
 */
import { finding, overlap, words } from './findings.mjs'

const DIFFICULTY_ORDER = ['основа', 'начальный', 'средний', 'продвинутый']

/** Причинные связки: по ним видно, что разбор объясняет, а не пересказывает условие. */
const CAUSAL = /потому что|так как|поэтому|значит|иначе|причина|за счёт|из-за|благодаря|именно поэтому/i

/** Совпадение по границе слова: «print(» не должно считаться использованием «int(». */
const usesToken = (fragment, token) => {
  if (!/^[A-Za-z0-9_]/.test(token)) return fragment.includes(token)
  let from = 0
  for (;;) {
    const at = fragment.indexOf(token, from)
    if (at === -1) return false
    if (at === 0 || !/[A-Za-z0-9_]/.test(fragment[at - 1])) return true
    from = at + 1
  }
}

const extensionOf = file => (file ?? '').slice((file ?? '').lastIndexOf('.'))

export function auditPedagogy(corpus) {
  const out = []
  const registry = corpus.skillsRegistry
  const byExtension = registry.languageByExtension ?? {}
  const extraLanguages = registry.extraLanguagesByExtension ?? {}

  const languagesOf = (mission, course) => {
    const primary = byExtension[extensionOf(mission.task?.workspaceFile)] ?? mission.language ?? course?.technology
    if (!primary) return []
    return [primary, ...(extraLanguages[extensionOf(mission.task?.workspaceFile)] ?? [])]
  }
  const skillsIn = (fragment, languages) => registry.skills.filter(skill =>
    languages.includes(skill.language) && skill.detect.some(token => usesToken(fragment, token)))

  /* -------------------------------------- порядок выдачи знаний по маршруту */

  const gapsByMission = new Map()
  for (const program of corpus.professionPrograms) {
    const route = (program.stages ?? []).flatMap(stage => stage.courseIds ?? [])
    const sequence = []
    for (const courseId of route) {
      const course = corpus.courseById.get(courseId)
      if (!course) continue
      for (const mission of course.missions ?? []) sequence.push({ courseId, course, mission })
    }
    const introducedAt = new Map()
    sequence.forEach(({ courseId, mission }, index) => {
      for (const skill of registry.skills) {
        if (introducedAt.has(skill.id)) continue
        if (skill.introducedIn.course === courseId && skill.introducedIn.mission === mission.id) introducedAt.set(skill.id, index)
      }
    })
    sequence.forEach(({ courseId, course, mission }, index) => {
      const languages = languagesOf(mission, course)
      if (!languages.length) return
      const required = new Set()
      for (const check of mission.task?.codeChecks ?? []) for (const skill of skillsIn(check.includes ?? '', languages)) required.add(skill.id)
      for (const skillId of required) {
        const introduced = introducedAt.get(skillId)
        if (introduced !== undefined && introduced <= index) continue
        const skill = corpus.skillById.get(skillId)
        const key = `${courseId}/${mission.id}/${skillId}`
        if (!gapsByMission.has(key)) gapsByMission.set(key, { courseId, mission, skill, professions: [], introduced, index })
        gapsByMission.get(key).professions.push(program.professionId)
      }
    })
  }

  for (const gap of gapsByMission.values()) {
    const explanation = gap.introduced === undefined
      ? `навык нигде не вводится в маршрут${gap.professions.length > 1 ? 'ах' : 'е'} ${gap.professions.join(', ')}`
      : `навык вводится позже: позиция ${gap.introduced + 1} против ${gap.index + 1} в маршруте ${gap.professions[0]}`
    out.push(finding('A3.unexplained-construct', 'error', `${gap.courseId}/${gap.mission.id}`,
      `задание требует «${gap.skill.title}», но ${explanation}`))
  }

  /* --------------------------------------------------- зависимости курсов */

  const courseOfSkill = new Map(registry.skills.map(skill => [skill.id, skill.introducedIn.course]))
  for (const course of corpus.courses) {
    const declared = new Set(corpus.prerequisitesByCourse.get(course.id) ?? [])
    const needed = new Set()
    for (const mission of course.missions ?? []) {
      const languages = languagesOf(mission, course)
      if (!languages.length) continue
      for (const check of mission.task?.codeChecks ?? []) {
        for (const skill of skillsIn(check.includes ?? '', languages)) {
          const source = courseOfSkill.get(skill.id)
          if (source && source !== course.id) needed.add(source)
        }
      }
    }
    for (const source of needed) {
      if (declared.has(source)) continue
      // Курс опирается на конструкции чужого курса, но не объявляет его входом:
      // человек может открыть его первым и упереться в незнакомый синтаксис.
      out.push(finding('A3.missing-prerequisite', 'warning', course.id,
        `курс использует конструкции из «${source}», но не объявляет его в prerequisites`))
    }
  }

  /* ------------------------------------------------- разбор и постепенность */

  for (const course of corpus.courses) {
    const missions = course.missions ?? []
    // Где внутри курса вводится каждый навык: по этому порядку человек и идёт.
    const introducedInCourse = new Map()
    missions.forEach((mission, index) => {
      for (const skill of registry.skills) {
        if (skill.introducedIn.course === course.id && skill.introducedIn.mission === mission.id) introducedInCourse.set(skill.id, index)
      }
    })
    let peak = 0
    missions.forEach((mission, index) => {
      const where = `${course.id}/${mission.id}`
      const task = mission.task ?? {}

      // Разбор, который дословно повторяет вводный текст, ничего не добавляет к
      // попытке: человек уже прочитал эти предложения до задания.
      const context = [mission.intro, mission.productionContext].filter(Boolean).join(' ')
      if (task.explanation && context && overlap(task.explanation, context) > 0.75) {
        out.push(finding('A3.explanation-restates', 'warning', where,
          'разбор повторяет вводный текст миссии, а не объясняет, почему ответ верный', task.explanation))
      } else if (task.explanation && words(task.explanation) < 18 && !CAUSAL.test(task.explanation)) {
        out.push(finding('A3.explanation-thin', 'warning', where,
          'разбор короче двух предложений и не содержит причины: ошибка ничему не научит', task.explanation))
      }

      // Конструкция, урок которой стоит дальше по этому же курсу. Маршрут
      // профессии тут не поможет: человек внутри курса идёт по порядку и
      // упирается в синтаксис, который ему объяснят через три миссии.
      const languages = languagesOf(mission, course)
      for (const check of task.codeChecks ?? []) {
        const fragment = check.includes ?? ''
        for (const skill of skillsIn(fragment, languages)) {
          const lesson = introducedInCourse.get(skill.id)
          if (lesson === undefined || lesson <= index) continue
          out.push(finding('A3.construct-before-lesson', 'error', where,
            `проверка «${check.label ?? fragment}» требует «${skill.title}», а его урок идёт ${lesson + 1}-м в этом же курсе`))
        }
      }

      // Практика без единого показанного примера.
      if ((task.codeChecks ?? []).length && !task.starterCode && !/\n/.test(String(task.answer ?? ''))) {
        out.push(finding('A3.no-worked-example', 'warning', where,
          'кодовое задание без стартового файла: человеку не с чего начать'))
      }

      const rank = DIFFICULTY_ORDER.indexOf(mission.difficulty)
      if (rank >= 0) {
        if (rank + 1 < peak) {
          out.push(finding('A3.difficulty-drop', 'info', where,
            `сложность падает с «${DIFFICULTY_ORDER[peak]}» до «${mission.difficulty}» на ${index + 1}-й миссии курса`))
        }
        peak = Math.max(peak, rank)
      }
    })

    if (!corpus.chaptersByCourse.has(course.id)) {
      out.push(finding('A3.course-outside-route', 'info', course.id,
        'курс не входит ни в один маршрут профессии: порядок выдачи знаний для него не проверяется'))
    }
  }

  return out
}
