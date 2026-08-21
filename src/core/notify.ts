/**
 * Мост из приложения в локального Telegram-бота.
 * Токена здесь нет и быть не может: он живёт только в .env на стороне бота.
 * Если бот не запущен, вызовы тихо игнорируются — обучение от этого не страдает.
 */
const ENDPOINT = import.meta.env.VITE_BOT_ENDPOINT?.trim()

let botAvailable = Boolean(ENDPOINT)

async function push(payload: Record<string, unknown>) {
  if (!botAvailable || !ENDPOINT) return
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Бот не запущен — перестаём стучаться до перезагрузки страницы.
    botAvailable = false
  }
}

export function syncProgress(progress: { missions: number; xp: number; streak: number }) {
  void push({ progress })
}

export function notifyMissionDone(title: string, xp: number) {
  void push({ text: `✅ Миссия «${title}» пройдена. +${xp} XP` })
}

export function notifyCaseEnding(caseTitle: string, endingTitle: string, rank: string) {
  void push({ text: `🎬 Дело «${caseTitle}» закрыто.\nКонцовка: <b>${endingTitle}</b> (${rank})` })
}
