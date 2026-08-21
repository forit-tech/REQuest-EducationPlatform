import { spriteAsset } from './Sprite'
import type { Character, Emotion } from './types'

export function Portrait({ character, emotion = 'neutral', size = 96, speaking = false }: {
  character: Character
  emotion?: Emotion
  size?: number
  speaking?: boolean
}) {
  const source = spriteAsset(character.id, emotion)
  if (!source) return null

  return <span
    className={`portrait-illustrated ${speaking ? 'is-speaking' : ''}`}
    style={{ width: size, height: size }}
    data-character-id={character.id}
  >
    <img src={source} alt={`${character.name}, ${character.role}`} draggable={false}/>
  </span>
}
