import type { Character, Emotion } from './types'
import miraNeutral from '../../assets/characters/generated/mira-neutral-v3.png'
import miraHappy from '../../assets/characters/generated/mira-happy-v3.png'
import miraWorried from '../../assets/characters/generated/mira-worried-v3.png'
import miraSurprised from '../../assets/characters/generated/mira-surprised-v3.png'
import miraDetermined from '../../assets/characters/generated/mira-determined-v3.png'
import olegNeutral from '../../assets/characters/generated/oleg-neutral-v3.png'
import olegHappy from '../../assets/characters/generated/oleg-happy-v3.png'
import olegWorried from '../../assets/characters/generated/oleg-worried-v3.png'
import olegSurprised from '../../assets/characters/generated/oleg-surprised-v3.png'
import olegDetermined from '../../assets/characters/generated/oleg-determined-v3.png'
import lenaNeutral from '../../assets/characters/generated/lena-neutral-v3.png'
import lenaHappy from '../../assets/characters/generated/lena-happy-v3.png'
import lenaWorried from '../../assets/characters/generated/lena-worried-v3.png'
import lenaSurprised from '../../assets/characters/generated/lena-surprised-v3.png'
import lenaDetermined from '../../assets/characters/generated/lena-determined-v3.png'
import glebNeutral from '../../assets/characters/generated/gleb-neutral-v3.png'
import glebHappy from '../../assets/characters/generated/gleb-happy-v3.png'
import glebWorried from '../../assets/characters/generated/gleb-worried-v3.png'
import glebSurprised from '../../assets/characters/generated/gleb-surprised-v3.png'
import glebDetermined from '../../assets/characters/generated/gleb-determined-v3.png'
import sonyaNeutral from '../../assets/characters/generated/sonya-neutral-v3.png'
import sonyaHappy from '../../assets/characters/generated/sonya-happy-v3.png'
import sonyaWorried from '../../assets/characters/generated/sonya-worried-v3.png'
import sonyaSurprised from '../../assets/characters/generated/sonya-surprised-v3.png'
import sonyaDetermined from '../../assets/characters/generated/sonya-determined-v3.png'
import artemNeutral from '../../assets/characters/generated/artem-neutral-v3.png'
import artemHappy from '../../assets/characters/generated/artem-happy-v3.png'
import artemWorried from '../../assets/characters/generated/artem-worried-v3.png'
import artemSurprised from '../../assets/characters/generated/artem-surprised-v3.png'
import artemDetermined from '../../assets/characters/generated/artem-determined-v3.png'
import vadimNeutral from '../../assets/characters/generated/vadim-neutral-v3.png'
import vadimHappy from '../../assets/characters/generated/vadim-happy-v3.png'
import vadimWorried from '../../assets/characters/generated/vadim-worried-v3.png'
import vadimSurprised from '../../assets/characters/generated/vadim-surprised-v3.png'
import vadimDetermined from '../../assets/characters/generated/vadim-determined-v3.png'
import alexeyNeutral from '../../assets/characters/generated/alexey-neutral-v3.png'
import alexeyHappy from '../../assets/characters/generated/alexey-happy-v3.png'
import alexeyWorried from '../../assets/characters/generated/alexey-worried-v3.png'
import alexeySurprised from '../../assets/characters/generated/alexey-surprised-v3.png'
import alexeyDetermined from '../../assets/characters/generated/alexey-determined-v3.png'
import yanaNeutral from '../../assets/characters/generated/yana-neutral-v3.png'
import yanaHappy from '../../assets/characters/generated/yana-happy-v3.png'
import yanaWorried from '../../assets/characters/generated/yana-worried-v3.png'
import yanaSurprised from '../../assets/characters/generated/yana-surprised-v3.png'
import yanaDetermined from '../../assets/characters/generated/yana-determined-v3.png'
import pavelNeutral from '../../assets/characters/generated/pavel-neutral-v3.png'
import pavelHappy from '../../assets/characters/generated/pavel-happy-v3.png'
import pavelWorried from '../../assets/characters/generated/pavel-worried-v3.png'
import pavelSurprised from '../../assets/characters/generated/pavel-surprised-v3.png'
import pavelDetermined from '../../assets/characters/generated/pavel-determined-v3.png'
import irinaNeutral from '../../assets/characters/generated/irina-neutral-v3.png'
import irinaHappy from '../../assets/characters/generated/irina-happy-v3.png'
import irinaWorried from '../../assets/characters/generated/irina-worried-v3.png'
import irinaSurprised from '../../assets/characters/generated/irina-surprised-v3.png'
import irinaDetermined from '../../assets/characters/generated/irina-determined-v3.png'
import damirNeutral from '../../assets/characters/generated/damir-neutral-v3.png'
import damirHappy from '../../assets/characters/generated/damir-happy-v3.png'
import damirWorried from '../../assets/characters/generated/damir-worried-v3.png'
import damirSurprised from '../../assets/characters/generated/damir-surprised-v3.png'
import damirDetermined from '../../assets/characters/generated/damir-determined-v3.png'

const spriteCatalog: Record<string, Record<Emotion, string>> = {
  mira: { neutral: miraNeutral, happy: miraHappy, worried: miraWorried, surprised: miraSurprised, tired: miraWorried, determined: miraDetermined },
  oleg: { neutral: olegNeutral, happy: olegHappy, worried: olegWorried, surprised: olegSurprised, tired: olegWorried, determined: olegDetermined },
  lena: { neutral: lenaNeutral, happy: lenaHappy, worried: lenaWorried, surprised: lenaSurprised, tired: lenaWorried, determined: lenaDetermined },
  gleb: { neutral: glebNeutral, happy: glebHappy, worried: glebWorried, surprised: glebSurprised, tired: glebWorried, determined: glebDetermined },
  sonya: { neutral: sonyaNeutral, happy: sonyaHappy, worried: sonyaWorried, surprised: sonyaSurprised, tired: sonyaWorried, determined: sonyaDetermined },
  artem: { neutral: artemNeutral, happy: artemHappy, worried: artemWorried, surprised: artemSurprised, tired: artemWorried, determined: artemDetermined },
  vadim: { neutral: vadimNeutral, happy: vadimHappy, worried: vadimWorried, surprised: vadimSurprised, tired: vadimWorried, determined: vadimDetermined },
  alexey: { neutral: alexeyNeutral, happy: alexeyHappy, worried: alexeyWorried, surprised: alexeySurprised, tired: alexeyWorried, determined: alexeyDetermined },
  yana: { neutral: yanaNeutral, happy: yanaHappy, worried: yanaWorried, surprised: yanaSurprised, tired: yanaWorried, determined: yanaDetermined },
  pavel: { neutral: pavelNeutral, happy: pavelHappy, worried: pavelWorried, surprised: pavelSurprised, tired: pavelWorried, determined: pavelDetermined },
  irina: { neutral: irinaNeutral, happy: irinaHappy, worried: irinaWorried, surprised: irinaSurprised, tired: irinaWorried, determined: irinaDetermined },
  damir: { neutral: damirNeutral, happy: damirHappy, worried: damirWorried, surprised: damirSurprised, tired: damirWorried, determined: damirDetermined },
}

export const illustratedCharacterIds = Object.freeze(Object.keys(spriteCatalog))

export function spriteAsset(characterId: string, emotion: Emotion = 'neutral') {
  return spriteCatalog[characterId]?.[emotion]
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
    role="img"
    aria-label={`${character.name}, ${character.role}`}
    draggable={false}
  />
}
