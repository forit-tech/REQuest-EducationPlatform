/**
 * Ворота качества учебного контента.
 *
 * Политика двух периметров:
 *
 *   legacy — старому контенту разрешено быть плохим ровно настолько, насколько
 *            он плох сегодня. Базовая линия зафиксирована в файле; сборка падает,
 *            если число нарушений выросло. Чинить можно постепенно, и каждое
 *            исправление опускает планку.
 *   v2     — новым заданиям и материалам поступления не прощается ничего:
 *            ноль ошибок, иначе сборка не проходит.
 *
 *   node ./scripts/validate-quality.mjs                 проверить
 *   node ./scripts/validate-quality.mjs --update-baseline  зафиксировать базовую линию
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadCorpus, SCOPE, STRICT_SCOPES } from './quality/corpus.mjs'
import { admissionCoverage, runRules, INTEGRITY_RULES } from './quality/rules.mjs'

const root = resolve(import.meta.dirname, '..')
const buildDir = join(root, 'build', 'engine')
const reportsDir = join(root, 'knowledge', 'reports')
const baselinePath = join(reportsDir, 'quality-baseline.json')
const updating = process.argv.includes('--update-baseline')

if (!existsSync(join(buildDir, 'core/task/index.js'))) {
  console.error('Сначала соберите движок: npm run engine:build')
  process.exit(1)
}
const engine = {
  ...(await import(pathToFileURL(join(buildDir, 'core/task/index.js')).href)),
  ...(await import(pathToFileURL(join(buildDir, 'core/tasks.js')).href)),
}

const started = Date.now()
const corpus = loadCorpus(root)
const findings = runRules(corpus, engine)
const elapsed = Date.now() - started

/* ------------------------------------------------------------- свод */

const counters = {}
for (const item of findings) {
  const key = `${item.scope}/${item.severity}/${item.rule}`
  counters[key] = (counters[key] ?? 0) + 1
}

const countBy = (scope, severity) => findings.filter(item => item.scope === scope && item.severity === severity).length
const bucket = scope => ({ error: countBy(scope, 'error'), warning: countBy(scope, 'warning'), info: countBy(scope, 'info') })
const summary = {
  legacy: bucket(SCOPE.LEGACY),
  production: bucket(SCOPE.PRODUCTION),
  fixture: bucket(SCOPE.FIXTURE),
}

// Дефекты целостности не подлежат снисхождению ни в одном периметре: это не
// исторический долг оформления, а поломка поведения приложения.
const integrityDefects = findings.filter(item => item.severity === 'error' && INTEGRITY_RULES.has(item.rule))

const coverage = admissionCoverage(corpus)
const coverageByTrack = {}
for (const item of coverage) {
  const track = coverageByTrack[item.trackId] ?? { official: 0, structural: 0, byStatus: {} }
  if (item.official) track.official += 1
  else track.structural += 1
  track.byStatus[item.status] = (track.byStatus[item.status] ?? 0) + 1
  coverageByTrack[item.trackId] = track
}

const byRule = {}
for (const item of findings) {
  const entry = byRule[item.rule] ?? { severity: item.severity, scope: item.scope, count: 0, samples: [] }
  entry.count += 1
  if (entry.samples.length < 3) entry.samples.push({ where: item.where, message: item.message, sample: item.sample })
  byRule[item.rule] = entry
}

const affectedCourses = [...new Set(findings
  .filter(item => item.scope === SCOPE.LEGACY && item.severity === 'error')
  .map(item => String(item.where).split('/')[0]))]

const report = {
  generatedAt: new Date().toISOString(),
  durationMs: elapsed,
  corpus: {
    courses: corpus.courses.length,
    legacyMissions: corpus.legacyMissions.length,
    v2Tasks: corpus.v2Tasks.length,
    skills: corpus.skills.length,
    officialRequirements: corpus.requirements.filter(item => item.official).length,
    structuralRequirements: corpus.requirements.filter(item => !item.official).length,
    sources: corpus.sources.length,
  },
  summary,
  byRule,
  affectedCourses,
  admissionCoverage: coverageByTrack,
  requirements: coverage.map(item => ({ ref: item.ref, official: item.official, status: item.status, tasks: item.tasks, skills: item.skills })),
}

