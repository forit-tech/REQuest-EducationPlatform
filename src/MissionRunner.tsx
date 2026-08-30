import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, ChevronsDownUp, ChevronsUpDown, CircleDot, Clapperboard, Code2, Database, FileJson, GripHorizontal, Lightbulb, Map, Play, RotateCcw, Star, TerminalSquare, X, Zap } from 'lucide-react'
import type { Mission, Room } from './types'
import { FOCUS_BONUS_THRESHOLD, HINT_FOCUS_COST } from './core/game'
import { glossary } from './glossary'
import { missionTypeLabels } from './data'
import data002 from '../knowledge/data/data-foundations/missions/DATA-002.json'
import data003 from '../knowledge/data/data-foundations/missions/DATA-003.json'
import { caseForCourse, character } from './story/engine'
import { Sprite } from './story/Sprite'
import type { ProfessionId } from './professions'

type RunnerProps = {
  room: Room
  mission: Mission
  completed: boolean
  /** Текущий фокус и предметы: влияют на подсказки и бонус к опыту. */
  energy: number
  inventory: string[]
  onSpendFocus: (amount: number) => boolean
  onExit: () => void
  onComplete: () => void
  /** Следующий эпизод дела: позволяет продолжать, не выходя в общее меню. */
  nextMission?: Mission
  onNext?: () => void
  /** Пересмотреть сцену, с которой начинается эпизод. */
  onReplayScene?: () => void
  questMode?: boolean
  professionId?: ProfessionId
}

const MIN_TERMINAL_HEIGHT = 120
const DEFAULT_TERMINAL_HEIGHT = 180
const COLLAPSED_TERMINAL_HEIGHT = 36

const eventRows = [
  ['104218', 'view_item', 'mobile', '—', '19:43:08'],
  ['104219', 'add_to_cart', 'mobile', '3 490', '19:43:51'],
  ['104220', 'checkout', 'desktop', '8 120', '19:44:17'],
  ['104221', 'purchase', 'mobile', '3 490', '19:44:42'],
]

const orderRows = [
  ['ORD-78101', '104218', '3 490', 'оплачен', '19:43:08'],
  ['ORD-78102', '104219', '8 120', 'собирается', '19:43:51'],
  ['ORD-78103', '104220', '1 990', 'доставлен', '19:44:17'],
  ['ORD-78104', '104221', '3 490', 'оплачен', '19:44:42'],
]

const orderItemRows = [
  ['ITEM-91001', 'ORD-78101', 'Кабель USB-C', '1', '1 490'],
  ['ITEM-91002', 'ORD-78101', 'Зарядное устройство', '1', '2 000'],
  ['ITEM-91003', 'ORD-78102', 'Механическая клавиатура', '1', '8 120'],
  ['ITEM-91004', 'ORD-78104', 'Кабель USB-C', '1', '1 490'],
  ['ITEM-91005', 'ORD-78104', 'Зарядное устройство', '1', '2 000'],
]

type InvestigationDataset = 'orders' | 'order_items'

function Data002Preview({ dataset, onDatasetChange, selectedRow, selectedColumn, selectedCell, onRow, onColumn, onCell }: {
  dataset: InvestigationDataset
  onDatasetChange: (dataset: InvestigationDataset) => void
  selectedRow: string
  selectedColumn: string
  selectedCell: string
  onRow: (rowId: string) => void
  onColumn: (column: string) => void
  onCell: (value: string, column: string, rowId: string) => void
}) {
  const isOrders = dataset === 'orders'
  const rows = isOrders ? orderRows : orderItemRows
  const columns = isOrders
    ? ['order_id', 'user_id', 'amount', 'status', 'created_at']
    : ['order_item_id', 'order_id', 'product', 'quantity', 'price']
  const meta = data002.datasets.find(item => item.id === dataset)!

  return <div className="runner-data-view investigation-view">
    <div className="dataset-switcher" aria-label="Наборы данных миссии">
      {data002.datasets.map(item => <button className={dataset === item.id ? 'active' : ''} key={item.id} onClick={() => onDatasetChange(item.id as InvestigationDataset)}><Database size={14}/>{item.file}</button>)}
    </div>
    <div className="data-file-meta"><div><FileJson size={17}/><strong>{meta.file}</strong></div><span>{rows.length} из {meta.rowCount.toLocaleString('ru-RU')} строк</span></div>
    <div className="data-table-wrap"><table className="data-table interactive-table"><thead><tr>{columns.map(column => <th className={selectedColumn === column ? 'selected-column' : ''} onClick={() => onColumn(column)} key={column}>{column}</th>)}</tr></thead><tbody>{rows.map(row => {
      const rowId = row[0]
      return <tr className={selectedRow === rowId ? 'selected-row' : ''} onClick={() => onRow(rowId)} key={rowId}>{row.map((cell, index) => <td className={selectedCell === cell && selectedColumn === columns[index] && selectedRow === rowId ? 'selected-cell' : ''} onClick={event => { event.stopPropagation(); onRow(rowId); onCell(cell, columns[index], rowId) }} key={`${rowId}-${columns[index]}`}>{cell}</td>)}</tr>
    })}</tbody></table></div>
    <div className="schema-strip"><span><i/>{columns.length} столбцов</span><span><i/>{meta.rowCount.toLocaleString('ru-RU')} строк</span><span><i/>Единица наблюдения: определи по данным</span></div>
    <div className="data-connection"><strong>{isOrders ? 'Исследование' : 'Production-поворот'}</strong><span>{isOrders ? 'Сначала выбери доказательства в самой таблице. Определение появится только после твоего вывода.' : 'Сравни повторяющиеся order_id и самостоятельно определи, что означает строка этой таблицы.'}</span></div>
  </div>
}

