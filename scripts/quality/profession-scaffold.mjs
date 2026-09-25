/**
 * Подпись шаблона `scripts/generate-profession-courses.mjs`.
 *
 * Второй генератор каталога собирает курс не из пяти слотов, а из триад:
 * на каждую тему выходят «Сцена», «Код» и «Лаборатория», а практика сводится
 * к тому, что человек вписывает русскую фразу в строковый литерал. Существующие
 * признаки классификатора ловят его вероятностно — по доле триад, по шаблонной
 * учебной цели, по эху одной фразы в трёх полях. Вероятностный признак
 * исчезает от правки текста: достаточно переписать вводные, и курс, собранный
 * машиной, возвращается в авторские.
 *
 * Здесь признак другой природы — дословное совпадение с формулировками
 * генератора. Ими курс остаётся помечен до тех пор, пока миссии не переписаны
 * по существу, а не по формулировке.
 *
 * Шесть частей одной миссии, каждая проверяется отдельно:
 *
 *   заголовок              «Сцена: <тема>», «Код: <тема>», «Лаборатория: <тема>»
 *   учебная цель           «понять принцип «<тема>»» и «применить его в рабочем решении»
 *   вводная                одна из трёх дословных концовок по номеру шага
 *   контекст               «… В этой миссии ошибка не учебная: …»
 *   подсказка              ровно одна, начинается с «Отдели наблюдение от решения.»
 *   практика               заготовка build_plan/artifact/steps либо её аналог в другом языке
 *
 * Порог — четыре совпадения из шести: миссии-«Сцены» практики не имеют вовсе,
 * а у финальной миссии свои заголовок и вводная.
 *
 * Списки ниже дублируют генератор осознанно: импортировать из него нельзя — он
 * на верхнем уровне пишет файлы курсов. От расхождения защищает
 * `professionGeneratorDrift`, которую вызывает классификатор.
 */

/** Префиксы заголовков триады. */
export const TITLE_PREFIXES = ['Сцена: ', 'Код: ', 'Лаборатория: ', 'Итоговое дело: ']

/** Неизменяемые куски формулировок: по ним же сверяется исходник генератора. */
export const PHRASES = {
  objective: 'понять принцип «',
  objectiveApply: 'применить его в рабочем решении',
  introStory: 'Наставник просит сначала назвать принцип, а не угадывать ответ.',
  introCode: 'Команда собрала факты, но результат нужно сделать воспроизводимым.',
  introLab: 'от твоего выбора зависит следующий шаг дела.',
  context: 'В этой миссии ошибка не учебная: неверное решение попадёт в рабочую систему.',
  finalContext: 'Итог должен выдержать повторный расчёт, вопрос руководителя и изменение исходных данных.',
  hint: 'Отдели наблюдение от решения.',
  finalHint: 'Вернись к четырём артефактам дела и выстрой их от вопроса к решению.',
  prompt: 'Заполни рабочий файл так, чтобы все автоматические проверки стали зелёными.',
  finalPrompt: 'Собери итоговый план дела в коде или конфигурации и защити его автоматической проверкой.',
}

/**
 * Заготовки практики по языкам.
 *
 * Проверяется не весь файл, а неизменяемая его часть: имя пустой структуры и
 * два пустых слота, которые человек обязан заполнить русской фразой. Именно эта
 * заготовка и есть поддельная практика из §12 спецификации.
 */
export const PRACTICE_MARKERS = [
  ['def build_plan():', 'artifact = ""', 'steps = []'],
  ['static Plan buildPlan()', 'String artifact = ""', 'record Plan('],
  ['func buildPlan() Plan', 'type Plan struct', 'return Plan{}'],
  ['function buildPlan()', 'const artifact = ""', 'const steps = []'],
  ['kind: InvestigationPlan', 'artifact: ""', 'actions: []'],
]

const introEndings = [PHRASES.introStory, PHRASES.introCode, PHRASES.introLab]

/** Шесть признаков одной миссии. */
export function professionScaffoldMarkers(mission) {
  const intro = String(mission.intro ?? '')
  const context = String(mission.productionContext ?? '')
  const task = mission.task ?? {}
  const starter = String(task.starterCode ?? '')
  const objectives = mission.objectives ?? []
  const hints = mission.hints ?? []
  return {
    title: TITLE_PREFIXES.some(prefix => String(mission.title ?? '').startsWith(prefix)),
    objectives: objectives.some(item => String(item).startsWith(PHRASES.objective))
      && objectives.includes(PHRASES.objectiveApply),
    intro: introEndings.some(ending => intro.trimEnd().endsWith(ending)),
    context: context.includes(PHRASES.context) || context.includes(PHRASES.finalContext),
    hints: hints.length === 1
      && (String(hints[0]).startsWith(PHRASES.hint) || String(hints[0]) === PHRASES.finalHint),
    practice: PRACTICE_MARKERS.some(marks => marks.every(mark => starter.includes(mark))),
  }
}

const MARKER_LIMIT = 4

export const professionScaffoldScore = mission =>
  Object.values(professionScaffoldMarkers(mission)).filter(Boolean).length

export const isProfessionScaffold = mission => professionScaffoldScore(mission) >= MARKER_LIMIT

/** Сколько миссий курса собрано шаблоном профессий. */
export const professionScaffoldMissions = course =>
  (course.missions ?? []).filter(isProfessionScaffold).length

export const PROFESSION_GENERATOR_PATH = 'scripts/generate-profession-courses.mjs'

/**
 * Расхождение признака с генератором.
 *
 * Тот же предохранитель, что у `planned-scaffold`: если формулировки в
 * генераторе поменяют, а списки здесь нет, признак молча перестанет срабатывать.
 */
export function professionGeneratorDrift(source) {
  const text = String(source ?? '')
  const marks = [...Object.values(PHRASES), ...TITLE_PREFIXES.map(prefix => prefix.trim()),
    ...PRACTICE_MARKERS.flat()]
  return marks.filter(mark => !text.includes(mark))
}
