/**
 * Проверки самих аудиторов курса.
 *
 * Аудитор, который никогда не срабатывает, выглядит ровно как аудитор, у
 * которого всё хорошо. Поэтому на каждое правило здесь есть заведомо испорченный
 * пример — и, где правило рискует поднять ложную тревогу, заведомо исправный.
 *
 *   npm run audit:course:test
 */
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { auditCharacters } from './audit/character.mjs'
import { auditVisuals } from './audit/visual.mjs'
import { auditPedagogy } from './audit/pedagogy.mjs'
import { auditStories } from './audit/story.mjs'
import { castingBook } from './audit/contracts.mjs'
import { genderSlip, playerGender, overlap } from './audit/findings.mjs'

const root = resolve(import.meta.dirname, '..')

let passed = 0
const failures = []
function check(name, run) {
  try { run(); passed += 1 } catch (error) { failures.push(`${name}\n    ${error.message.split('\n')[0]}`) }
}

/* ------------------------------------------------------------ фикстуры */

const CAST = [
  { id: 'mira', name: 'Мира', gender: 'female', archetype: 'peer', role: 'стажёр' },
  { id: 'oleg', name: 'Олег', gender: 'male', archetype: 'mentor', role: 'наставник' },
  { id: 'yana', name: 'Яна', gender: 'female', archetype: 'research', role: 'исследователь' },
  { id: 'alexey', name: 'Алексей', gender: 'male', archetype: 'lead', role: 'руководитель' },
  { id: 'narrator', name: '', gender: 'neutral', archetype: 'narrator', role: 'рассказчик' },
]

const CASTING = {
  archetypeFallbacks: {
    peer: ['peer', 'research'],
    mentor: ['mentor', 'lead'],
    research: ['research', 'peer'],
    lead: ['lead', 'mentor'],
  },
  castableGenders: ['male', 'female'],
  minCastPerProfession: 4,
}

const line = (speaker, text, emotion = 'neutral') => ({ kind: 'line', speaker, emotion, text })

/** Минимальное валидное дело: завязка, сцена вокруг миссии и живой выбор. */
function caseOf(overrides = {}) {
  return {
    caseId: 'case-test',
    courseId: 'test-course',
    file: 'knowledge/story/cases/test.json',
    title: 'Проверка',
    logline: 'Короткая завязка.',
    setting: 'Отдел данных.',
    cast: ['mira', 'oleg'],
    acts: [
      { id: 'a0', title: 'Начало', trigger: { on: 'caseStart' }, beats: [line('mira', 'Начнём с вопроса?'), line('oleg', 'Начнём.')] },
      { id: 'a1', title: 'После миссии', trigger: { on: 'afterMission', missionId: 'T-001' }, beats: [line('oleg', 'Проверка прошла.'), line('mira', 'Прошла, вижу.')] },
    ],
    endings: [{ id: 'gold', title: 'Готово', summary: 'Итог.', rank: 'золото' }],
    ...overrides,
  }
}

function courseOf(overrides = {}) {
  return {
    id: 'test-course',
    title: 'Тестовый курс',
    technology: 'python',
    skills: ['вопрос'],
    missions: [{
      id: 'T-001', title: 'Миссия', type: 'code', difficulty: 'начальный',
      objectives: ['цель'], intro: 'Вводный текст миссии.', productionContext: 'Рабочий контекст.',
      task: {
        prompt: 'Сделай', answer: 'ответ', explanation: 'Так работает, потому что счётчик увеличивается на каждом шаге цикла.',
        workspaceFile: 'solution.py', starterCode: 'print("привет")\n',
        codeChecks: [{ label: 'вывод', includes: 'print(' }],
      },
    }],
    ...overrides,
  }
}

const SKILLS = {
  skills: [
    { id: 'py-print', title: 'Вывод в консоль', detect: ['print('], language: 'python', introducedIn: { course: 'test-course', mission: 'T-001' } },
    { id: 'py-for', title: 'Цикл for', detect: ['for '], language: 'python', introducedIn: { course: 'test-course', mission: 'T-002' } },
  ],
  languageByExtension: { '.py': 'python' },
  extraLanguagesByExtension: {},
}