function Data003Preview({ selectedColumn, selectedCell, onColumn, onCell }: {
  selectedColumn: string
  selectedCell: string
  onColumn: (column: string) => void
  onCell: (value: string, column: string, rowId: string) => void
}) {
  const columns = ['order_id', 'user_id', 'amount', 'status', 'created_at']
  return <div className="runner-data-view investigation-view">
    <div className="data-file-meta"><div><FileJson size={17}/><strong>orders.csv</strong></div><span>4 из 128 400 строк</span></div>
    <div className="data-table-wrap"><table className="data-table interactive-table"><thead><tr>{columns.map(column => <th className={selectedColumn === column ? 'selected-column' : ''} onClick={() => onColumn(column)} key={column}>{column}</th>)}</tr></thead><tbody>{orderRows.map(row => <tr key={row[0]}>{row.map((cell, index) => <td className={selectedCell === cell && selectedColumn === columns[index] ? 'selected-cell' : ''} onClick={() => onCell(cell, columns[index], row[0])} key={`${row[0]}-${columns[index]}`}>{cell}</td>)}</tr>)}</tbody></table></div>
    <div className="schema-strip"><span><i/>{columns.length} столбцов</span><span><i/>128 400 строк</span><span><i/>dtype не заменяет смысл признака</span></div>
    <div className="data-connection"><strong>Полевое наблюдение</strong><span>Сравни <code>amount</code> и <code>user_id</code>: оба выглядят как числа, но отвечают на разные вопросы.</span></div>
  </div>
}

function DataPreview({ mission }: { mission: Mission }) {
  const isOrderTable = mission.id === 'DATA-002'
  const rows = isOrderTable ? orderRows : eventRows
  const columns = isOrderTable ? ['order_id', 'user_id', 'amount', 'status', 'created_at'] : ['user_id', 'event_name', 'device', 'revenue', 'event_time']
  const fileName = isOrderTable ? 'orders_sample.csv' : 'events_sample.csv'
  const connection = mission.id === 'DATA-001'
    ? <><strong>Почему эта таблица здесь?</strong><span>Строка <code>104221</code> фиксирует реальный факт: пользователь совершил покупку на 3 490 в 19:44:42. Сам факт — это данные. Таблица и CSV — только способ их записать.</span></>
    : <><strong>Да: каждая строка — наблюдение.</strong><span>В этой таблице объект наблюдения — заказ. Например, строка <code>ORD-78104</code> целиком является одним наблюдением о заказе; столбцы описывают его признаки.</span></>
  return <div className="runner-data-view">
    <div className="data-file-meta"><div><FileJson size={17}/><strong>{fileName}</strong></div><span>{isOrderTable ? '4 из 128 400 заказов' : '4 из 850 000 событий'}</span></div>
    <div className="data-table-wrap"><table className="data-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr className={index === 3 ? 'focus-row' : ''} key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
    <div className="schema-strip"><span><i/>5 столбцов</span><span><i/>{isOrderTable ? '128 400 наблюдений-заказов' : '850 000 наблюдений-событий'}</span><span><i/>CSV · UTF-8</span></div>
    <div className="data-connection">{connection}</div>
  </div>
}

/**
 * Каркас решения для кодовых эпизодов. Возвращает шаблон только тогда,
 * когда он действительно закрывает все обязательные проверки миссии.
 */
