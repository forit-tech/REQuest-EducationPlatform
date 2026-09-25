/**
 * Ворота качества курса: персонажи, изображения, педагогика и сюжет за один прогон.
 *
 *   node ./scripts/audit-course.mjs                     полный отчёт
 *   node ./scripts/audit-course.mjs --auditor=story     только один аудитор
 *   node ./scripts/audit-course.mjs --course=numpy      только один курс
 *   node ./scripts/audit-course.mjs --full              все находки, а не первые пять
 *   node ./scripts/audit-course.mjs --json              машинный вывод
 *   node ./scripts/audit-course.mjs --update-baseline   зафиксировать текущий долг
 *
 * Политика та же, что в воротах качества контента:
 *
 *   критические правила — ноль находок всегда. Это поломки, а не долг оформления:
 *                         реплика неизвестного героя, сцена, привязанная к
 *                         несуществующей миссии, недостижимая концовка.
 *   остальные ошибки    — не хуже базовой линии. Долг зафиксирован в файле, расти
 *                         ему нельзя, а каждое исправление опускает планку.
 *   предупреждения      — ничего не блокируют, но лежат в отчёте.
 *
 * Так проверка включается на живом контенте сразу, а не «когда-нибудь потом,
 * когда починим все 200 находок».
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadAuditCorpus } from './audit/corpus.mjs'
import { auditCharacters } from './audit/character.mjs'
import { auditVisuals } from './audit/visual.mjs'
import { auditPedagogy } from './audit/pedagogy.mjs'
import { auditStories } from './audit/story.mjs'

const root = resolve(import.meta.dirname, '..')
const reportsDir = join(root, 'knowledge', 'reports')
const baselinePath = join(reportsDir, 'course-audit-baseline.json')

const argument = name => process.argv.find(item => item.startsWith(`--${name}=`))?.split('=')[1]
const flag = name => process.argv.includes(`--${name}`)
const updating = flag('update-baseline')
const asJson = flag('json')
const showAll = flag('full')

const AUDITORS = [
  { id: 'character', title: 'Персонажи', run: auditCharacters },
  { id: 'visual', title: 'Изображения', run: auditVisuals },
  { id: 'pedagogy', title: 'Педагогика', run: auditPedagogy },
  { id: 'story', title: 'Сюжет', run: auditStories },
]

/**
 * Правила, которые нельзя занести в базовую линию. Признак один: находка означает,
 * что приложение показывает игроку сломанную сцену или требует несуществующее
 * знание. Стилистический долг сюда не входит.
 */
const CRITICAL_RULES = new Set([
  'A1.unknown-speaker',
  'A1.speaker-not-in-cast',
  'A1.unknown-emotion',
  'A1.self-gender',
  'A1.named-gender',
  // Долг закрыт полностью: обращения к игроку больше не имеют рода. Правило
  // переведено в критические, чтобы новая реплика не смогла вернуть его через
  // базовую линию.
  'A1.player-gender',
  'A1.protagonist-gender-missing',
  'A2.character-not-illustrated',
  'A2.scene-missing',
  'A2.unreadable',
  // Целостность контракта эмоций: объявленная нарисованной поза обязана быть на
  // диске, а замена для запланированной — вести к нарисованной. Долг здесь
  // невозможен: это не «ещё не дошли руки», а сломанное объявление.
  'A2.pose-not-drawn',
  'A2.substitute-missing',
  'A2.substitute-not-drawn',
  'A2.substitute-on-drawn',
  'A3.unexplained-construct',
  'A3.construct-before-lesson',
  'A4.case-missing',
  // Долг закрыт: ни одна глава больше не начинается со знакомства с командой.
  'A4.reintroduction',
  'A4.trigger-unknown-mission',
  'A4.ending-unreachable',
  'A4.arc-incomplete',
  'A4.act-too-short',
  'A4.unknown-location',
])

const started = Date.now()
const corpus = loadAuditCorpus(root)
const onlyAuditor = argument('auditor')
const onlyCourse = argument('course')

