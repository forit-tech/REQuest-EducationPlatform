import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, BookOpen, Boxes, Check, ChevronRight, CircleDot,
  Code2, Compass, Database, Flame, FlaskConical, Hexagon, Home, Info, Layers3, LockKeyhole,
  GitBranch, Map, Play, Search, Settings, Sparkles, Star, TerminalSquare, Trophy, UserRound, X,
  Gift, Zap, Backpack,
} from 'lucide-react'
import { missionTypeLabels, rooms, roomsForProfession } from './data'
import type { AppSection, MissionType, Room, View } from './types'
import { AccountView, AuthView } from './AccountViews'
import { activeAccount, completeMission, getProgress, loadState, logout, setTheme as persistTheme, type ThemeId, type UserAccount, type UserProgress } from './core/storage'
import { careerDomains, professions, sharedSkillNames, type CareerDomainId, type Profession, type ProfessionId } from './professions'
import { glossary } from './glossary'
import dataPrograms from '../knowledge/data/programs.json'
import professionPrograms from '../knowledge/professions/programs.json'
import { MissionRunner } from './MissionRunner'
import { DiagnosticMode } from './diagnostic/DiagnosticMode'
import { getDiagnostic, getMastery, saveDiagnostic, saveMastery } from './core/storage'
import { normalizeMastery } from './core/task/mastery'
import skillRegistry from '../knowledge/skills/registry.json'
import itmoSkillMap from '../knowledge/admissions/itmo-skill-map.json'
import diagnosticProbes from '../knowledge/tasks/fixtures/diagnostic.json'
import type { Task } from './core/task/types'
import type { SkillNode } from './core/task/prerequisites'
import { StoryScene } from './story/StoryScene'
import { Sprite } from './story/Sprite'
import { caseActIds, caseChoiceIds, caseForCourse, caseProgress, cast, character, missionBriefAct, missionSceneForReplay, pendingAct, resolveEnding } from './story/engine'
import { applyChoice, claimDaily, emptyGame, focusBonusXp, getGame, markActSeen, rankFor, recordEnding, replayCase, spendEnergy, spendFocus as spendFocusPoints, useItem, ITEMS, FOCUS_BONUS_THRESHOLD, type BeatEffects, type GameState, MAX_ENERGY } from './core/game'
import type { StoryAct } from './story/types'
import { notifyCaseEnding, notifyMissionDone, syncProgress } from './core/notify'

const icons: Record<MissionType, typeof BookOpen> = {
  story: BookOpen, quiz: CircleDot, code: Code2, lab: FlaskConical, case: Database, boss: Trophy,
}


function Sidebar({ active, account, progress, onNavigate, onOpenAccount }: { active: string; account: UserAccount; progress: UserProgress; onNavigate: (section: AppSection) => void; onOpenAccount: () => void }) {
  const nav = [
    ['home', Home, 'Главная'], ['path', Map, 'Профессии'], ['practice', TerminalSquare, 'Практика'],
    ['projects', Boxes, 'Проекты'], ['hq', Backpack, 'Штаб'], ['achievements', Trophy, 'Достижения'],
  ] as const
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark"><Hexagon size={19}/><span>∿</span></div><span>REdu<strong>Quest</strong></span></div>
    <nav>
      <div className="nav-label">Обучение</div>
      {nav.map(([id, Icon, label]) => <button key={id} className={`nav-item ${active === id ? 'active' : ''}`} onClick={() => onNavigate(id)} aria-current={active === id ? 'page' : undefined}>
        <Icon size={18}/><span>{label}</span>{id === 'practice' && <span className="nav-kbd">⌘ K</span>}
      </button>)}
    </nav>
    <div className="sidebar-foot">
      <div className="streak"><Flame size={19}/><div><b>{progress.streak} дней</b><span>Личная серия</span></div></div>
      <button className="nav-item" onClick={onOpenAccount}><Settings size={18}/><span>Настройки</span></button>
      <button className="profile" onClick={onOpenAccount}><span className="avatar">{account.avatar ? <img src={account.avatar} alt=""/> : account.displayName.slice(0, 2).toUpperCase()}</span><span><b>{account.displayName}</b><small>Уровень 7 · {progress.xp.toLocaleString('ru-RU')} XP</small></span><ChevronRight size={16}/></button>
    </div>
  </aside>
}

function Header({ title = 'Профессии', onBack, room, theme, onThemeChange, xp, game, onOpenAccount, onOpenSearch }: { title?: string; onBack?: () => void; room?: Room; theme: ThemeId; onThemeChange: (theme: ThemeId) => void; xp: number; game: GameState; onOpenAccount: () => void; onOpenSearch: () => void }) {
  return <header className="topbar">
    <div className="crumbs">
      {onBack ? <button className="back-button" onClick={onBack}><ArrowLeft size={17}/></button> : <span>{title}</span>}
      {room && <><ChevronRight size={14}/><span>{room.category}</span><ChevronRight size={14}/><strong>{room.title}</strong></>}
    </div>
    <div className="top-actions">
      <button className="search" onClick={onOpenSearch} aria-haspopup="dialog"><Search size={16}/><span>Найти тему</span><kbd>Ctrl /</kbd></button>
      <div className="theme-toggle" title="Сменить тему"><button className={theme === 'future' ? 'active' : ''} onClick={() => onThemeChange('future')}>BLUE</button><button className={theme === 'hacker' ? 'active' : ''} onClick={() => onThemeChange('hacker')}>HACK</button></div>
      <GameHud game={game} xp={xp}/>
      <div className="xp-pill"><Star size={15}/><span>{xp.toLocaleString('ru-RU')} XP</span></div>
      <button className="icon-button" onClick={onOpenAccount}><UserRound size={18}/></button>
    </div>
  </header>
}

type SearchTarget =
  | { kind: 'section'; section: AppSection }
  | { kind: 'profession'; professionId: ProfessionId }
  | { kind: 'room'; roomId: string }
  | { kind: 'mission'; roomId: string; missionId: string }

type SearchEntry = { id: string; title: string; context: string; terms: string; target: SearchTarget }

function hasRoomProgress(room: Room, progress: UserProgress) {
  return room.missions.some(mission => progress.completedMissionIds.includes(mission.id))
}

function isRoomComplete(roomId: string, progress: UserProgress) {
  const room = rooms.find(item => item.id === roomId)
  return Boolean(room?.missions.length && room.missions.every(mission => progress.completedMissionIds.includes(mission.id)))
}

function isRoomAccessible(room: Room, progress: UserProgress) {
  if (hasRoomProgress(room, progress)) return true
  if (room.prerequisites?.length) return room.prerequisites.every(prerequisite => isRoomComplete(prerequisite, progress))
  return !room.locked
}

function isMissionAccessible(room: Room, missionId: string, progress: UserProgress) {
  if (!isRoomAccessible(room, progress)) return false
  const index = room.missions.findIndex(mission => mission.id === missionId)
  if (index < 0) return false
  if (progress.completedMissionIds.includes(missionId)) return true
  const firstIncomplete = room.missions.findIndex(mission => !progress.completedMissionIds.includes(mission.id))
  return index === (firstIncomplete < 0 ? room.missions.length - 1 : firstIncomplete)
}

function currentAccessibleRoom(progress: UserProgress) {
  const saved = rooms.find(item => item.id === progress.currentRoomId)
  return saved && isRoomAccessible(saved, progress) ? saved : rooms.find(item => isRoomAccessible(item, progress)) ?? rooms[0]
}

