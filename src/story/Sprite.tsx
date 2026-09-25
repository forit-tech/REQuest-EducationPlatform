import type { Character } from './types'
import { emotionIds, shownEmotion, type Emotion } from './emotions'

/**
 * Каталог спрайтов собирается из файлов, а не переписывается руками.
 *
 * Раньше здесь лежали шестьдесят импортов и двенадцать строк вида
 * `tired: miraWorried`. Первое приходилось править при каждой перерисовке
 * состава, второе тихо отменяло эмоцию: сцена просила усталость, а получала
 * тревогу, и заметить это можно было только глазами.
 *
 * Теперь имя файла — это и есть объявление: `<герой>-<эмоция>-v<версия>.png`.
 * Замену ненарисованной позы задаёт контракт эмоций, и её видит аудит.
 *
 * В каталоге лежат только позы. Исходные листы и старые версии живут в
 * `assets/characters/source/` и в сборку не попадают.
 */
const files = import.meta.glob('../../assets/characters/generated/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const NAME = /([a-z]+)-([a-z]+)-v(\d+)\.png$/

type Pose = { asset: string; version: number }

const drawnPoses = new Map<string, Map<Emotion, Pose>>()
for (const [path, asset] of Object.entries(files)) {
  const match = NAME.exec(path)
  if (!match) continue
  const [, characterId, emotion, version] = match
  if (!(emotionIds as readonly string[]).includes(emotion)) continue
  if (!drawnPoses.has(characterId)) drawnPoses.set(characterId, new Map())
  const poses = drawnPoses.get(characterId)!
  const previous = poses.get(emotion as Emotion)
  // Старая версия позы остаётся на диске до полной замены состава: на сцену
  // выходит самая свежая.
  if (previous && previous.version >= Number(version)) continue
  poses.set(emotion as Emotion, { asset, version: Number(version) })
}

export const illustratedCharacterIds = Object.freeze([...drawnPoses.keys()].sort())

/** Есть ли у героя собственная картинка именно этой эмоции. */
export function hasDrawnPose(characterId: string, emotion: Emotion) {
  return drawnPoses.get(characterId)?.has(emotion) ?? false
}

export function spriteAsset(characterId: string, emotion: Emotion = 'neutral') {
  const poses = drawnPoses.get(characterId)
  if (!poses) return undefined
  // Порядок один и тот же и в приложении, и в аудите: своя поза, объявленная
  // контрактом замена, спокойствие.
  return poses.get(emotion)?.asset ?? poses.get(shownEmotion(emotion))?.asset ?? poses.get('neutral')?.asset
}

export function Sprite({ character, emotion = 'neutral', height = 420, dimmed = false, side = 'left' }: {
  character: Character
  emotion?: Emotion
  height?: number
  dimmed?: boolean
  side?: 'left' | 'right'
}) {
  const source = spriteAsset(character.id, emotion)
  if (!source) return null

  return <img
    className={`vn-sprite illustrated height-${character.traits.height ?? 'average'} ${dimmed ? 'is-dimmed' : ''} side-${side}`}
    src={source}
    height={height}
    data-character-id={character.id}
    data-emotion={emotion}
    role="img"
    aria-label={`${character.name}, ${character.role}`}
    draggable={false}
  />
}
