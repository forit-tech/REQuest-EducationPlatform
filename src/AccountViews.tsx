import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Bell, Camera, Check, KeyRound, LogIn, Mail, Radio, RotateCcw, Save, ShieldCheck, UserPlus } from 'lucide-react'
import { Button, Field, StatusBadge } from './ui'
import { changePassword, login, register, resetProgress, updateAccount, type UserAccount, type UserProgress } from './core/storage'

export function AuthView({ onAuthenticated }: { onAuthenticated: (account: UserAccount) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const account = mode === 'login'
        ? await login(String(data.get('identifier')), String(data.get('password')), data.get('remember') === 'on')
        : await register({ displayName: String(data.get('displayName')), username: String(data.get('username')), email: String(data.get('email')), password: String(data.get('password')) })
      onAuthenticated(account)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось войти') }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><section className="auth-brand"><div className="auth-orbit"><span>∿</span></div><div className="section-kicker">REQUEST // ЛОКАЛЬНЫЙ ВХОД</div><h1>Твоя учебная станция<br/><span>помнит прогресс.</span></h1><p>Локальный аккаунт хранится только на этом устройстве. Синхронизация появится вместе с серверной частью.</p></section>
    <section className="auth-card"><div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}><LogIn size={16}/>Вход</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}><UserPlus size={16}/>Новый ID</button></div>
      <form onSubmit={submit}>{mode === 'register' && <><Field required name="displayName" label="Имя" placeholder="Как к вам обращаться"/><Field required name="username" label="Никнейм" placeholder="data_explorer" pattern="[A-Za-z0-9_]{3,24}"/></>}
        {mode === 'login' ? <Field required name="identifier" autoComplete="username" label="Почта или никнейм" defaultValue="alex_data"/> : <Field required type="email" name="email" autoComplete="email" label="Почта" placeholder="you@example.com"/>}
        <Field required type="password" name="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} label="Пароль" defaultValue={mode === 'login' ? 'request2026' : ''} minLength={8}/>
        {mode === 'login' && <label className="check-row"><input type="checkbox" name="remember" defaultChecked/><span>Сохранить вход на этом устройстве</span></label>}
        {error && <div className="form-alert">{error}</div>}<Button disabled={busy} className="wide">{busy ? 'Подключение…' : mode === 'login' ? 'Войти на станцию' : 'Создать REduQuest ID'}</Button>
        {mode === 'login' && <small className="demo-note">Демо-вход: alex_data / request2026</small>}
      </form></section></main>
}