function solutionSkeleton(mission: Mission, hypothesis: string) {
  const checks = mission.task?.codeChecks ?? []
  if (!checks.length) return ''
  const file = mission.task?.workspaceFile ?? 'solution.py'
  if (!file.endsWith('.py')) return ''
  const claim = hypothesis.trim().replace(/"/g, '«')
  const header = (mission.task?.starterCode ?? '').split('\n').filter(line => line.startsWith('#') || line.includes('case_id')).join('\n')
  const body = claim
    ? [`    return "${claim}"`, '', '', `assert solve() == "${claim}"`]
    : ['    # TODO: верни свой вывод одной строкой', '    return "твой вывод"', '', '', '# Проверка: ровно та же строка, что и в return', 'assert solve() == "твой вывод"']
  const template = [header, '', 'def solve():', '    """Вывод, который ты защищаешь в этом эпизоде."""', ...body, 'print(solve())'].join('\n')
  return checks.every(check => template.includes(check.includes)) ? template : ''
}

function CodeWorkspace({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const lines = value.split('\n')
  return <div className="runner-code-view"><div className="code-gutter">{lines.map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label="Редактор решения" spellCheck={false} value={value} onChange={event => onChange(event.target.value)}/></div>
}

function ReadmeView({ mission, isCodeMission, hasTerminal, onOpenWorkspace }: { mission: Mission; isCodeMission: boolean; hasTerminal: boolean; onOpenWorkspace: () => void }) {
  const isDataIntro = mission.id === 'DATA-001'
  return <article className="runner-readme">
    <div className="readme-kicker">КРАТКАЯ ЛЕКЦИЯ // README.md</div>
    <h2>{mission.title}</h2>
    <p className="readme-lead">{isDataIntro ? 'Люди работали с данными задолго до компьютеров. Менялись носители и инструменты, но суть оставалась прежней: зафиксировать факт так, чтобы к нему можно было вернуться, сравнить его с другими и сделать вывод.' : mission.intro}</p>
    {mission.historicalFact && <aside className="history-fact"><span>ИСТОРИЯ И НАУКА</span><h3>{mission.historicalFact.title}</h3><p>{mission.historicalFact.text}</p><a href={mission.historicalFact.sourceUrl} target="_blank" rel="noreferrer">Источник: {mission.historicalFact.sourceLabel}</a></aside>}
    {isDataIntro ? <>
      <section><h3>Как появилась работа с данными</h3><div className="data-history"><div><span>01</span><strong>Зарубки и переписи</strong><p>Количество товаров, людей и налогов фиксировали на глине, папирусе и бумаге.</p></div><div><span>02</span><strong>Журналы и ведомости</strong><p>Факты стали записывать по единым правилам: одна строка — одна операция или объект.</p></div><div><span>03</span><strong>Базы данных</strong><p>Компьютеры позволили хранить миллионы связанных записей и быстро находить нужные.</p></div><div><span>04</span><strong>Цифровые события</strong><p>Сегодня приложения автоматически фиксируют клики, покупки, платежи и показания датчиков.</p></div></div></section>
      <section><h3>Главная мысль</h3><div className="concept-contrast"><div><span>ДАННЫЕ</span><strong>Зафиксированные факты и наблюдения</strong><p>«Пользователь 104221 совершил покупку в 19:44:42 на сумму 3 490».</p></div><div><span>ПРЕДСТАВЛЕНИЕ</span><strong>Способ хранения этих фактов</strong><p>CSV-файл, таблица, JSON, база данных или запись на бумаге.</p></div></div><p className="lecture-rule"><strong>Формат можно поменять — факт останется тем же.</strong> Поэтому данные нельзя определять как «только числа» или «любой файл».</p></section>
      <section><h3>Как это связано с таблицей</h3><div className="table-anatomy"><div><code>строка 104221</code><span>одно наблюдение: конкретная покупка</span></div><div><code>event_name</code><span>признак: какое действие произошло</span></div><div><code>purchase</code><span>значение признака в этом наблюдении</span></div></div><button className="open-data-button" onClick={onOpenWorkspace}><Database size={16}/>Посмотреть этот факт в таблице</button></section>
      <section><h3>Зачем нужен вопрос справа</h3><p>Он проверяет одну идею: сможешь ли ты отделить сам зафиксированный факт от файла, в котором он хранится. Сначала найди строку покупки в таблице, затем выбери самое точное определение данных.</p></section>
    </> : isCodeMission ? <section><h3>Короткий конспект</h3><p>{mission.productionContext}</p>
      <div className="lecture-rule"><strong>Что считается решением.</strong> Короткая программа в файле <code>{mission.task?.workspaceFile ?? 'solution.py'}</code>: она возвращает твой вывод и сама же его проверяет. Обязательные фрагменты перечислены в панели «Задание» справа.</div>
      {!!mission.task?.codeChecks?.length && <pre><code>{mission.task.codeChecks.map(check => check.includes.trim()).join('\n')}</code></pre>}
      <button className="open-data-button" onClick={onOpenWorkspace}><Code2 size={16}/>Открыть рабочий файл</button>
    </section> : <section><h3>Короткий конспект</h3><p>{mission.productionContext}</p><div className="lecture-rule"><strong>Свяжи определение с рабочим примером.</strong> Открой таблицу, найди единицу наблюдения и только затем отвечай на вопрос.</div><button className="open-data-button" onClick={onOpenWorkspace}><Database size={16}/>Открыть рабочие данные</button></section>}
    {hasTerminal && <section><h3>Зачем здесь терминал</h3><p>Эта миссия требует исследовать рабочую среду или выполнить код. Терминал нужен для просмотра файлов, схемы данных и запуска проверки. Его окно можно растянуть вверх за верхнюю кромку.</p><pre><code>help{`\n`}ls{`\n`}inspect events_sample.csv{`\n`}schema{`\n`}cat {mission.task?.workspaceFile ?? 'solution.py'}{`\n`}rq check{`\n`}clear</code></pre></section>}
    {!hasTerminal && <div className="readme-note theory"><BookOpen size={18}/><p><strong>Терминала в этой миссии нет намеренно.</strong> Здесь тренируется понимание понятия, поэтому достаточно конспекта, таблицы и вопроса.</p></div>}
  </article>
}

export function MissionRunner({ room, mission, completed, energy, inventory, onSpendFocus, onExit, onComplete, nextMission, onNext, onReplayScene, questMode = false, professionId }: RunnerProps) {
  const isObservationInvestigation = mission.id === 'DATA-002'
  const isFeatureInvestigation = mission.id === 'DATA-003'
  const isContentFactoryInvestigation = isObservationInvestigation || isFeatureInvestigation
  const isCodeMission = mission.type === 'code' || mission.type === 'lab' || Boolean(mission.task?.starterCode)
  const hasTerminal = isCodeMission || mission.type === 'case' || mission.type === 'boss'
  const dataFileName = mission.id === 'DATA-002' || mission.id === 'DATA-003' ? 'orders.csv' : 'events_sample.csv'
  const [activeTab, setActiveTab] = useState<'workspace' | 'readme'>(hasTerminal || isContentFactoryInvestigation ? 'workspace' : 'readme')
  const [answer, setAnswer] = useState('')
  const [productionAnswer, setProductionAnswer] = useState('')
  const [investigationDataset, setInvestigationDataset] = useState<InvestigationDataset>('orders')
  const [selectedRow, setSelectedRow] = useState('')
  const [selectedColumn, setSelectedColumn] = useState('')
  const [selectedCell, setSelectedCell] = useState('')
  const [checked, setChecked] = useState(false)
  const [finished, setFinished] = useState(completed)
  const [hintVisible, setHintVisible] = useState(false)
  const [hintPaid, setHintPaid] = useState(false)
  const [mapUsed, setMapUsed] = useState(false)
  const [exampleVisible, setExampleVisible] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const terminalOutputRef = useRef<HTMLDivElement>(null)
  const hasDuck = inventory.includes('rubber-duck')
  const hasMap = inventory.includes('schema-map')
  const hasNotebook = inventory.includes('notebook')
  const focusBonus = energy >= FOCUS_BONUS_THRESHOLD
  const hintAffordable = hasDuck || hintPaid || energy >= HINT_FOCUS_COST
  const story = questMode ? caseForCourse(room.id, professionId) : undefined
  const companion = character(story?.cast[0] ?? 'mira')
  const guide = character(story?.cast[1] ?? 'oleg')
  const episode = room.missions.findIndex(item => item.id === mission.id) + 1
  function revealHint() {
    if (hintVisible) { setHintVisible(false); return }
    if (hasDuck || hintPaid) { setHintVisible(true); return }
    if (!onSpendFocus(HINT_FOCUS_COST)) return
    setHintPaid(true)
    setHintVisible(true)
  }
  const [command, setCommand] = useState('')
  const [code, setCode] = useState(mission.task?.starterCode ?? "# Рабочий файл миссии\n# Исследуй данные и запиши решение ниже\n\nrows = 850_000\nprint(f'Получено наблюдений: {rows}')")
  const workspaceFile = mission.task?.workspaceFile ?? 'solution.py'
  const [terminalLines, setTerminalLines] = useState([
    'REduQuest Runtime 0.4 · изолированная учебная среда',
    'Контейнер rq-data-01 запущен',
    'Набор events_sample.csv подключён в /workspace/data',
    'Введите help, чтобы увидеть доступные команды.',
  ])
  const evidenceComplete = selectedRow === 'ORD-78104' && selectedColumn === 'status' && selectedCell === 'оплачен'
  const featureEvidenceComplete = selectedColumn === 'amount' && selectedCell === '3 490'
  const codeChecks = mission.task?.codeChecks ?? []
  const hasCodeChecks = codeChecks.length > 0
  const passedCodeChecks = codeChecks.filter(check => code.includes(check.includes))
  const failedCodeChecks = codeChecks.filter(check => !code.includes(check.includes))
  /** В кодовых эпизодах гипотеза выбирается вариантом, а потом оформляется программой. */
  const codeHypothesis = hasCodeChecks ? mission.task?.options ?? [] : []
  const hypothesisReady = !codeHypothesis.length || answer.trim() === mission.task?.answer.trim()
  /** Каркас вставляется с заглушкой, образец — уже с выбранной гипотезой. */
  const skeleton = useMemo(() => hasCodeChecks ? solutionSkeleton(mission, '') : '', [mission, hasCodeChecks])
  const skeletonExample = useMemo(() => hasCodeChecks && hypothesisReady && answer ? solutionSkeleton(mission, answer) : skeleton, [mission, hasCodeChecks, hypothesisReady, answer, skeleton])
  const isCorrect = isObservationInvestigation
    ? evidenceComplete && answer === data002.reasoningCheck.answer && productionAnswer === data002.productionCheck.answer
    : isFeatureInvestigation
      ? featureEvidenceComplete && answer === data003.reasoningCheck.answer && productionAnswer === data003.productionCheck.answer
      : hasCodeChecks
        ? passedCodeChecks.length === codeChecks.length && hypothesisReady
      : mission.task
        ? answer.trim() === mission.task.answer.trim()
        : isCodeMission && code.trim().length > 30
  const canCheck = isObservationInvestigation
    ? evidenceComplete && Boolean(answer) && Boolean(productionAnswer)
    : isFeatureInvestigation
      ? featureEvidenceComplete && Boolean(answer) && Boolean(productionAnswer)
      : hasCodeChecks
        ? code.trim().length > 0 && (!codeHypothesis.length || Boolean(answer))
      : mission.task
        ? Boolean(answer)
        : isCodeMission ? code.trim().length > 0 : Boolean(answer)
  const step = finished ? 4 : checked && isCorrect ? 3 : answer || isCodeMission ? 2 : 1
  const termNotes = useMemo(() => mission.termIds?.map(id => glossary[id]).filter(Boolean) || [], [mission.termIds])

  function runCommand() {
    const clean = command.trim()
    if (!clean) return
    const normalized = clean.toLowerCase()
    let output: string[]
    if (normalized === 'help') output = [`Команды: ls · inspect events_sample.csv · schema · cat ${workspaceFile} · rq check · clear`]
    else if (normalized === 'rq check' || normalized === 'rq check solution') { setCommand(''); verify(); return }
    else if (normalized === `cat ${workspaceFile.toLowerCase()}`) output = code.split('\n')
    else if (normalized === 'ls') output = ['events_sample.csv   README.md   solution.py']
    else if (normalized === 'inspect events_sample.csv' || normalized === 'inspect') output = ['850000 rows × 5 columns', 'user_id:int · event_name:string · device:string · revenue:float? · event_time:datetime']
    else if (normalized === 'schema') output = ['PRIMARY OBSERVATION: одно действие пользователя', 'NULLABLE: revenue', 'SOURCE: web-event-stream']
    else if (normalized === 'clear') { setTerminalLines([]); setCommand(''); return }
    else output = [`Команда не найдена: ${clean}`, 'Введите help для списка команд.']
    setTerminalLines(lines => [...lines, `$ ${clean}`, ...output])
    setCommand('')
  }

  function verify() {
    setChecked(true)
    const report = hasCodeChecks
      ? isCorrect
        ? [`✓ Пройдено проверок: ${codeChecks.length} из ${codeChecks.length}.`]
        : [
            ...(hypothesisReady ? [] : ['✕ Гипотеза выбрана неверно: сначала шаг 1 в панели задания.']),
            ...failedCodeChecks.map(check => `✕ ${check.label}: в файле нет фрагмента ${check.includes.trim()}`),
          ]
      : [isCorrect ? '✓ Проверка пройдена: смысл данных определён верно.' : '✕ Проверка не пройдена: вернись к наблюдениям и контексту.']
    setTerminalLines(lines => [...lines, `$ rq check ${workspaceFile}`, ...report])
    if (!terminalCollapsed) requestAnimationFrame(() => terminalOutputRef.current?.scrollTo({ top: terminalOutputRef.current.scrollHeight }))
  }

  /** Терминал тянется вверх мышью: в кодовых эпизодах вывод бывает длиннее окна. */
  function startTerminalResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = terminalCollapsed ? COLLAPSED_TERMINAL_HEIGHT : terminalHeight
    setTerminalCollapsed(false)
    const move = (moveEvent: PointerEvent) => {
      const maximum = Math.max(MIN_TERMINAL_HEIGHT, window.innerHeight - 260)
      setTerminalHeight(Math.min(Math.max(startHeight + (startY - moveEvent.clientY), MIN_TERMINAL_HEIGHT), maximum))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  function nudgeTerminal(delta: number) {
    setTerminalCollapsed(false)
    setTerminalHeight(value => Math.min(Math.max(value + delta, MIN_TERMINAL_HEIGHT), Math.max(MIN_TERMINAL_HEIGHT, window.innerHeight - 260)))
  }

  function finishMission() {
    if (!finished) onComplete()
    setFinished(true)
  }

  return <div className={`mission-runner ${questMode ? 'quest-runner' : ''}`}>
    <header className="runner-topbar">
      <div className="runner-brand"><span className="runner-mark">∿</span><strong>REdu<span>Quest</span></strong></div>
      {questMode ? <>
        <div className="quest-case-location"><span>{story?.career ? `${story.career.protagonistName} · ГЛАВА ${story.career.chapterNumber}/${story.career.chapterCount}` : story?.number ?? `ДЕЛО ${room.index}`}</span><strong>{story?.title ?? room.title}</strong></div>
        <div className="quest-episode-location"><span>ЭПИЗОД {String(episode).padStart(2, '0')} / {room.missions.length}</span><strong>{mission.title}</strong></div>
        <div className="runner-telemetry"><span><CircleDot size={14}/>{mission.minutes}:00</span><span><Star size={14}/>+{mission.xp} XP</span><button onClick={onExit} aria-label="Поставить дело на паузу"><X size={18}/></button></div>
      </> : <>
        <button className="runner-back" onClick={onExit}><ArrowLeft size={17}/>Комната {room.index}</button>
        <div className="runner-location"><span>{room.title}</span><ChevronRight size={14}/><strong>{mission.title}</strong></div>
        <div className="runner-telemetry"><span><CircleDot size={14}/>{mission.minutes}:00</span><span><Star size={14}/>+{mission.xp} XP</span><button onClick={onExit} aria-label="Закрыть миссию"><X size={18}/></button></div>
      </>}
    </header>

    <div className="runner-shell">
      <aside className="runner-brief">
        {questMode && <div className="quest-cast-stage">
          <div className="quest-cast-figures"><Sprite character={companion} emotion="worried" height={226}/><Sprite character={guide} emotion="determined" height={244} side="right"/></div>
          <div className="quest-dialogue-brief">
            <span>{guide.name} · {guide.role}</span>
            <p>{mission.intro}</p>
            {onReplayScene && <button className="scene-replay" onClick={onReplayScene}><Clapperboard size={15}/>Пересмотреть сцену эпизода</button>}
          </div>
        </div>}
        <div className="runner-brief-head"><span>{questMode ? `ТЕКУЩАЯ ЦЕЛЬ // ${mission.id}` : `МИССИЯ // ${mission.id}`}</span><h1>{mission.title}</h1>{!questMode && <p>{mission.intro}</p>}</div>
        <nav className="runner-steps" aria-label="Этапы миссии">
          {(questMode ? ['Получить цель', 'Собрать улику', 'Доказать вывод', 'Продолжить дело'] : ['Изучи контекст', 'Выполни задание', 'Пройди проверку', 'Забери награду']).map((label, index) => { const number = index + 1; const done = number < step || finished; const active = number === step && !finished; return <div className={`${done ? 'done' : ''} ${active ? 'active' : ''}`} key={label}><i>{done ? <Check size={14}/> : number}</i><span>{label}</span></div> })}
        </nav>
        <section className="runner-context"><span>РАБОЧИЙ КОНТЕКСТ</span><p>{mission.productionContext || 'Перед тобой учебная копия рабочего окружения. Изменения сохраняются только внутри миссии.'}</p></section>
        {!!mission.objectives?.length && <section className="runner-objectives"><span>ЦЕЛИ</span><ul>{mission.objectives.map(item => <li key={item}>{item}</li>)}</ul></section>}
        {!!termNotes.length && <section className="runner-glossary"><span><BookOpen size={15}/>ТЕХНИЧЕСКАЯ СНОСКА</span>{termNotes.map(term => <div key={term.term}><strong>{term.term}</strong><p>{term.definition}</p></div>)}</section>}
        {mission.hints?.[0] && <div className="runner-hint">
          <button onClick={revealHint} disabled={!hintAffordable} title={hasDuck ? 'Резиновая утка: подсказки бесплатны' : `Стоит ${HINT_FOCUS_COST} фокуса`}>
            <Lightbulb size={16}/>
            {hintVisible ? 'Скрыть подсказку' : hasDuck ? 'Спросить утку' : hintPaid ? 'Показать подсказку' : `Подсказка — ${HINT_FOCUS_COST} фокуса`}
          </button>
          {hintVisible && <p>{mission.hints[0]}</p>}
          {!hintAffordable && !hintVisible && <small className="focus-note">Не хватает фокуса. Он восстанавливается сам — миссию можно пройти и без подсказки.</small>}
          {hasDuck && <small className="focus-note duck">🦆 Утка в инвентаре: подсказки не тратят фокус.</small>}
        </div>}
        {isContentFactoryInvestigation && hasMap && <div className="runner-hint item-hint">
          <button onClick={() => setMapUsed(true)} disabled={mapUsed}><Map size={16}/>{mapUsed ? 'Карта раскрыта' : '🗺 Свериться с картой схемы'}</button>
          {mapUsed && <p>{isObservationInvestigation
            ? 'Единица наблюдения таблицы orders — один заказ. Ключ строки: order_id, состояние заказа хранит столбец status.'
            : 'Сумма заказа лежит в столбце amount. Столбец user_id записан цифрами, но количественным признаком не является.'}</p>}
        </div>}
        {isContentFactoryInvestigation && hasNotebook && <div className="runner-note-item"><BookOpen size={15}/><span>📓 Блокнот: записи по прошлым делам доступны в разделе «Штаб».</span></div>}
        <div className={`focus-state ${focusBonus ? 'on' : ''}`}>
          <Zap size={14}/>
          <span>{focusBonus
            ? `В фокусе: миссия закроется с бонусом +25% XP (энергии ${energy})`
            : `Фокус ${energy}. С ${FOCUS_BONUS_THRESHOLD} и выше миссия даёт +25% XP`}</span>
        </div>
      </aside>

      <main className={`runner-workspace ${hasTerminal ? '' : 'theory-workspace'}`} style={{ '--terminal-h': `${terminalCollapsed ? COLLAPSED_TERMINAL_HEIGHT : terminalHeight}px` } as React.CSSProperties}>
        <div className="workspace-tabs"><button className={activeTab === 'workspace' ? 'active' : ''} onClick={() => setActiveTab('workspace')}>{isCodeMission ? <Code2 size={15}/> : <Database size={15}/>} {isCodeMission ? workspaceFile : dataFileName}</button><button className={activeTab === 'readme' ? 'active' : ''} disabled={isContentFactoryInvestigation && !isCorrect} title={isContentFactoryInvestigation && !isCorrect ? 'Конспект откроется после самостоятельного вывода' : undefined} onClick={() => setActiveTab('readme')}><BookOpen size={15}/>{isContentFactoryInvestigation && !isCorrect ? 'Конспект после вывода' : 'Конспект.md'}</button><div><span className="runtime-dot"/>{hasTerminal ? 'Среда запущена' : 'Материал загружен'}</div></div>
        <div className="workspace-main">
          <section className="workspace-canvas">{activeTab === 'readme' ? <ReadmeView mission={mission} isCodeMission={isCodeMission} hasTerminal={hasTerminal} onOpenWorkspace={() => setActiveTab('workspace')}/> : isCodeMission ? <CodeWorkspace value={code} onChange={setCode}/> : isObservationInvestigation ? <Data002Preview dataset={investigationDataset} onDatasetChange={setInvestigationDataset} selectedRow={selectedRow} selectedColumn={selectedColumn} selectedCell={selectedCell} onRow={setSelectedRow} onColumn={setSelectedColumn} onCell={(value, column, rowId) => { if (column === 'status' && rowId === 'ORD-78104') setSelectedCell(value); else setSelectedCell('') }}/> : isFeatureInvestigation ? <Data003Preview selectedColumn={selectedColumn} selectedCell={selectedCell} onColumn={column => { setSelectedColumn(column); if (column !== 'amount') setSelectedCell('') }} onCell={(value, column, rowId) => { setSelectedColumn(column); setSelectedCell(column === 'amount' && rowId === 'ORD-78104' ? value : '') }}/> : <DataPreview mission={mission}/>}</section>
          <aside className="runner-task-panel">
            <div className="task-panel-heading"><span>ЗАДАНИЕ</span><strong>{missionTypeLabels[mission.type]}</strong></div>
            {mission.id === 'DATA-001' && <div className="task-bridge"><strong>Связь с таблицей</strong><p>Найди строку <code>104221</code>. Она сообщает о покупке. Что здесь является данными: сам факт, число или файл?</p></div>}
            {isObservationInvestigation ? <div className="investigation-task">
              <p className="investigation-lead">Не угадывай определение. Сначала собери три доказательства в <code>orders.csv</code>.</p>
              <div className="evidence-list">
                {data002.activities.map((activity, index) => {
                  const done = index === 0 ? selectedRow === activity.expected : index === 1 ? selectedColumn === activity.expected : selectedCell === activity.expected
                  return <div className={done ? 'done' : ''} key={activity.id}><i>{done ? <Check size={13}/> : index + 1}</i><span>{activity.prompt}</span></div>
                })}
              </div>
              <div className="investigation-question"><span>ОБОСНУЙ ВЫВОД</span><p>{data002.reasoningCheck.prompt}</p><div className="runner-options">{data002.reasoningCheck.options.map(option => <button className={answer === option ? 'selected' : ''} onClick={() => { setAnswer(option); setChecked(false) }} key={option}><i>{answer === option && <Check size={13}/>}</i><span>{option}</span></button>)}</div></div>
              <div className="production-check"><div><span>PRODUCTION</span><button onClick={() => setInvestigationDataset('order_items')}>Открыть order_items.csv</button></div><p>{data002.productionCheck.prompt}</p><div className="runner-options">{data002.productionCheck.options.map(option => <button className={productionAnswer === option ? 'selected' : ''} onClick={() => { setProductionAnswer(option); setChecked(false) }} key={option}><i>{productionAnswer === option && <Check size={13}/>}</i><span>{option}</span></button>)}</div></div>
            </div> : isFeatureInvestigation ? <div className="investigation-task">
              <p className="investigation-lead">Исследуй <code>orders.csv</code>: сначала найди признак и его конкретное значение.</p>
              <div className="evidence-list">{data003.activities.map((activity, index) => { const done = index === 0 ? selectedColumn === activity.expected : selectedCell === activity.expected; return <div className={done ? 'done' : ''} key={activity.id}><i>{done ? <Check size={13}/> : index + 1}</i><span>{activity.prompt}</span></div> })}</div>
              <div className="investigation-question"><span>ОБОСНУЙ ВЫВОД</span><p>{data003.reasoningCheck.prompt}</p><div className="runner-options">{data003.reasoningCheck.options.map(option => <button className={answer === option ? 'selected' : ''} onClick={() => { setAnswer(option); setChecked(false) }} key={option}><i>{answer === option && <Check size={13}/>}</i><span>{option}</span></button>)}</div></div>
              <div className="production-check"><div><span>PRODUCTION // ЛОВУШКА ТИПА</span></div><p>{data003.productionCheck.prompt}</p><div className="runner-options">{data003.productionCheck.options.map(option => <button className={productionAnswer === option ? 'selected' : ''} onClick={() => { setProductionAnswer(option); setChecked(false) }} key={option}><i>{productionAnswer === option && <Check size={13}/>}</i><span>{option}</span></button>)}</div></div>
            </div> : hasCodeChecks ? <div className="code-brief">
              <p>{mission.task?.prompt}</p>
              {!!codeHypothesis.length && <div className="code-step">
                <span className="code-brief-kicker">ШАГ 1 // ГИПОТЕЗА</span>
                <p className="code-step-lead">Сначала выбери вывод, который будешь защищать кодом.</p>
                <div className="runner-options">{codeHypothesis.map(option => <button className={answer === option ? 'selected' : ''} onClick={() => { setAnswer(option); setChecked(false) }} key={option}><i>{answer === option && <Check size={13}/>}</i><span>{option}</span></button>)}</div>
              </div>}
              <div className="code-step">
                <span className="code-brief-kicker">{codeHypothesis.length ? 'ШАГ 2 // КОД' : 'УСЛОВИЯ ПРОВЕРКИ'}</span>
                <p className="code-step-lead">Решение — это короткая программа в файле <code>{workspaceFile}</code>. Проверка ищет в нём обязательные фрагменты: их видно ниже, написать их нужно самому.</p>
                <div className="code-checklist">{codeChecks.map(check => { const passed = code.includes(check.includes); return <div className={passed ? 'passed' : ''} key={check.label}><i>{passed ? <Check size={13}/> : '·'}</i><div><span>{check.label}</span><code>{check.includes.trim()}</code></div></div> })}</div>
                {!!skeleton && <div className="code-skeleton">
                  <button onClick={() => setExampleVisible(value => !value)}><Lightbulb size={15}/>{exampleVisible ? 'Скрыть образец' : 'Показать образец решения'}</button>
                  <button onClick={() => { setCode(skeleton); setChecked(false); setActiveTab('workspace') }} title="Вставить каркас в рабочий файл"><Code2 size={15}/>Вставить каркас в файл</button>
                </div>}
                {exampleVisible && !!skeletonExample && <pre className="code-example"><code>{skeletonExample}</code></pre>}
              </div>
            </div> : <><p>{mission.task?.prompt || 'Исследуй рабочие файлы и подготовь решение.'}</p>{mission.task?.options ? <div className="runner-options">{mission.task.options.map(option => <button className={answer === option ? 'selected' : ''} onClick={() => { setAnswer(option); setChecked(false) }} key={option}><i>{answer === option && <Check size={13}/>}</i><span>{option}</span></button>)}</div> : <label className="runner-answer"><span>Ответ или вывод</span><textarea value={answer} onChange={event => { setAnswer(event.target.value); setChecked(false) }} placeholder="Запиши результат исследования…"/></label>}</>}
            {checked && <div className={`runner-feedback ${isCorrect ? 'success' : 'error'}`}>
              <strong>{isCorrect ? 'Проверка пройдена' : 'Есть неточность'}</strong>
              <p>{isCorrect
                ? mission.task?.explanation || 'Решение прошло автоматические проверки.'
                : hasCodeChecks
                  ? !hypothesisReady
                    ? 'Гипотеза в шаге 1 выбрана неверно — с ней код проверку не пройдёт.'
                    : `В файле не хватает обязательных фрагментов: ${failedCodeChecks.map(check => check.includes.trim()).join(' · ')}`
                  : 'Посмотри на единицу наблюдения и попробуй ещё раз.'}</p>
            </div>}
            {finished && <div className="runner-complete"><Check size={22}/><div><strong>Миссия завершена</strong><span>+{mission.xp} XP сохранено в профиле</span></div></div>}
          </aside>
        </div>

        {hasTerminal && <section className={`runner-terminal ${terminalCollapsed ? 'collapsed' : ''}`}>
          <div
            className="terminal-resize"
            role="separator"
            aria-label="Высота терминала"
            aria-orientation="horizontal"
            tabIndex={0}
            title="Потяни вверх, чтобы увеличить терминал"
            onPointerDown={startTerminalResize}
            onDoubleClick={() => { setTerminalCollapsed(false); setTerminalHeight(value => value > DEFAULT_TERMINAL_HEIGHT ? DEFAULT_TERMINAL_HEIGHT : Math.max(MIN_TERMINAL_HEIGHT, window.innerHeight - 320)) }}
            onKeyDown={event => {
              if (event.key === 'ArrowUp') { event.preventDefault(); nudgeTerminal(40) }
              if (event.key === 'ArrowDown') { event.preventDefault(); nudgeTerminal(-40) }
            }}
          ><GripHorizontal size={15}/></div>
          <div className="terminal-head">
            <div><TerminalSquare size={15}/><strong>ТЕРМИНАЛ</strong><span>rq-data-01</span></div>
            <div className="terminal-tools">
              <button onClick={() => setTerminalCollapsed(value => !value)} title={terminalCollapsed ? 'Развернуть терминал' : 'Свернуть терминал'}>{terminalCollapsed ? <ChevronsUpDown size={14}/> : <ChevronsDownUp size={14}/>}{terminalCollapsed ? 'Развернуть' : 'Свернуть'}</button>
              <button onClick={() => setTerminalLines([])}><RotateCcw size={14}/>Очистить</button>
            </div>
          </div>
          <div className="terminal-output" ref={terminalOutputRef}>{terminalLines.map((line, index) => <div className={line.startsWith('✓') ? 'ok' : line.startsWith('✕') ? 'bad' : ''} key={`${line}-${index}`}>{line}</div>)}<form onSubmit={event => { event.preventDefault(); runCommand() }}><span>$</span><input aria-label="Команда терминала" value={command} onChange={event => setCommand(event.target.value)} autoComplete="off" spellCheck={false}/></form></div>
        </section>}

        <footer className="runner-actions">
          <span>{finished
            ? nextMission ? `Дальше: ${nextMission.title}` : questMode ? 'Улика добавлена в досье — эпизоды дела закончились' : 'Миссия закрыта — это была последняя в комнате'
            : checked && isCorrect ? 'Доказательство принято — история продолжится' : questMode ? 'Результат изменит ход текущего дела' : 'Изменения сохраняются в учебной среде'}</span>
          <div>
            {!finished && <button className="runner-check" onClick={verify} disabled={!canCheck}><Play size={15} fill="currentColor"/>Проверить решение</button>}
            {checked && isCorrect && !finished && <button className="runner-finish" onClick={finishMission}><Check size={16}/>{questMode ? 'Продолжить историю' : 'Завершить миссию'}</button>}
            {finished && (nextMission && onNext ? <>
              <button className="runner-check" onClick={onExit}><ArrowLeft size={16}/>{questMode ? 'Поставить дело на паузу' : 'Вернуться в комнату'}</button>
              <button className="runner-finish" onClick={onNext}>{questMode ? 'Следующий эпизод' : 'Следующая миссия'}<ArrowRight size={16}/></button>
            </> : <button className="runner-finish" onClick={onExit}><Check size={16}/>{questMode ? 'К финалу дела' : 'Вернуться в комнату'}</button>)}
          </div>
        </footer>
      </main>
    </div>
  </div>
}
