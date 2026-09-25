import { normalizeMastery } from './task/mastery'

export type ThemeId = 'future' | 'hacker'

export interface UserAccount {
  id: string
  displayName: string
  username: string
  email: string
  passwordHash: string
  avatar?: string
  telegramUsername?: string
  telegramUserId?: string
  emailNotifications: boolean
  telegramNotifications: boolean
  desktopNotifications: boolean
  /** Роль назначается только при первом запуске. Регистрация её не выдаёт. */
  role?: 'admin'
  createdAt: string
}

export interface UserProgress {
  xp: number
  streak: number
  currentRoomId: string
  completedMissionIds: string[]
  attempts: Record<string, number>
  updatedAt: string
}

export const STATE_VERSION = 6

interface StoredState {
  version: number
  users: UserAccount[]
  sessionUserId: string | null
  rememberSession: boolean
  /** Пользователь сам решил, запоминать ли вход. Без него сессия из заготовки не считается выбором. */
  sessionChosen?: boolean
  theme: ThemeId
  progress: Record<string, UserProgress>
  games?: Record<string, import('./game').GameState>
  /**
   * Освоение тем — отдельно от прохождения сюжета.
   *
   * `progress.completedMissionIds` продолжает означать «сцена пройдена» и
   * ничего не говорит про понимание. Появилось во второй версии состояния;
   * старые файлы получают пустую книгу и открываются как раньше.
   */
  mastery?: Record<string, import('./task/mastery').MasteryBook>
  /**
   * Незавершённая входная диагностика. Хранится отдельно от прогресса и от
   * освоения: это состояние режима, а не результат обучения.
   */
  diagnostics?: Record<string, import('./diagnostic/types').DiagnosticSession>
}

/**
 * Миссии, снятые из каталога вместе с шаблонными хвостами курсов.
 *
 * `PYC-006..050` были выводом генератора: практика в них сводилась к заглушке
 * `def solve()`, а темы, которые они объявляли, теперь написаны блоками 10–18
 * того же курса. `NPY-001..047` и `NPY-BOSS-01` — прежний курс NumPy, где ни
 * одна из тридцати двух кодовых миссий не давала человеку ни строки готового
 * кода; он переписан блоками 1–24 с другой разбивкой тем. `PDA-001..117` —
 * прежний курс Pandas: девяносто шесть из ста семнадцати миссий были выводом
 * того же генератора, что и хвост python-core; он переписан блоками 1–29.
 *
 * Номера намеренно не переиспользованы — иначе человек, закрывший заглушку под
 * старым номером, получил бы новую миссию уже отмеченной пройденной. Здесь
 * отметка о прохождении снимается: это честнее, чем утверждать, что человек
 * прошёл то, чего не было.
 *
 * Опыт и книга освоения не трогаются: опыт уже начислен и по списку миссий не
 * пересчитывается, а освоение привязано к навыкам, а не к идентификаторам.
 * Подробности — в `knowledge/migrations/mission-id-aliases.json`.
 */
const RETIRED_PYTHON_CORE = Array.from(
  { length: 45 }, (_, index) => `PYC-${String(index + 6).padStart(3, '0')}`,
)
const RETIRED_NUMPY = [
  ...Array.from({ length: 47 }, (_, index) => `NPY-${String(index + 1).padStart(3, '0')}`),
  'NPY-BOSS-01',
]
const RETIRED_PANDAS = Array.from(
  { length: 117 }, (_, index) => `PDA-${String(index + 1).padStart(3, '0')}`,
)
const RETIRED_MISSION_IDS = new Set([...RETIRED_PYTHON_CORE, ...RETIRED_NUMPY, ...RETIRED_PANDAS])

