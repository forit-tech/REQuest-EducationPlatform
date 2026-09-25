import { useMemo, useState } from 'react'
import { ArrowRight, Check, ClipboardCopy, Download, Trash2 } from 'lucide-react'
import {
  ISSUE_SEVERITY_LABEL, ISSUE_STATUS_LABEL, ISSUE_TYPE_LABEL,
  issueForAgent, issuesAsMarkdown, listIssues, removeIssue, updateIssue,
  type IssueStatus, type IssueType, type LearningIssue,
} from './core/qa'

const TYPES: IssueType[] = ['BUG', 'COURSE_LOGIC', 'IMPROVEMENT', 'CONTENT_ERROR']

/**
 * Очередь замечаний, снятых во время прохождения.
 *
 * Это не трекер задач: здесь нужно быстро найти запись, вернуться ровно к той
 * миссии и пометить разобранное. Поэтому фильтров ровно три, а действий у
 * карточки четыре.
 */
export function QaView({ onOpenMission }: { onOpenMission: (courseId: string, missionId: string) => void }) {
  const [issues, setIssues] = useState<LearningIssue[]>(() => listIssues())
  const [status, setStatus] = useState<IssueStatus | 'all'>('open')
  const [type, setType] = useState<IssueType | 'all'>('all')
  const [course, setCourse] = useState<string>('all')
  const [copied, setCopied] = useState<string | null>(null)

  const courses = useMemo(() => [...new Set(issues.map(issue => issue.courseId))].sort(), [issues])
  const shown = issues.filter(issue =>
    (status === 'all' || issue.status === status)
    && (type === 'all' || issue.type === type)
    && (course === 'all' || issue.courseId === course))

  const refresh = () => setIssues(listIssues())

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1500)
    }, () => { /* буфер недоступен */ })
  }

  function exportMarkdown() {
    const blob = new Blob([issuesAsMarkdown(shown)], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'reduquest-qa.md'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className="qa-view">
    <header className="qa-view-head">
      <div>
        <span className="section-kicker">QA · ЗАМЕЧАНИЯ</span>
        <h1>Что нашлось при прохождении</h1>
        <p>Открытых: {issues.filter(issue => issue.status === 'open').length} из {issues.length}. Замечания не влияют на прогресс обучения.</p>
      </div>
      <button type="button" className="section-link" onClick={exportMarkdown} disabled={!shown.length}>
        <Download size={16}/> Экспорт в Markdown
      </button>
    </header>

    <div className="qa-filters">
      <label>Состояние
        <select value={status} onChange={event => setStatus(event.target.value as IssueStatus | 'all')}>
          <option value="all">любое</option>
          {(Object.keys(ISSUE_STATUS_LABEL) as IssueStatus[]).map(item =>
            <option key={item} value={item}>{ISSUE_STATUS_LABEL[item]}</option>)}
        </select>
      </label>
      <label>Тип
        <select value={type} onChange={event => setType(event.target.value as IssueType | 'all')}>
          <option value="all">любой</option>
          {TYPES.map(item => <option key={item} value={item}>{ISSUE_TYPE_LABEL[item]}</option>)}
        </select>
      </label>
      <label>Курс
        <select value={course} onChange={event => setCourse(event.target.value)}>
          <option value="all">все</option>
          {courses.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    </div>

    {!shown.length && <p className="qa-empty">Пока ничего не отмечено. Кнопка «Пометить» — в шапке урока.</p>}

    <div className="qa-list">
      {shown.map(issue => <article key={issue.id} className={`qa-card sev-${issue.severity} st-${issue.status}`}>
        <header>
          <span className="qa-tag">{ISSUE_TYPE_LABEL[issue.type]}</span>
          <span className="qa-sev">{ISSUE_SEVERITY_LABEL[issue.severity]}</span>
          {issue.blocker && <span className="qa-sev">мешает продолжить</span>}
          <span className="qa-status">{ISSUE_STATUS_LABEL[issue.status]}</span>
        </header>
        <h3>{issue.courseTitle} → {issue.missionTitle}</h3>
        <small>{issue.missionId} · {issue.targetArea}{issue.missionStage ? ` · ${issue.missionStage}` : ''}</small>
        <p>{issue.description}</p>
        {issue.quote && <blockquote>{issue.quote}</blockquote>}
        <footer>
          <button type="button" onClick={() => onOpenMission(issue.courseId, issue.missionId)}>
            Открыть миссию <ArrowRight size={14}/>
          </button>
          {issue.status !== 'fixed' && <button type="button" onClick={() => { updateIssue(issue.id, { status: 'fixed' }); refresh() }}>
            <Check size={14}/> Исправлено
          </button>}
          <button type="button" onClick={() => copy(issueForAgent(issue), issue.id)}>
            <ClipboardCopy size={14}/> {copied === issue.id ? 'Скопировано' : 'Скопировать для агента'}
          </button>
          <button type="button" className="qa-danger" onClick={() => { removeIssue(issue.id); refresh() }} aria-label="Удалить замечание">
            <Trash2 size={14}/>
          </button>
        </footer>
      </article>)}
    </div>
  </section>
}
