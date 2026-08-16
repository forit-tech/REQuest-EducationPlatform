import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')
const subscribersPath = resolve(root, 'bot', 'subscribers.json')

/** Читаем .env вручную, чтобы не тянуть зависимости. */
async function loadEnv() {
  if (!existsSync(envPath)) return {}
  const raw = await readFile(envPath, 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index < 0) continue
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
  }
  return env
}

const env = { ...(await loadEnv()), ...process.env }
const TOKEN = env.TELEGRAM_BOT_TOKEN
const PORT = Number(env.BOT_PORT || 8787)
const REMINDER_HOUR = Number(env.REMINDER_HOUR ?? 19)
const REMINDER_MINUTE = Number(env.REMINDER_MINUTE ?? 0)

if (!TOKEN) {
  console.error('Не найден TELEGRAM_BOT_TOKEN.')
  console.error('Создай файл .env в корне проекта и впиши строку:')
  console.error('TELEGRAM_BOT_TOKEN=сюда_токен_от_BotFather')
  process.exit(1)
}

const api = (method) => `https://api.telegram.org/bot${TOKEN}/${method}`

async function call(method, payload) {
  const response = await fetch(api(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json()
  if (!data.ok) console.error(`Telegram ${method}:`, data.description)
  return data
}

async function loadSubscribers() {
  if (!existsSync(subscribersPath)) return {}
  try { return JSON.parse(await readFile(subscribersPath, 'utf8')) } catch { return {} }
}

async function saveSubscribers(subscribers) {
  await writeFile(subscribersPath, JSON.stringify(subscribers, null, 2), 'utf8')
}

let subscribers = await loadSubscribers()

export async function broadcast(text) {
  const ids = Object.keys(subscribers)
  for (const chatId of ids) {
    await call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' })
  }
  return ids.length
}

const HELP = [
  '<b>REQuest — напоминания об обучении</b>',
  '',
  '/start — подписаться на напоминания',
  '/stop — отписаться',
  '/id — показать твой chat id для профиля в приложении',
  '/progress — последний известный прогресс',
  '/help — эта справка',
].join('\n')

async function handleCommand(message) {
  const chatId = String(message.chat.id)
  const text = (message.text || '').trim().toLowerCase()
  const name = message.from?.first_name || 'коллега'

  if (text.startsWith('/start')) {
    subscribers[chatId] = { name, since: new Date().toISOString(), progress: subscribers[chatId]?.progress ?? null }
    await saveSubscribers(subscribers)
    await call('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: `Привет, ${name}! Буду напоминать про серию и незакрытые миссии.\n\nТвой chat id: <code>${chatId}</code>\nВпиши его в приложении: Профиль → Telegram user ID.\n\n${HELP}`,
    })
    return
  }
  if (text.startsWith('/stop')) {
    delete subscribers[chatId]
    await saveSubscribers(subscribers)
    await call('sendMessage', { chat_id: chatId, text: 'Отписал. Вернуться — /start' })
    return
  }
  if (text.startsWith('/id')) {
    await call('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: `Твой chat id: <code>${chatId}</code>` })
    return
  }
  if (text.startsWith('/progress')) {
    const progress = subscribers[chatId]?.progress
    await call('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: progress
        ? `<b>Последний прогресс</b>\nМиссий пройдено: ${progress.missions}\nОпыт: ${progress.xp} XP\nСерия: ${progress.streak} дн.\nОбновлено: ${new Date(progress.at).toLocaleString('ru-RU')}`
        : 'Пока нет данных. Открой приложение — оно пришлёт прогресс автоматически.',
    })
    return
  }
  await call('sendMessage', { chat_id: chatId, parse_mode: 'HTML', text: HELP })
}

/** Длинный опрос Telegram. */
async function poll() {
  let offset = 0
  console.log('Бот запущен. Напиши ему /start в Telegram.')
  for (;;) {
    try {
      const response = await fetch(`${api('getUpdates')}?timeout=50&offset=${offset}`)
      const data = await response.json()
      if (data.ok) {
        for (const update of data.result) {
          offset = update.update_id + 1
          if (update.message) await handleCommand(update.message)
        }
      }
    } catch (reason) {
      console.error('Опрос не удался, повтор через 5 секунд:', reason.message)
      await new Promise(done => setTimeout(done, 5000))
    }
  }
}

/** Локальный приём событий из приложения. Слушаем только петлевой интерфейс. */
function startEventServer() {
  createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Headers', 'content-type')
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
    if (request.method !== 'POST') { response.writeHead(405); response.end(); return }

    let body = ''
    request.on('data', chunk => { body += chunk })
    request.on('end', async () => {
      try {
        const event = JSON.parse(body || '{}')
        if (event.progress) {
          for (const chatId of Object.keys(subscribers)) {
            subscribers[chatId].progress = { ...event.progress, at: new Date().toISOString() }
          }
          await saveSubscribers(subscribers)
        }
        if (event.text) await broadcast(event.text)
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: true }))
      } catch (reason) {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: false, error: reason.message }))
      }
    })
  }).listen(PORT, '127.0.0.1', () => console.log(`Приём событий из приложения: http://127.0.0.1:${PORT}`))
}

/** Ежедневное напоминание. */
function startReminder() {
  let sentOn = null
  setInterval(async () => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    if (sentOn === today) return
    if (now.getHours() !== REMINDER_HOUR || now.getMinutes() !== REMINDER_MINUTE) return
    sentOn = today
    const count = await broadcast('⏳ Серия под угрозой. Одна миссия занимает шесть минут — этого хватит, чтобы день засчитался.')
    if (count) console.log(`Напоминание отправлено: ${count}`)
  }, 30_000)
  console.log(`Ежедневное напоминание: ${String(REMINDER_HOUR).padStart(2, '0')}:${String(REMINDER_MINUTE).padStart(2, '0')}`)
}

startEventServer()
startReminder()
poll()