/** Приводит состояние любой прошлой версии к текущей. Данные не теряются. */
function migrateState(state: StoredState): StoredState {
  if (!state.mastery) state.mastery = {}
  if (!state.diagnostics) state.diagnostics = {}
  if (state.version < 4) {
    for (const progress of Object.values(state.progress ?? {})) {
      progress.completedMissionIds = (progress.completedMissionIds ?? [])
        .filter(id => !RETIRED_MISSION_IDS.has(id))
    }
  }
  if (state.version < 6) {
    // Демо-аккаунт уезжал вместе со сборкой и открывался сам. Убираем его
    // только нетронутым: совпали и опыт, и серия, и число пройденных миссий.
    // Если человек успел что-то на нём сделать, запись остаётся ему.
    const demo = state.progress?.['local-alex']
    const untouched = demo && demo.xp === DEMO_PROGRESS.xp && demo.streak === DEMO_PROGRESS.streak
      && (demo.completedMissionIds ?? []).length === DEMO_PROGRESS.missions
    if (untouched) {
      state.users = (state.users ?? []).filter(user => user.id !== 'local-alex')
      delete state.progress['local-alex']
      if (state.sessionUserId === 'local-alex') { state.sessionUserId = null; state.rememberSession = false }
    }
  }
  state.version = STATE_VERSION
  return state
}

const STORAGE_KEY = 'request.local-state.v1'

/**
 * Служебная учётная запись разработчика. Существует только в QA-сборке.
 *
 * Публичная сборка собирается без этих переменных, поэтому в её бандл не
 * попадает ни проверочная запись, ни сам факт, что такая учётная запись
 * бывает: скрытого администратора у скачавшего приложение нет.
 *
 * Пароль не хранится нигде — ни здесь, ни в переменных. Хранится только
 * проверочная запись PBKDF2: по ней можно проверить введённый пароль, но
 * нельзя его восстановить. Сами переменные лежат в `.env.admin.local`,
 * который закрыт от git.
 */
export const ADMIN_USERNAME = 'adminfort'
const ADMIN_ID = 'account-adminfort'
/**
 * Переменная сборки читается и в браузере, и в проверках движка.
 *
 * Vite подставляет `import.meta.env` целым объектом, поэтому в публичной
 * сборке нужного ключа там просто нет. В Node такого объекта не существует,
 * и значение берётся из окружения процесса — так один и тот же код
 * проверяется и как публичная сборка, и как QA.
 */
const buildEnv = (name: string) => {
  const inlined = (import.meta as { env?: Record<string, string | undefined> }).env
  if (inlined && inlined[name] !== undefined) return inlined[name]
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
}
/** Соль и производный ключ хранятся через двоеточие: доллар в env-файле раскрывается. */
const ADMIN_VERIFIER_SHAPE = /^[0-9a-f]{32}:[0-9a-f]{64}$/
const adminVerifier = () => {
  const stored = buildEnv('VITE_ADMIN_VERIFIER') ?? ''
  return ADMIN_VERIFIER_SHAPE.test(stored) ? `pbkdf2$${stored.replace(':', '$')}` : ''
}

/** Собрана ли эта копия как QA-сборка: от этого зависят и учётная запись, и разметка замечаний. */
export const isQaBuild = () => buildEnv('VITE_ADMIN_BUILD') === 'true' && adminVerifier() !== ''

export const isAdmin = (account: UserAccount | null | undefined) => account?.role === 'admin'

/**
 * Признак административной сессии для интерфейса.
 *
 * Берётся из сохранённой учётной записи и нигде больше: ни адрес, ни флаг в
 * интерфейсе его выдать не могут. Значение кешируется, потому что проверка
 * доступности вызывается на каждый курс при отрисовке, и сбрасывается ровно
 * там, где меняется текущая запись, — при входе, регистрации и выходе.
 */
let adminCache: boolean | null = null
export function refreshAdminSession() {
  adminCache = isAdmin(activeAccount())
  return adminCache
}
export function adminSession() {
  return adminCache ?? refreshAdminSession()
}
const LEGACY_DEMO_HASH = 'a592d463ed8517f99ea698b6ba8b12f2d2e839dc3e24564b597a8a1d9fcc5553'
const DEMO_HASH = '95b3951ed7ec9cdbbd58edaef3c0617dfb711162a0a34e14abc5d0735ad58b50'

/**
 * Прогресс человека, который только что завёл учётную запись.
 *
 * Здесь раньше лежала витрина: 2480 XP, серия 12 дней и девять пройденных
 * миссий. Она же служила запасным значением в `getProgress`, поэтому любой
 * пользователь без записи прогресса получал чужие достижения и открытую
 * середину маршрута. Пустой старт — единственное честное начало.
 */