function corpusOf(overrides = {}) {
  const cases = overrides.cases ?? [caseOf()]
  const courses = overrides.courses ?? [courseOf()]
  const chapters = overrides.chapters ?? []
  const chaptersByCourse = new Map()
  for (const chapter of chapters) {
    if (!chaptersByCourse.has(chapter.courseId)) chaptersByCourse.set(chapter.courseId, [])
    chaptersByCourse.get(chapter.courseId).push(chapter)
  }
  return {
    root,
    cast: CAST,
    castById: new Map(CAST.map(member => [member.id, member])),
    cases,
    caseByCourse: new Map(cases.map(story => [story.courseId, story])),
    courses,
    courseById: new Map(courses.map(course => [course.id, course])),
    programs: [],
    prerequisitesByCourse: new Map(),
    narratives: overrides.narratives ?? [],
    narrativeByProfession: new Map((overrides.narratives ?? []).map(item => [item.professionId, item])),
    professionPrograms: overrides.professionPrograms ?? [],
    routes: {},
    casting: overrides.casting ?? CASTING,
    castingBook: castingBook(CAST, overrides.casting ?? CASTING),
    skillsRegistry: overrides.skillsRegistry ?? SKILLS,
    skillById: new Map((overrides.skillsRegistry ?? SKILLS).skills.map(skill => [skill.id, skill])),
    emotions: ['neutral', 'happy', 'worried', 'surprised', 'tired', 'determined'],
    locationIds: ['office', 'library', 'train', 'lab'],
    locationAliases: { 'trip-station': 'trip' },
    sprites: overrides.sprites ?? new Map(),
    posesByCharacter: overrides.posesByCharacter ?? posesOf(overrides.sprites ?? new Map()),
    chapters,
    chaptersByCourse,
    ...overrides,
  }
}

/** Позы по героям собираются из файлов так же, как в приложении и в корпусе. */
function posesOf(sprites) {
  const byCharacter = new Map()
  for (const sprite of sprites.values()) {
    if (!byCharacter.has(sprite.characterId)) byCharacter.set(sprite.characterId, new Map())
    byCharacter.get(sprite.characterId).set(sprite.emotion, sprite)
  }
  return byCharacter
}

const spriteOf = (characterId, emotion, width = 600, height = 1400) => ({
  characterId, emotion, version: 4, file: `${characterId}-${emotion}-v4.png`,
  path: 'нет', changedAt: 0, width, height,
})

/** Полный набор нарисованных поз перечисленных героев. */
const drawnCast = (characterIds, size = {}) => new Map(
  [characterIds].flat().flatMap(characterId => ['neutral', 'happy', 'worried', 'surprised', 'determined']
    .map(emotion => [`${characterId}:${emotion}`, spriteOf(characterId, emotion, size.width, size.height)])))

const chapterOf = (overrides = {}) => ({
  professionId: 'data-analyst', courseId: 'test-course', stageIndex: 0, stageTitle: 'Этап',
  chapterIndex: 0, location: 'office', declaredLocation: 'office', hook: 'Завязка этапа.',
  teamIds: ['mira', 'oleg'], protagonist: { name: 'Алина', gender: 'female', description: 'аналитик' },
  ...overrides,
})

const rules = list => list.map(item => item.rule)

/* ------------------------------------------------------------ морфология */

check('род говорящего виден в прошедшем времени', () => {
  assert.ok(genderSlip('Я уже собрала материалы.', ['я'], 'male'))
  assert.equal(genderSlip('Я уже собрал материалы.', ['я'], 'male'), null)
})

check('краткие формы тоже выдают род', () => {
  assert.ok(genderSlip('Я готова начать.', ['я'], 'male'))
  assert.equal(genderSlip('Я готов начать.', ['я'], 'male'), null)
})

check('наречие на «-ла» не считается глаголом', () => {
  assert.equal(genderSlip('Я сначала посмотрел таблицу.', ['я'], 'male'), null)
  assert.equal(genderSlip('Я пока не знаю.', ['я'], 'female'), null)
})

check('возвратные глаголы тоже выдают род', () => {
  assert.equal(playerGender('Ты добился этого не скандалом.').gender, 'male')
  assert.equal(playerGender('Ты добилась этого не скандалом.').gender, 'female')
  assert.ok(genderSlip('Я разобралась в схеме.', ['я'], 'male'))
  assert.equal(genderSlip('Я разобрался в схеме.', ['я'], 'male'), null)
})

