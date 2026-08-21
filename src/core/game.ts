import { loadState, saveState } from './storage'

export interface GameState {
  energy: number
  energyAt: string
  trust: Record<string, number>
  flags: string[]
  choices: Record<string, string>
  inventory: string[]
  seenActs: string[]
  endings: Record<string, string>
  playthrough: number
  dailyClaimedOn: string | null
}

export const MAX_ENERGY = 20
export const MISSION_ENERGY_COST = 1
/** Одна единица энергии за пять минут: полная шкала восстанавливается примерно за час сорок. */
const ENERGY_REGEN_MINUTES = 5

/**
 * Энергия — это «фокус». Она НИКОГДА не запрещает проходить миссию:
 * запирать обучение за таймером в учебном продукте недопустимо.
 * Фокус покупает преимущества и даёт бонус за внимательную работу.
 */
export const HINT_FOCUS_COST = 2
export const SECOND_CHANCE_FOCUS_COST = 3
/** При таком запасе фокуса миссия закрывается с бонусом к опыту. */
export const FOCUS_BONUS_THRESHOLD = 14
export const FOCUS_BONUS_MULTIPLIER = 1.25

export function focusBonusXp(baseXp: number, energy: number) {
  return energy >= FOCUS_BONUS_THRESHOLD ? Math.round(baseXp * FOCUS_BONUS_MULTIPLIER) - baseXp : 0
}

export const RANKS = [
  { id: 'intern', title: 'Стажёр', from: 0 },
  { id: 'junior', title: 'Младший аналитик', from: 800 },
  { id: 'analyst', title: 'Аналитик', from: 2500 },
  { id: 'senior', title: 'Старший аналитик', from: 6000 },
  { id: 'lead', title: 'Ведущий аналитик', from: 12000 },
  { id: 'principal', title: 'Эксперт по данным', from: 20000 },
] as const

export const ITEMS: Record<string, { title: string; description: string; icon: string }> = {
  'notebook': { title: 'Рабочий блокнот', description: 'Записи по каждому делу. Открывает разбор после финала.', icon: '📓' },
  'coffee': { title: 'Талон на кофе', description: 'Мгновенно восстанавливает пять единиц энергии.', icon: '☕' },
  'schema-map': { title: 'Карта схемы', description: 'Подсказка по структуре данных в миссиях-расследованиях.', icon: '🗺' },
  'access-key': { title: 'Доступ к проду', description: 'Выдаётся за доверие наставника. Открывает скрытые акты.', icon: '🔑' },
  'rubber-duck': { title: 'Резиновая утка', description: 'Классический инструмент отладки. Даёт дополнительную подсказку.', icon: '🦆' },
  'incident-badge': { title: 'Значок дежурного', description: 'Ты закрыл ночной инцидент. Уважение команды.', icon: '🎖' },
}

export const emptyGame = (): GameState => ({
  energy: MAX_ENERGY,
  energyAt: new Date().toISOString(),
  trust: {},
  flags: [],
  choices: {},
  inventory: ['notebook'],
  seenActs: [],
  endings: {},
  playthrough: 1,
  dailyClaimedOn: null,
})

function withRegen(game: GameState): GameState {
  const elapsedMinutes = (Date.now() - new Date(game.energyAt).getTime()) / 60000
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < ENERGY_REGEN_MINUTES) return game
  const restored = Math.floor(elapsedMinutes / ENERGY_REGEN_MINUTES)
  const energy = Math.min(MAX_ENERGY, game.energy + restored)
  if (energy === game.energy) return game
  return { ...game, energy, energyAt: new Date().toISOString() }
}

export function getGame(userId: string): GameState {
  const state = loadState()
  const stored = state.games?.[userId]
  const game = withRegen({ ...emptyGame(), ...stored })
  return game
}

function commit(userId: string, next: GameState) {
  const state = loadState()
  state.games = { ...state.games, [userId]: next }
  saveState(state)
  return next
}

export function rankFor(xp: number) {
  const index = RANKS.reduce((best, rank, position) => (xp >= rank.from ? position : best), 0)
  const current = RANKS[index]
  const next = RANKS[index + 1]
  const span = next ? next.from - current.from : 1
  const done = next ? xp - current.from : span
  return { index, current, next, percent: Math.min(100, Math.round(done / span * 100)) }
}

export function spendEnergy(userId: string, amount = MISSION_ENERGY_COST) {
  const game = getGame(userId)
  if (game.energy <= 0) return game
  return commit(userId, { ...game, energy: Math.max(0, game.energy - amount), energyAt: new Date().toISOString() })
}

/**
 * Списывает фокус под конкретную покупку. Возвращает null, если не хватает —
 * вызывающий код обязан просто не дать купить преимущество, а не заблокировать миссию.
 */
export function spendFocus(userId: string, amount: number): GameState | null {
  const game = getGame(userId)
  if (game.energy < amount) return null
  return commit(userId, { ...game, energy: game.energy - amount, energyAt: new Date().toISOString() })
}

export function useItem(userId: string, itemId: string) {
  const game = getGame(userId)
  if (!game.inventory.includes(itemId)) return game
  if (itemId !== 'coffee') return game
  return commit(userId, {
    ...game,
    energy: Math.min(MAX_ENERGY, game.energy + 5),
    inventory: game.inventory.filter((item, index) => !(item === itemId && index === game.inventory.indexOf(itemId))),
  })
}

export function claimDaily(userId: string) {
  const game = getGame(userId)
  const today = new Date().toISOString().slice(0, 10)
  if (game.dailyClaimedOn === today) return game
  return commit(userId, {
    ...game,
    dailyClaimedOn: today,
    energy: MAX_ENERGY,
    inventory: [...game.inventory, 'coffee'],
  })
}

export interface BeatEffects {
  trust?: Record<string, number>
  flags?: string[]
  clearFlags?: string[]
  items?: string[]
}

export function applyChoice(userId: string, choiceId: string, optionId: string, effects: BeatEffects) {
  const game = getGame(userId)
  const trust = { ...game.trust }
  for (const [character, delta] of Object.entries(effects.trust ?? {})) {
    trust[character] = (trust[character] ?? 0) + delta
  }
  return commit(userId, {
    ...game,
    trust,
    flags: [...new Set([
      ...game.flags.filter(flag => !(effects.clearFlags ?? []).includes(flag)),
      ...(effects.flags ?? []),
    ])],
    inventory: [...new Set([...game.inventory, ...(effects.items ?? [])])],
    choices: { ...game.choices, [choiceId]: optionId },
  })
}

export function markActSeen(userId: string, actId: string) {
  const game = getGame(userId)
  if (game.seenActs.includes(actId)) return game
  return commit(userId, { ...game, seenActs: [...game.seenActs, actId] })
}

export function recordEnding(userId: string, caseId: string, endingId: string) {
  const game = getGame(userId)
  return commit(userId, { ...game, endings: { ...game.endings, [caseId]: endingId } })
}

/** Перепрохождение: сюжет и выборы сбрасываются, открытые концовки и предметы остаются. */
export function replayCase(userId: string, caseId: string, actIds: string[], choiceIds: string[]) {
  const game = getGame(userId)
  const choices = { ...game.choices }
  for (const id of choiceIds) delete choices[id]
  return commit(userId, {
    ...game,
    seenActs: game.seenActs.filter(id => !actIds.includes(id)),
    choices,
    playthrough: game.playthrough + 1,
    flags: game.flags.filter(flag => !flag.startsWith(`${caseId}:`)),
  })
}
