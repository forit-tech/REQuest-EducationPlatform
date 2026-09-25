import { useState } from 'react'
import { Flag, X } from 'lucide-react'
import {
  ISSUE_AREAS, ISSUE_SEVERITY_LABEL, ISSUE_TYPE_LABEL, addIssue,
  type IssueSeverity, type IssueType,
} from '../core/qa'
import type { Mission, Room } from '../types'

const TYPES: IssueType[] = ['BUG', 'COURSE_LOGIC', 'IMPROVEMENT', 'CONTENT_ERROR']
const SEVERITIES: IssueSeverity[] = ['low', 'medium', 'high', 'blocker']

const PLACEHOLDER: Record<IssueType, string> = {
  BUG: 'Например: проверка не засчитывает верное решение',
  COURSE_LOGIC: 'Например: здесь требуют .groupby(), но его ещё не объясняли',
  IMPROVEMENT: 'Например: объяснение станет понятнее, если показать вывод',
  CONTENT_ERROR: 'Например: в примере опечатка, среднее посчитано неверно',
}

/**
 * Отметка о проблеме прямо из урока.
 *
 * Смысл кнопки — не завести задачу, а не потерять наблюдение: человек учится,
 * и всё, кроме типа и пары слов, форма заполняет сама. Выделенный на странице
 * текст подхватывается в момент открытия, потому что модальное окно снимает
 * выделение сразу после появления.
 */
export function QaFlag({ room, mission, author }: { room: Room; mission: Mission; author: string }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<IssueType>('COURSE_LOGIC')
  const [severity, setSeverity] = useState<IssueSeverity>('medium')
  const [area, setArea] = useState<string>('теория')
  const [blocker, setBlocker] = useState(false)
  const [description, setDescription] = useState('')
  const [quote, setQuote] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function start() {
    const selection = window.getSelection()?.toString().trim()
    setQuote(selection ? selection.slice(0, 500) : null)
    setSaved(false)
    setOpen(true)
  }

  function save() {
    if (!description.trim()) return
    addIssue({
      createdBy: author,
      type, severity, blocker,
      courseId: room.id,
      courseTitle: room.title,
      missionId: mission.id,
      missionTitle: mission.title,
      missionStage: mission.stage,
      concept: mission.concept,
      targetArea: area,
      quote,
      description: description.trim(),
      appVersion: __APP_VERSION__,
    })
    setDescription('')
    setQuote(null)
    setBlocker(false)
    setSaved(true)
    setOpen(false)
  }

  return <>
    <button type="button" className="qa-flag" onClick={start} title="Пометить проблему в этой миссии">
      <Flag size={14}/><span>{saved ? 'Отмечено' : 'Пометить'}</span>
    </button>
    {open && <div className="qa-overlay" role="dialog" aria-label="Отметить проблему">
      <div className="qa-sheet">
        <header>
          <div>
            <b>Что не так в этой миссии?</b>
            <small>{room.title} · {mission.id}</small>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть"><X size={16}/></button>
        </header>

        <div className="qa-types">
          {TYPES.map(item => <button key={item} type="button" className={item === type ? 'active' : ''} onClick={() => setType(item)}>
            {ISSUE_TYPE_LABEL[item]}
          </button>)}
        </div>

        {quote && <blockquote className="qa-quote">{quote}</blockquote>}

        <textarea
          value={description}
          onChange={event => setDescription(event.target.value)}
          placeholder={PLACEHOLDER[type]}
          rows={3}
          autoFocus
        />

        <div className="qa-meta">
          <label>Место
            <select value={area} onChange={event => setArea(event.target.value)}>
              {ISSUE_AREAS.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Важность
            <select value={severity} onChange={event => setSeverity(event.target.value as IssueSeverity)}>
              {SEVERITIES.map(item => <option key={item} value={item}>{ISSUE_SEVERITY_LABEL[item]}</option>)}
            </select>
          </label>
        </div>

        <label className="qa-blocker">
          <input type="checkbox" checked={blocker} onChange={() => setBlocker(!blocker)}/>
          <span>Мешает продолжить обучение</span>
        </label>

        <footer>
          <button type="button" className="qa-cancel" onClick={() => setOpen(false)}>Отмена</button>
          <button type="button" className="qa-save" disabled={!description.trim()} onClick={save}>Сохранить</button>
        </footer>
      </div>
    </div>}
  </>
}
