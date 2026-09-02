/**
 * Правила качества учебного контента.
 *
 * Каждое правило — чистая функция над корпусом, возвращающая находки. Уровни:
 *
 *   error   — контент невалиден, сборка не должна проходить;
 *   warning — подозрительно, нужен человеческий просмотр;
 *   info    — метрика, ничего не блокирует.
 *
 * Уровень выбирается по одному признаку: можно ли доказать нарушение
 * детерминированно. «Ответ дословно лежит в тексте перед вопросом» доказуемо и
 * потому error. «Формулировка похожа на пересказ» — эвристика и потому warning:
 * блокировать сборку недоказуемым нельзя.
 */
import { SCOPE, jaccard, normalize, sentences } from './corpus.mjs'

/**
 * Дефекты целостности. Их нельзя занести в базовую линию и оставить жить:
 * это не стилистический долг, а поломка. Совпадающие идентификаторы миссий
 * заставляют прогресс засчитываться не тому заданию, заготовка, которая уже
 * решает задачу, отменяет саму задачу, битая ссылка ломает граф.
 */
export const INTEGRITY_RULES = new Set([
  'C1.duplicate-id',
  'C1.dangling-skill',
  'C1.skill-cycle',
  'C1.unknown-skill',
  'C1.unknown-prerequisite',
  'C1.unknown-admission-ref',
  'C1.evaluator-mismatch',
  'C1.environment-mismatch',
  'C2.starter-already-passes',
  'C4.answer-not-in-options',
  'C5.starter-already-passes',
  'C8.professional-claims-admission',
])

const finding = (rule, severity, scope, where, message, sample) => ({ rule, severity, scope, where, message, sample })

/* ------------------------------------------------- C1. структурные проверки */

function structural(corpus, engine) {
  const out = []

  const missionIds = new Map()
  for (const { course, mission } of corpus.legacyMissions) {
    const seen = missionIds.get(mission.id)
    if (seen) out.push(finding('C1.duplicate-id', 'error', SCOPE.LEGACY, mission.id, `Идентификатор миссии повторяется: ${seen} и ${course.id}`))
    else missionIds.set(mission.id, course.id)

    if (!mission.task) continue
    if (!String(mission.task.prompt ?? '').trim()) out.push(finding('C1.empty-prompt', 'error', SCOPE.LEGACY, mission.id, 'Пустая формулировка задания'))
    if (!String(mission.task.explanation ?? '').trim()) out.push(finding('C1.missing-explanation', 'error', SCOPE.LEGACY, mission.id, 'Нет разбора: ошибка ничему не учит'))
  }

  const courseIds = new Set()
  for (const course of corpus.courses) {
    if (courseIds.has(course.id)) out.push(finding('C1.duplicate-id', 'error', SCOPE.LEGACY, course.id, 'Идентификатор курса повторяется'))
    courseIds.add(course.id)
    if (!(course.missions ?? []).length) out.push(finding('C1.empty-course', 'error', SCOPE.LEGACY, course.id, 'Курс без миссий'))
  }

  // Граф навыков: висячие ссылки и циклы.
  for (const skill of corpus.skills) {
    for (const id of skill.prerequisites ?? []) {
      if (!corpus.skillById[id]) out.push(finding('C1.dangling-skill', 'error', SCOPE.PRODUCTION, skill.id, `Предпосылка не найдена в реестре: ${id}`))
    }
  }
  const graph = engine.skillGraph(corpus.skills)
  for (const skill of corpus.skills) {
    if (engine.prerequisiteChain(graph, skill.id).includes(skill.id)) {
      out.push(finding('C1.skill-cycle', 'error', SCOPE.PRODUCTION, skill.id, 'Цикл в графе навыков'))
    }
  }

  // Задания новой модели проверяются границей схемы движка.
  for (const { path, task, scope } of corpus.v2Tasks) {
    for (const problem of engine.validateTask(task, { skills: graph, admissionRefs: corpus.requirementRefs })) {
      out.push(finding(`C1.${problem.code}`, problem.severity, scope, `${task.id} (${path})`, problem.message))
    }
    // Сочетание формы ответа и способа проверки должно быть осмысленным.
    const compatible = {
      choice: ['choice'], numeric: ['numeric'], expression: ['symbolic'], text: ['text', 'rubric'],
      ordering: ['ordering'], matching: ['matching'], code: ['program', 'legacy-substring'],
      form: ['form'], composite: ['composite'],
    }
    const allowed = compatible[task.response.kind] ?? []
    if (!allowed.includes(task.evaluation.type)) {
      out.push(finding('C1.evaluator-mismatch', 'error', scope, task.id, `Проверка «${task.evaluation.type}» не подходит форме ответа «${task.response.kind}»`))
    }
    // Окружение не должно обещать редактор там, где кода нет.
    const resolved = engine.resolveEnvironment({ ...task, environment: undefined })
    if (task.environment && task.environment !== resolved && task.environment !== 'none') {
      const needsCode = task.environment.includes('editor')
      if (needsCode && !resolved.includes('editor')) {
        out.push(finding('C1.environment-mismatch', 'error', scope, task.id, `Заявлено окружение «${task.environment}», но кода в задании нет`))
      }
    }
    if (task.intent === 'exam' || task.intent === 'oral-exam') {
      if (!(task.sources ?? []).length) out.push(finding('C1.missing-source', 'warning', scope, task.id, 'Экзаменационное задание без ссылки на источник'))
    }
  }

  return out
}

