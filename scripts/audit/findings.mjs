/**
 * Общий словарь аудита: форма находки и русская морфология рода.
 *
 * Уровни те же, что в воротах качества (scripts/quality/rules.mjs):
 *
 *   error   — нарушение доказуемо, публиковать нельзя;
 *   warning — подозрительно, нужен человеческий просмотр;
 *   info    — метрика, ничего не блокирует.
 *
 * Род определяется по опорному слову, а не по всему предложению: единственная
 * надёжная привязка — местоимение или имя, стоящее рядом с формой прошедшего
 * времени или кратким прилагательным. Всё остальное даёт ложные срабатывания,
 * а проверка, которая кричит на исправном тексте, перестаёт что-либо значить.
 */

export const finding = (rule, severity, where, message, sample) => ({ rule, severity, where, message, sample })

/* --------------------------------------------------------- морфология */

/**
 * Слова, которые могут стоять между «я» и словом, выдающим род.
 * «Я уже собрала» и «я сама всё сделала» — одна и та же конструкция.
 */
const FILLERS = new Set([
  'уже', 'только', 'что', 'не', 'же', 'бы', 'тут', 'там', 'сразу', 'вчера', 'сегодня',
  'опять', 'ещё', 'еще', 'всё', 'все', 'просто', 'как', 'раз', 'тоже', 'именно',
  'лично', 'снова', 'почти', 'едва', 'наконец', 'вообще', 'здесь', 'потом', 'сначала',
])

/** Пары кратких форм: слева женская, справа мужская. */
const SHORT_FORMS = [
  ['готова', 'готов'], ['уверена', 'уверен'], ['должна', 'должен'], ['рада', 'рад'],
  ['сама', 'сам'], ['одна', 'один'], ['права', 'прав'], ['согласна', 'согласен'],
  ['занята', 'занят'], ['вынуждена', 'вынужден'], ['обязана', 'обязан'],
  ['способна', 'способен'], ['виновата', 'виноват'], ['спокойна', 'спокоен'],
  ['уставшая', 'уставший'], ['новенькая', 'новенький'], ['единственная', 'единственный'],
]
const FEMININE_SHORT = new Set(SHORT_FORMS.map(pair => pair[0]))
const MASCULINE_SHORT = new Set(SHORT_FORMS.map(pair => pair[1]))
/** Мужская пара к женской форме — она попадает в подсказку исправления. */
export const masculineFor = word => SHORT_FORMS.find(pair => pair[0] === word)?.[1]
export const feminineFor = word => SHORT_FORMS.find(pair => pair[1] === word)?.[0]

/** Неправильные мужские формы прошедшего времени: на «л» они не заканчиваются. */
const MASCULINE_IRREGULAR = new Set(['мог', 'смог', 'помог', 'намок', 'привык', 'сбежал'])

/**
 * Слова на «-ла», не являющиеся глаголами. Список короткий намеренно: сюда
 * попадает только то, что реально встречается рядом с «я» и «ты».
 */
const NOT_A_VERB = new Set(['дотла', 'пока', 'сначала', 'зеркала', 'скала', 'вилла', 'тела'])

const FEMININE_PAST = /^[а-яё]{2,}ла$/
const MASCULINE_PAST = /^[а-яё]{2,}(?:ал|ял|ил|ел|ёл|ыл|ул|ол)$/
/**
 * Возвратные формы: «разобрался» и «разобралась». Отдельные шаблоны нужны из-за
 * хвоста «-ся», из-за которого «добился» не оканчивается ни на одно из окончаний
 * выше. Ложных срабатываний здесь нет: слов на «-лся» и «-лась», кроме глаголов
 * прошедшего времени, в русском не существует.
 */
const FEMININE_REFLEXIVE = /^[а-яё]{2,}лась$/
const MASCULINE_REFLEXIVE = /^[а-яё]{2,}лся$/