const starterProgress = (): UserProgress => ({
  xp: 0,
  streak: 0,
  currentRoomId: 'technical-foundations',
  completedMissionIds: [],
  attempts: {},
  updatedAt: new Date().toISOString(),
})

/** Витрина, с которой приложение собиралось до первого выпуска. */
const DEMO_PROGRESS = { xp: 2480, streak: 12, missions: 9 }

const initialState = (): StoredState => ({
  version: STATE_VERSION, users: [], sessionUserId: null, rememberSession: false,
  sessionChosen: true, theme: 'future', progress: {}, mastery: {}, diagnostics: {},
})

/**
 * Учётная запись администратора появляется один раз и не выбирается сама.
 *
 * Она именно существует, а не входит: первый экран у всех одинаковый —
 * «войти или зарегистрироваться». Повторный запуск второй записи не создаёт.
 */
function ensureAdmin(state: StoredState) {
  if (!isQaBuild()) return state
  if (state.users.some(user => user.username === ADMIN_USERNAME)) return state
  state.users.push({
    id: ADMIN_ID,
    displayName: 'Фортуна',
    username: ADMIN_USERNAME,
    email: 'adminfort@reduquest.local',
    passwordHash: adminVerifier(),
    role: 'admin',
    emailNotifications: false,
    telegramNotifications: false,
    desktopNotifications: false,
    createdAt: new Date().toISOString(),
  })
  state.progress[ADMIN_ID] = starterProgress()
  return state
}

export function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = migrateState(JSON.parse(raw) as StoredState)
      const demo = state.users.find(user => user.id === 'local-alex')
      if (demo?.passwordHash === LEGACY_DEMO_HASH) demo.passwordHash = DEMO_HASH
      if (state.sessionChosen === undefined) {
        // Раньше приложение открывалось сразу под демо-аккаунтом. Это была заготовка,
        // а не решение пользователя, поэтому один раз просим войти явно.
        state.sessionUserId = null
        state.rememberSession = false
        state.sessionChosen = true
      }
      ensureAdmin(state)
      saveState(state)
      return state
    }
  } catch { /* reset corrupted local state */ }
  const state = ensureAdmin(initialState())
  saveState(state)
  return state
}

/**
 * Есть ли на устройстве учётная запись человека: от этого зависит первый экран.
 *
 * Служебная запись администратора не считается — она существует на любой
 * установке, и из-за неё новый человек попадал бы на вход вместо регистрации.
 */
export function hasAccounts() {
  return loadState().users.some(user => user.username !== ADMIN_USERNAME)
}

export function saveState(state: StoredState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export async function hashPassword(password: string) {
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function passwordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' }, material, 256)
  const encode = (bytes: Uint8Array) => Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `pbkdf2$${encode(salt)}$${encode(new Uint8Array(bits))}`
}

async function verifyPassword(password: string, record: string) {
  if (!record.startsWith('pbkdf2$')) return await hashPassword(password) === record
  const [, saltHex, expected] = record.split('$')
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)))
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' }, material, 256)
  const actual = Array.from(new Uint8Array(bits)).map(byte => byte.toString(16).padStart(2, '0')).join('')
  return actual === expected
}

export async function login(identifier: string, password: string, remember: boolean) {
  const state = loadState()
  const normalized = identifier.trim().toLowerCase()
  const account = state.users.find(user => user.email.toLowerCase() === normalized || user.username.toLowerCase() === normalized)
  if (!account || !await verifyPassword(password, account.passwordHash)) throw new Error('Неверная почта, никнейм или пароль')
  state.sessionUserId = account.id
  state.rememberSession = remember
  state.sessionChosen = true
  saveState(state)
  return account
}

