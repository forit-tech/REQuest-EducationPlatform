/**
 * Разбор миссии на сущности и правила их введения.
 *
 * Вынесено из `audit-api-introduction.mjs` отдельным модулем ради golden set:
 * валидатор, который перестал ловить нарушение, снаружи выглядит так же, как
 * валидатор, у которого всё хорошо. Проверки лежат в `scripts/audit-tests.mjs`.
 *
 * Три различия, на которых держатся правила.
 *
 * 1. Исполняемый код против показанного текста. Комментарий человек видит, но
 *    не исполняет: он годится в доказательство показа и не годится в
 *    доказательство того, что требование уже выполнено за ученика.
 * 2. Показ против упоминания. «Преобразуй в int» — упоминание: имени функции
 *    без синтаксиса вызова недостаточно, чтобы человек знал, как её написать.
 *    Показом функции или метода считается только реальный пример `int("12")`.
 * 3. Обучение против подсказки. Подсказка помогает вспомнить пройденное. Если
 *    конструкция впервые появляется в подсказке той же миссии, которая требует
 *    её написать, это не обучение, а выдача ответа.
 */

/* --------------------------------------------------------- словари языка */

/**
 * Ключевые слова, которые для новичка являются отдельными сущностями.
 *
 * Список намеренно короткий: сюда попадает только то, что нельзя понять из
 * контекста и что действительно нужно вводить отдельной миссией.
 */
export const KEYWORDS = {
  python: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'import', 'from', 'as',
    'class', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'assert',
    'global', 'nonlocal', 'async', 'await'],
  javascript: ['function', 'return', 'if', 'else', 'for', 'while', 'const', 'let', 'var',
    'class', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'from',
    'async', 'await', 'new', 'this', 'yield'],
  go: ['func', 'return', 'if', 'else', 'for', 'range', 'var', 'const', 'type', 'struct',
    'interface', 'map', 'chan', 'go', 'select', 'defer', 'package', 'import', 'switch', 'case'],
  java: ['class', 'interface', 'public', 'private', 'protected', 'static', 'void', 'return',
    'if', 'else', 'for', 'while', 'new', 'try', 'catch', 'finally', 'throw', 'throws',
    'import', 'package', 'extends', 'implements', 'record', 'enum', 'switch', 'case'],
}

/**
 * Операторы и пунктуация, которые новичок не обязан понимать сам.
 *
 * Скобка и кавычка выглядят очевидными только тому, кто уже писал код.
 * Порядок важен: длинные записи проверяются раньше коротких, иначе `==`
 * распознаётся как два `=`.
 */
const OPERATORS = ['**=', '//=', '===', '!==', '<=>', '**', '//', '==', '!=', '<=', '>=',
  '+=', '-=', '*=', '/=', '%=', '=>', '->', ':=', '&&', '||', '<-',
  '+', '-', '*', '/', '%', '=', '<', '>', '!']