/* --------------------------------------------------- C2. подсказанный ответ */

function answerLeakage(corpus, engine) {
  const out = []
  for (const { course, mission } of corpus.legacyMissions) {
    const task = mission.task
    if (!task) continue
    const before = `${mission.intro ?? ''} ${mission.productionContext ?? ''}`
    const answer = String(task.answer ?? '').trim()
    const where = `${course.id}/${mission.id}`

    if (answer.length > 12 && before.includes(answer)) {
      out.push(finding('C2.exact-answer-in-theory', 'error', SCOPE.LEGACY, where, 'Ответ дословно лежит в тексте перед вопросом', answer.slice(0, 90)))
    } else if (answer.length > 12 && normalize(before).includes(normalize(answer))) {
      out.push(finding('C2.normalized-answer-in-theory', 'error', SCOPE.LEGACY, where, 'Ответ лежит в тексте перед вопросом с точностью до оформления', answer.slice(0, 90)))
    } else if (answer.length > 12) {
      // Пересказ доказать нельзя, поэтому только предупреждение.
      const closest = sentences(before).reduce((best, sentence) => Math.max(best, jaccard(sentence, answer)), 0)
      if (closest >= 0.7) {
        out.push(finding('C2.paraphrased-answer', 'warning', SCOPE.LEGACY, where, `Формулировка ответа почти повторяет предложение из теории (совпадение ${closest.toFixed(2)})`, answer.slice(0, 90)))
      }
    }

    // Решение уже лежит в заготовке кода: писать нечего.
    const checks = task.codeChecks ?? []
    const starter = task.starterCode ?? ''
    if (checks.length && checks.every(check => engine.passesCodeCheck(starter, check.includes))) {
      out.push(finding('C2.starter-already-passes', 'error', SCOPE.LEGACY, where, 'Заготовка кода уже проходит все проверки задания'))
    } else {
      // Отдельная, более мягкая метрика: часть обязательных фрагментов уже
      // лежит в заготовке. Задание при этом решаемо, но проверка ослаблена.
      const free = checks.filter(check => engine.passesCodeCheck(starter, check.includes))
      if (free.length) {
        out.push(finding('C2.free-check', 'warning', SCOPE.LEGACY, where,
          `${free.length} из ${checks.length} проверок выполнены заготовкой заранее`, free.map(check => check.label).join('; ')))
      }
    }
  }

  for (const { task, scope } of corpus.v2Tasks) {
    const before = `${task.prompt ?? ''} ${(task.instructions ?? []).join(' ')}`
    if (task.response.kind === 'choice' && task.evaluation.type === 'choice') {
      for (const id of task.evaluation.correct ?? []) {
        const option = task.response.options.find(item => item.id === id)
        if (option && option.text.length > 12 && normalize(before).includes(normalize(option.text))) {
          out.push(finding('C2.exact-answer-in-theory', 'error', scope, task.id, 'Верный вариант дословно повторяет текст задания', option.text.slice(0, 90)))
        }
      }
    }
  }
  return out
}

/* -------------------------------------------------------- C3. повторы */

