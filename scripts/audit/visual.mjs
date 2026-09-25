/**
 * Аудитор изображений.
 *
 * Отвечает на два вопроса: хватает ли картинок и не мылятся ли они.
 *
 * «Хватает» проверяется по контракту эмоций (src/story/emotions.ts). Нарисованная
 * эмоция обязана иметь файл у каждого героя; запланированная файла не имеет и
 * показывается объявленной заменой — но только пока её никто не играет. Как
 * только сценарист написал реплику под усталость, отсутствие позы перестаёт быть
 * планом и становится ошибкой: игрок видит не то лицо, которое написано.
 *
 * «Не мылится» — это сравнение размера файла с размером вывода. Апскейл здесь не
 * помогает: растянутый исходник остаётся растянутым, героя нужно перерисовывать.
 * Разбор альфа-канала (высота самой фигуры, а не холста) живёт в
 * scripts/check-sprites.py и попадает сюда через knowledge/reports/sprite-metrics.json.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spokenBeats } from './corpus.mjs'
import { emotions as emotionContracts, drawnEmotionIds, shownEmotion } from './contracts.mjs'
import { finding } from './findings.mjs'

/** Требования к выводу берутся из scripts/check-sprites.py: два порога разошлись бы молча. */
function renderLimits(root) {
  const source = readFileSync(join(root, 'scripts/check-sprites.py'), 'utf8')
  const number = name => Number(new RegExp(name + ' = ([\\d.]+)').exec(source)?.[1])
  return {
    stageHeight: number('STAGE_HEIGHT') || 900,
    deviceScale: number('DEVICE_SCALE') || 1.5,
    sharpLimit: number('SHARP_LIMIT') || 1.15,
  }
}

/** Фоны мест действия: какой файл показывает сцена для каждого места. */
function sceneImages(root) {
  const source = readFileSync(join(root, 'src/story/StoryScene.tsx'), 'utf8')
  const imports = new Map([...source.matchAll(/import\s+(\w+)\s+from\s+'[^']*scenes\/([\w-]+\.png)'/g)]
    .map(match => [match[1], match[2]]))
  const block = /const locationImages = \{([^}]*)\}/.exec(source)?.[1] ?? ''
  return new Map([...block.matchAll(/(\w+):\s*(\w+)/g)].map(match => [match[1], imports.get(match[2])]))
}