/* ------------------------------------------------------- базовая линия */

// В базовую линию попадает только допустимый временно долг оформления.
// Дефекты целостности в неё не заносятся принципиально: иначе она превратится
// в лицензию хранить функциональные баги.
const legacyErrorCounts = {}
for (const item of findings) {
  if (item.scope !== SCOPE.LEGACY || item.severity !== 'error') continue
  if (INTEGRITY_RULES.has(item.rule)) continue
  legacyErrorCounts[item.rule] = (legacyErrorCounts[item.rule] ?? 0) + 1
}

mkdirSync(reportsDir, { recursive: true })

if (updating) {
  const baseline = {
    note: 'Базовая линия качества старого контента. Число нарушений по каждому правилу не должно расти. Каждое исправление уменьшает эти числа — тогда базовую линию нужно перезаписать этой же командой.',
    updatedAt: new Date().toISOString(),
    legacyErrors: legacyErrorCounts,
    legacyWarnings: Object.fromEntries(Object.entries(counters)
      .filter(([key]) => key.startsWith(`${SCOPE.LEGACY}/warning/`))
      .map(([key, value]) => [key.split('/').slice(2).join('/'), value])),
  }
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
  console.log(`Базовая линия записана: ${Object.values(legacyErrorCounts).reduce((sum, value) => sum + value, 0)} ошибок старого контента`)
}

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : { legacyErrors: {} }
const regressions = []
for (const [rule, count] of Object.entries(legacyErrorCounts)) {
  const allowed = baseline.legacyErrors[rule] ?? 0
  if (count > allowed) regressions.push({ rule, count, allowed })
}
const improvements = Object.entries(baseline.legacyErrors)
  .filter(([rule, allowed]) => (legacyErrorCounts[rule] ?? 0) < allowed)
  .map(([rule, allowed]) => ({ rule, count: legacyErrorCounts[rule] ?? 0, allowed }))