const findings = []
for (const auditor of AUDITORS) {
  if (onlyAuditor && auditor.id !== onlyAuditor) continue
  for (const item of auditor.run(corpus)) {
    if (onlyCourse && !String(item.where).includes(onlyCourse)) continue
    findings.push({ ...item, auditor: auditor.id })
  }
}
const elapsed = Date.now() - started

/* ------------------------------------------------------------------ свод */

const countBy = (list, key) => list.reduce((sum, item) => {
  sum[item[key]] = (sum[item[key]] ?? 0) + 1
  return sum
}, {})

const errorsByRule = countBy(findings.filter(item => item.severity === 'error'), 'rule')
const summary = AUDITORS.filter(auditor => !onlyAuditor || auditor.id === onlyAuditor).map(auditor => {
  const own = findings.filter(item => item.auditor === auditor.id)
  return {
    id: auditor.id,
    title: auditor.title,
    error: own.filter(item => item.severity === 'error').length,
    warning: own.filter(item => item.severity === 'warning').length,
    info: own.filter(item => item.severity === 'info').length,
  }
})

/* -------------------------------------------------------- базовая линия */

// Базовая линия сравнивается только с полным прогоном. Отфильтрованный аудит
// нашёл бы «улучшение» на каждом правиле, которое просто не проверялось.
const filtered = Boolean(onlyAuditor || onlyCourse)
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : { errorsByRule: {} }
const critical = findings.filter(item => item.severity === 'error' && CRITICAL_RULES.has(item.rule))
const regressions = filtered ? [] : Object.entries(errorsByRule)
  .filter(([rule]) => !CRITICAL_RULES.has(rule))
  .map(([rule, count]) => ({ rule, count, allowed: baseline.errorsByRule?.[rule] ?? 0 }))
  .filter(item => item.count > item.allowed)
const improvements = filtered ? [] : Object.entries(baseline.errorsByRule ?? {})
  .map(([rule, allowed]) => ({ rule, allowed, count: errorsByRule[rule] ?? 0 }))
  .filter(item => item.count < item.allowed)

if (updating && filtered) {
  console.error('Базовая линия фиксируется только по полному прогону: уберите --auditor и --course')
  process.exit(1)
}

/* ------------------------------------------------------------- отчёты */

mkdirSync(reportsDir, { recursive: true })
const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  elapsedMs: elapsed,
  scope: { auditor: onlyAuditor ?? 'все', course: onlyCourse ?? 'все' },
  counted: { cases: corpus.cases.length, courses: corpus.courses.length, chapters: corpus.chapters.length, sprites: corpus.sprites.size },
  summary,
  errorsByRule,
  findings,
}
if (!onlyAuditor && !onlyCourse) {
  writeFileSync(join(reportsDir, 'course-audit.json'), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(reportsDir, 'course-audit.md'), markdown(report, { critical, regressions }))
}

if (updating) {
  writeFileSync(baselinePath, JSON.stringify({
    $comment: 'Долг аудита курса на момент фиксации. Расти нельзя, уменьшать можно и нужно.',
    updatedAt: report.generatedAt,
    errorsByRule,
  }, null, 2) + '\n')
  console.log(`Базовая линия аудита обновлена: ${Object.values(errorsByRule).reduce((sum, count) => sum + count, 0)} ошибок в ${Object.keys(errorsByRule).length} правилах`)
  process.exit(0)
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(critical.length || regressions.length ? 1 : 0)
}

/* ------------------------------------------------------------- консоль */

const pad = (text, width) => String(text).padEnd(width, ' ')
console.log('')
console.log(`Аудит курса REQuest · ${report.counted.courses} курсов, ${report.counted.cases} дел, ${report.counted.sprites} спрайтов`)
console.log('')
console.log(`  ${pad('аудитор', 14)}${pad('ошибки', 9)}${pad('предупреждения', 16)}заметки`)
for (const row of summary) {
  const mark = row.error ? '✕' : row.warning ? '·' : '✓'
  console.log(`  ${mark} ${pad(row.title, 12)}${pad(row.error, 9)}${pad(row.warning, 16)}${row.info}`)
}
console.log('')