export function auditVisuals(corpus) {
  const out = []
  const { stageHeight, deviceScale, sharpLimit } = renderLimits(corpus.root)
  const requiredHeight = Math.round(stageHeight * deviceScale)
  const label = emotion => emotionContracts.find(item => item.id === emotion)?.label ?? emotion

  /* --------------------------------------------- эмоции, которые нужны сюжету */

  const usedEmotions = new Map()
  for (const story of corpus.cases) {
    for (const beat of spokenBeats(story)) {
      if (!beat.speaker || beat.speaker === 'narrator' || !beat.emotion) continue
      if (!usedEmotions.has(beat.speaker)) usedEmotions.set(beat.speaker, new Map())
      const byEmotion = usedEmotions.get(beat.speaker)
      byEmotion.set(beat.emotion, (byEmotion.get(beat.emotion) ?? 0) + 1)
    }
  }

  /* ---------------------------------------------------- контракт эмоций */

  for (const emotion of emotionContracts) {
    if (emotion.status === 'drawn') {
      if (emotion.shownAs) {
        out.push(finding('A2.substitute-on-drawn', 'error', emotion.id,
          `эмоция нарисована, но контракт всё ещё подменяет её на «${emotion.shownAs}»`))
      }
      continue
    }
    if (!emotion.shownAs) {
      out.push(finding('A2.substitute-missing', 'error', emotion.id,
        'запланированная эмоция не объявляет замену: сцена покажет спокойствие вместо задуманного'))
    } else if (!drawnEmotionIds.includes(emotion.shownAs)) {
      out.push(finding('A2.substitute-not-drawn', 'error', emotion.id,
        `замена «${emotion.shownAs}» сама не нарисована — цепочка подстановок никуда не ведёт`))
    }
  }

  /* ---------------------------------------------------- позы по героям */

  for (const [characterId, poses] of corpus.posesByCharacter) {
    for (const file of poses.values()) {
      if (emotionContracts.some(item => item.id === file.emotion)) continue
      out.push(finding('A2.pose-unknown-emotion', 'warning', file.file,
        `файл назван эмоцией «${file.emotion}», которой нет в контракте: сцена никогда его не покажет`))
    }
    for (const emotion of drawnEmotionIds) {
      if (poses.has(emotion)) continue
      const uses = usedEmotions.get(characterId)?.get(emotion) ?? 0
      out.push(finding('A2.pose-not-drawn', 'error', `${characterId}:${emotion}`,
        `у героя нет обязательной позы «${label(emotion)}»${uses ? `, а она звучит в ${uses} репликах` : ''}`))
    }
  }

  // Запланированная поза: пока её никто не играет — это план, как только
  // сценарист её написал — ошибка, потому что игрок увидит чужое лицо.
  for (const emotion of emotionContracts.filter(item => item.status === 'planned')) {
    const users = [...usedEmotions].filter(([, byEmotion]) => byEmotion.has(emotion.id))
    const missing = [...corpus.posesByCharacter.keys()].filter(id => !corpus.posesByCharacter.get(id).has(emotion.id))
    // Заказ художнику считается по всему составу, а не по тем героям, кому эмоция
    // уже понадобилась: половина состава с усталостью, а половина без — это не
    // набор поз, а лоскут.
    out.push(finding('A2.pose-planned', 'warning', emotion.id,
      `поза «${emotion.label}» не нарисована у ${missing.length} героев из ${corpus.posesByCharacter.size}`
      + `${users.length ? `; ${users.length} из них уже играют её в сценах` : ', и пока её никто не играет'}`
      + `. До перерисовки сцена показывает «${label(emotion.shownAs)}»`))
    for (const [characterId, byEmotion] of users) {
      out.push(finding('A2.pose-planned-in-use', 'error', `${characterId}:${emotion.id}`,
        `${corpus.castById.get(characterId)?.name ?? characterId}: поза «${emotion.label}» звучит в ${byEmotion.get(emotion.id)} репликах, но не нарисована — сцена показывает «${label(shownEmotion(emotion.id))}»`))
    }
  }

  for (const characterId of usedEmotions.keys()) {
    if (corpus.posesByCharacter.has(characterId)) continue
    out.push(finding('A2.character-not-illustrated', 'error', characterId,
      'персонаж говорит в сюжете, но у него нет ни одной позы'))
  }

  /* --------------------------------------------------- качество спрайтов */

  for (const sprite of corpus.sprites.values()) {
    if (!sprite.height || !sprite.width) {
      out.push(finding('A2.unreadable', 'error', sprite.file, 'файл не читается как PNG'))
      continue
    }
    const stretch = stageHeight / sprite.height
    if (stretch > sharpLimit) {
      out.push(finding('A2.blurry', 'error', sprite.file,
        `холст ${sprite.width}×${sprite.height}: сцена растягивает его в ${(stretch * deviceScale).toFixed(2)} раза, нужна высота от ${requiredHeight} px`))
    }
  }

  // Пропорции холста ничего не доказывают: у поз разная ширина по замыслу, а
  // размер самой фигуры выравнивает normalize-sprites.py. Растяжение видно
  // только по альфа-каналу, и его считает python-скрипт.
  const metricsPath = join(corpus.root, 'knowledge/reports/sprite-metrics.json')
  if (existsSync(metricsPath)) {
    const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'))
    const measuredAt = statSync(metricsPath).mtimeMs
    const newest = Math.max(0, ...[...corpus.sprites.values()].map(sprite => sprite.changedAt ?? 0))
    if (newest > measuredAt) {
      out.push(finding('A2.figure-metrics-stale', 'warning', 'knowledge/reports/sprite-metrics.json',
        'спрайты перерисованы после последнего замера фигуры: перезапустите npm run sprites:check'))
    }
    for (const [characterId, spread] of Object.entries(metrics.spreadByCharacter ?? {})) {
      if (spread > (metrics.spreadLimit ?? 1.5)) {
        out.push(finding('A2.figure-jump', 'warning', characterId,
          `фигура меняет размер между эмоциями на ${spread.toFixed(1)}% — герой «прыгает» при смене лица; лечится scripts/normalize-sprites.py`))
      }
    }
  } else {
    out.push(finding('A2.figure-metrics-missing', 'info', 'assets/characters/generated',
      'нет knowledge/reports/sprite-metrics.json: размер фигуры внутри холста не проверен (npm run sprites:check)'))
  }

  /* ------------------------------------------------------------- фоны */

  const images = sceneImages(corpus.root)
  for (const location of corpus.locationIds) {
    const file = images.get(location)
    if (!file) {
      out.push(finding('A2.scene-missing', 'error', location, 'у места действия нет фона: сцена покажет предыдущее место'))
      continue
    }
    if (!existsSync(join(corpus.root, 'assets/scenes', file))) {
      out.push(finding('A2.scene-missing', 'error', location, `файл фона не найден: assets/scenes/${file}`))
    }
  }

  /* ----------------------------------------------- эмоции без применения */

  for (const [characterId, poses] of corpus.posesByCharacter) {
    const used = usedEmotions.get(characterId)
    if (!used) continue
    const unused = [...poses.keys()].filter(emotion => !used.has(emotion))
    if (unused.length >= 3) {
      out.push(finding('A2.emotion-unused', 'info', characterId,
        `нарисованные позы не используются в сюжете: ${unused.map(label).join(', ')} — герой играет одним лицом`))
    }
  }

  return out
}
