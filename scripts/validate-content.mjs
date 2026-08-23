import { readFile, access, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const missionsDir = resolve(root, 'knowledge/data/data-foundations/missions')
const datasetsDir = resolve(root, 'knowledge/data/data-foundations/datasets')
const sourcesPath = resolve(root, 'knowledge/content-factory/sources.json')
const knowledgeRoot = resolve(root, 'knowledge')
const professionProgramsPath = resolve(root, 'knowledge/professions/programs.json')
const professionNarrativesPath = resolve(root, 'knowledge/professions/narratives.json')
const storyCasesRoot = resolve(root, 'knowledge/story/cases')
const castPath = resolve(root, 'knowledge/story/cast.json')
const catalog = JSON.parse(await readFile(sourcesPath, 'utf8'))
const professionPrograms = JSON.parse(await readFile(professionProgramsPath, 'utf8'))
const professionNarratives = JSON.parse(await readFile(professionNarrativesPath, 'utf8'))
const storyCast = JSON.parse(await readFile(castPath, 'utf8'))
const castIds = new Set(storyCast.map(member => member.id))
const illustratedCastIds = new Set(['mira', 'oleg', 'lena', 'gleb', 'sonya', 'artem', 'vadim', 'alexey'])
const domainConfigs = []
for (const entry of await readdir(knowledgeRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || ['content-factory', 'story', 'professions'].includes(entry.name)) continue
  const domainRoot = resolve(knowledgeRoot, entry.name)
  try {
    const programs = JSON.parse(await readFile(resolve(domainRoot, 'programs.json'), 'utf8'))
    const manifest = JSON.parse(await readFile(resolve(domainRoot, 'manifest.json'), 'utf8'))
    domainConfigs.push({ id: entry.name, root: domainRoot, programs, manifest })
  } catch {
    // Каталог без manifest/programs не считается учебным доменом.
  }
}
const programs = domainConfigs.flatMap(domain => domain.programs)
const knownSourceIds = new Set(catalog.sources.map(source => source.id))
const missionFiles = (await readdir(missionsDir)).filter(file => file.endsWith('.json')).sort()
const errors = []
let datasetCount = 0
let activityCount = 0
let courseMissionCount = 0

function validate(condition, missionId, message) {
  if (!condition) errors.push(`${missionId}: ${message}`)
}

const programIds = new Set(programs.map(program => program.id))
const manifestCourseIds = new Set(domainConfigs.flatMap(domain => domain.manifest.courses))
const courseIds = new Set()
const coursesById = new Map()
for (const domain of domainConfigs) {
  for (const entry of await readdir(domain.root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const coursePath = resolve(domain.root, entry.name, 'course.json')
    try {
      await access(coursePath)
    } catch {
      continue
    }
    const course = JSON.parse(await readFile(coursePath, 'utf8'))
    const program = programs.find(item => item.id === course.id)
    validate(course.id === entry.name, course.id ?? entry.name, 'id курса не совпадает с именем каталога')
    validate(!courseIds.has(course.id), course.id, 'дублирующийся id курса')
    validate(programIds.has(course.id), course.id, 'курс отсутствует в programs.json')
    validate(manifestCourseIds.has(course.id), course.id, 'курс отсутствует в manifest.json')
    validate(Boolean(course.title && course.description && course.category), course.id, 'не заполнены основные русские поля курса')
    validate(course.missions?.length > 1, course.id, 'в курсе должно быть несколько миссий')
    validate(!program || program.missionCount === course.missions?.length, course.id, `missionCount в programs.json не совпадает с course.json (${program?.missionCount} != ${course.missions?.length})`)
    courseIds.add(course.id)
    coursesById.set(course.id, course)
    const missionIds = new Set()
    for (const mission of course.missions ?? []) {
      courseMissionCount += 1
      validate(Boolean(mission.id && mission.title && mission.intro && mission.productionContext), mission.id ?? course.id, 'не заполнены обязательные поля миссии')
      validate(!missionIds.has(mission.id), mission.id, 'дублирующийся id миссии внутри курса')
      validate(mission.objectives?.length >= 1, mission.id, 'нет учебной цели')
      validate(Boolean(mission.task?.prompt && mission.task?.answer && mission.task?.explanation), mission.id, 'задание или объяснение не заполнено')
      if (mission.task?.options) validate(mission.task.options.includes(mission.task.answer), mission.id, 'правильный ответ отсутствует среди вариантов')
      missionIds.add(mission.id)
    }
    if (program?.phase?.startsWith('Профессия')) {
      const practical = course.missions.filter(mission => ['code', 'lab'].includes(mission.type) || mission.task?.starterCode)
      validate(practical.length / course.missions.length >= 0.65, course.id, 'в профессиональном блоке практика должна занимать не менее 65% миссий')
      validate(course.missions.some(mission => mission.historicalFact?.sourceUrl), course.id, 'нет исторического или научного факта с источником')
      for (const mission of practical) {
        validate(Boolean(mission.task?.starterCode), mission.id, 'практическая миссия не содержит стартовый рабочий файл')
        validate(mission.task?.codeChecks?.length >= 3, mission.id, 'практическая миссия должна иметь минимум три автоматические проверки')
      }
    }
  }
}

for (const program of programs) {
  for (const prerequisite of program.prerequisites ?? []) {
    validate(programIds.has(prerequisite), program.id, `неизвестная зависимость: ${prerequisite}`)
    validate(prerequisite !== program.id, program.id, 'курс не может зависеть от самого себя')
  }
  if (program.status === 'ready') validate(courseIds.has(program.id), program.id, 'готовый курс не имеет course.json')
}

const runtimeCourseIds = new Set(courseIds)
const professionIds = new Set()
const professionRouteCourseIds = new Set()
const narrativeProfessionIds = new Set()
const protagonistNames = new Set()
for (const narrative of professionNarratives) {
  validate(!narrativeProfessionIds.has(narrative.professionId), narrative.professionId, 'дублирующаяся сквозная новелла профессии')
  validate(Boolean(narrative.protagonist?.name && narrative.protagonist?.description && narrative.premise), narrative.professionId, 'не заполнены главный герой или завязка сквозной новеллы')
  validate(!protagonistNames.has(narrative.protagonist?.name), narrative.professionId, `главный герой повторяется в другой профессии: ${narrative.protagonist?.name}`)
  validate(narrative.cast?.length === 3, narrative.professionId, 'в постоянной команде профессии должно быть три персонажа')
  validate(new Set(narrative.locations ?? []).size >= 4, narrative.professionId, 'в сквозной новелле должно быть минимум четыре разные главы-локации')
  for (const castId of narrative.cast ?? []) validate(illustratedCastIds.has(castId), narrative.professionId, `у постоянного персонажа нет иллюстрированных поз: ${castId}`)
  narrativeProfessionIds.add(narrative.professionId)
  protagonistNames.add(narrative.protagonist?.name)
}
for (const profession of professionPrograms) {
  validate(!professionIds.has(profession.professionId), profession.professionId, 'дублирующийся маршрут профессии')
  validate(profession.status === 'ready', profession.professionId, 'профессия не переведена в ready')
  validate(profession.stages?.length >= 3, profession.professionId, 'маршрут должен содержать минимум три этапа')
  validate(narrativeProfessionIds.has(profession.professionId), profession.professionId, 'у профессии нет сквозной новеллы и собственного главного героя')
  professionIds.add(profession.professionId)
  const routeCourseIds = new Set()
  for (const stage of profession.stages ?? []) {
    validate(Boolean(stage.title && stage.goal), profession.professionId, 'у этапа не заполнены title или goal')
    validate(stage.courseIds?.length >= 1, profession.professionId, `этап «${stage.title}» не содержит курсов`)
    for (const courseId of stage.courseIds ?? []) {
      validate(runtimeCourseIds.has(courseId), profession.professionId, `маршрут ссылается на неизвестный курс: ${courseId}`)
      validate(!routeCourseIds.has(courseId), profession.professionId, `курс повторяется в маршруте: ${courseId}`)
      routeCourseIds.add(courseId)
      professionRouteCourseIds.add(courseId)
    }
    for (const prerequisite of stage.prerequisites ?? []) {
      validate(runtimeCourseIds.has(prerequisite), profession.professionId, `неизвестная зависимость этапа: ${prerequisite}`)
    }
  }
}

const storyCourseIds = new Set()
for (const file of (await readdir(storyCasesRoot)).filter(name => name.endsWith('.json') && name !== 'prologue.json')) {
  const story = JSON.parse(await readFile(resolve(storyCasesRoot, file), 'utf8'))
  validate(courseIds.has(story.courseId), story.caseId ?? file, `сюжет ссылается на неизвестный курс: ${story.courseId}`)
  validate(!storyCourseIds.has(story.courseId), story.caseId ?? file, `для курса найдено несколько сюжетных дел: ${story.courseId}`)
  validate(story.cast?.length >= 3, story.caseId ?? file, 'в сюжетном деле должно быть минимум три персонажа')
  validate(story.acts?.length >= 4, story.caseId ?? file, 'сюжетное дело должно содержать минимум четыре акта')
  validate(story.endings?.length >= 2, story.caseId ?? file, 'сюжетное дело должно содержать минимум две концовки')
  for (const castId of story.cast ?? []) {
    validate(castIds.has(castId), story.caseId ?? file, `неизвестный персонаж в составе дела: ${castId}`)
    validate(illustratedCastIds.has(castId), story.caseId ?? file, `у персонажа нет иллюстрированных поз: ${castId}`)
  }
  for (const act of story.acts ?? []) {
    for (const beat of act.beats ?? []) {
      const speakers = beat.kind === 'line'
        ? [beat.speaker]
        : beat.kind === 'comic'
          ? beat.panels.map(panel => panel.speaker).filter(Boolean)
          : []
      for (const speaker of speakers) {
        validate(castIds.has(speaker), act.id, `неизвестный speaker: ${speaker}`)
        validate(speaker === 'narrator' || story.cast.includes(speaker), act.id, `speaker ${speaker} отсутствует в составе дела`)
        validate(speaker === 'narrator' || illustratedCastIds.has(speaker), act.id, `у speaker ${speaker} нет иллюстрированного спрайта`)
      }
    }
  }
  storyCourseIds.add(story.courseId)
}

for (const courseId of professionRouteCourseIds) {
  validate(storyCourseIds.has(courseId), courseId, 'профессиональный блок не имеет собственного сюжетного дела')
  const course = coursesById.get(courseId)
  if (!course) continue
  const practical = course.missions.filter(mission => mission.task?.starterCode)
  validate(practical.length / course.missions.length >= 0.65, courseId, 'в профессиональном блоке практика должна занимать не менее 65% миссий')
  validate(course.missions.some(mission => mission.historicalFact?.sourceUrl), courseId, 'нет исторического или научного факта с источником')
  for (const mission of practical) {
    validate(mission.task?.codeChecks?.length >= 3, mission.id, 'практическая миссия должна иметь минимум три автоматические проверки')
  }
}

for (const missionFile of missionFiles) {
  const mission = JSON.parse(await readFile(resolve(missionsDir, missionFile), 'utf8'))
  const missionId = mission.id ?? missionFile
  validate(mission.schemaVersion === 1, missionId, 'неподдерживаемая schemaVersion')
  validate(mission.locale === 'ru-RU', missionId, 'locale должен быть ru-RU')
  validate(mission.activities?.length >= 2, missionId, 'нужно минимум два интерактивных действия')
  validate(mission.sourceIds?.length >= 2, missionId, 'Fact Digest должен опираться минимум на два источника')
  validate(mission.factDigest?.length >= 1, missionId, 'Fact Digest отсутствует')
  validate(mission.executionTests?.length >= 1, missionId, 'нет исполняемых проверок')
  validate(mission.review?.executionValidated === true, missionId, 'reference solution/tests не подтверждены')
  validate(mission.review?.technicalReview === 'approved', missionId, 'нет технического ревью')
  validate(mission.review?.russianEdit === 'approved', missionId, 'нет русской редактуры')
  validate(mission.review?.licenseReview === 'approved', missionId, 'нет лицензионной проверки')

  for (const sourceId of mission.sourceIds ?? []) {
    validate(knownSourceIds.has(sourceId), missionId, `неизвестный sourceId: ${sourceId}`)
  }
  for (const fact of mission.factDigest ?? []) {
    validate(Boolean(fact.claim), missionId, 'в Fact Digest найден пустой факт')
    validate(fact.sourceIds?.length >= 1, missionId, `у факта «${fact.claim}» нет provenance`)
    for (const sourceId of fact.sourceIds ?? []) validate(knownSourceIds.has(sourceId), missionId, `у факта указан неизвестный sourceId: ${sourceId}`)
  }

  const parsedDatasets = new Map()
  for (const dataset of mission.datasets ?? []) {
    datasetCount += 1
    const datasetPath = resolve(datasetsDir, dataset.file)
    try {
      await access(datasetPath)
      const lines = (await readFile(datasetPath, 'utf8')).trim().split(/\r?\n/)
      const [header, ...dataLines] = lines
      validate(header === dataset.columns.join(','), missionId, `${dataset.file}: схема CSV не совпадает с декларацией`)
      validate(dataset.columns.includes(dataset.primaryKey), missionId, `${dataset.file}: primaryKey отсутствует в схеме`)
      parsedDatasets.set(dataset.id, {
        columns: dataset.columns,
        rows: dataLines.map(line => Object.fromEntries(line.split(',').map((value, index) => [dataset.columns[index], value])))
      })
    } catch {
      errors.push(`${missionId}: не найден датасет ${dataset.file}`)
    }
  }

  for (const test of mission.executionTests ?? []) {
    const dataset = parsedDatasets.get(test.datasetId)
    validate(Boolean(dataset), missionId, `execution test ссылается на неизвестный datasetId: ${test.datasetId}`)
    if (!dataset) continue
    const { columns, rows } = dataset
    if (test.type === 'column-exists') {
      validate(columns.includes(test.column), missionId, `column-exists не прошёл: ${test.column}`)
    } else if (test.type === 'row-exists') {
      validate(rows.some(row => row[test.column] === test.value), missionId, `row-exists не прошёл: ${test.column}=${test.value}`)
    } else if (test.type === 'cell-equals') {
      const row = rows.find(item => item[test.where.column] === test.where.value)
      validate(row?.[test.column] === test.value, missionId, `cell-equals не прошёл: ${test.column}=${test.value}`)
    } else if (test.type === 'distinct-less-than-rows') {
      const distinct = new Set(rows.map(row => row[test.column])).size
      validate(distinct < rows.length, missionId, `distinct-less-than-rows не прошёл для ${test.column}`)
    } else {
      errors.push(`${missionId}: неизвестный тип execution test ${test.type}`)
    }
  }

  for (const check of [mission.reasoningCheck, mission.productionCheck]) {
    validate(check?.options?.includes(check.answer), missionId, `ответ проверки «${check?.prompt ?? 'без названия'}» отсутствует в options`)
  }
  activityCount += mission.activities?.length ?? 0
}

if (errors.length) {
  console.error(`Content Factory: найдено ошибок — ${errors.length}`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Content Factory: проверено миссий — ${missionFiles.length}`)
console.log(`Учебные программы: проверено курсов — ${courseIds.size}; миссий — ${courseMissionCount}`)
console.log(`Источники каталога: ${catalog.sources.length}; действия: ${activityCount}; датасеты: ${datasetCount}`)