check('обращение к игроку различает род', () => {
  assert.equal(playerGender('Ты усвоил главное.').gender, 'male')
  assert.equal(playerGender('Ты усвоила главное.').gender, 'female')
  assert.equal(playerGender('Ты понимаешь, о чём речь?'), null)
})

check('пересказ узнаётся по общим словам', () => {
  assert.ok(overlap('контракт задаёт состояние объекта', 'контракт задаёт состояние объекта и поведение') > 0.75)
  assert.ok(overlap('цикл повторяет действие', 'вывод в консоль печатает строку') < 0.3)
})

/* ------------------------------------------------------------ персонажи */

check('чужой род в собственной реплике — ошибка', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('oleg', 'Я уже собрала материалы.')] }] })
  assert.ok(rules(auditCharacters(corpusOf({ cases: [story] }))).includes('A1.self-gender'))
})

check('исправная реплика молчит', () => {
  const found = auditCharacters(corpusOf())
  assert.deepEqual(found.filter(item => item.severity === 'error'), [])
})

check('чужой род при упоминании героя — ошибка', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('oleg', 'Мира кивнул и открыл файл.')] }] })
  assert.ok(rules(auditCharacters(corpusOf({ cases: [story] }))).includes('A1.named-gender'))
})

check('говорящий вне состава дела — ошибка', () => {
  const story = caseOf({ cast: ['oleg'] })
  assert.ok(rules(auditCharacters(corpusOf({ cases: [story] }))).includes('A1.speaker-not-in-cast'))
})

check('обращение к игроку в роде, которого нет у героинь главы', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('oleg', 'Ты усвоил главное.')] }] })
  const found = auditCharacters(corpusOf({ cases: [story], chapters: [chapterOf()] }))
  assert.ok(rules(found).includes('A1.player-gender'))
})

check('без совместимого кандидата кастинг отказывает, а аудит показывает адрес', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('mira', 'Я уже собрала материалы.')] }, caseOf().acts[1]] })
  const chapter = chapterOf({ teamIds: ['oleg', 'alexey'], protagonist: { name: 'Тимур', gender: 'male', description: 'инженер' } })
  const found = auditCharacters(corpusOf({ cases: [story], chapters: [chapter] }))
  const refusal = found.find(item => item.rule === 'A1.no-compatible-cast')
  assert.ok(refusal, 'отказ кастинга не попал в отчёт')
  assert.equal(refusal.severity, 'error')
  // Адрес сцены, миссия, исходный герой и доступный состав — всё в находке.
  assert.match(refusal.where, /data-analyst\/test-course\/a1#/)
  assert.match(refusal.message, /T-001/)
  assert.match(refusal.message, /Мира/)
  assert.match(refusal.message, /Олег \(male, mentor\), Алексей \(male, lead\)/)
  // Молчаливой подмены не осталось: реплика в чужом роде не появляется.
  assert.ok(!rules(found).includes('A1.recast-gender-line'))
})

check('два героя, ставшие одним, — ошибка', () => {
  // В команде один мужчина: и наставник, и руководитель достанутся ему.
  const story = caseOf({ cast: ['oleg', 'alexey', 'mira'], acts: [
    { id: 'a0', trigger: { on: 'caseStart' }, beats: [line('oleg', 'Начнём?'), line('alexey', 'Начнём.')] },
    caseOf().acts[1],
  ] })
  const chapter = chapterOf({ teamIds: ['oleg', 'mira'] })
  const found = auditCharacters(corpusOf({ cases: [story], chapters: [chapter] }))
  const clash = found.find(item => item.rule === 'A1.recast-collision')
  assert.ok(clash, 'склейка героев не найдена')
  assert.equal(clash.severity, 'error')
  assert.match(clash.message, /Олег и Алексей/)
})

check('совместимая замена проходит без находок', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('mira', 'Я уже собрала материалы.'), line('oleg', 'Хорошо.')] }, caseOf().acts[1]] })
  const chapter = chapterOf({ teamIds: ['yana', 'oleg'] })
  const found = auditCharacters(corpusOf({ cases: [story], chapters: [chapter] }))
  assert.deepEqual(found.filter(item => item.severity === 'error'), [])
})