export function AccountView({ account, progress, onAccountChange, onProgressReset, onBack, onLogout }: { account: UserAccount; progress: UserProgress; onAccountChange: (account: UserAccount) => void; onProgressReset: (progress: UserProgress) => void; onBack: () => void; onLogout: () => void }) {
  const [draft, setDraft] = useState(account)
  const [saved, setSaved] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const initials = draft.displayName.split(' ').map(item => item[0]).join('').slice(0, 2).toUpperCase()

  function patch<K extends keyof UserAccount>(key: K, value: UserAccount[K]) { setDraft(current => ({ ...current, [key]: value })); setSaved(false) }
  function saveProfile() { updateAccount(draft); onAccountChange(draft); setSaved(true) }
  function confirmReset() { onProgressReset(resetProgress(account.id)); setResetArmed(false) }
  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return
    if (file.size > 2_000_000) { alert('Фото должно быть меньше 2 МБ'); return }
    const reader = new FileReader(); reader.onload = () => patch('avatar', String(reader.result)); reader.readAsDataURL(file)
  }
  async function passwordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPasswordMessage('')
    const data = new FormData(event.currentTarget)
    try { await changePassword(account.id, String(data.get('currentPassword')), String(data.get('newPassword'))); setPasswordMessage('Пароль обновлён'); event.currentTarget.reset() }
    catch (reason) { setPasswordMessage(reason instanceof Error ? reason.message : 'Ошибка') }
  }
  async function requestDesktop() {
    if (!('Notification' in window)) return
    const permission = await Notification.requestPermission()
    patch('desktopNotifications', permission === 'granted')
  }

  return <main className="main account-page"><div className="account-heading"><div><button className="text-back" onClick={onBack}>← Вернуться к маршруту</button><div className="section-kicker">REQUEST ID // ЛОКАЛЬНЫЙ ПРОФИЛЬ</div><h1>Профиль станции</h1></div><div className="id-state"><StatusBadge tone="success"><ShieldCheck size={13}/> Локально защищён</StatusBadge><span>ID {account.id.slice(0, 8).toUpperCase()}</span></div></div>
    <div className="account-grid"><section className="id-card"><div className="avatar-large">{draft.avatar ? <img src={draft.avatar} alt="Аватар"/> : initials}<button onClick={() => fileRef.current?.click()} aria-label="Загрузить фото"><Camera size={16}/></button><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></div><h2>{draft.displayName}</h2><span>@{draft.username}</span><div className="rank">DATA EXPLORER · LVL 07</div><div className="id-telemetry"><div><strong>{progress.xp.toLocaleString('ru-RU')}</strong><span>XP ENERGY</span></div><div><strong>{progress.completedMissionIds.length}</strong><span>MISSIONS</span></div><div><strong>{progress.streak}</strong><span>DAY STREAK</span></div></div></section>
      <div className="account-sections"><section className="settings-panel"><div className="settings-title"><div><span className="settings-icon"><Mail size={18}/></span><div><h2>Идентичность и связь</h2><p>Эти данные используются только локально.</p></div></div>{saved && <StatusBadge tone="success"><Check size={12}/> Сохранено</StatusBadge>}</div><div className="fields-grid"><Field label="Отображаемое имя" autoComplete="name" value={draft.displayName} onChange={event => patch('displayName', event.target.value)}/><Field label="Никнейм" autoComplete="username" value={draft.username} onChange={event => patch('username', event.target.value)}/><Field type="email" label="Почта" autoComplete="email" value={draft.email} onChange={event => patch('email', event.target.value)}/><Field label="Telegram username" placeholder="@nickname" value={draft.telegramUsername ?? ''} onChange={event => patch('telegramUsername', event.target.value)}/><Field label="Telegram user ID" placeholder="123456789" value={draft.telegramUserId ?? ''} onChange={event => patch('telegramUserId', event.target.value)} hint="Числовой ID можно узнать у @userinfobot."/></div><Button onClick={saveProfile}><Save size={15}/>Сохранить профиль</Button></section>
        <section className="settings-panel"><div className="settings-title"><div><span className="settings-icon"><Bell size={18}/></span><div><h2>Напоминания</h2><p>Каналы для серии дней и незавершённых миссий.</p></div></div></div><div className="toggle-list"><Toggle label="Системные уведомления" text="Работают, пока приложение REduQuest запущено." checked={draft.desktopNotifications} onChange={requestDesktop}/><Toggle label="Письма на почту" text="Будет активировано после подключения локального backend." checked={draft.emailNotifications} onChange={() => patch('emailNotifications', !draft.emailNotifications)} pending/><Toggle label="Telegram-бот" text="Потребуется токен бота и фоновый планировщик." checked={draft.telegramNotifications} onChange={() => patch('telegramNotifications', !draft.telegramNotifications)} pending/></div><Button variant="secondary" onClick={saveProfile}>Сохранить каналы</Button></section>
        <section className="settings-panel"><div className="settings-title"><div><span className="settings-icon"><KeyRound size={18}/></span><div><h2>Безопасность</h2><p>PBKDF2-SHA-256 · индивидуальная соль · локальное хранение.</p></div></div></div><form className="password-form" onSubmit={passwordSubmit}><Field type="password" name="currentPassword" autoComplete="current-password" label="Текущий пароль" required/><Field type="password" name="newPassword" autoComplete="new-password" label="Новый пароль" minLength={8} required/>{passwordMessage && <div className={passwordMessage === 'Пароль обновлён' ? 'success-message' : 'form-alert'}>{passwordMessage}</div>}<Button variant="secondary">Сменить пароль</Button></form><div className="danger-line"><div><strong>Сбросить прохождение</strong><span>{resetArmed ? `Опыт, серия дней и ${progress.completedMissionIds.length} пройденных миссий будут стёрты. Аккаунт и профиль останутся.` : 'Начать маршрут заново: опыт, серия дней и отметки о пройденных миссиях.'}</span></div>{resetArmed
        ? <div className="danger-confirm"><Button variant="secondary" onClick={() => setResetArmed(false)}>Отмена</Button><Button variant="danger" onClick={confirmReset}><RotateCcw size={16}/>Стереть прогресс</Button></div>
        : <Button variant="secondary" onClick={() => setResetArmed(true)}><RotateCcw size={16}/>Сбросить</Button>}</div>
      <div className="danger-line"><div><strong>Завершить локальную сессию</strong><span>Прогресс и профиль останутся на устройстве.</span></div><Button variant="danger" onClick={onLogout}>Выйти</Button></div></section>
      </div></div></main>
}

function Toggle({ label, text, checked, onChange, pending }: { label: string; text: string; checked: boolean; onChange: () => void; pending?: boolean }) {
  return <div className="toggle-row"><div><strong>{label}</strong><span>{text}</span></div>{pending && <StatusBadge tone="warning"><Radio size={11}/> Backend</StatusBadge>}<button className={`switch ${checked ? 'on' : ''}`} onClick={onChange} role="switch" aria-label={label} aria-checked={checked} disabled={pending}><i/></button></div>
}