for (const auditor of summary) {
  const own = findings.filter(item => item.auditor === auditor.id && item.severity !== 'info')
  if (!own.length) continue
  console.log(`${auditor.title}`)
  const byRule = new Map()
  for (const item of own) {
    if (!byRule.has(item.rule)) byRule.set(item.rule, [])
    byRule.get(item.rule).push(item)
  }
  for (const [rule, items] of [...byRule].sort((left, right) => right[1].length - left[1].length)) {
    const level = items[0].severity === 'error' ? 'ошибка' : 'предупреждение'
    console.log(`  ${rule} · ${items.length} · ${level}`)
    for (const item of showAll ? items : items.slice(0, 3)) {
      console.log(`    ${item.where}: ${item.message}`)
      if (item.sample) console.log(`      «${String(item.sample).slice(0, 120).replace(/\s+/g, ' ')}»`)
    }
    if (!showAll && items.length > 3) console.log(`    … ещё ${items.length - 3} (--full покажет все)`)
  }
  console.log('')
}

if (!onlyAuditor && !onlyCourse) console.log('Отчёт: knowledge/reports/course-audit.md')

if (improvements.length) {
  console.log('')
  console.log('Стало лучше базовой линии — зафиксируйте: npm run audit:course:baseline')
  for (const item of improvements) console.log(`  ${item.rule}: ${item.allowed} → ${item.count}`)
}

if (critical.length) {
  console.log('')
  console.log(`Критические ошибки (${critical.length}) — публикация заблокирована:`)
  for (const item of critical.slice(0, 20)) console.log(`  ${item.rule} · ${item.where}: ${item.message}`)
  if (critical.length > 20) console.log(`  … ещё ${critical.length - 20}`)
}
if (regressions.length) {
  console.log('')
  console.log('Ошибок стало больше, чем в базовой линии:')
  for (const item of regressions) console.log(`  ${item.rule}: ${item.count} против ${item.allowed}`)
}

if (critical.length || regressions.length) {
  console.log('')
  console.log('Аудит не пройден.')
  process.exit(1)
}
console.log('')
console.log('Аудит пройден: критических ошибок нет, долг не вырос.')

/* --------------------------------------------------------------- markdown */

function markdown(data, gate) {
  const lines = []
  lines.push('# Аудит курса REQuest')
  lines.push('')
  lines.push(`Собран ${data.generatedAt} · ${data.counted.courses} курсов · ${data.counted.cases} сюжетных дел · ${data.counted.chapters} глав профессий · ${data.counted.sprites} спрайтов`)
  lines.push('')
  lines.push('| Аудитор | Ошибки | Предупреждения | Заметки |')
  lines.push('| --- | ---: | ---: | ---: |')
  for (const row of data.summary) lines.push(`| ${row.title} | ${row.error} | ${row.warning} | ${row.info} |`)
  lines.push('')
  lines.push(gate.critical.length || gate.regressions.length
    ? '**Публикация заблокирована.**'
    : 'Критических ошибок нет, долг не вырос — публикация разрешена.')
  lines.push('')
  for (const auditor of data.summary) {
    const own = data.findings.filter(item => item.auditor === auditor.id)
    if (!own.length) continue
    lines.push(`## ${auditor.title}`)
    lines.push('')
    const byRule = new Map()
    for (const item of own) {
      if (!byRule.has(item.rule)) byRule.set(item.rule, [])
      byRule.get(item.rule).push(item)
    }
    for (const [rule, items] of [...byRule].sort((left, right) => right[1].length - left[1].length)) {
      lines.push(`### ${rule} · ${items.length} · ${items[0].severity}`)
      lines.push('')
      for (const item of items.slice(0, 25)) {
        lines.push(`- \`${item.where}\` — ${item.message}${item.sample ? ` <br> «${String(item.sample).slice(0, 200).replace(/\s+/g, ' ')}»` : ''}`)
      }
      if (items.length > 25) lines.push(`- … ещё ${items.length - 25}`)
      lines.push('')
    }
  }
  return lines.join('\n') + '\n'
}