function duplicates(corpus) {
  const out = []
  const byPrompt = new Map()
  const byNormalized = new Map()
  const byIntro = new Map()
  const optionSets = new Map()

  for (const { course, mission } of corpus.legacyMissions) {
    const task = mission.task
    if (!task) continue
    const where = `${course.id}/${mission.id}`
    const prompt = String(task.prompt ?? '').trim()
    if (prompt) {
      byPrompt.set(prompt, [...(byPrompt.get(prompt) ?? []), where])
      const key = normalize(prompt)
      byNormalized.set(key, [...(byNormalized.get(key) ?? []), where])
    }
    const intro = String(mission.intro ?? '').trim()
    if (intro.length > 40) byIntro.set(intro, [...(byIntro.get(intro) ?? []), where])
    if ((task.options ?? []).length) {
      const key = task.options.map(normalize).sort().join('|')
      optionSets.set(key, [...(optionSets.get(key) ?? []), where])
    }
  }

  let affectedByDuplicates = 0
  for (const [prompt, places] of byPrompt) {
    if (places.length > 1) {
      affectedByDuplicates += places.length
      out.push(finding('C3.duplicate-prompt', 'error', SCOPE.LEGACY, places[0], `Формулировка повторяется ${places.length} раз`, prompt.slice(0, 90)))
    }
  }
  // Два разных числа про одно и то же: сколько формулировок продублировано и
  // сколько заданий этим затронуто. В отчётах путать их нельзя.
  out.push(finding('C3.duplicate-reach', 'info', SCOPE.LEGACY, 'все курсы',
    `Продублированных формулировок ${[...byPrompt.values()].filter(places => places.length > 1).length}, затронуто заданий ${affectedByDuplicates}`))
  for (const [, places] of byNormalized) {
    if (places.length > 1 && !out.some(item => item.where === places[0] && item.rule === 'C3.duplicate-prompt')) {
      out.push(finding('C3.near-duplicate-prompt', 'warning', SCOPE.LEGACY, places[0], `Формулировка повторяется ${places.length} раз с точностью до оформления`))
    }
  }
  for (const [, places] of byIntro) {
    if (places.length > 1) out.push(finding('C3.duplicate-intro', 'warning', SCOPE.LEGACY, places[0], `Вступление повторяется ${places.length} раз`))
  }
  for (const [, places] of optionSets) {
    if (places.length > 1) out.push(finding('C3.duplicate-options', 'warning', SCOPE.LEGACY, places[0], `Набор вариантов ответа повторяется ${places.length} раз`))
  }

  // Шаблонность курса: доля миссий, чьи заголовки построены по одной схеме.
  for (const course of corpus.courses) {
    const missions = course.missions ?? []
    if (missions.length < 6) continue
    const shapes = new Map()
    for (const mission of missions) {
      const shape = normalize(mission.title).split(' ').slice(0, 1).join(' ')
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1)
    }
    const repeated = [...shapes.values()].filter(count => count > 1).reduce((sum, count) => sum + count, 0)
    const ratio = repeated / missions.length
    if (ratio >= 0.8) {
      out.push(finding('C3.template-course', 'info', SCOPE.LEGACY, course.id, `Курс собран по шаблону: ${(ratio * 100).toFixed(0)}% заголовков повторяют схему`))
    }
  }
  return out
}

/* ------------------------------------------- C4. качество выбора из вариантов */