check('состав меньше порога — ошибка с адресом профессии', () => {
  const narratives = [{ professionId: 'data-analyst', cast: ['mira', 'oleg'], protagonist: { name: 'Алина', gender: 'female', description: 'аналитик' }, locations: ['office'] }]
  const found = auditCharacters(corpusOf({ narratives }))
  const small = found.find(item => item.rule === 'A1.cast-too-small')
  assert.ok(small)
  assert.equal(small.where, 'data-analyst')
  assert.match(small.message, /2 персонажей из 4/)
})

check('род в тексте концовки проверяется наравне с репликами', () => {
  const story = caseOf({ endings: [{ id: 'gold', title: 'Итог', summary: 'Ты сам нашёл причину и остановил конвейер.', rank: 'золото' }] })
  const found = auditCharacters(corpusOf({ cases: [story], chapters: [chapterOf()] }))
  const hit = found.find(item => item.rule === 'A1.player-gender')
  assert.ok(hit, 'обращение к игроку в концовке не найдено')
  assert.equal(hit.where, 'test-course/ending:gold')
})

check('молчащий персонаж состава — предупреждение', () => {
  const story = caseOf({ cast: ['mira', 'oleg', 'narrator'], acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('mira', 'Одна реплика.')] }] })
  assert.ok(rules(auditCharacters(corpusOf({ cases: [story] }))).includes('A1.silent-cast'))
})

/* ---------------------------------------------------------- изображения */

check('нарисованная эмоция без файла — ошибка', () => {
  const sprites = drawnCast(['mira', 'oleg'])
  sprites.delete('mira:happy')
  const found = auditVisuals(corpusOf({ sprites }))
  const missing = found.find(item => item.rule === 'A2.pose-not-drawn')
  assert.ok(missing, 'пропущенная обязательная поза не найдена')
  assert.equal(missing.where, 'mira:happy')
})

check('полный набор поз нужного размера не даёт ошибок по спрайтам', () => {
  const found = auditVisuals(corpusOf({ sprites: drawnCast(['mira', 'oleg']) }))
  assert.deepEqual(found.filter(item => item.severity === 'error'), [])
})

check('запланированная поза в сцене — ошибка с именем героя', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('mira', 'Устала.', 'tired')] }, caseOf().acts[1]] })
  const found = auditVisuals(corpusOf({ cases: [story], sprites: drawnCast(['mira', 'oleg']) }))
  const inUse = found.find(item => item.rule === 'A2.pose-planned-in-use')
  assert.ok(inUse, 'сыгранная, но ненарисованная поза не найдена')
  assert.equal(inUse.severity, 'error')
  assert.match(inUse.message, /Мира/)
  assert.match(inUse.message, /тревог/)
})

check('незанятая запланированная поза — только предупреждение', () => {
  const found = auditVisuals(corpusOf({ sprites: drawnCast(['mira', 'oleg']) }))
  const planned = found.find(item => item.rule === 'A2.pose-planned')
  assert.ok(planned)
  assert.equal(planned.severity, 'warning')
  assert.ok(!found.some(item => item.rule === 'A2.pose-planned-in-use'))
})

check('низкое разрешение спрайта — ошибка', () => {
  const found = auditVisuals(corpusOf({ sprites: drawnCast('mira', { width: 250, height: 620 }) }))
  assert.equal(found.filter(item => item.rule === 'A2.blurry').length, 5)
})

check('файл с эмоцией вне контракта — предупреждение', () => {
  const sprites = drawnCast(['mira', 'oleg'])
  sprites.set('mira:sleepy', spriteOf('mira', 'sleepy'))
  assert.ok(rules(auditVisuals(corpusOf({ sprites }))).includes('A2.pose-unknown-emotion'))
})

check('говорящий герой без единой позы — ошибка', () => {
  // Нарисован только Олег, а в деле говорит ещё и Мира.
  const found = auditVisuals(corpusOf({ sprites: drawnCast('oleg') }))
  assert.ok(rules(found).includes('A2.character-not-illustrated'))
})

/* ----------------------------------------------------------- педагогика */

check('конструкция раньше своего урока — ошибка', () => {
  const course = courseOf({
    missions: [
      { ...courseOf().missions[0], id: 'T-001', task: { ...courseOf().missions[0].task, codeChecks: [{ label: 'цикл', includes: 'for x in items:' }] } },
      { ...courseOf().missions[0], id: 'T-002' },
    ],
  })
  assert.ok(rules(auditPedagogy(corpusOf({ courses: [course] }))).includes('A3.construct-before-lesson'))
})

