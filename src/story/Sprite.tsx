import type { Character, Emotion } from './types'
import miraNeutral from '../../assets/characters/generated/mira-v2.png'
import miraHappy from '../../assets/characters/generated/mira-happy-v2.png'
import miraWorried from '../../assets/characters/generated/mira-worried-v2.png'
import miraSurprised from '../../assets/characters/generated/mira-surprised-v2.png'
import miraDetermined from '../../assets/characters/generated/mira-determined-v2.png'
import olegNeutral from '../../assets/characters/generated/oleg-v2.png'
import olegHappy from '../../assets/characters/generated/oleg-happy-v2.png'
import olegWorried from '../../assets/characters/generated/oleg-worried-v2.png'
import olegSurprised from '../../assets/characters/generated/oleg-surprised-v2.png'
import olegDetermined from '../../assets/characters/generated/oleg-determined-v2.png'
import lenaNeutral from '../../assets/characters/generated/lena-v2.png'
import lenaHappy from '../../assets/characters/generated/lena-happy-v2.png'
import lenaWorried from '../../assets/characters/generated/lena-worried-v2.png'
import lenaSurprised from '../../assets/characters/generated/lena-surprised-v2.png'
import lenaDetermined from '../../assets/characters/generated/lena-determined-v2.png'
import glebNeutral from '../../assets/characters/generated/gleb-v2.png'
import glebHappy from '../../assets/characters/generated/gleb-happy-v2.png'
import glebWorried from '../../assets/characters/generated/gleb-worried-v2.png'
import glebSurprised from '../../assets/characters/generated/gleb-surprised-v2.png'
import glebDetermined from '../../assets/characters/generated/gleb-determined-v2.png'
import sonyaNeutral from '../../assets/characters/generated/sonya-v2.png'
import sonyaHappy from '../../assets/characters/generated/sonya-happy-v3.png'
import sonyaWorried from '../../assets/characters/generated/sonya-worried-v3.png'
import sonyaSurprised from '../../assets/characters/generated/sonya-surprised-v3.png'
import sonyaDetermined from '../../assets/characters/generated/sonya-determined-v3.png'
import artemNeutral from '../../assets/characters/generated/artem-v2.png'
import artemHappy from '../../assets/characters/generated/artem-happy-v3.png'
import artemWorried from '../../assets/characters/generated/artem-worried-v3.png'
import artemSurprised from '../../assets/characters/generated/artem-surprised-v3.png'
import artemDetermined from '../../assets/characters/generated/artem-determined-v3.png'
import antonNeutral from '../../assets/characters/generated/anton-v2.png'
import antonHappy from '../../assets/characters/generated/anton-happy-v3.png'
import antonWorried from '../../assets/characters/generated/anton-worried-v3.png'
import antonSurprised from '../../assets/characters/generated/anton-surprised-v3.png'
import antonDetermined from '../../assets/characters/generated/anton-determined-v3.png'
import alexeyNeutral from '../../assets/characters/generated/alexey-v2.png'
import alexeyHappy from '../../assets/characters/generated/alexey-happy-v3.png'
import alexeyWorried from '../../assets/characters/generated/alexey-worried-v3.png'
import alexeySurprised from '../../assets/characters/generated/alexey-surprised-v3.png'
import alexeyDetermined from '../../assets/characters/generated/alexey-determined-v3.png'

const spriteCatalog: Record<string, Record<Emotion, string>> = {
  mira: { neutral: miraNeutral, happy: miraHappy, worried: miraWorried, surprised: miraSurprised, tired: miraWorried, determined: miraDetermined },
  oleg: { neutral: olegNeutral, happy: olegHappy, worried: olegWorried, surprised: olegSurprised, tired: olegWorried, determined: olegDetermined },
  lena: { neutral: lenaNeutral, happy: lenaHappy, worried: lenaWorried, surprised: lenaSurprised, tired: lenaWorried, determined: lenaDetermined },
  gleb: { neutral: glebNeutral, happy: glebHappy, worried: glebWorried, surprised: glebSurprised, tired: glebWorried, determined: glebDetermined },
  sonya: { neutral: sonyaNeutral, happy: sonyaHappy, worried: sonyaWorried, surprised: sonyaSurprised, tired: sonyaWorried, determined: sonyaDetermined },
  artem: { neutral: artemNeutral, happy: artemHappy, worried: artemWorried, surprised: artemSurprised, tired: artemWorried, determined: artemDetermined },
  anton: { neutral: antonNeutral, happy: antonHappy, worried: antonWorried, surprised: antonSurprised, tired: antonWorried, determined: antonDetermined },
  alexey: { neutral: alexeyNeutral, happy: alexeyHappy, worried: alexeyWorried, surprised: alexeySurprised, tired: alexeyWorried, determined: alexeyDetermined },
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
    className={`vn-sprite illustrated ${dimmed ? 'is-dimmed' : ''} side-${side}`}
    src={source}
    height={height}
    data-character-id={character.id}
    role="img"
    aria-label={`${character.name}, ${character.role}`}
    draggable={false}
  />
}
