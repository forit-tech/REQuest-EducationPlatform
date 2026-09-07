/** Регрессии учебного маршрута, которые нельзя надёжно увидеть по схеме JSON. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
const walk = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})
const courses = walk(join(root, 'knowledge')).filter(path => path.endsWith('course.json')).map(path => readFileSync(path, 'utf8')).map(JSON.parse)
const byId = new Map(courses.map(course => [course.id, course]))
const programs = read('knowledge/professions/programs.json')
const catalog = read('knowledge/data/programs.json')

let passed = 0
const check = (label, run) => { run(); passed += 1; console.log(`  ✓ ${label}`) }

check('каждый маршрут с python-core сначала проходит python-first-steps', () => {
  const routed = programs.filter(program => program.stages.some(stage => stage.courseIds.includes('python-core')))
  assert.equal(routed.length, 6, `ожидалось 6 Python-маршрутов, найдено ${routed.length}`)
  for (const program of routed) {
    const route = program.stages.flatMap(stage => stage.courseIds)
    assert.ok(route.includes('python-first-steps'), `${program.professionId}: нет python-first-steps`)
    assert.ok(route.indexOf('python-first-steps') < route.indexOf('python-core'), `${program.professionId}: Basics стоит после Core`)
  }
})

check('python-core закрыт прямой зависимостью от Basics', () => {
  const core = catalog.find(course => course.id === 'python-core')
  assert.deepEqual(core?.prerequisites, ['python-first-steps'])
})

check('порядок внутри этапа является обязательным, а не только визуальным', () => {
  for (const program of programs) for (const stage of program.stages) {
    for (let index = 1; index < stage.courseIds.length; index += 1) {
      assert.notEqual(stage.courseIds[index], stage.courseIds[index - 1],
        `${program.professionId}: курс продублирован подряд и не образует осмысленную ступень`)
    }
  }
  const analyst = programs.find(program => program.professionId === 'data-analyst')
  const pythonStage = analyst.stages.find(stage => stage.courseIds.includes('pandas'))
  assert.deepEqual(pythonStage.courseIds.slice(-2), ['python-core', 'pandas'])
})

check('проверенные курсы размечают каждую миссию стадией и сущностью', () => {
  const audited = courses.filter(course => course.pedagogy?.audited)
  assert.ok(audited.length >= 2)
  for (const course of audited) for (const mission of course.missions) {
    assert.ok(mission.stage, `${course.id}/${mission.id}: нет stage`)
    assert.ok(mission.concept, `${course.id}/${mission.id}: нет concept`)
  }
})

check('самостоятельный код появляется только после учебной лестницы', () => {
  for (const course of courses.filter(course => course.pedagogy?.audited)) {
    for (const [index, mission] of course.missions.entries()) {
      if (mission.stage !== 'independent') continue
      const before = course.missions.slice(0, index).filter(item => item.concept === mission.concept)
      assert.ok(before.length >= 3, `${course.id}/${mission.id}: перед independent меньше трёх ступеней`)
      assert.ok(before.some(item => item.stage === 'explained'), `${course.id}/${mission.id}: не было объяснения`)
      assert.ok(before.some(item => item.task?.starterCode), `${course.id}/${mission.id}: человек не работал с готовым кодом`)
      assert.ok(before.some(item => ['modified', 'filled', 'debugged'].includes(item.stage)), `${course.id}/${mission.id}: не было управляемой практики`)
    }
  }
})

check('две проверки не являются одной подстрокой, посчитанной дважды', () => {
  for (const course of courses.filter(course => course.pedagogy?.audited)) for (const mission of course.missions) {
    const checks = mission.task?.codeChecks ?? []
    for (let left = 0; left < checks.length; left += 1) for (let right = left + 1; right < checks.length; right += 1) {
      const a = checks[left]
      const b = checks[right]
      if (a.notIncludes || b.notIncludes || a.minOccurrences || b.minOccurrences) continue
      assert.ok(!a.includes.includes(b.includes) && !b.includes.includes(a.includes),
        `${course.id}/${mission.id}: проверки «${a.includes}» и «${b.includes}» вложены`)
    }
  }
})

console.log(`\nПедагогический контракт: пройдено проверок ${passed}`)
