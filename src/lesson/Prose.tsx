import { useMemo } from 'react'
import { parseProse } from './parse-prose'

/**
 * Учебный текст с кодом.
 *
 * Раньше объяснение уходило в один абзац целиком, и браузер схлопывал в нём
 * переводы строк. Двухстрочная программа превращалась в одну строку, невозможную
 * в Python, — ровно в той миссии, которая учит, что строки выполняются сверху
 * вниз. Здесь код остаётся кодом: моноширинный шрифт, сохранённые переносы,
 * собственная подложка.
 */
export function Prose({ source, className }: { source?: string | null; className?: string }) {
  const blocks = useMemo(() => parseProse(source), [source])
  if (!blocks.length) return null
  return <div className={`prose${className ? ` ${className}` : ''}`}>
    {blocks.map((block, index) => {
      if (block.kind === 'code') {
        return <pre className="prose-code" key={index}><code>{block.value}</code></pre>
      }
      if (block.kind === 'output') {
        return <pre className="prose-output" key={index} aria-label="Вывод программы"><code>{block.value}</code></pre>
      }
      return <p key={index}>{block.value}</p>
    })}
  </div>
}