const SYNTAX = [
  ['f-строка', /\bf"/],
  ['срез', /\[[^\]]*:[^\]]*\]/],
  ['список', /\[[^\]]*\]/],
  ['словарь или блок', /\{/],
  ['обращение по точке', /\w\.\w/],
  ['двойные кавычки', /"/],
  ['одинарные кавычки', /'/],
  ['запятая-разделитель', /,/],
]

const CALL = /(?:([A-Za-z_][\w.]*)\s*\.\s*)?([A-Za-z_]\w*)\s*\(/g

/** Виды сущностей, показом которых считается только пример синтаксиса вызова. */
const CALLABLE_KINDS = new Set(['функция', 'метод или функция модуля', 'вызов библиотеки'])

/* ---------------------------------------------------- исполняемый код */

/**
 * Как в языке размечены комментарии, строки и docstring.
 *
 * `drop` вырезается вместе с содержимым: это комментарий или docstring.
 * `keep` копируется целиком: строковый литерал — часть кода, и кавычки в нём
 * сами являются сущностью, которую курс обязан ввести.
 */
const LEXICAL = {
  python: { line: ['#'], block: [], drop: ['"""', "'''"], keep: ['"', "'"] },
  javascript: { line: ['//'], block: [['/*', '*/']], drop: [], keep: ['"', "'", '`'] },
  go: { line: ['//'], block: [['/*', '*/']], drop: [], keep: ['"', "'", '`'] },
  java: { line: ['//'], block: [['/*', '*/']], drop: [], keep: ['"', "'"] },
}

/**
 * Код без комментариев и docstring.
 *
 * Полноценного AST здесь нет и не нужно: достаточно сканера, который знает про
 * строковый литерал и поэтому не режет `print("# не комментарий")` пополам.
 * Экранированная кавычка внутри строки сканеру не по силам — это осознанная
 * граница точности, а не недосмотр.
 */
export function executableCode(code, language) {
  const text = String(code ?? '')
  const lexical = LEXICAL[language] ?? LEXICAL.python
  const startsHere = (marks, at) => marks.find(mark => text.startsWith(mark, at))
  let out = ''
  let at = 0
  while (at < text.length) {
    const dropped = startsHere(lexical.drop, at)
    if (dropped) {
      const end = text.indexOf(dropped, at + dropped.length)
      at = end === -1 ? text.length : end + dropped.length
      continue
    }
    const kept = startsHere(lexical.keep, at)
    if (kept) {
      const end = text.indexOf(kept, at + kept.length)
      const stop = end === -1 ? text.length : end + kept.length
      out += text.slice(at, stop)
      at = stop
      continue
    }
    if (startsHere(lexical.line, at)) {
      const end = text.indexOf('\n', at)
      at = end === -1 ? text.length : end
      continue
    }
    const block = lexical.block.find(([open]) => text.startsWith(open, at))
    if (block) {
      const end = text.indexOf(block[1], at + block[0].length)
      at = end === -1 ? text.length : end + block[1].length
      continue
    }
    out += text[at]
    at += 1
  }
  return out
}

/* -------------------------------------------------- совместимость с игрой */

const WORD = /[\p{L}\p{N}_]/u
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Тот же матчер обязательных фрагментов, что и в игре.
 *
 * Повторён здесь намеренно: аудит обязан отвечать на вопрос «что засчитает
 * настоящая проверка», а не «что засчитала бы правильная». Исходник —
 * `codeCheckPattern` в `src/core/tasks.ts`; расхождение ловит golden set.
 */
export function codeCheckPattern(fragment) {
  let source = ''
  for (let index = 0; index < fragment.length; index += 1) {
    const char = fragment[index]
    if (!/\s/.test(char)) { source += escapeRegExp(char); continue }
    let end = index
    while (end < fragment.length && /\s/.test(fragment[end])) end += 1
    const before = fragment[index - 1]
    const after = fragment[end]
    const glued = before !== undefined && after !== undefined && WORD.test(before) && WORD.test(after)
    source += glued ? '\\s+' : '\\s*'
    index = end - 1
  }
  return new RegExp(source)
}

export function passesCodeCheck(code, fragment) {
  if (!fragment) return true
  if (String(code).includes(fragment)) return true
  try {
    return codeCheckPattern(fragment).test(String(code))
  } catch {
    return false
  }
}

/* ---------------------------------------------------------- извлечение */

/**
 * Разбор куска кода на сущности, каждую из которых нужно вводить отдельно.
 *
 * Категории различаются намеренно: встроенная функция, метод объекта и функция
 * библиотеки для новичка — три разных механизма, и знание одного не даёт
 * знания другого.
 */
export function extract(code, language) {
  const found = new Map()
  const add = (kind, name) => { if (!found.has(name)) found.set(name, kind) }
  const text = String(code ?? '')
  if (!text.trim()) return found

  for (const match of text.matchAll(CALL)) {
    const [, qualifier, name] = match
    if (KEYWORDS[language]?.includes(name)) continue
    if (qualifier) add(qualifier.includes('.') ? 'вызов библиотеки' : 'метод или функция модуля', `${qualifier}.${name}()`)
    else add('функция', `${name}()`)
  }
  for (const keyword of KEYWORDS[language] ?? []) {
    if (new RegExp(`(^|[^\\w])${keyword}([^\\w]|$)`).test(text)) add('ключевое слово', keyword)
  }
  let rest = text
  for (const operator of OPERATORS) {
    if (rest.includes(operator)) {
      add('оператор', operator)
      rest = rest.split(operator).join(' ')
    }
  }
  for (const [name, pattern] of SYNTAX) if (pattern.test(text)) add('синтаксис', name)
  return found
}

/**
 * Текст, которым миссия учит: стартовый файл, вводная, задание, разбор.
 *
 * Подсказок здесь нет. Подсказка приходит к человеку после того, как он
 * столкнулся с заданием, и служит напоминанием о пройденном; учить ею то, что
 * тут же требуется написать, нельзя.
 */
export function teachingSurfaceOf(mission) {
  const task = mission.task ?? {}
  return [task.starterCode, mission.intro, mission.productionContext,
    task.prompt, task.explanation, (task.options ?? []).join(' ')].join('\n')
}

/** Всё, что миссия вообще показала человеку на экране, включая подсказки. */
export function surfaceOf(mission) {
  return [teachingSurfaceOf(mission), (mission.hints ?? []).join(' ')].join('\n')
}

export const hintTextOf = mission => (mission.hints ?? []).join('\n')

/**
 * Упоминание имени в прозе.
 *
 * Показом это больше не считается: «преобразуй в int» не учит писать `int(...)`.
 * Различие сохранено, чтобы в отчёте было видно разницу между «названо словом»
 * и «не встречалось нигде» — это разные диагнозы и разная починка.
 */
export function mentionedIn(text, token) {
  const bare = token.replace(/\(\)$/, '')
  if (!/^[A-Za-z_][\w.]*$/.test(bare)) return false
  return new RegExp(`(^|[^\\w.])${bare.replace(/\./g, '\\.')}([^\\w]|$)`).test(text)
}

/**
 * Есть ли конструкция в этом куске кода.
 *
 * Для имён — по границам слова, а не подстрокой. Наивное вхождение считало
 * `int()` уже написанным везде, где в стартовом файле стоял `print(`: буквы
 * «int» лежат внутри «print». Требование при этом молча исчезало, и ни одно
 * правило по нему больше не срабатывало.
 *
 * Для операторов и пунктуации границы слова не определены, там остаётся
 * прямое вхождение.
 */
function presentIn(code, name) {
  const bare = name.replace(/\(\)$/, '')
  if (!/^[A-Za-z_][\w.]*$/.test(bare)) return String(code).includes(bare)
  return mentionedIn(code, name)
}

/** Всё, что миссия требует написать самостоятельно. */
export function requiredBy(mission, language) {
  const task = mission.task ?? {}
  const starter = executableCode(task.starterCode, language)
  const required = new Map()
  for (const check of task.codeChecks ?? []) {
    for (const [name, kind] of extract(check.includes, language)) {
      // Уже лежащее в стартовом файле человек не пишет — это подсказка, а не
      // требование. Комментарий лежащим не считается: он не исполняется.
      if (presentIn(starter, name)) continue
      required.set(name, kind)
    }
  }
  return required
}

/**
 * Пустой редактор: в стартовом файле нет ни одной исполняемой строки.
 *
 * Комментарий «TODO: собери массив и проверь форму результата» кодом не
 * является. Само по себе это не нарушение: PROGRAMMING_PEDAGOGY.md разрешает
 * писать с чистого места после того, как конструкция прошла show → modify →
 * fill. Нарушением становится пустой редактор с конструкцией, которой человек
 * ни разу не держал в собственном рабочем файле.
 */
export function isBlankEditor(mission, language) {
  return executableCode(mission.task?.starterCode, language).trim() === ''
}

/* ------------------------------------------------------------ правила */

export const VIOLATIONS = {
  REQUIRED_BEFORE_SHOWN: 'required-before-shown',
  FIRST_USE_SAME_MISSION: 'independent-use-right-after-first-sight',
  MULTIPLE_NEW_APIS: 'multiple-new-apis-at-once',
  BLANK_EDITOR: 'blank-editor-task',
  CHECK_PASSES_ON_STARTER: 'check-passes-on-starter',
  HINT_IS_NOT_TEACHING: 'hint-is-not-teaching',
  LADDER_GAP: 'ladder-gap',
  DECLARED_NEVER_REQUIRED: 'declared-but-never-required',
  NO_REINFORCEMENT: 'introduced-without-reinforcement',
}

/**
 * Стадии, на которых человек уже держал конструкцию в собственном файле.
 *
 * `shown` сюда не входит намеренно: увидеть — не то же самое, что написать.
 * Между показом и самостоятельной записью спецификация требует хотя бы одну
 * ступень, где конструкцию правят или дополняют.
 */
const PRACTICE_STAGES = new Set(['guided', 'modified', 'filled', 'debugged'])

export const RULE_TEXT = {
  [VIOLATIONS.REQUIRED_BEFORE_SHOWN]: 'миссия требует написать конструкцию, синтаксис которой человеку нигде не показывали',
  [VIOLATIONS.FIRST_USE_SAME_MISSION]: 'конструкцию показали первый раз и в этой же миссии требуют написать самостоятельно',
  [VIOLATIONS.MULTIPLE_NEW_APIS]: 'в одной миссии впервые требуется больше одной новой сущности',
  [VIOLATIONS.BLANK_EDITOR]: 'человек начинает с пустого редактора: в стартовом файле нет ни одной исполняемой строки',
  [VIOLATIONS.CHECK_PASSES_ON_STARTER]: 'автоматическая проверка выполнена стартовым файлом до действий ученика',
  [VIOLATIONS.HINT_IS_NOT_TEACHING]: 'подсказка содержит фрагмент, который требует проверка: задание решается копированием',
  [VIOLATIONS.LADDER_GAP]: 'конструкцию требуют написать с чистого места, а ступени «измени» и «дополни» она не проходила',
  [VIOLATIONS.DECLARED_NEVER_REQUIRED]: 'навык объявлен введённым, но ни одна автоматическая проверка во всём каталоге его не требует',
  [VIOLATIONS.NO_REINFORCEMENT]: 'навык требуется только в той миссии, где введён, и больше нигде не закрепляется',
}

const NEW_API_LIMIT = 1

/**
 * Проверка качества самих `codeChecks`.
 *
 * Различаются три исхода. Проверка, выполненная исполняемым кодом стартового
 * файла, мертва по замыслу автора. Проверка, выполненная только комментарием,
 * мертва фактически: игра сравнивает фрагмент со всем текстом файла и такую
 * проверку пропускает. Случай, когда стартовый файл проходит все проверки
 * миссии сразу, отмечается отдельно: делать в такой миссии нечего вообще.
 */
export function checksSatisfiedByStarter(mission, language) {
  const task = mission.task ?? {}
  const checks = task.codeChecks ?? []
  if (!checks.length) return []
  const raw = String(task.starterCode ?? '')
  const runnable = executableCode(raw, language)
  return checks.map(check => ({
    label: check.label,
    includes: check.includes,
    byCode: passesCodeCheck(runnable, check.includes),
    byCommentOnly: !passesCodeCheck(runnable, check.includes) && passesCodeCheck(raw, check.includes),
  }))
}

/**
 * Разбор одного курса по порядку миссий.
 *
 * `earlierCourses` — курсы того же языка, которые хотя бы в одном маршруте
 * стоят раньше данного: всё показанное в них человек уже видел.
 */
export function analyzeCourse({ course, language, earlierCourses = [] }) {
  const knownBefore = new Map()
  let seenText = ''
  // Отдельно от увиденного копится то, что человек держал в рабочем файле.
  // Хранится и текстом, и разобранным: имя `mentionedIn` найдёт, а знак
  // равенства или кавычка именем не являются и иначе всегда считались бы
  // неотработанными.
  let editedText = ''
  const editedTokens = new Set()
  // Какие стадии лестницы конструкция уже прошла руками ученика.
  const practised = new Map()
  /**
   * Стадия засчитывается конструкции, которая была у человека в рабочем файле.
   *
   * Не только той, что требует проверка: на ступени «измени» человек правит
   * значение внутри готового условия, и `if` он не набирает — но работает
   * именно с ним. Считать такую ступень непройденной значило бы требовать
   * переписывать конструкцию на каждой ступени, чего лестница не просит.
   */
  const rememberStage = (mission, required) => {
    if (!mission.stage) return
    const inFile = extract(executableCode(mission.task?.starterCode, language), language).keys()
    for (const name of [...required, ...inFile]) {
      if (!practised.has(name)) practised.set(name, new Set())
      practised.get(name).add(mission.stage)
    }
  }
  const rememberEdited = (code) => {
    const runnable = executableCode(code, language)
    editedText += `\n${runnable}`
    for (const name of extract(runnable, language).keys()) editedTokens.add(name)
  }
  for (const earlier of earlierCourses) {
    for (const mission of earlier.missions ?? []) {
      seenText += `\n${surfaceOf(mission)}`
      rememberEdited(mission.task?.starterCode)
      rememberStage(mission, requiredBy(mission, language).keys())
      for (const [name, kind] of extract(surfaceOf(mission), language)) {
        if (!knownBefore.has(name)) knownBefore.set(name, kind)
      }
    }
  }

  const known = new Map(knownBefore)
  const findings = []
  let requiredTotal = 0
  for (const mission of course.missions ?? []) {
    const required = requiredBy(mission, language)
    requiredTotal += required.size
    // Миссия вправе объяснить конструкцию в собственной вводной и тут же дать
    // её применить: «объяснили — показали — примени» это нормальный шаг. Но
    // показом считается только то, чем миссия учит, — без подсказок.
    const shownHere = extract(teachingSurfaceOf(mission), language)
    const hintText = hintTextOf(mission)
    const isNew = name => !known.has(name)
    const unseen = [...required].filter(([name]) => isNew(name) && !shownHere.has(name))
    const freshlyShown = [...required].filter(([name]) => isNew(name) && shownHere.has(name))

    for (const [name, kind] of unseen) {
      // Разные диагнозы: имя, названное в прозе, чинится показом синтаксиса,
      // а не встречавшееся нигде — отдельной вводной миссией.
      const named = mentionedIn(`${seenText}\n${teachingSurfaceOf(mission)}`, name)
      const inHint = mentionedIn(hintText, name)
      findings.push({
        rule: VIOLATIONS.REQUIRED_BEFORE_SHOWN,
        missionId: mission.id, missionTitle: mission.title, token: name, kind,
        evidence: named ? 'названо словом, синтаксис не показан'
          : inHint ? 'встречается только в подсказке этой же миссии' : 'не встречалось нигде',
      })
    }
    // Слабее предыдущего, но важно для новичка: конструкцию увидели первый раз
    // и сразу требуют написать, без промежуточных «измени» и «дополни».
    for (const [name, kind] of freshlyShown) {
      findings.push({
        rule: VIOLATIONS.FIRST_USE_SAME_MISSION,
        missionId: mission.id, missionTitle: mission.title, token: name, kind,
      })
    }

    // Конструкция считается отработанной руками, если человек уже видел её в
    // собственном рабочем файле: это и есть след стадий modify и fill.
    const untrained = [...required.keys()]
      .filter(name => !editedTokens.has(name) && !mentionedIn(editedText, name))
    if (untrained.length && isBlankEditor(mission, language)) {
      findings.push({
        rule: VIOLATIONS.BLANK_EDITOR,
        missionId: mission.id, missionTitle: mission.title,
        token: untrained.join(', '),
        kind: 'пустой стартовый файл, а конструкция ни разу не была в рабочем файле',
      })
    }

    const satisfied = checksSatisfiedByStarter(mission, language)
    const dead = satisfied.filter(check => check.byCode)
    const passingByComment = satisfied.filter(check => check.byCommentOnly)
    const alreadyPassing = satisfied.filter(check => check.byCode || check.byCommentOnly)
    if (dead.length) {
      const all = dead.length === satisfied.length
      findings.push({
        rule: VIOLATIONS.CHECK_PASSES_ON_STARTER,
        missionId: mission.id, missionTitle: mission.title,
        token: dead.map(check => check.includes.trim()).join(' · '),
        kind: all
          ? `стартовый файл проходит все ${satisfied.length} проверки миссии`
          : `${dead.length} из ${satisfied.length} проверок выполнены стартовым файлом`,
        severity: all ? 'critical' : 'warning',
      })
    }
    if (passingByComment.length) {
      findings.push({
        rule: VIOLATIONS.CHECK_PASSES_ON_STARTER,
        missionId: mission.id, missionTitle: mission.title,
        token: passingByComment.map(check => check.includes.trim()).join(' · '),
        kind: alreadyPassing.length === satisfied.length
          ? `стартовый файл проходит все ${satisfied.length} проверки миссии, часть — комментарием`
          : `${passingByComment.length} из ${satisfied.length} проверок выполнены комментарием в стартовом файле`,
        severity: alreadyPassing.length === satisfied.length ? 'critical' : 'warning',
      })
    }

    // Подсказка, содержащая проверяемый фрагмент, снимает задачу целиком:
    // остаётся скопировать строку. Хуже всего, когда конструкция при этом
    // видна человеку впервые — тогда подсказка подменяет собой обучение.
    const copyable = satisfied.filter(check =>
      !check.byCode && !check.byCommentOnly && passesCodeCheck(hintText, check.includes))
    if (copyable.length) {
      const teaches = copyable.some(check =>
        [...extract(check.includes, language).keys()].some(name => isNew(name)))
      findings.push({
        rule: VIOLATIONS.HINT_IS_NOT_TEACHING,
        missionId: mission.id, missionTitle: mission.title,
        token: copyable.map(check => check.includes.trim()).join(' · '),
        kind: teaches
          ? 'подсказка выдаёт фрагмент проверки, и конструкция видна человеку впервые'
          : 'подсказка выдаёт фрагмент проверки дословно',
        severity: teaches ? 'critical' : 'warning',
      })
    }

    // Самостоятельная запись раньше, чем конструкцию правили или дополняли.
    // На курсах без поля stage правило молчит: судить там не по чему.
    if (mission.stage === 'independent') {
      for (const [name, kind] of required) {
        const stages = practised.get(name)
        if (stages && [...stages].some(item => PRACTICE_STAGES.has(item))) continue
        findings.push({
          rule: VIOLATIONS.LADDER_GAP,
          missionId: mission.id, missionTitle: mission.title, token: name, kind,
          evidence: stages ? `пройдены только стадии: ${[...stages].join(', ')}` : 'ни одной ступени до этой',
        })
      }
    }
    rememberStage(mission, required.keys())

    rememberEdited(mission.task?.starterCode)
    seenText += `\n${surfaceOf(mission)}`
    // В известное уходит вся поверхность, включая подсказки: человек их видел.
    // Запрет касается только той миссии, которая требует конструкцию прямо сейчас.
    for (const [name, kind] of extract(surfaceOf(mission), language)) if (!known.has(name)) known.set(name, kind)
    for (const [name, kind] of required) if (!known.has(name)) known.set(name, kind)

    const newHere = unseen.length + freshlyShown.length
    if (newHere > NEW_API_LIMIT) {
      findings.push({
        rule: VIOLATIONS.MULTIPLE_NEW_APIS,
        missionId: mission.id, missionTitle: mission.title,
        token: [...unseen, ...freshlyShown].map(([name]) => name).join(', '),
        kind: `${newHere} новых сущностей сразу`,
      })
    }
  }

  return { findings, requiredTotal, inheritedTokens: knownBefore.size }
}

/**
 * Покрытие объявленных навыков практикой — по всему каталогу сразу.
 *
 * Реестр навыков утверждает, где каждый из них вводится. Утверждение проверяемо:
 * если ни одна автоматическая проверка во всём каталоге не требует навык
 * написать, курс объявил обучение, которого не было. Отдельно отмечается более
 * мягкий случай — навык требуется ровно один раз, в той же миссии, где введён:
 * закрепления у него нет.
 *
 * Находка приписывается курсу, который объявил навык своим, а не тому, где он
 * мог бы применяться: чинить её этому курсу.
 */
export function auditSkillCoverage({ skills = [], courses = [] }) {
  const requiredAt = new Map()
  for (const course of courses) {
    for (const mission of course.missions ?? []) {
      for (const check of mission.task?.codeChecks ?? []) {
        const fragment = String(check.includes ?? '')
        for (const skill of skills) {
          if (!(skill.detect ?? []).some(token => fragment.includes(token))) continue
          if (!requiredAt.has(skill.id)) requiredAt.set(skill.id, new Set())
          requiredAt.get(skill.id).add(`${course.id}/${mission.id}`)
        }
      }
    }
  }

  const findings = []
  for (const skill of skills) {
    const home = skill.introducedIn ?? {}
    if (!home.course) continue
    const places = requiredAt.get(skill.id) ?? new Set()
    const shared = { courseId: home.course, missionId: home.mission, token: skill.id }
    if (!places.size) {
      findings.push({
        ...shared, rule: VIOLATIONS.DECLARED_NEVER_REQUIRED,
        kind: `навык «${skill.title}» объявлен введённым, но ни одна проверка его не требует`,
      })
    } else if (places.size === 1 && places.has(`${home.course}/${home.mission}`)) {
      findings.push({
        ...shared, rule: VIOLATIONS.NO_REINFORCEMENT,
        kind: `навык «${skill.title}» требуется только в миссии, где введён`,
      })
    }
  }
  return findings
}

export const countRule = (findings, rule) => findings.filter(item => item.rule === rule).length
export const countCritical = (findings, rule) =>
  findings.filter(item => item.rule === rule && item.severity === 'critical').length

/* ------------------------------------------------- сравнение с базовой линией */

/** Поля отчёта, по которым считается регрессия: одно на каждое правило. */
export const RULE_FIELDS = {
  [VIOLATIONS.REQUIRED_BEFORE_SHOWN]: 'requiredBeforeShown',
  [VIOLATIONS.FIRST_USE_SAME_MISSION]: 'firstUseSameMission',
  [VIOLATIONS.MULTIPLE_NEW_APIS]: 'multipleNewApis',
  [VIOLATIONS.BLANK_EDITOR]: 'blankEditor',
  [VIOLATIONS.CHECK_PASSES_ON_STARTER]: 'checkPassesOnStarter',
  [VIOLATIONS.HINT_IS_NOT_TEACHING]: 'hintIsNotTeaching',
  [VIOLATIONS.LADDER_GAP]: 'ladderGap',
  [VIOLATIONS.DECLARED_NEVER_REQUIRED]: 'declaredNeverRequired',
  [VIOLATIONS.NO_REINFORCEMENT]: 'noReinforcement',
}

/**
 * Сравнение с зафиксированным долгом — по курсам, а не по общему итогу.
 *
 * Итог скрывает размен: исправили десять находок в одном курсе, добавили
 * десять в другом, сумма та же, а маршрут стал хуже. Курс, которого в линии
 * нет, считается новым: приезжать он обязан чистым, потому что для нового
 * содержания старого долга не существует.
 */
export function compareToBaseline(baseline, courses) {
  const failures = []
  const improvements = []
  const fields = Object.values(RULE_FIELDS)
  for (const course of courses) {
    const before = baseline?.byCourse?.[course.id]
    for (const field of fields) {
      const now = course[field] ?? 0
      if (!before) {
        if (now > 0) failures.push(`${course.id}: новый курс сразу с находками, ${field} = ${now}`)
        continue
      }
      const was = before[field] ?? 0
      if (now > was) failures.push(`${course.id}/${field}: было ${was}, стало ${now}`)
      if (now < was) improvements.push(`${course.id}/${field}: ${was} → ${now}`)
    }
  }
  return { failures, improvements }
}