/** Род, который выдаёт одно слово. Ничего не знает о контексте — это делает вызывающий. */
export function genderOfWord(word) {
  const lower = word.toLowerCase()
  if (FEMININE_SHORT.has(lower)) return 'female'
  if (MASCULINE_SHORT.has(lower)) return 'male'
  if (NOT_A_VERB.has(lower)) return null
  if (FEMININE_REFLEXIVE.test(lower)) return 'female'
  if (MASCULINE_REFLEXIVE.test(lower)) return 'male'
  if (FEMININE_PAST.test(lower)) return 'female'
  if (MASCULINE_IRREGULAR.has(lower)) return 'male'
  if (MASCULINE_PAST.test(lower)) return 'male'
  return null
}

const WORD = /[А-Яа-яЁё]+/g

function tokenize(text) {
  return [...String(text ?? '').matchAll(WORD)].map(match => ({ word: match[0], at: match.index }))
}

/**
 * Слова, выдающие род того, о ком идёт речь после опорного слова.
 * Возвращает первое значимое слово справа и слово слева: «я собрала» и
 * «собрала я» — одна и та же ошибка.
 */
function formsAround(tokens, index) {
  const out = []
  const previous = tokens[index - 1]
  if (previous && genderOfWord(previous.word)) out.push(previous)
  for (let step = 1; step <= 4 && index + step < tokens.length; step += 1) {
    const next = tokens[index + step]
    if (FILLERS.has(next.word.toLowerCase())) continue
    if (genderOfWord(next.word)) out.push(next)
    break
  }
  return out
}

/**
 * Ищет форму чужого рода рядом с опорным словом.
 *
 * @param text      проверяемая реплика
 * @param anchors   опорные слова в нижнем регистре: «я», «ты» или имя героя
 * @param gender    ожидаемый род: male | female
 * @param options   requireCapital — опорное слово должно быть с большой буквы
 *                  (нужно именам: «мира» — это ещё и родительный падеж слова «мир»)
 */
export function genderSlip(text, anchors, gender, options = {}) {
  if (!text || !gender || gender === 'neutral') return null
  const tokens = tokenize(text)
  const wanted = new Set(anchors.map(item => item.toLowerCase()))
  for (const [index, token] of tokens.entries()) {
    if (!wanted.has(token.word.toLowerCase())) continue
    if (options.requireCapital && !/^[А-ЯЁ]/.test(token.word)) continue
    for (const form of formsAround(tokens, index)) {
      const found = genderOfWord(form.word)
      if (found && found !== gender) return { word: form.word, anchor: token.word, found }
    }
  }
  return null
}

/**
 * Род, в котором текст говорит о собеседнике. Нужен там, где героя выбирает игрок.
 *
 * Опора только на именительный падеж «ты»: рядом с ним стоит сказуемое, которое
 * согласуется именно с игроком. У косвенных «тебе» и «тебя» подлежащее другое, и
 * глагол согласуется с ним — «результат уже соврал тебе один раз» и «никто, кроме
 * тебя, не усомнился» верны при любом роде игрока.
 */
export function playerGender(text) {
  if (!text) return null
  const tokens = tokenize(text)
  for (const [index, token] of tokens.entries()) {
    if (token.word.toLowerCase() !== 'ты') continue
    for (const form of formsAround(tokens, index)) {
      const found = genderOfWord(form.word)
      if (found) return { word: form.word, gender: found }
    }
  }
  return null
}

/* ------------------------------------------------------------- текст */

export const words = text => String(text ?? '').split(/\s+/).filter(Boolean).length

/** Слова длиннее двух букв в нижнем регистре: основа для сравнений по смыслу. */
export function contentWords(text) {
  return new Set([...String(text ?? '').toLowerCase().replace(/ё/g, 'е').matchAll(/[a-zа-я0-9]{3,}/g)].map(match => match[0]))
}

export function overlap(left, right) {
  const a = contentWords(left)
  const b = contentWords(right)
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  return shared / Math.min(a.size, b.size)
}
