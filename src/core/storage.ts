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

interface StoredState {
  version: 1
  users: UserAccount[]
  sessionUserId: string | null
  rememberSession: boolean
  /** Пользователь сам решил, запоминать ли вход. Без него сессия из заготовки не считается выбором. */
  sessionChosen?: boolean
  theme: ThemeId
  progress: Record<string, UserProgress>
  games?: Record<string, import('./game').GameState>
}

const STORAGE_KEY = 'request.local-state.v1'
const LEGACY_DEMO_HASH = 'a592d463ed8517f99ea698b6ba8b12f2d2e839dc3e24564b597a8a1d9fcc5553'
const DEMO_HASH = '95b3951ed7ec9cdbbd58edaef3c0617dfb711162a0a34e14abc5d0735ad58b50'

const starterProgress = (): UserProgress => ({
  xp: 2480,
  streak: 12,
  currentRoomId: 'technical-foundations',
  completedMissionIds: ['py-1', 'py-2', 'py-3', 'py-4', 'py-5', 'py-6', 'py-7', 'pd-1', 'pd-2'],
  attempts: {},
  updatedAt: new Date().toISOString(),
})

const initialState = (): StoredState => {
  const demo: UserAccount = {
    id: 'local-alex', displayName: 'Алексей', username: 'alex_data', email: 'alex@request.local',
    passwordHash: DEMO_HASH, emailNotifications: false, telegramNotifications: false,
    desktopNotifications: false, createdAt: new Date().toISOString(),
  }
  return { version: 1, users: [demo], sessionUserId: null, rememberSession: false, sessionChosen: true, theme: 'future', progress: { [demo.id]: starterProgress() } }
}

export function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = JSON.parse(raw) as StoredState
      const demo = state.users.find(user => user.id === 'local-alex')
      if (demo?.passwordHash === LEGACY_DEMO_HASH) demo.passwordHash = DEMO_HASH
      if (state.sessionChosen === undefined) {
        // Раньше приложение открывалось сразу под демо-аккаунтом. Это была заготовка,
        // а не решение пользователя, поэтому один раз просим войти явно.
        state.sessionUserId = null
        state.rememberSession = false
        state.sessionChosen = true
      }
      saveState(state)
      return state
    }
  } catch { /* reset corrupted local state */ }
  const state = initialState()
  saveState(state)
  return state
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
  state.progress[account.id] = { ...starterProgress(), xp: 0, streak: 0, completedMissionIds: [] }
  saveState(state)
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
  saveState(state)
  return fresh
}

export function activeAccount() {
  const state = loadState()
  if (!state.rememberSession) return null
  return state.users.find(user => user.id === state.sessionUserId) ?? null
}