check('конструкция, не введённая в маршруте, — ошибка', () => {
  const skills = { ...SKILLS, skills: [{ id: 'py-for', title: 'Цикл for', detect: ['for '], language: 'python', introducedIn: { course: 'другой-курс', mission: 'X-001' } }] }
  const course = courseOf({ missions: [{ ...courseOf().missions[0], task: { ...courseOf().missions[0].task, codeChecks: [{ label: 'цикл', includes: 'for x in items:' }] } }] })
  const programs = [{ professionId: 'data-analyst', stages: [{ title: 'Этап', courseIds: ['test-course'] }] }]
  const found = auditPedagogy(corpusOf({ courses: [course], skillsRegistry: skills, professionPrograms: programs }))
  assert.ok(rules(found).includes('A3.unexplained-construct'))
})

check('разбор, пересказывающий вводный текст, — предупреждение', () => {
  const mission = courseOf().missions[0]
  const course = courseOf({ missions: [{ ...mission, task: { ...mission.task, explanation: mission.intro + ' ' + mission.productionContext } }] })
  assert.ok(rules(auditPedagogy(corpusOf({ courses: [course] }))).includes('A3.explanation-restates'))
})

check('живой разбор с причиной молчит', () => {
  const found = auditPedagogy(corpusOf())
  assert.ok(!rules(found).includes('A3.explanation-thin'))
  assert.ok(!rules(found).includes('A3.explanation-restates'))
})

/* --------------------------------------------------------------- сюжет */

check('сцена, привязанная к несуществующей миссии, — ошибка', () => {
  const story = caseOf({ acts: [...caseOf().acts.slice(0, 1), { id: 'a1', trigger: { on: 'afterMission', missionId: 'НЕТ-999' }, beats: [line('oleg', 'Готово.'), line('mira', 'Вижу.')] }] })
  assert.ok(rules(auditStories(corpusOf({ cases: [story] }))).includes('A4.trigger-unknown-mission'))
})

check('концовка без выдаваемого флага недостижима', () => {
  const story = caseOf({ endings: [{ id: 'gold', title: 'Итог', summary: 'Текст.', requiresFlags: ['честность'], rank: 'золото' }] })
  assert.ok(rules(auditStories(corpusOf({ cases: [story] }))).includes('A4.ending-unreachable'))
})

check('концовка выше потолка доверия недостижима', () => {
  const choice = { kind: 'choice', id: 'c1', prompt: 'Что скажешь?', options: [{ id: 'a', text: 'Прямо', trust: { oleg: 2 } }, { id: 'b', text: 'Мягко', trust: { oleg: 1 } }] }
  const acts = caseOf().acts.map((act, index) => index === 0 ? { ...act, beats: [...act.beats, choice] } : act)
  const story = caseOf({ acts, endings: [{ id: 'gold', title: 'Итог', summary: 'Текст.', minTrust: { oleg: 5 }, rank: 'золото' }] })
  assert.ok(rules(auditStories(corpusOf({ cases: [story] }))).includes('A4.ending-unreachable'))
})

check('флаг, который никто не читает, — предупреждение', () => {
  const choice = { kind: 'choice', id: 'c1', prompt: 'Что скажешь?', options: [{ id: 'a', text: 'Прямо', flags: ['честность'] }] }
  const acts = caseOf().acts.map((act, index) => index === 0 ? { ...act, beats: [...act.beats, choice] } : act)
  assert.ok(rules(auditStories(corpusOf({ cases: [caseOf({ acts })] }))).includes('A4.flag-dangling'))
})

check('поезд в главе про библиотеку — предупреждение', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('mira', 'В вагоне душно, но таблицу мы всё-таки открыли.'), line('oleg', 'Открыли.')] }, caseOf().acts[1]] })
  const found = auditStories(corpusOf({ cases: [story], chapters: [chapterOf({ location: 'library' })] }))
  assert.ok(rules(found).includes('A4.location-contradiction'))
})

check('программная библиотека местом действия не считается', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('mira', 'Библиотеку подключать не нужно.'), line('oleg', 'Не нужно.')] }, caseOf().acts[1]] })
  const found = auditStories(corpusOf({ cases: [story], chapters: [chapterOf({ location: 'train' })] }))
  assert.ok(!rules(found).includes('A4.location-contradiction'))
})