export async function register(input: { displayName: string; username: string; email: string; password: string }) {
  const state = loadState()
  if (state.users.some(user => user.email.toLowerCase() === input.email.trim().toLowerCase())) throw new Error('Эта почта уже привязана')
  if (input.username.trim().toLowerCase() === ADMIN_USERNAME) throw new Error('Этот логин недоступен')
  if (state.users.some(user => user.username.toLowerCase() === input.username.trim().toLowerCase())) throw new Error('Этот никнейм уже занят')
  const account: UserAccount = {
    id: crypto.randomUUID(), displayName: input.displayName.trim(), username: input.username.trim(), email: input.email.trim(),
    passwordHash: await passwordRecord(input.password), emailNotifications: false, telegramNotifications: false,
    desktopNotifications: false, createdAt: new Date().toISOString(),
  }
  state.users.push(account)
  state.sessionUserId = account.id
  state.rememberSession = true
  state.sessionChosen = true
  state.progress[account.id] = starterProgress()
  saveState(state)
  adminCache = false
  return account
}

export function updateAccount(account: UserAccount) {
  const state = loadState()
  state.users = state.users.map(user => user.id === account.id ? account : user)
  saveState(state)
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const state = loadState()
  const user = state.users.find(item => item.id === userId)
  if (!user || !await verifyPassword(currentPassword, user.passwordHash)) throw new Error('Текущий пароль указан неверно')
  if (newPassword.length < 8) throw new Error('Новый пароль должен содержать минимум 8 символов')
  user.passwordHash = await passwordRecord(newPassword)
  saveState(state)
}

export function logout() {
  adminCache = false
  const state = loadState()
  state.sessionUserId = null
  state.rememberSession = false
  state.sessionChosen = true
  saveState(state)
}

export function setTheme(theme: ThemeId) {
  const state = loadState()
  state.theme = theme
  saveState(state)
}

/** Освоение тем. Никогда не меняется прохождением сюжета — только попытками заданий. */
export function getMastery(userId: string): import('./task/mastery').MasteryBook {
  const state = loadState()
  return normalizeMastery(state.mastery?.[userId])
}

export function saveMastery(userId: string, book: import('./task/mastery').MasteryBook) {
  const state = loadState()
  state.mastery = { ...state.mastery, [userId]: book }
  saveState(state)
  return book
}

/** Сессия диагностики. Переживает перезагрузку и возврат позже. */
export function getDiagnostic(userId: string) {
  const state = loadState()
  return state.diagnostics?.[userId]
}

export function saveDiagnostic(userId: string, session: import('./diagnostic/types').DiagnosticSession) {
  const state = loadState()
  state.diagnostics = { ...state.diagnostics, [userId]: session }
  saveState(state)
  return session
}

export function clearDiagnostic(userId: string) {
  const state = loadState()
  if (state.diagnostics) delete state.diagnostics[userId]
  saveState(state)
}

export function getProgress(userId: string) {
  const state = loadState()
  return state.progress[userId] ?? starterProgress()
}

export function completeMission(userId: string, missionId: string, xp: number, roomId: string) {
  const state = loadState()
  const progress = state.progress[userId] ?? starterProgress()
  if (!progress.completedMissionIds.includes(missionId)) {
    progress.completedMissionIds.push(missionId)
    progress.xp += xp
  }
  progress.currentRoomId = roomId
  progress.updatedAt = new Date().toISOString()
  state.progress[userId] = progress
  saveState(state)
  return progress
}

/** Пустой прогресс: стартовый набор — демонстрационный, для сброса он не годится. */
const emptyProgress = (): UserProgress => ({
  xp: 0,
  streak: 0,
  currentRoomId: 'technical-foundations',
  completedMissionIds: [],
  attempts: {},
  updatedAt: new Date().toISOString(),
})

/** Полный сброс прохождения: миссии, опыт, серия дней и состояние мини-игр. */
export function resetProgress(userId: string) {
  const state = loadState()
  const fresh = emptyProgress()
  state.progress[userId] = fresh
  if (state.games) delete state.games[userId]
  if (state.mastery) delete state.mastery[userId]
  if (state.diagnostics) delete state.diagnostics[userId]
  saveState(state)
  return fresh
}

export function activeAccount() {
  const state = loadState()
  if (!state.rememberSession) return null
  return state.users.find(user => user.id === state.sessionUserId) ?? null
}