function multipleChoice(corpus) {
  const out = []
  const optionCounts = new Map()
  const longestByCourse = new Map()

  for (const { course, mission } of corpus.legacyMissions) {
    const task = mission.task
    if (!task || !(task.options ?? []).length) continue
    const where = `${course.id}/${mission.id}`
    const options = task.options

    optionCounts.set(options.length, (optionCounts.get(options.length) ?? 0) + 1)

    if (options.length < 2) out.push(finding('C4.too-few-options', 'error', SCOPE.LEGACY, where, 'Меньше двух вариантов ответа'))
    if (!options.some(option => option.trim() === String(task.answer).trim())) {
      out.push(finding('C4.answer-not-in-options', 'error', SCOPE.LEGACY, where, 'Верного ответа нет среди вариантов'))
    }
    if (new Set(options.map(normalize)).size !== options.length) {
      out.push(finding('C4.duplicate-options', 'error', SCOPE.LEGACY, where, 'Варианты ответа повторяются'))
    }
    if (options.some(option => !option.trim())) out.push(finding('C4.empty-option', 'error', SCOPE.LEGACY, where, 'Пустой вариант ответа'))
    if (options.some(option => /^(всё|все) (перечисленное|вышеперечисленное)|ничего из перечисленного/i.test(option.trim()))) {
      out.push(finding('C4.catch-all-option', 'warning', SCOPE.LEGACY, where, 'Вариант «всё перечисленное» почти всегда подсказка'))
    }

    const correct = options.find(option => option.trim() === String(task.answer).trim())
    if (correct) {
      const longest = options.every(option => option === correct || option.length < correct.length)
      const stats = longestByCourse.get(course.id) ?? { total: 0, longest: 0 }
      stats.total += 1
      if (longest) stats.longest += 1
      longestByCourse.set(course.id, stats)
    }
  }

  for (const [courseId, stats] of longestByCourse) {
    if (stats.total >= 8 && stats.longest / stats.total >= 0.8) {
      out.push(finding('C4.longest-is-correct', 'warning', SCOPE.LEGACY, courseId,
        `В ${stats.longest} из ${stats.total} вопросов верный вариант — самый длинный: угадывается без знания темы`))
    }
  }

  out.push(finding('C4.option-count', 'info', SCOPE.LEGACY, 'все курсы',
    `Распределение числа вариантов: ${[...optionCounts.entries()].sort().map(([count, missions]) => `${count} вариантов — ${missions}`).join('; ')}`))

  for (const { task, scope } of corpus.v2Tasks) {
    if (task.response.kind !== 'choice') continue
    const ids = task.response.options.map(option => option.id)
    if (ids.length < 2) out.push(finding('C4.too-few-options', 'error', scope, task.id, 'Меньше двух вариантов ответа'))
    if (new Set(ids).size !== ids.length) out.push(finding('C4.duplicate-options', 'error', scope, task.id, 'Идентификаторы вариантов повторяются'))
    for (const id of task.evaluation.correct ?? []) {
      if (!ids.includes(id)) out.push(finding('C4.answer-not-in-options', 'error', scope, task.id, `Верный вариант ${id} отсутствует среди предложенных`))
    }
    if (task.response.select === 'one' && (task.evaluation.correct ?? []).length !== 1) {
      out.push(finding('C4.correct-count-mismatch', 'error', scope, task.id, 'Одиночный выбор, а верных вариантов не один'))
    }
  }
  return out
}

/* ------------------------------------------------------- C5. кодовые задания */

function codeTasks(corpus, engine) {
  const out = []
  for (const { course, mission } of corpus.legacyMissions) {
    const checks = mission.task?.codeChecks ?? []
    if (!checks.length) continue
    const where = `${course.id}/${mission.id}`
    for (const check of checks) {
      const fragment = check.includes
      if (/^\s*[-+*/%<>=!]{1,2}\s*$/.test(fragment) || (fragment !== fragment.trim() && fragment.trim().length <= 3)) {
        out.push(finding('C5.fragile-substring', 'warning', SCOPE.LEGACY, where, `Проверка зависит от оформления: ${JSON.stringify(fragment)}`))
      }
    }
  }

  for (const { task, scope } of corpus.v2Tasks) {
    if (task.evaluation.type === 'legacy-substring') {
      out.push(finding('C5.legacy-evaluator', 'error', scope, task.id, 'Новое задание не может проверяться поиском подстроки'))
    }
    if (task.evaluation.type !== 'program') continue
    const files = task.response.kind === 'code' ? task.response.files : []
    const starter = files.map(file => file.content).join('\n')
    const staticChecks = task.evaluation.staticChecks ?? []
    if (staticChecks.length && staticChecks.every(check =>
      check.kind === 'must-contain' ? engine.passesCodeCheck(starter, check.fragment) : !engine.passesCodeCheck(starter, check.fragment))) {
      out.push(finding('C5.starter-already-passes', 'error', scope, task.id, 'Заготовка уже проходит все статические проверки'))
    }
    for (const testCase of task.evaluation.cases ?? []) {
      if (!testCase.id || !testCase.name) out.push(finding('C5.malformed-test', 'error', scope, task.id, 'У теста нет идентификатора или названия'))
      if (!testCase.hidden && testCase.expected === undefined) out.push(finding('C5.malformed-test', 'error', scope, task.id, `Открытый тест ${testCase.id} без ожидаемого результата`))
    }
    if (!(task.evaluation.cases ?? []).some(testCase => testCase.hidden)) {
      out.push(finding('C5.no-hidden-test', 'warning', scope, task.id, 'Нет скрытого теста: решение можно подогнать под открытые'))
    }
    if (!task.evaluation.timeoutMs) {
      out.push(finding('C5.no-timeout', 'warning', scope, task.id, 'Не задан предел времени выполнения'))
    }
  }
  return out
}