function GlobalSearch({ open, progress, onClose, onChoose }: { open: boolean; progress: UserProgress; onClose: () => void; onChoose: (target: SearchTarget) => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const entries = useMemo<SearchEntry[]>(() => {
    const sections: SearchEntry[] = [
      ['home', 'Главная', 'Раздел', 'продолжить обучение'],
      ['path', 'Профессии', 'Раздел', 'карьера направления дерево навыков'],
      ['practice', 'Практика', 'Раздел', 'тренажер упражнения'],
      ['projects', 'Проекты', 'Раздел', 'портфолио кейсы'],
      ['achievements', 'Достижения', 'Раздел', 'награды прогресс'],
    ].map(([section, title, context, terms]) => ({ id: `section-${section}`, title, context, terms, target: { kind: 'section', section: section as AppSection } }))
    const professionEntries: SearchEntry[] = professions.map(item => ({ id: `profession-${item.id}`, title: item.title, context: 'Профессия', terms: `${item.subtitle} ${item.description} ${item.stack.join(' ')}`, target: { kind: 'profession', professionId: item.id } }))
    const roomEntries: SearchEntry[] = rooms.filter(item => isRoomAccessible(item, progress)).map(item => ({ id: `room-${item.id}`, title: item.title, context: `Курс · ${item.category}`, terms: `${item.description} ${item.skills.join(' ')}`, target: { kind: 'room', roomId: item.id } }))
    const missionEntries: SearchEntry[] = rooms.flatMap(roomItem => roomItem.missions.filter(item => isMissionAccessible(roomItem, item.id, progress)).map(item => ({ id: `mission-${item.id}`, title: item.title, context: `Миссия · ${roomItem.title}`, terms: `${item.intro || ''} ${item.objectives?.join(' ') || ''}`, target: { kind: 'mission' as const, roomId: roomItem.id, missionId: item.id } })))
    return [...sections, ...professionEntries, ...roomEntries, ...missionEntries]
  }, [progress])
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU')
    if (!needle) return entries.filter(item => item.target.kind === 'section').slice(0, 5)
    return entries.filter(item => `${item.title} ${item.context} ${item.terms}`.toLocaleLowerCase('ru-RU').includes(needle)).slice(0, 12)
  }, [entries, query])
  useEffect(() => {
    if (!open) return
    setQuery('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])
  if (!open) return null
  return <div className="search-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Поиск по REduQuest">
      <div className="search-dialog-head"><Search size={19}/><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Профессия, курс или миссия…" aria-label="Поисковый запрос"/><button onClick={onClose} aria-label="Закрыть поиск"><X size={18}/></button></div>
      <div className="search-dialog-meta"><span>{query ? `Найдено: ${results.length}` : 'Быстрый переход'}</span><kbd>Esc — закрыть</kbd></div>
      <div className="search-results">{results.length ? results.map(item => <button key={item.id} className="search-result" onClick={() => onChoose(item.target)}><span className="search-result-icon">{item.target.kind === 'profession' ? <GitBranch size={18}/> : item.target.kind === 'mission' ? <BookOpen size={18}/> : item.target.kind === 'room' ? <Database size={18}/> : <Map size={18}/>}</span><span><strong>{item.title}</strong><small>{item.context}</small></span><ChevronRight size={17}/></button>) : <div className="search-empty"><Search size={23}/><strong>Ничего не найдено</strong><span>Попробуй название навыка, курса или профессии.</span></div>}</div>
    </section>
  </div>
}

function GameHud({ game, xp }: { game: GameState; xp: number }) {
  const rank = rankFor(xp)
  return <div className="game-hud">
    <div className="rank-chip" title={rank.next ? `До ранга «${rank.next.title}» — ${(rank.next.from - xp).toLocaleString('ru-RU')} XP` : 'Максимальный ранг'}>
      <b>{rank.current.title}</b><span>{rank.percent}%</span>
    </div>
    <div className="energy-meter" title={`Энергия ${game.energy} из ${MAX_ENERGY}. Восстанавливается сама: одна единица за пять минут.`}>
      <span className="energy-bar">{Array.from({ length: MAX_ENERGY }, (_, index) => <i key={index} className={index < game.energy ? 'on' : ''}/>)}</span>
      <span>{game.energy}</span>
    </div>
  </div>
}

function EndingView({ roomId, professionId, game, onReplay, onClose }: { roomId: string; professionId: ProfessionId; game: GameState; onReplay: () => void; onClose: () => void }) {
  const story = caseForCourse(roomId, professionId)
  if (!story) return null
  const ending = resolveEnding(story, game)
  return <div className="story-overlay" role="dialog" aria-label="Финал дела">
    <div className="story-panel"><div className="story-body">
      <div className="ending-card">
        <span className={`ending-rank ${ending.rank}`}>{ending.rank.toUpperCase()}</span>
        <h2>{ending.title}</h2>
        <p>{ending.summary}</p>
        <div className="ending-actions">
          <button className="section-button" onClick={onReplay}>Перепройти дело иначе</button>
          <button className="primary-button" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div></div>
  </div>
}

function HqView({ header, account, progress, professionId, game, onGameChange, onOpenRoom }: { header: React.ReactNode; account: UserAccount; progress: UserProgress; professionId: ProfessionId; game: GameState; onGameChange: (game: GameState) => void; onOpenRoom: (roomId: string) => void }) {
  const rank = rankFor(progress.xp)
  const today = new Date().toISOString().slice(0, 10)
  const dailyReady = game.dailyClaimedOn !== today
  const coffeeCount = game.inventory.filter(item => item === 'coffee').length
  const owned = [...new Set(game.inventory)]
  const careerProgram = (professionPrograms as Array<{ professionId: string; stages: Array<{ courseIds: string[] }> }>).find(item => item.professionId === professionId)
  const careerStories = careerProgram?.stages.flatMap(stage => stage.courseIds).map(courseId => caseForCourse(courseId, professionId)).filter(Boolean) ?? []
  const relations = careerStories[0]?.cast.map(character) ?? cast.filter(item => item.id !== 'narrator')
  return <>{header}<main className="main section-page">
    <SectionIntro kicker="ШТАБ" title="Снаряжение и связи" description="Здесь собрано всё, что ты заработал вне миссий: энергия, предметы, отношения с командой и закрытые дела."/>

    <section className="hq-top">
      <article className="hq-card daily">
        <div className="section-card-icon"><Gift size={20}/></div>
        <span className="section-kicker">ЕЖЕДНЕВНОЕ ЗАДАНИЕ</span>
        <h2>{dailyReady ? 'Отметиться на смене' : 'Смена отмечена'}</h2>
        <p>{dailyReady ? 'Полная шкала энергии и талон на кофе за то, что пришёл сегодня.' : 'Награда за сегодня получена. Следующая — завтра.'}</p>
        <button className="primary-button" disabled={!dailyReady} onClick={() => onGameChange(claimDaily(account.id))}>
          {dailyReady ? <><Gift size={16}/>Забрать награду</> : <><Check size={16}/>Уже забрано</>}
        </button>
      </article>

      <article className="hq-card energy">
        <div className="section-card-icon"><Zap size={20}/></div>
        <span className="section-kicker">ФОКУС</span>
        <h2>{game.energy} из {MAX_ENERGY}</h2>
        <p>{game.energy >= FOCUS_BONUS_THRESHOLD
          ? `Ты в фокусе: миссии сейчас дают +25% опыта. Порог — ${FOCUS_BONUS_THRESHOLD}.`
          : `До бонуса +25% опыта не хватает ${FOCUS_BONUS_THRESHOLD - game.energy}. Восстанавливается сам: единица за пять минут.`}</p>
        <p className="focus-rules">Фокус <b>не запирает миссии</b> — учиться можно с нулём. Он покупает подсказки (по 2) и даёт бонус к опыту, когда ты работаешь на свежую голову.</p>
        <div className="energy-bar big">{Array.from({ length: MAX_ENERGY }, (_, index) => <i key={index} className={index < game.energy ? 'on' : ''}/>)}</div>
        <button className="section-button" disabled={!coffeeCount || game.energy >= MAX_ENERGY} onClick={() => onGameChange(useItem(account.id, 'coffee'))}>
          ☕ Выпить кофе {coffeeCount ? `(${coffeeCount})` : ''} — плюс пять
        </button>
      </article>

      <article className="hq-card rank">
        <div className="section-card-icon"><Trophy size={20}/></div>
        <span className="section-kicker">РАНГ</span>
        <h2>{rank.current.title}</h2>
        <p>{rank.next ? `До ранга «${rank.next.title}» осталось ${(rank.next.from - progress.xp).toLocaleString('ru-RU')} XP.` : 'Максимальный ранг достигнут.'}</p>
        <div className="achievement-bar"><i style={{ width: `${rank.percent}%` }}/></div>
        <small>Прохождений сюжета: {game.playthrough}</small>
      </article>
    </section>

    <section className="hq-block">
      <div className="mission-list-head"><div><span className="section-kicker">ИНВЕНТАРЬ</span><h2>Предметы</h2></div><span>{owned.length} из {Object.keys(ITEMS).length}</span></div>
      <div className="inventory-grid">{Object.entries(ITEMS).map(([id, item]) => {
        const has = game.inventory.includes(id)
        const count = game.inventory.filter(entry => entry === id).length
        return <article className={`inventory-item ${has ? 'owned' : 'locked'}`} key={id}>
          <span className="item-icon">{has ? item.icon : <LockKeyhole size={18}/>}</span>
          <div><strong>{has ? item.title : 'Не получен'}{has && count > 1 ? ` ×${count}` : ''}</strong><p>{has ? item.description : 'Открывается по ходу дел и за решения в сюжете.'}</p></div>
        </article>
      })}</div>
    </section>

    <section className="hq-block">
      <div className="mission-list-head"><div><span className="section-kicker">КОМАНДА</span><h2>Отношения</h2></div><span>доверие меняется от твоих решений</span></div>
      <div className="relations-grid">{relations.map(item => {
        const value = game.trust[item.id] ?? 0
        const level = value >= 6 ? 'высокое' : value >= 3 ? 'рабочее' : value > 0 ? 'начальное' : value < 0 ? 'испорчено' : 'нейтральное'
        return <article className={`relation-card ${value < 0 ? 'negative' : ''}`} key={item.id}>
          <div className="relation-sprite"><Sprite character={item} height={150} emotion={value >= 6 ? 'happy' : value < 0 ? 'worried' : 'neutral'}/></div>
          <div>
            <strong>{item.name}</strong><span>{item.role}</span>
            <p className="relation-bio">{item.bio}</p>
            <div className="trust-bar"><i style={{ width: `${Math.min(100, Math.abs(value) / 10 * 100)}%` }}/></div>
            <small>Доверие: {value > 0 ? `+${value}` : value} · {level}</small>
          </div>
        </article>
      })}</div>
    </section>

    <section className="hq-block">
      <div className="mission-list-head"><div><span className="section-kicker">АРХИВ</span><h2>Закрытые дела</h2></div><span>концовки можно пересобрать</span></div>
      <div className="endings-grid">{careerStories.map(story => {
        if (!story) return null
        const endingId = game.endings[story.caseId]
        const ending = story.endings.find(item => item.id === endingId)
        const progressInCase = caseProgress(story, game)
        return <article className={`ending-row ${ending ? 'closed' : ''}`} key={story.caseId}>
          <div className="ending-row-head">
            <span className="case-number">{story.number}</span>
            {ending ? <span className={`ending-rank ${ending.rank}`}>{ending.rank.toUpperCase()}</span> : <span className="ending-rank pending">В РАБОТЕ</span>}
          </div>
          <h3>{story.title}</h3>
          <p>{ending ? ending.summary : story.logline}</p>
          <div className="case-progress"><i style={{ width: `${progressInCase.percent}%` }}/></div>
          <div className="ending-row-foot">
            <small>{progressInCase.seen} из {progressInCase.total} сцен · концовок открыто: {ending ? 1 : 0} из {story.endings.length}</small>
            <button className="section-link" onClick={() => onOpenRoom(story.courseId)}>{ending ? 'Перепройти' : 'Продолжить'} <ArrowRight size={15}/></button>
          </div>
        </article>
      })}</div>
    </section>
  </main></>
}

function plural(count: number, one: string, few: string, many: string) {
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${many}`
  const mod10 = count % 10
  if (mod10 === 1) return `${count} ${one}`
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${few}`
  return `${count} ${many}`
}

function ProgressRing({ percent }: { percent: number }) {
  return <div className="progress-ring" style={{ '--path-percent': `${percent}%` } as React.CSSProperties}><div><strong>{percent}%</strong><span>пути</span></div></div>
}

function ProfessionRoadmap({ profession, progress, onSelect, onOpenStage }: { profession: Profession; progress: UserProgress; onSelect: (id: ProfessionId) => void; onOpenStage: (roomId: string) => void }) {
  const available = profession.status === 'Доступен'
  const related = professions.filter(item => item.domainId === profession.domainId)
  return <section className="profession-roadmap">
    <div className="roadmap-heading"><div><span className="section-kicker">ДЕРЕВО ПРОФЕССИИ // 5 ЭТАПОВ</span><h2>Путь, блоки и стек</h2><p>Двигайся сверху вниз: этап открывает связанные учебные блоки, а справа показывает инструменты, с которыми ты будешь работать.</p></div><div className="roadmap-summary"><Layers3 size={18}/><span><strong>{profession.stages.reduce((sum, stage) => sum + stage.blocks.length, 0)}</strong> учебных блоков</span><span><strong>{new Set(profession.stages.flatMap(stage => stage.stack)).size}</strong> инструментов</span></div></div>
    <div className="tree-selector"><div><span className="section-kicker">ДЕРЕВЬЯ НАПРАВЛЕНИЯ</span><p>Сравни выбранную профессию со смежными ролями.</p></div><div>{related.map(item => <button key={item.id} className={item.id === profession.id ? 'active' : ''} onClick={() => onSelect(item.id)}><span className="mini-tree" aria-hidden="true">{item.stages.map((_, index) => <i key={index}/>)}</span><strong>{item.title}</strong><small>{item.id === profession.id ? 'выбрано' : 'показать дерево'}</small></button>)}</div></div>
    <div className="roadmap-tree">{profession.stages.map((stage, index) => {
      const linkedRoom = stage.roomId ? rooms.find(item => item.id === stage.roomId) : undefined
      const stageComplete = Boolean(linkedRoom && isRoomComplete(linkedRoom.id, progress))
      const canOpen = Boolean(linkedRoom && isRoomAccessible(linkedRoom, progress))
      const previousStagesComplete = profession.stages.slice(0, index).every(item => !item.roomId || isRoomComplete(item.roomId, progress))
      const state = !available ? 'planned' : stageComplete ? 'completed' : canOpen && previousStagesComplete ? 'active' : canOpen ? 'available' : 'locked'
      return <div className={`tree-stage ${state}`} key={stage.title}>
        <div className="tree-axis" aria-hidden="true"><span>{String(index + 1).padStart(2, '0')}</span>{index < profession.stages.length - 1 && <i/>}</div>
        <article className="tree-branch">
          <header><div><span className="stage-state">{state === 'active' ? 'Текущий этап' : state === 'available' ? 'Доступен' : state === 'completed' ? 'Пройден' : state === 'locked' ? 'Закрыт' : 'В плане'}</span><h3>{stage.title}</h3><p>{stage.goal}</p></div><button className="stage-open" disabled={!canOpen} onClick={() => stage.roomId && onOpenStage(stage.roomId)} aria-label={`${canOpen ? 'Открыть' : 'Недоступен'} этап «${stage.title}»`}><span>{canOpen ? stageComplete ? 'Повторить этап' : state === 'active' ? 'Начать этап' : 'Открыть этап' : state === 'planned' ? 'В плане' : 'Закрыт'}</span>{canOpen ? <ChevronRight size={20}/> : <LockKeyhole size={17}/>}</button></header>
          <div className="tree-content"><div className="tree-blocks"><span>Учебные блоки</span><div>{stage.blocks.map((block, blockIndex) => <div className="skill-node" key={block}><i>{String(blockIndex + 1).padStart(2, '0')}</i><strong>{block}</strong>{sharedSkillNames.has(block) && <em>общий навык</em>}</div>)}</div></div><aside className="tree-stack"><span>Стек этапа</span><div>{stage.stack.map(tool => <b key={tool}>{tool}</b>)}</div></aside></div>
        </article>
      </div>
    })}</div>
  </section>
}

function DataCurriculum({ progress, onOpen }: { progress: UserProgress; onOpen: (roomId: string) => void }) {
  const phases = [...new Set(dataPrograms.map(program => program.phase))]
  const totalMissions = dataPrograms.reduce((sum, program) => sum + program.missionCount, 0)
  return <section className="data-curriculum">
    <div className="roadmap-heading"><div><span className="section-kicker">ПОЛНАЯ ПРОГРАММА // ДАННЫЕ</span><h2>{dataPrograms.length} курса от фундамента до проекта</h2><p>Курсы открываются по зависимостям. Каждый узел — отдельная программа с практическими миссиями, а не одна длинная лекция.</p></div><div className="roadmap-summary"><Database size={18}/><span><strong>{dataPrograms.length}</strong> курса</span><span><strong>{totalMissions}</strong> миссий</span></div></div>
    <div className="program-tree">{phases.map((phase, phaseIndex) => <div className="program-phase" key={phase}><div className="program-axis"><span>{String(phaseIndex + 1).padStart(2, '0')}</span><strong>{phase}</strong></div><div className="program-nodes">{dataPrograms.filter(program => program.phase === phase).map(program => {
      const programRoom = rooms.find(item => item.id === program.id)
      const contentReady = program.status === 'ready' && Boolean(programRoom)
      const canOpen = Boolean(programRoom && contentReady && isRoomAccessible(programRoom, progress))
      const prerequisites = program.prerequisites.map(id => dataPrograms.find(item => item.id === id)?.title || id)
      return <article className={`program-node ${canOpen ? 'ready' : 'locked'}`} key={program.id}><div><span>{canOpen ? 'ДОСТУПЕН' : contentReady ? 'ЗАКРЫТ' : `${program.missionCount} МИССИЙ`}</span><h3>{program.title}</h3><p>{program.goal}</p></div><div className="program-blocks">{program.blocks.slice(0, 4).map(block => <i key={block}>{block}</i>)}{program.blocks.length > 4 && <i>+{program.blocks.length - 4} блоков</i>}</div>{canOpen ? <button className="section-link" onClick={() => onOpen(program.id)}>Открыть курс <ArrowRight size={16}/></button> : <small>{prerequisites.length ? `После: ${prerequisites.join(' · ')}` : 'Курс готовится'}</small>}</article>
    })}</div></div>)}</div>
  </section>
}

function RoomCard({ room, locked, onOpen, completedMissionIds }: { room: Room; locked: boolean; onOpen: () => void; completedMissionIds: string[] }) {
  const done = room.missions.filter(mission => completedMissionIds.includes(mission.id)).length
  const percent = Math.round(done / room.missions.length * 100)
  return <article className={`room-card ${locked ? 'locked' : ''}`} style={{ '--room-accent': room.accent } as React.CSSProperties}>
    <div className="room-index">{room.index}</div>
    <div className="room-content">
      <div className="room-meta"><span>{room.category}</span><span>•</span><span>{room.level}</span></div>
      <h3>{room.title}</h3>
      <p>{room.description}</p>
      <div className="skill-tags">{room.skills.map(skill => <span key={skill}>{skill}</span>)}</div>
      <div className="room-bottom">
        <div className="room-progress"><div className="progress-label"><span>{done ? `${done} из ${room.missions.length} миссий` : `${room.missions.length} миссий`}</span><strong>{percent}%</strong></div><div className="bar"><i style={{ width: `${percent}%` }}/></div></div>
        <button onClick={onOpen} disabled={locked} className="room-action" aria-label={locked ? `${room.title} — закрыто` : `Открыть ${room.title}`}>
          {locked ? <LockKeyhole size={17}/> : done ? <Play size={16} fill="currentColor"/> : <ArrowRight size={17}/>} 
        </button>
      </div>
    </div>
  </article>
}

function PathView({ onOpen, header, progress, domainId, professionId, onDomainChange, onProfessionChange }: { onOpen: (id: string) => void; header: React.ReactNode; progress: UserProgress; domainId: CareerDomainId; professionId: ProfessionId; onDomainChange: (id: CareerDomainId) => void; onProfessionChange: (id: ProfessionId) => void }) {
  const profession = professions.find(item => item.id === professionId) ?? professions[0]
  const program = professionPrograms.find(item => item.professionId === profession.id)
  const routeRooms = roomsForProfession(profession.id)
  const totalMissions = routeRooms.reduce((sum, room) => sum + room.missions.length, 0)
  const routeMissionIds = new Set(routeRooms.flatMap(room => room.missions.map(mission => mission.id)))
  const completedCount = progress.completedMissionIds.filter(id => routeMissionIds.has(id)).length
  const pathPercent = totalMissions ? Math.round(completedCount / totalMissions * 100) : 0
  const domain = careerDomains.find(item => item.id === domainId) ?? careerDomains[0]
  const domainProfessions = professions.filter(item => item.domainId === domain.id)
  const isReady = program?.status === 'ready' && routeRooms.length > 0
  const roadmapProfession: Profession = program ? {
    ...profession,
    status: isReady ? 'Доступен' : 'Скоро',
    stages: program.stages.map(stage => ({
      title: stage.title,
      goal: stage.goal,
      blocks: stage.courseIds.map(id => rooms.find(room => room.id === id)?.title ?? id),
      stack: profession.stack,
      roomId: stage.courseIds[0],
    })),
  } : profession
  const routeStartRoom = routeRooms.find(item => isRoomAccessible(item, progress) && !isRoomComplete(item.id, progress)) ?? routeRooms.find(item => isRoomAccessible(item, progress))
  const routeStarted = Boolean(routeStartRoom && hasRoomProgress(routeStartRoom, progress))
  return <>
    {header}
    <main className="main path-page">
      <section className="career-hub">
        <div className="career-heading"><div><span className="section-kicker">ШАГ 01 // НАПРАВЛЕНИЕ</span><h2>В какой области ты хочешь работать?</h2></div><p>Сначала выбери большую профессиональную область. Смежные роли больше не смешаны с принципиально разными профессиями.</p></div>
        <div className="domain-grid">{careerDomains.map(item => {
          const count = professions.filter(candidate => candidate.domainId === item.id).length
          return <button key={item.id} className={`domain-card ${domain.id === item.id ? 'selected' : ''}`} onClick={() => onDomainChange(item.id)}><span className="domain-icon"><item.Icon size={22}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><b>{count} {count === 5 ? 'ролей' : count === 3 ? 'роли' : 'роли'}</b></button>
        })}</div>
      </section>
      <section className="specialization-hub">
        <div className="career-heading"><div><span className="section-kicker">ШАГ 02 // {domain.title.toUpperCase()}</span><h2>Выбери специализацию</h2></div><p>Роли внутри направления используют общий фундамент, а затем расходятся в специализированные ветки.</p></div>
        <div className="profession-grid">{domainProfessions.map(item => { const ready = professionPrograms.some(programItem => programItem.professionId === item.id && programItem.status === 'ready'); return <button key={item.id} className={`profession-card ${profession.id === item.id ? 'selected' : ''}`} onClick={() => onProfessionChange(item.id)}><span className="profession-icon"><item.Icon size={20}/></span><span className="profession-copy"><strong>{item.title}</strong><small>{item.subtitle}</small></span><span className={`profession-status ${ready ? 'ready' : ''}`}>{ready ? 'Доступен' : 'Скоро'}</span></button> })}</div>
        <div className="shared-skills-note"><GitBranch size={18}/><div><strong>Один навык — несколько карьерных путей</strong><span>Основы Python, SQL, Git, Linux и другие общие блоки засчитываются везде. Повторно проходить их не придётся.</span></div></div>
      </section>
      <section className="path-hero">
        <div className="hero-copy"><div className="eyebrow"><Sparkles size={15}/> Выбранная профессия</div><h1>{profession.title}:<br/><span>{profession.subtitle}</span></h1><p>{profession.description} {isReady && 'Каждый учебный блок — отдельное приключение с миссиями, кодом и собственным прогрессом.'}</p>
          <div className="hero-actions">{isReady && routeStartRoom ? <><button className="primary-button" onClick={() => onOpen(routeStartRoom.id)}><Play size={16} fill="currentColor"/>{routeStarted ? 'Продолжить блок' : 'Открыть первый блок'}</button><span>{routeStartRoom.title} · {routeStartRoom.missions[0]?.minutes ?? 6} минут</span></> : <button className="primary-button" disabled><LockKeyhole size={16}/>Маршрут готовится</button>}</div>
        </div>
        {isReady ? <div className="hero-stats"><ProgressRing percent={pathPercent}/><div className="stat-stack"><div><strong>{completedCount}</strong><span>миссий пройдено</span></div><div><strong>{totalMissions}</strong><span>всего в маршруте</span></div></div></div> : <div className="profession-modules"><span>Основной стек</span>{profession.stack.map(tool => <b key={tool}>{tool}</b>)}</div>}
      </section>
      <ProfessionRoadmap profession={roadmapProfession} progress={progress} onSelect={onProfessionChange} onOpenStage={onOpen}/>
      {profession.id === 'data-scientist' && <DataCurriculum progress={progress} onOpen={onOpen}/>} 
      {isReady ? <>
      <section className="route-head"><div><span className="section-kicker">ПОЛНЫЙ МАРШРУТ</span><h2>{profession.title}: от первого дела до продакшена</h2></div><div className="legend"><span><i className="dot done"/>пройдено</span><span><i className="dot current"/>доступно</span><span><i className="dot"/>закрыто</span></div></section>
      <section className="route-grid">
        <div className="route-line" aria-hidden="true"/>
        {routeRooms.map(room => <RoomCard key={room.id} room={room} locked={!isRoomAccessible(room, progress)} completedMissionIds={progress.completedMissionIds} onOpen={() => onOpen(room.id)}/>)}
      </section>
      <section className="next-path"><div><span className="section-kicker">СБОРКА ПРОФЕССИИ</span><h2>Соедини пройденные блоки в итоговый проект</h2><p>SQL, Python, математика и ML изучаются отдельными приключениями, а в финале сходятся в одном рабочем решении.</p></div><div className="specialties"><span>Рабочий артефакт</span><span>Код и проверки</span><span>Защита решения</span></div></section>
      </> : <section className="profession-preview"><div className="preview-mark"><profession.Icon size={28}/></div><div><span className="section-kicker">МАРШРУТ В РАЗРАБОТКЕ</span><h2>{profession.title}</h2><p>Структура профессии уже предусмотрена платформой. Полноценные комнаты и практические миссии будут добавлены следующим контентным этапом.</p></div><button className="ds-button ds-secondary" onClick={() => onProfessionChange('data-scientist')}>Открыть готовый маршрут</button></section>}
    </main>
  </>
}

function SectionIntro({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div className="section-intro"><span className="section-kicker">{kicker}</span><h1>{title}</h1><p>{description}</p></div>
}

function HomeView({ header, account, progress, onContinue, onOpenPath, onOpenPractice, onOpenDiagnostic }: { header: React.ReactNode; account: UserAccount; progress: UserProgress; onContinue: (roomId: string) => void; onOpenPath: () => void; onOpenPractice: () => void; onOpenDiagnostic: () => void }) {
  const totalMissions = rooms.reduce((sum, room) => sum + room.missions.length, 0)
  const percent = Math.round(progress.completedMissionIds.length / totalMissions * 100)
  const currentRoom = currentAccessibleRoom(progress)
  return <>{header}<main className="main section-page">
    <section className="home-command"><div><span className="section-kicker">ЦЕНТР УПРАВЛЕНИЯ ОБУЧЕНИЕМ</span><h1>С возвращением, {account.displayName}</h1><p>Выбери учебный блок или продолжи уже начатый. Приключение запускается только внутри выбранного блока.</p><div className="hero-actions"><button className="primary-button" onClick={() => onContinue(currentRoom.id)}><Play size={16} fill="currentColor"/>Продолжить блок</button><button className="section-button" onClick={onOpenPath}><Map size={17}/>Открыть карьерные пути</button></div></div><ProgressRing percent={percent}/></section>
    <section className="section-metrics"><article><span>Пройдено миссий</span><strong>{progress.completedMissionIds.length}</strong><small>из {totalMissions} в первом маршруте</small></article><article><span>Энергия опыта</span><strong>{progress.xp.toLocaleString('ru-RU')} XP</strong><small>общий прогресс профиля</small></article><article><span>Серия занятий</span><strong>{progress.streak} дней</strong><small>ритм сохранён</small></article></section>
    <section className="home-grid"><article className="focus-card"><div className="section-card-icon"><Database size={20}/></div><span className="section-kicker">ТЕКУЩИЙ БЛОК</span><h2>{currentRoom.title}</h2><p>{currentRoom.description}</p><button className="section-link" onClick={() => onContinue(currentRoom.id)}>Открыть программу блока <ArrowRight size={16}/></button></article><article className="focus-card"><div className="section-card-icon"><TerminalSquare size={20}/></div><span className="section-kicker">БЫСТРЫЙ РЕЖИМ</span><h2>Практика навыков</h2><p>Короткие упражнения из уже открытых учебных блоков.</p><button className="section-link" onClick={onOpenPractice}>Перейти к практике <ArrowRight size={16}/></button></article><article className="focus-card"><div className="section-card-icon"><Compass size={20}/></div><span className="section-kicker">ПОДГОТОВКА К МАГИСТРАТУРЕ</span><h2>Входная диагностика</h2><p>Короткая адаптивная проверка по графу навыков: что уже умеете, где пробел и с чего начинать.</p><button className="section-link" onClick={onOpenDiagnostic}>Пройти диагностику <ArrowRight size={16}/></button></article></section>
  </main></>
}

function PracticeView({ header, progress, onOpen }: { header: React.ReactNode; progress: UserProgress; onOpen: (roomId: string) => void }) {
  return <>{header}<main className="main section-page"><SectionIntro kicker="ТРЕНАЖЁР" title="Практика" description="Возвращайся к открытым комнатам и закрепляй навыки короткими подходами."/><section className="practice-list">{rooms.map(room => {
    const done = room.missions.filter(mission => progress.completedMissionIds.includes(mission.id)).length
    const locked = !isRoomAccessible(room, progress)
    return <article className={`practice-row ${locked ? 'is-locked' : ''}`} key={room.id}><div className="section-card-icon"><TerminalSquare size={19}/></div><div><span>{room.category} · {room.level}</span><h2>{room.title}</h2><p>{room.skills.join(' · ')}</p></div><div className="practice-progress"><strong>{done}/{room.missions.length}</strong><span>миссий</span></div><button className="section-button" disabled={locked} onClick={() => onOpen(room.id)}>{locked ? <LockKeyhole size={16}/> : <Play size={16}/>} {locked ? 'Закрыто' : 'Открыть'}</button></article>
  })}</section></main></>
}

function ProjectsView({ header }: { header: React.ReactNode }) {
  const projects = [
    { index: '01', title: 'Отчёт о качестве доставок', description: 'Очистить JSON-данные, найти сбои и подготовить воспроизводимый отчёт.', stack: ['Python', 'JSON', 'pytest'], ready: false },
    { index: '02', title: 'Витрина метрик маркетплейса', description: 'Собрать таблицы заказов, проверить пропуски и рассчитать ключевые показатели.', stack: ['Pandas', 'SQL', 'Plotly'], ready: false },
    { index: '03', title: 'Модель прогноза оттока', description: 'Пройти путь от базового решения до объяснимой модели и защиты результата.', stack: ['scikit-learn', 'CatBoost', 'SHAP'], ready: false },
  ]
  return <>{header}<main className="main section-page"><SectionIntro kicker="ПОРТФОЛИО" title="Проекты" description="Большие практические задания связывают несколько навыков и заканчиваются результатом для портфолио."/><section className="project-grid">{projects.map(project => <article className="project-card" key={project.index}><span className="project-index">PROJECT // {project.index}</span><h2>{project.title}</h2><p>{project.description}</p><div className="skill-tags">{project.stack.map(tool => <span key={tool}>{tool}</span>)}</div><button className="section-button" disabled><LockKeyhole size={16}/>В разработке</button></article>)}</section></main></>
}

function AchievementsView({ header, progress }: { header: React.ReactNode; progress: UserProgress }) {
  const achievements = [
    { title: 'Первый сигнал', description: 'Завершить первую миссию', current: progress.completedMissionIds.length, target: 1 },
    { title: 'Рабочая серия', description: 'Учиться семь дней подряд', current: progress.streak, target: 7 },
    { title: 'Исследователь', description: 'Завершить десять миссий', current: progress.completedMissionIds.length, target: 10 },
    { title: 'Тысяча энергии', description: 'Набрать 1 000 XP', current: progress.xp, target: 1000 },
    { title: 'Комната закрыта', description: 'Пройти целую учебную комнату', current: Math.min(progress.completedMissionIds.filter(id => id.startsWith('DATA-')).length, rooms[0].missions.length), target: rooms[0].missions.length },
    { title: 'Первый проект', description: 'Защитить работу для портфолио', current: 0, target: 1 },
  ]
  return <>{header}<main className="main section-page"><SectionIntro kicker="ТЕЛЕМЕТРИЯ ПРОГРЕССА" title="Достижения" description="Вехи показывают не абстрактные баллы, а реальные шаги в обучении."/><section className="achievement-grid">{achievements.map(item => {
    const unlocked = item.current >= item.target
    const percent = Math.min(100, Math.round(item.current / item.target * 100))
    return <article className={`achievement-card ${unlocked ? 'unlocked' : ''}`} key={item.title}><div className="achievement-mark">{unlocked ? <Trophy size={21}/> : <LockKeyhole size={19}/>}</div><span>{unlocked ? 'ПОЛУЧЕНО' : `${item.current} / ${item.target}`}</span><h2>{item.title}</h2><p>{item.description}</p><div className="achievement-bar"><i style={{ width: `${percent}%` }}/></div></article>
  })}</section></main></>
}

function RoomView({ room, onBack, header, progress, onStart }: { room: Room; onBack: () => void; header: React.ReactNode; progress: UserProgress; onStart: (missionId: string) => void }) {
  const completed = room.missions.filter(mission => progress.completedMissionIds.includes(mission.id)).length
  const firstIncomplete = room.missions.findIndex(mission => !progress.completedMissionIds.includes(mission.id))
  const [selected, setSelected] = useState(firstIncomplete < 0 ? room.missions.length - 1 : firstIncomplete)
  const current = room.missions[selected]
  const panelRef = useRef<HTMLElement>(null)
  const currentCompleted = progress.completedMissionIds.includes(current.id)
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [current.id])
  const totalMinutes = useMemo(() => room.missions.reduce((sum, mission) => sum + mission.minutes, 0), [room])
  return <>{header}<main className="main room-page">
    <section className="room-hero" style={{ '--room-accent': room.accent } as React.CSSProperties}>
      <div><div className="room-number">Комната {room.index} · {room.category}</div><h1>{room.title}</h1><p>{room.description}</p><div className="room-facts"><span><CircleDot size={15}/>{plural(room.missions.length, 'миссия', 'миссии', 'миссий')}</span><span>≈ {plural(totalMinutes, 'минута', 'минуты', 'минут')}</span><span>{plural(room.skills.length, 'навык', 'навыка', 'навыков')}</span></div></div>
      <div className="mastery"><span>Освоение</span><strong>{Math.round(completed / room.missions.length * 100)}%</strong><div className="bar"><i style={{ width: `${completed / room.missions.length * 100}%` }}/></div><small>{completed} из {room.missions.length} миссий</small></div>
    </section>
    <div className="room-layout">
      <section className="mission-list"><div className="mission-list-head"><div><span className="section-kicker">План комнаты</span><h2>Миссии</h2></div><span>коротко · по делу · руками</span></div>
        {room.missions.map((mission, index) => { const Icon = icons[mission.type]; const isDone = progress.completedMissionIds.includes(mission.id); const isCurrent = index === selected; const isLocked = !isDone && index !== firstIncomplete; return <button key={mission.id} className={`mission ${isCurrent ? 'selected' : ''} ${isLocked ? 'mission-locked' : ''}`} onClick={() => !isLocked && setSelected(index)} disabled={isLocked}>
          <span className={`mission-state ${isDone ? 'is-done' : ''}`}>{isDone ? <Check size={15}/> : isLocked ? <LockKeyhole size={13}/> : String(index + 1).padStart(2, '0')}</span>
          <span className="mission-icon"><Icon size={17}/></span><span className="mission-name"><b>{mission.title}</b><small>{missionTypeLabels[mission.type]} · {mission.minutes} мин</small></span><span className="mission-xp">+{mission.xp} XP</span><ChevronRight size={16}/>
        </button>})}
      </section>
      <aside ref={panelRef} className={`mission-panel ${current.intro ? 'has-content' : ''}`}>
        <div className="panel-label">Брифинг миссии</div><div className="panel-icon">{(() => { const Icon = icons[current.type]; return <Icon size={23}/> })()}</div><span className="panel-kind">{missionTypeLabels[current.type]}{current.difficulty && ` · ${current.difficulty}`}</span><h2>{current.title}</h2><p>{current.intro || (current.type === 'code' ? 'Открой редактор, выполни задачу и пройди автоматические тесты.' : 'Разбери рабочую ситуацию и сделай следующий шаг в расследовании данных.')}</p>
        <button className={`panel-start ${currentCompleted ? 'started' : ''}`} onClick={() => onStart(current.id)}>{currentCompleted ? <Check size={16}/> : <Play size={16} fill="currentColor"/>}{currentCompleted ? 'Открыть пройденную миссию' : 'Открыть рабочую станцию'}</button>
        {!!current.objectives?.length && <section className="mission-objectives"><span>После миссии ты сможешь</span><ul>{current.objectives.map(item => <li key={item}>{item}</li>)}</ul></section>}
        {current.productionContext && <section className="production-context"><span>Рабочий контекст</span><p>{current.productionContext}</p></section>}
        {current.task && <section className="mission-task"><span>Что предстоит сделать</span><p>{current.task.prompt}</p><small>Ответ и инструменты откроются в рабочей станции.</small></section>}
        {!!current.termIds?.length && <section className="term-notes"><div className="term-notes-title"><Info size={16}/><span>Техническая сноска</span></div>{current.termIds.map(id => <div className="term-note" key={id}><strong>{glossary[id].term}</strong><p>{glossary[id].definition}</p></div>)}</section>}
        <div className="panel-reward"><span>Награда</span><strong><Star size={15}/> +{current.xp} XP</strong></div><small className="autosave">Прохождение откроется отдельным экраном</small>
      </aside>
    </div>
  </main></>
}

export default function App() {
  const initial = loadState()
  const [account, setAccount] = useState<UserAccount | null>(() => activeAccount())
  const [theme, setTheme] = useState<ThemeId>(initial.theme)
  const [progress, setProgress] = useState<UserProgress | null>(() => account ? getProgress(account.id) : null)
  const [view, setView] = useState<View>({ type: 'home' })
  /** Диагностика хранится в состоянии приложения, поэтому её нужно перечитывать. */
  const [, setDiagnosticTick] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [game, setGame] = useState<GameState>(() => (account ? getGame(account.id) : emptyGame()))
  const [scene, setScene] = useState<StoryAct | null>(null)
  const [endingRoomId, setEndingRoomId] = useState<string | null>(null)
  const [professionId, setProfessionId] = useState<ProfessionId>(() => (localStorage.getItem('request.selected-profession') as ProfessionId) || 'data-scientist')
  const [domainId, setDomainId] = useState<CareerDomainId>(() => professions.find(item => item.id === ((localStorage.getItem('request.selected-profession') as ProfessionId) || 'data-scientist'))?.domainId || 'data-ai')
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [view])
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [])
  function changeTheme(next: ThemeId) { setTheme(next); persistTheme(next) }
  function changeDomain(next: CareerDomainId) {
    const firstProfession = professions.find(item => item.domainId === next)
    if (!firstProfession) return
    setDomainId(next)
    setProfessionId(firstProfession.id)
    localStorage.setItem('request.selected-domain', next)
    localStorage.setItem('request.selected-profession', firstProfession.id)
  }
  function changeProfession(next: ProfessionId) {
    const nextProfession = professions.find(item => item.id === next)
    if (!nextProfession) return
    setProfessionId(next)
    setDomainId(nextProfession.domainId)
    localStorage.setItem('request.selected-domain', nextProfession.domainId)
    localStorage.setItem('request.selected-profession', next)
  }
  useEffect(() => {
    if (!account || scene) return
    if (view.type !== 'mission') return
    const brief = briefActFor(view.roomId, view.missionId)
    const act = pendingAct(view.roomId, game, { on: 'caseStart' }, professionId)
      ?? pendingAct(view.roomId, game, { on: 'beforeMission', missionId: view.missionId }, professionId)
      ?? (brief && !game.seenActs.includes(brief.id) ? brief : undefined)
    if (act) setScene(act)
  }, [view, game, account, scene, professionId])
  /** Сцена-бриф эпизода: у большинства миссий нет собственного авторского акта. */
  function briefActFor(roomId: string, missionId: string) {
    const story = caseForCourse(roomId, professionId)
    const missionRoom = rooms.find(item => item.id === roomId)
    const missionItem = missionRoom?.missions.find(item => item.id === missionId)
    if (!story || !missionRoom || !missionItem) return undefined
    const episode = missionRoom.missions.findIndex(item => item.id === missionId) + 1
    return missionBriefAct(story, missionItem, episode, missionRoom.missions.length)
  }
  function replayScene(roomId: string, missionId: string) {
    const missionRoom = rooms.find(item => item.id === roomId)
    const missionItem = missionRoom?.missions.find(item => item.id === missionId)
    if (!missionRoom || !missionItem) return
    const episode = missionRoom.missions.findIndex(item => item.id === missionId) + 1
    const act = missionSceneForReplay(roomId, missionItem, episode, missionRoom.missions.length, professionId)
    if (act) setScene(act)
  }
  function authenticated(next: UserAccount) {
    const nextGame = getGame(next.id)
    setAccount(next)
    setProgress(getProgress(next.id))
    setGame(nextGame)
    setScene(null)
    setView({ type: 'home' })
  }
  function signOut() { logout(); setAccount(null); setProgress(null) }
  function finishScene() {
    if (account && scene) {
      let next = markActSeen(account.id, scene.id)
      // Открытие дела уже вводит игрока в эпизод: второй бриф подряд показывать не нужно.
      if (scene.trigger.on === 'caseStart' && view.type === 'mission') {
        const brief = briefActFor(view.roomId, view.missionId)
        if (brief) next = markActSeen(account.id, brief.id)
      }
      setGame(next)
    }
    setScene(null)
  }
  function pickChoice(choiceId: string, optionId: string, effects: BeatEffects) {
    if (!account) return
    setGame(applyChoice(account.id, choiceId, optionId, effects))
  }
  function spendFocus(amount: number) {
    if (!account) return false
    const next = spendFocusPoints(account.id, amount)
    if (!next) return false
    setGame(next)
    return true
  }
  function missionCompleted(missionRoom: Room, missionId: string, xp: number) {
    if (!account) return
    const bonus = focusBonusXp(xp, game.energy)
    const nextProgress = completeMission(account.id, missionId, xp + bonus, missionRoom.id)
    setProgress(nextProgress)
    const afterEnergy = spendEnergy(account.id)
    setGame(afterEnergy)
    const missionTitle = missionRoom.missions.find(item => item.id === missionId)?.title ?? missionId
    notifyMissionDone(missionTitle, xp + bonus)
    syncProgress({ missions: nextProgress.completedMissionIds.length, xp: nextProgress.xp, streak: nextProgress.streak })
    const after = pendingAct(missionRoom.id, afterEnergy, { on: 'afterMission', missionId }, professionId)
    if (after) setScene(after)
    const story = caseForCourse(missionRoom.id, professionId)
    const allDone = missionRoom.missions.every(item => nextProgress.completedMissionIds.includes(item.id))
    if (story && allDone) {
      const ending = resolveEnding(story, afterEnergy)
      setGame(recordEnding(account.id, story.caseId, ending.id))
      setEndingRoomId(missionRoom.id)
      notifyCaseEnding(story.title, ending.title, ending.rank)
    }
  }
  function replayCurrentCase(roomId: string) {
    const story = caseForCourse(roomId, professionId)
    if (!account || !story) return
    setGame(replayCase(account.id, story.caseId, caseActIds(story), caseChoiceIds(story)))
    setEndingRoomId(null)
  }
  function chooseSearchResult(target: SearchTarget) {
    if (!progress) return
    if (target.kind === 'profession') {
      setSearchOpen(false)
      changeProfession(target.professionId)
      setView({ type: 'path' })
    } else if (target.kind === 'section') {
      setSearchOpen(false)
      setView({ type: target.section })
    } else {
      const targetRoom = rooms.find(item => item.id === target.roomId)
      if (!targetRoom || !isRoomAccessible(targetRoom, progress)) return
      if (target.kind === 'mission' && !isMissionAccessible(targetRoom, target.missionId, progress)) return
      setSearchOpen(false)
      setView(target.kind === 'room' ? { type: 'room', roomId: target.roomId } : { type: 'mission', roomId: target.roomId, missionId: target.missionId })
    }
  }
  if (!account || !progress) return <AuthView onAuthenticated={authenticated}/>
  if (view.type === 'diagnostic') {
    const skills = (skillRegistry as { skills: SkillNode[] }).skills
    const requirementSkills = Object.fromEntries(
      (itmoSkillMap as { map: Array<{ requirementId: string; skills: string[] }> }).map.map(item => [item.requirementId, item.skills]),
    )
    const context = {
      trackId: (itmoSkillMap as { trackId: string }).trackId,
      requirementSkills,
      probes: diagnosticProbes as unknown as Task[],
      maxProbes: 24,
    }
    return <DiagnosticMode
      skills={skills}
      context={context}
      book={normalizeMastery(getMastery(account.id))}
      session={getDiagnostic(account.id)}
      onSession={session => { saveDiagnostic(account.id, session); setDiagnosticTick(value => value + 1) }}
      onMastery={book => { saveMastery(account.id, book); setDiagnosticTick(value => value + 1) }}
      onExit={() => setView({ type: 'home' })}
    />
  }

  if (view.type === 'mission') {
    const missionRoom = rooms.find(item => item.id === view.roomId)
    const mission = missionRoom?.missions.find(item => item.id === view.missionId)
    const nextMission = missionRoom && mission ? missionRoom.missions[missionRoom.missions.findIndex(item => item.id === mission.id) + 1] : undefined
    if (missionRoom && mission && isMissionAccessible(missionRoom, mission.id, progress)) return <>
      <MissionRunner key={mission.id} professionId={professionId} questMode={Boolean(caseForCourse(missionRoom.id, professionId))} room={missionRoom} mission={mission} completed={progress.completedMissionIds.includes(mission.id)} energy={game.energy} inventory={game.inventory} onSpendFocus={spendFocus} onExit={() => setView({ type: 'room', roomId: missionRoom.id })} onComplete={() => missionCompleted(missionRoom, mission.id, mission.xp)} nextMission={nextMission} onNext={nextMission ? () => setView({ type: 'mission', roomId: missionRoom.id, missionId: nextMission.id }) : undefined} onReplayScene={caseForCourse(missionRoom.id, professionId) ? () => replayScene(missionRoom.id, mission.id) : undefined}/>
      {scene && (
        <StoryScene act={scene} career={caseForCourse(view.roomId, professionId)?.career} chosenByChoiceId={game.choices} onChoose={pickChoice} onFinish={finishScene} onHome={() => { setScene(null); setView({ type: 'home' }) }}/>
      )}
      {endingRoomId && (
        <EndingView roomId={endingRoomId} professionId={professionId} game={game} onReplay={() => replayCurrentCase(endingRoomId)} onClose={() => setEndingRoomId(null)}/>
      )}
    </>
  }
  const requestedRoom = view.type === 'room' ? rooms.find(item => item.id === view.roomId) : undefined
  const room = requestedRoom && isRoomAccessible(requestedRoom, progress) ? requestedRoom : undefined
  const sectionTitles: Record<AppSection, string> = { home: 'Главная', path: 'Профессии', practice: 'Практика', projects: 'Проекты', achievements: 'Достижения', hq: 'Штаб' }
  const header = (title: string, roomValue?: Room) => <Header title={title} onBack={roomValue ? () => setView({ type: 'path' }) : undefined} room={roomValue} theme={theme} onThemeChange={changeTheme} xp={progress.xp} game={game} onOpenAccount={() => setView({ type: 'account' })} onOpenSearch={() => setSearchOpen(true)}/>
  const activeSection = view.type === 'room' ? 'path' : view.type === 'account' ? 'account' : view.type
  return <><div className="app-shell"><Sidebar active={activeSection} account={account} progress={progress} onNavigate={section => setView({ type: section })} onOpenAccount={() => setView({ type: 'account' })}/><div className="content-shell">
    {view.type === 'account' ? <AccountView account={account} progress={progress} onAccountChange={setAccount} onProgressReset={setProgress} onBack={() => setView({ type: 'path' })} onLogout={signOut}/>
      : room ? <RoomView room={room} onBack={() => setView({ type: 'path' })} header={header('Профессии', room)} progress={progress} onStart={missionId => setView({ type: 'mission', roomId: room.id, missionId })}/>
      : view.type === 'home' ? <HomeView header={header(sectionTitles.home)} account={account} progress={progress} onContinue={roomId => setView({ type: 'room', roomId })} onOpenPath={() => setView({ type: 'path' })} onOpenPractice={() => setView({ type: 'practice' })} onOpenDiagnostic={() => setView({ type: 'diagnostic' })}/>
      : view.type === 'practice' ? <PracticeView header={header(sectionTitles.practice)} progress={progress} onOpen={roomId => setView({ type: 'room', roomId })}/>
      : view.type === 'projects' ? <ProjectsView header={header(sectionTitles.projects)}/>
      : view.type === 'hq' ? <HqView header={header(sectionTitles.hq)} account={account} progress={progress} professionId={professionId} game={game} onGameChange={setGame} onOpenRoom={roomId => setView({ type: 'room', roomId })}/>
      : view.type === 'achievements' ? <AchievementsView header={header(sectionTitles.achievements)} progress={progress}/>
      : <PathView header={header(sectionTitles.path)} progress={progress} domainId={domainId} professionId={professionId} onDomainChange={changeDomain} onProfessionChange={changeProfession} onOpen={roomId => setView({ type: 'room', roomId })}/>} 
  </div></div><GlobalSearch open={searchOpen} progress={progress} onClose={() => setSearchOpen(false)} onChoose={chooseSearchResult}/>
  {scene && (
    <StoryScene act={scene} career={view.type === 'mission' ? caseForCourse(view.roomId, professionId)?.career : undefined} chosenByChoiceId={game.choices} onChoose={pickChoice} onFinish={finishScene} onHome={() => { setScene(null); setView({ type: 'home' }) }}/>
  )}
  {endingRoomId && <EndingView roomId={endingRoomId} professionId={professionId} game={game} onReplay={() => replayCurrentCase(endingRoomId)} onClose={() => setEndingRoomId(null)}/>}</>
}
