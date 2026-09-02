/**
 * Дописывает `.js` относительным импортам в собранном JS.
 *
 * Приложение собирается Vite и пишет импорты без расширений. Node так не умеет,
 * а менять стиль импортов во всём проекте ради одного тестового прогона — плохой
 * размен. Поэтому расширения проставляются постобработкой, и только в сборке
 * для тестов.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const target = resolve(process.argv[2] ?? 'build/engine')

function walk(dir) {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

let patched = 0
for (const file of walk(target).filter(path => path.endsWith('.js'))) {
  const source = readFileSync(file, 'utf8')
  const fixed = source.replace(/(from\s+|import\s*\()(['"])(\.\.?\/[^'"]+)\2/g, (match, prefix, quote, specifier) => {
    if (/\.(js|json|mjs|cjs)$/.test(specifier)) return match
    const base = resolve(file, '..', specifier)
    const suffix = existsSync(`${base}.js`) ? '.js' : existsSync(join(base, 'index.js')) ? '/index.js' : '.js'
    return `${prefix}${quote}${specifier}${suffix}${quote}`
  })
  if (fixed !== source) {
    writeFileSync(file, fixed, 'utf8')
    patched += 1
  }
}
console.log(`Расширения импортов проставлены в файлах: ${patched}`)