/* ------------------------------------------- C6-C7. педагогика и прогрессия */

function pedagogy(corpus) {
  const out = []
  const order = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']
  const bySkill = new Map()

  for (const { task, scope } of corpus.v2Tasks) {
    for (const evidence of task.skills ?? []) {
      const entry = bySkill.get(evidence.skillId) ?? { levels: new Set(), intents: new Set(), tasks: [] }
      entry.levels.add(task.difficulty)
      entry.intents.add(task.intent)
      entry.tasks.push(task.id)
      bySkill.set(evidence.skillId, entry)
    }
    // Продвинутое задание обязано называть основание, иначе оно неотличимо от угадывания.
    if ((task.difficulty === 'L3' || task.difficulty === 'L4' || task.difficulty === 'L5') && !(task.prerequisites ?? []).length) {
      const derived = (task.skills ?? []).flatMap(evidence => corpus.skillById[evidence.skillId]?.prerequisites ?? [])
      if (!derived.length) out.push(finding('C6.no-foundation', 'warning', scope, task.id, `Задание уровня ${task.difficulty} не объявляет ни одной предпосылки`))
    }
  }

  for (const [skillId, entry] of bySkill) {
    const levels = [...entry.levels].sort((left, right) => order.indexOf(left) - order.indexOf(right))
    const lowest = order.indexOf(levels[0])
    const examOnly = [...entry.intents].every(intent => intent === 'exam' || intent === 'oral-exam' || intent === 'boss')
    if (lowest >= order.indexOf('L4') || examOnly) {
      out.push(finding('C7.no-introduction', 'warning', SCOPE.PRODUCTION, skillId,
        `Первая встреча с навыком сразу на уровне ${levels[0]}: нет ступени знакомства`, entry.tasks.join(', ')))
    }
    if (entry.tasks.length >= 5 && levels.every(level => level === 'L0' || level === 'L1')) {
      out.push(finding('C7.recall-only', 'warning', SCOPE.PRODUCTION, skillId, `${entry.tasks.length} заданий и ни одного на применение`))
    }
    out.push(finding('C7.progression', 'info', SCOPE.PRODUCTION, skillId, `Ступени: ${levels.join(' → ')}; заданий: ${entry.tasks.length}`))
  }
  return out
}

/* ---------------------------------------- C8. покрытие требований вуза */

const COVERAGE_ORDER = ['uncovered', 'mapped', 'taught', 'practiced', 'exam-ready']

/**
 * Покрытие программы, а не готовность человека.
 *
 * Это ответ на вопрос «существует ли в REQuest обучение по этому официальному
 * пункту», и только он. Освоил ли материал конкретный человек — отдельная
 * величина, она считается по журналу попыток в `readinessFor`. Смешивать их в
 * одно число нельзя: «готовность к ИТМО 68%» без указания, чья это готовность,
 * не означает ничего.
 *
 * Учитываются только задания периметра production. Фикстуры доказывают, что
 * движок способен выразить билет, но обучением не являются.
 */
export function admissionCoverage(corpus) {
  const byRef = new Map()
  for (const { task } of corpus.productionTasks ?? []) {
    for (const ref of task.admissionRefs ?? []) {
      byRef.set(ref, [...(byRef.get(ref) ?? []), task])
    }
  }

  return corpus.requirements.map(requirement => {
    const tasks = byRef.get(requirement.ref) ?? []
    let status = 'uncovered'
    if (tasks.length) status = 'mapped'
    // Профессиональный материал без экзаменационного формата даёт только «изучено».
    if (tasks.some(task => task.evaluation && task.response)) status = 'taught'
    if (tasks.some(task => task.intent !== 'concept' && task.evaluation?.type !== 'rubric')) status = 'practiced'
    if (tasks.some(task => task.intent === 'exam' || task.intent === 'oral-exam')) status = 'exam-ready'
    return {
      ...requirement,
      status,
      tasks: tasks.map(task => task.id),
      skills: [...new Set(tasks.flatMap(task => (task.skills ?? []).map(evidence => evidence.skillId)))],
    }
  })
}