check('знакомство в третьей главе — ошибка', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('oleg', 'Меня зовут Олег, будем работать вместе.'), line('mira', 'Очень приятно.')] }, caseOf().acts[1]] })
  const found = auditStories(corpusOf({ cases: [story], chapters: [chapterOf({ chapterIndex: 2 })] }))
  assert.ok(rules(found).includes('A4.reintroduction'))
})

check('знакомство в первой главе допустимо', () => {
  const story = caseOf({ acts: [{ id: 'a0', trigger: { on: 'caseStart' }, beats: [line('oleg', 'Меня зовут Олег, будем работать вместе.'), line('mira', 'Очень приятно.')] }, caseOf().acts[1]] })
  const found = auditStories(corpusOf({ cases: [story], chapters: [chapterOf({ chapterIndex: 0 })] }))
  assert.ok(!rules(found).includes('A4.reintroduction'))
})

check('дословно повторяющиеся реплики выдают заготовку', () => {
  // Шесть дел, собранных из одних и тех же фраз с подставленной темой.
  const stock = index => caseOf({
    caseId: 'case-' + index, courseId: 'course-' + index,
    acts: [
      { id: 'a0', trigger: { on: 'caseStart' }, beats: [
        line('mira', `Я открыла материалы по теме «Тема ${index}». Сначала зафиксируем вопрос, потом напишем проверку.`),
        line('oleg', 'Сначала строим цепочку доказательств. Красивый ответ без проверки не принимается.'),
      ] },
      { id: 'a1', trigger: { on: 'afterMission', missionId: 'T-001' }, beats: [
        line('mira', 'Первая проверка не подтвердила удобную гипотезу. Зато теперь мы знаем, где искать дальше.'),
        line('oleg', 'Отлично. Отрицательный результат — тоже улика, если код и условия сохранены.'),
      ] },
    ],
  })
  const cases = [0, 1, 2, 3, 4, 5].map(stock)
  const found = auditStories(corpusOf({ cases, courses: cases.map(item => courseOf({ id: item.courseId })) }))
  assert.equal(found.filter(item => item.rule === 'A4.template-story').length, cases.length)
})

check('оригинальный текст заготовкой не считается', () => {
  const found = auditStories(corpusOf())
  assert.ok(!rules(found).includes('A4.template-story'))
})

check('флаг, который читает акт-последствие, живой', () => {
  const choiceBeat = { kind: 'choice', id: 'c1', prompt: 'Что делаем?', options: [{ id: 'fast', text: 'Быстро', flags: ['shortcut'] }] }
  const acts = [
    { ...caseOf().acts[0], beats: [...caseOf().acts[0].beats, choiceBeat] },
    caseOf().acts[1],
    { id: 'a2', title: 'Возвращается', trigger: { on: 'afterMission', missionId: 'T-001' }, requiresFlags: ['shortcut'],
      beats: [line('oleg', 'Та же ошибка вернулась.'), line('mira', 'Вернулась, вижу.')] },
  ]
  assert.ok(!rules(auditStories(corpusOf({ cases: [caseOf({ acts })] }))).includes('A4.flag-dangling'))
})

check('дело без завязки — ошибка', () => {
  const story = caseOf({ acts: [caseOf().acts[1]] })
  assert.ok(rules(auditStories(corpusOf({ cases: [story] }))).includes('A4.arc-incomplete'))
})

check('курс маршрута без сюжетного дела — ошибка', () => {
  const found = auditStories(corpusOf({ cases: [], chapters: [chapterOf()] }))
  assert.ok(rules(found).includes('A4.case-missing'))
})

check('исправное дело не даёт ошибок сюжета', () => {
  const found = auditStories(corpusOf({ chapters: [chapterOf()] }))
  assert.deepEqual(found.filter(item => item.severity === 'error').map(item => item.rule + ' ' + item.where), [])
})

console.log(`\nПройдено проверок аудита: ${passed}`)
if (failures.length) {
  console.error(`Упало: ${failures.length}\n`)
  for (const failure of failures) console.error(`  ✕ ${failure}`)
  process.exit(1)
}
console.log('Аудиторы курса: все проверки пройдены\n')
