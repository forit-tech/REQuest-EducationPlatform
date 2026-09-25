/**
 * Доступ аудита к контрактам сюжета: кастинг и эмоции.
 *
 * Аудит не повторяет их своими словами, а импортирует собранный движок. Пересказ
 * правил внутри проверки — это второй источник правды, и расходится он молча:
 * зелёный отчёт начинает означать «проверка согласна сама с собой».
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const storyDir = join(resolve(import.meta.dirname, '..', '..'), 'build', 'engine', 'story')

async function contract(name) {
  const compiled = join(storyDir, name + '.js')
  if (!existsSync(compiled)) {
    console.error('Сначала соберите движок: npm run engine:build')
    process.exit(1)
  }
  return import(pathToFileURL(compiled).href)
}

export const { castCharacter, castingBook, refusalReason } = await contract('casting')
export const { emotions, emotionIds, drawnEmotionIds, emotionContract, shownEmotion } = await contract('emotions')