function admission(corpus) {
  const out = []
  const coverage = admissionCoverage(corpus)
  const byTrack = new Map()
  for (const item of coverage) {
    const stats = byTrack.get(item.trackId) ?? { official: 0, structural: 0, covered: 0, examReady: 0 }
    if (item.official) stats.official += 1
    else stats.structural += 1
    if (item.status !== 'uncovered') stats.covered += 1
    if (item.status === 'exam-ready') stats.examReady += 1
    byTrack.set(item.trackId, stats)
  }
  for (const [trackId, stats] of byTrack) {
    out.push(finding('C8.coverage', 'info', SCOPE.PRODUCTION, trackId,
      `Официальных вопросов ${stats.official}, структурных записей ${stats.structural}; хоть как-то закрыто ${stats.covered}, готово к экзамену ${stats.examReady}`))
  }

  // Ссылка на требование из задания, которое не является экзаменационным.
  for (const { task, scope } of corpus.v2Tasks) {
    for (const ref of task.admissionRefs ?? []) {
      if (!corpus.requirementRefs.has(ref)) continue
      if (task.intent !== 'exam' && task.intent !== 'oral-exam') {
        out.push(finding('C8.professional-claims-admission', 'error', scope, task.id,
          `Непрофильный формат ссылается на требование ${ref}: на готовность влиять не должен`))
      }
    }
  }
  return out
}

/* ----------------------------------------------- C9. источники и лицензии */

function sources(corpus) {
  const out = []
  for (const source of corpus.sources) {
    const where = source.id ?? '(без идентификатора)'
    for (const field of ['id', 'title', 'url', 'class', 'allowedUses']) {
      if (!source[field]) out.push(finding('C9.missing-field', 'error', SCOPE.PRODUCTION, where, `У источника нет обязательного поля «${field}»`))
    }
    if (!source.license) out.push(finding('C9.missing-license', 'error', SCOPE.PRODUCTION, where, 'Не указана лицензия'))
    const adaptable = (source.allowedUses ?? []).includes('adaptation')
    if (adaptable && source.class !== 'ADAPTABLE_OER') {
      out.push(finding('C9.adaptation-without-class', 'error', SCOPE.PRODUCTION, where, 'Разрешена адаптация, но класс источника это не подтверждает'))
    }
    if (adaptable && source.licenseVerification === 'required') {
      out.push(finding('C9.unverified-adaptation', 'error', SCOPE.PRODUCTION, where, 'Лицензия не проверена, но материал помечен как пригодный к адаптации'))
    }
    if (source.class === 'REFERENCE_ONLY' && (source.allowedUses ?? []).some(use => use === 'code' || use === 'facts' || use === 'adaptation')) {
      out.push(finding('C9.reference-overreach', 'error', SCOPE.PRODUCTION, where, 'REFERENCE_ONLY допускает только ориентир по программе, не перенос содержания'))
    }
    if (source.shareAlike && adaptable) {
      out.push(finding('C9.share-alike', 'warning', SCOPE.PRODUCTION, where, 'Вирусная лицензия: производный текст придётся отдать под той же лицензией'))
    }
  }
  out.push(finding('C9.inventory', 'info', SCOPE.PRODUCTION, 'реестр источников',
    `Всего ${corpus.sources.length}; требуют проверки лицензии ${corpus.sources.filter(source => source.licenseVerification === 'required').length}`))
  return out
}

export const rules = [
  { id: 'C1', title: 'Структура', run: structural },
  { id: 'C2', title: 'Подсказанный ответ', run: answerLeakage },
  { id: 'C3', title: 'Повторы', run: duplicates },
  { id: 'C4', title: 'Качество вариантов', run: multipleChoice },
  { id: 'C5', title: 'Кодовые задания', run: codeTasks },
  { id: 'C6/C7', title: 'Педагогика и прогрессия', run: pedagogy },
  { id: 'C8', title: 'Покрытие требований', run: admission },
  { id: 'C9', title: 'Источники и лицензии', run: sources },
]

export function runRules(corpus, engine) {
  return rules.flatMap(rule => rule.run(corpus, engine))
}
