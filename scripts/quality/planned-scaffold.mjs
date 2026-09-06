/**
 * Подпись шаблона `scripts/generate-planned-courses.mjs`.
 *
 * Остальные признаки генератора в `classify-courses.mjs` вероятностные: префикс
 * «Сцена:» бывает и авторским, поэтому каждый из них требует подтверждения
 * вторым. Здесь признак другой природы — точное совпадение с формулировками
 * генератора, которых человек не пишет. Одного такого совпадения достаточно.
 *
 * Генератор собирает миссию из шести предсказуемых частей, и каждая проверяется
 * отдельно:
 *
 *   заголовок              «<тема>: <ракурс>», ракурс из списка ANGLES
 *   вводная                «В теме «<тема>» рабочее правило формулируется так:»
 *   контекст               «На этапе «<ракурс>» результатом работы считается…»
 *   формулировка задания   «… Контекст: <тема>.»
 *   варианты ответа        ровно два дословных из общего списка DISTRACTORS
 *   подсказка              «Сначала назови единицу наблюдения…»
 *
 * Порог — пять совпадений из шести. Шестое теряет финальная миссия курса:
 * у неё свой заголовок «Итоговое испытание», всё остальное шаблонное.
 *
 * Списки ниже дублируют генератор, и это осознанный дубль: импортировать из
 * него нельзя — он на верхнем уровне пишет файлы курсов. От расхождения
 * защищает `generatorDrift`, которую вызывает классификатор.
 */

/** Ракурсы, из которых генератор берёт вторую половину заголовка. */
export const ANGLES = [
  'основная идея', 'механика', 'практический выбор', 'проверка результата',
  'типичная ловушка', 'диагностика', 'производственный контур',
  'контроль качества', 'компромиссы', 'интеграция',
]

/** Неправильные варианты ответа, общие на весь каталог. */
export const DISTRACTORS = [
  'Достаточно получить результат один раз; происхождение и проверки можно не сохранять.',
  'Надёжнее всегда обрабатывать все данные целиком и полагаться на значения по умолчанию.',
  'Если задача завершилась без технической ошибки, результат автоматически корректен.',
  'Любое редкое значение следует удалить до изучения его происхождения.',
  'Оптимизация важнее сохранения смысла данных и воспроизводимости расчёта.',
]

/** Неизменяемые куски формулировок: по ним же сверяется исходник генератора. */
export const PHRASES = {
  topic: 'В теме «',
  rule: 'рабочее правило формулируется так:',
  practice: 'Практика этой миссии —',
  evidence: 'результатом работы считается не только преобразованный набор, но и доказательство:',
  hint: 'Сначала назови единицу наблюдения и ожидаемый инвариант для темы',
  context: 'Контекст:',
}

export const GENERATOR_PATH = 'scripts/generate-planned-courses.mjs'

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Тема миссии читается из вводной: её туда подставил генератор. */
const TOPIC = new RegExp(`${escapeRegExp(PHRASES.topic)}([^»]+)» ${escapeRegExp(PHRASES.rule)}`)
const stagePrefix = angle => `На этапе «${angle}» ${PHRASES.evidence}`
const hintFor = topic => `${PHRASES.hint} «${topic}».`
const contextFor = topic => `${PHRASES.context} ${topic}.`

/**
 * Шесть признаков одной миссии.
 *
 * Тема читается из самой вводной, а не из порядка миссий и не из списка `skills`
 * курса. Порядок генератор задаёт арифметикой, повторять её здесь значило бы
 * завязаться на неё же. От списка тем курса признак отвязан намеренно: при
 * переработке программы заголовки меняют раньше, чем миссии, и сверка с ним
 * превратила бы правку одной строки в молчаливое возвращение курса
 * в AUTHORED_REAL. Ракурс берётся из контекста, потому что у финальной миссии
 * его нет в заголовке.
 */
export function plannedScaffoldMarkers(mission) {
  const intro = String(mission.intro ?? '')
  const context = String(mission.productionContext ?? '')
  const task = mission.task ?? {}
  const topic = TOPIC.exec(intro)?.[1]
  const angle = ANGLES.find(item => context.startsWith(stagePrefix(item)))
  return {
    title: Boolean(topic && angle) && mission.title === `${topic}: ${angle}`,
    intro: Boolean(topic) && intro.includes(PHRASES.practice),
    context: Boolean(angle),
    prompt: Boolean(topic) && String(task.prompt ?? '').includes(contextFor(topic)),
    options: (task.options ?? []).filter(option => DISTRACTORS.includes(option)).length === 2,
    hints: Boolean(topic) && (mission.hints ?? []).join('') === hintFor(topic),
  }
}

const MARKER_LIMIT = 5

export const plannedScaffoldScore = mission =>
  Object.values(plannedScaffoldMarkers(mission)).filter(Boolean).length

export const isPlannedScaffold = mission => plannedScaffoldScore(mission) >= MARKER_LIMIT

/** Сколько миссий курса собрано шаблоном. */
export const plannedScaffoldMissions = course =>
  (course.missions ?? []).filter(isPlannedScaffold).length

/**
 * Расхождение признака с генератором.
 *
 * Если формулировки в генераторе поменяют, а списки здесь нет, признак молча
 * перестанет срабатывать и курсы поедут обратно в AUTHORED_REAL. Поэтому
 * классификатор сверяет исходник генератора с тем, что ищет: возвращённый
 * непустой список означает, что чинить нужно этот файл.
 */
export function generatorDrift(source) {
  const text = String(source ?? '')
  return [...Object.values(PHRASES), ...ANGLES, ...DISTRACTORS].filter(marker => !text.includes(marker))
}