report.baseline = { regressions, improvements, integrityDefects: integrityDefects.length }
report.integrityRules = [...INTEGRITY_RULES]
writeFileSync(join(reportsDir, 'content-quality.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

/* ------------------------------------------------- человеческая сводка */

const severityOrder = { error: 0, warning: 1, info: 2 }
const lines = []
lines.push('# Качество учебного контента', '')
lines.push(`Собрано ${new Date(report.generatedAt).toLocaleString('ru-RU')} за ${elapsed} мс.`, '')
lines.push('| Периметр | Ошибки | Предупреждения | Наблюдения |', '|---|---:|---:|---:|')
lines.push(`| Старый контент | ${summary.legacy.error} | ${summary.legacy.warning} | ${summary.legacy.info} |`)
lines.push(`| Учебный материал | ${summary.production.error} | ${summary.production.warning} | ${summary.production.info} |`)
lines.push(`| Тестовые фикстуры | ${summary.fixture.error} | ${summary.fixture.warning} | ${summary.fixture.info} |`, '')
lines.push(`Дефектов целостности: ${integrityDefects.length} (допустимо ноль в любом периметре).`, '')
lines.push('Покрытие ниже — это характеристика программы, а не конкретного человека: оно отвечает на вопрос «есть ли в REQuest обучение по этому пункту». Готовность человека считается отдельно, по журналу его попыток.', '')
lines.push(`Корпус: ${report.corpus.courses} курсов, ${report.corpus.legacyMissions} старых заданий, ${report.corpus.v2Tasks} заданий новой модели, ${report.corpus.skills} навыков, ${report.corpus.officialRequirements} официальных вопросов вузов.`, '')
lines.push('## По правилам', '', '| Правило | Уровень | Периметр | Находок |', '|---|---|---|---:|')
for (const [rule, entry] of Object.entries(byRule).sort((left, right) => severityOrder[left[1].severity] - severityOrder[right[1].severity] || right[1].count - left[1].count)) {
  lines.push(`| ${rule} | ${entry.severity} | ${entry.scope} | ${entry.count} |`)
}
lines.push('', '## Покрытие требований вузов', '', '| Программа | Официальных вопросов | Структурных записей | Закрыто | Готово к экзамену |', '|---|---:|---:|---:|---:|')
for (const [trackId, track] of Object.entries(coverageByTrack)) {
  const covered = Object.entries(track.byStatus).filter(([status]) => status !== 'uncovered').reduce((sum, [, value]) => sum + value, 0)
  lines.push(`| ${trackId} | ${track.official} | ${track.structural} | ${covered} | ${track.byStatus['exam-ready'] ?? 0} |`)
}
lines.push('', 'Полный отчёт: `knowledge/reports/content-quality.json`.', '')
writeFileSync(join(reportsDir, 'content-quality.md'), lines.join('\n'), 'utf8')

/* ----------------------------------------------------------- вывод */

console.log(`Корпус: ${report.corpus.courses} курсов · ${report.corpus.legacyMissions} старых заданий · ${report.corpus.v2Tasks} новых · ${report.corpus.skills} навыков · ${report.corpus.officialRequirements} официальных вопросов`)
console.log(`Старый контент:    ошибок ${summary.legacy.error}, предупреждений ${summary.legacy.warning}`)
console.log(`Учебный материал:  ошибок ${summary.production.error}, предупреждений ${summary.production.warning}`)
console.log(`Тестовые фикстуры: ошибок ${summary.fixture.error}, предупреждений ${summary.fixture.warning}`)
console.log(`Дефектов целостности: ${integrityDefects.length}`)
console.log(`Проверка заняла ${elapsed} мс\n`)

const top = Object.entries(byRule)
  .filter(([, entry]) => entry.severity !== 'info')
  .sort((left, right) => severityOrder[left[1].severity] - severityOrder[right[1].severity] || right[1].count - left[1].count)
for (const [rule, entry] of top) {
  console.log(`  ${entry.severity === 'error' ? '✕' : '·'} ${rule.padEnd(34)} ${String(entry.count).padStart(5)}  ${entry.scope}`)
  if (entry.samples[0]) console.log(`      пример: ${entry.samples[0].where} — ${entry.samples[0].message}`)
}

if (improvements.length) {
  console.log('\nСтало лучше базовой линии:')
  for (const item of improvements) console.log(`  ${item.rule}: ${item.allowed} → ${item.count}`)
  console.log('  Перезапишите базовую линию: npm run quality:baseline')
}

let failed = false
const strictErrors = findings.filter(item => STRICT_SCOPES.includes(item.scope) && item.severity === 'error')
if (strictErrors.length) {
  failed = true
  console.error(`\nНовый контент обязан быть чистым, а ошибок ${strictErrors.length}:`)
  for (const item of strictErrors.slice(0, 10)) console.error(`  ✕ ${item.rule} · ${item.where}: ${item.message}`)
}
// Целостность не прощается нигде, включая старый контент: базовая линия — это
// уступка оформлению, а не разрешение хранить сломанное поведение.
if (integrityDefects.length) {
  failed = true
  console.error(`\nДефекты целостности не заносятся в базовую линию — их ${integrityDefects.length}:`)
  for (const item of integrityDefects.slice(0, 10)) console.error(`  ✕ ${item.rule} · ${item.where}: ${item.message}`)
}
if (regressions.length) {
  failed = true
  console.error('\nСтарый контент стал хуже базовой линии:')
  for (const item of regressions) console.error(`  ✕ ${item.rule}: было не больше ${item.allowed}, стало ${item.count}`)
}

console.log(`\nОтчёты: knowledge/reports/content-quality.json и .md`)
if (failed) process.exit(1)
console.log('Ворота качества пройдены\n')
