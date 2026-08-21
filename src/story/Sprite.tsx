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
import glebHappy from '../../assets/characters/generated/gleb-happy-v2.png'
import glebWorried from '../../assets/characters/generated/gleb-worried-v2.png'
import glebSurprised from '../../assets/characters/generated/gleb-surprised-v2.png'
import glebDetermined from '../../assets/characters/generated/gleb-determined-v2.png'
import glebNeutral from '../../assets/characters/generated/gleb-v2.png'
import sonyaNeutral from '../../assets/characters/generated/sonya-v2.png'
import artemNeutral from '../../assets/characters/generated/artem-v2.png'
import antonNeutral from '../../assets/characters/generated/anton-v2.png'
import alexeyNeutral from '../../assets/characters/generated/alexey-v2.png'

function singlePose(image: string): Record<Emotion, string> {
  return { neutral: image, happy: image, worried: image, surprised: image, tired: image, determined: image }
}

const illustratedSprites: Partial<Record<string, Record<Emotion, string>>> = {
  mira: { neutral: miraNeutral, happy: miraHappy, worried: miraWorried, surprised: miraSurprised, tired: miraWorried, determined: miraDetermined },
  oleg: { neutral: olegNeutral, happy: olegHappy, worried: olegWorried, surprised: olegSurprised, tired: olegWorried, determined: olegDetermined },
  lena: { neutral: lenaNeutral, happy: lenaHappy, worried: lenaWorried, surprised: lenaSurprised, tired: lenaWorried, determined: lenaDetermined },
  gleb: { neutral: glebNeutral, happy: glebHappy, worried: glebWorried, surprised: glebSurprised, tired: glebWorried, determined: glebDetermined },
  sonya: singlePose(sonyaNeutral),
  artem: singlePose(artemNeutral),
  anton: singlePose(antonNeutral),
  alexey: singlePose(alexeyNeutral),
}

/** Голова центрирована в (110, 108), rx 52 / ry 60. Все черты лица считаются от неё. */
const brows: Record<Emotion, { left: string; right: string }> = {
  neutral: { left: 'M78,86 L100,83', right: 'M120,83 L142,86' },
  happy: { left: 'M78,85 L100,79', right: 'M120,79 L142,85' },
  worried: { left: 'M78,80 L100,89', right: 'M120,89 L142,80' },
  surprised: { left: 'M78,74 L100,71', right: 'M120,71 L142,74' },
  tired: { left: 'M78,86 L100,90', right: 'M120,90 L142,86' },
  determined: { left: 'M76,88 L102,79', right: 'M118,79 L144,88' },
}

const mouths: Record<Emotion, string> = {
  neutral: 'M98,136 Q110,140 122,136',
  happy: 'M94,132 Q110,148 126,132',
  worried: 'M98,141 Q110,133 122,141',
  surprised: 'M104,133 Q110,130 116,133 Q116,144 110,144 Q104,144 104,133',
  tired: 'M99,139 L121,139',
  determined: 'M98,138 L122,135',
}

/** Лёгкий наклон корпуса под настроение — статичная поза без анимации. */
const posture: Record<Emotion, number> = {
  neutral: 0, happy: -1.5, worried: 2, surprised: -2.5, tired: 3.5, determined: -2,
}

function Hair({ style, color }: { style: Character['traits']['hair']; color: string }) {
  switch (style) {
    case 'bob':
      return <path d="M56,110 C52,54 168,54 164,110 L164,80 C164,44 56,44 56,80 Z M52,106 C44,130 52,156 60,160 L64,102 Z M168,106 C176,130 168,156 160,160 L156,102 Z" fill={color}/>
    case 'long':
      return <path d="M56,106 C52,50 168,50 164,106 L164,76 C164,40 56,40 56,76 Z M48,102 C40,152 48,206 56,220 L68,102 Z M172,102 C180,152 172,206 164,220 L152,102 Z" fill={color}/>
    case 'ponytail':
      return <><path d="M56,106 C52,50 168,50 164,106 L164,76 C164,40 56,40 56,76 Z" fill={color}/><path d="M160,80 C192,88 196,140 178,172 C174,140 166,112 152,96 Z" fill={color}/></>
    case 'short':
      return <path d="M56,106 C52,50 168,50 164,106 L164,78 C164,46 56,46 56,78 Z" fill={color}/>
    case 'buzz':
      return <path d="M60,98 C60,54 160,54 160,98 L160,84 C160,58 60,58 60,84 Z" fill={color} opacity="0.86"/>
    default:
      return null
  }
}

export function Sprite({ character, emotion = 'neutral', height = 420, dimmed = false, side = 'left' }: {
  character: Character
  emotion?: Emotion
  height?: number
  dimmed?: boolean
  side?: 'left' | 'right'
}) {
  const illustrated = illustratedSprites[character.id]?.[emotion]
  if (illustrated) {
    return <img className={`vn-sprite illustrated ${dimmed ? 'is-dimmed' : ''} side-${side}`} src={illustrated} height={height}
      role="img" aria-label={`${character.name}, ${character.role}`} draggable={false}/>
  }

  const { palette, traits } = character
  const brow = brows[emotion]
  const eyeOpen = emotion === 'tired' ? 3 : emotion === 'surprised' ? 8 : 6
  const tilt = posture[emotion]
  const skinShade = `color-mix(in srgb, ${palette.skin} 82%, #000)`

  return (
    <svg className={`vn-sprite ${dimmed ? 'is-dimmed' : ''} side-${side}`} height={height} viewBox="0 0 220 460"
      role="img" aria-label={`${character.name}, ${character.role}`} preserveAspectRatio="xMidYMax meet">
      <g transform={`rotate(${tilt} 110 300)`}>
        {/* ноги */}
        <path d="M84,286 L84,430 Q84,440 94,440 L104,440 Q112,440 112,430 L112,286 Z" fill="#2b3140"/>
        <path d="M108,286 L108,430 Q108,440 116,440 L126,440 Q136,440 136,430 L136,286 Z" fill="#232936"/>
        <rect x="80" y="434" width="36" height="12" rx="5" fill="#171b24"/>
        <rect x="104" y="434" width="36" height="12" rx="5" fill="#12161d"/>

        {/* корпус */}
        <path d="M110,168 C142,168 160,186 163,214 L168,292 Q168,300 158,300 L62,300 Q52,300 52,292 L57,214 C60,186 78,168 110,168 Z" fill={palette.cloth}/>
        {/* руки */}
        <path d="M60,196 C48,206 42,240 42,278 Q42,288 50,288 Q58,288 59,278 C61,246 66,222 72,208 Z" fill={palette.cloth}/>
        <path d="M160,196 C172,206 178,240 178,278 Q178,288 170,288 Q162,288 161,278 C159,246 154,222 148,208 Z" fill={palette.cloth}/>
        <circle cx="50" cy="290" r="9" fill={palette.skin}/>
        <circle cx="170" cy="290" r="9" fill={palette.skin}/>
        {/* воротник и акцент */}
        <path d="M110,168 L96,190 L110,206 L124,190 Z" fill={palette.accent} opacity="0.85"/>
        <path d="M110,206 L110,290" stroke={skinShade} strokeWidth="1.5" opacity="0.25"/>

        {/* шея */}
        <rect x="98" y="150" width="24" height="28" rx="9" fill={skinShade}/>

        {/* голова */}
        <ellipse cx="110" cy="108" rx="52" ry="60" fill={palette.skin}/>
        <ellipse cx="58" cy="112" rx="8" ry="13" fill={palette.skin}/>
        <ellipse cx="162" cy="112" rx="8" ry="13" fill={palette.skin}/>
        <Hair style={traits.hair} color={palette.hair}/>
        {traits.freckles && <g fill={palette.hair} opacity="0.26">
          <circle cx="88" cy="122" r="2"/><circle cx="96" cy="127" r="1.8"/><circle cx="124" cy="127" r="1.8"/><circle cx="132" cy="122" r="2"/>
        </g>}
        <path d={brow.left} stroke={palette.hair} strokeWidth="4.5" strokeLinecap="round" fill="none"/>
        <path d={brow.right} stroke={palette.hair} strokeWidth="4.5" strokeLinecap="round" fill="none"/>
        <ellipse cx="92" cy="106" rx="7" ry={eyeOpen} fill="#f8fbff"/>
        <ellipse cx="128" cy="106" rx="7" ry={eyeOpen} fill="#f8fbff"/>
        <circle cx="92" cy="106" r={Math.min(3.6, eyeOpen)} fill="#20262f"/>
        <circle cx="128" cy="106" r={Math.min(3.6, eyeOpen)} fill="#20262f"/>
        <path d="M108,112 Q106,124 112,126" stroke={skinShade} strokeWidth="2" fill="none" opacity="0.5"/>
        {traits.beard && <path d="M70,124 C74,164 146,164 150,124 C142,152 78,152 70,124 Z" fill={palette.hair} opacity="0.92"/>}
        <path d={mouths[emotion]} stroke="#8d4a4a" strokeWidth="3.2" fill={emotion === 'surprised' ? '#8d4a4a' : 'none'} strokeLinecap="round"/>
        {traits.glasses && <g stroke={palette.accent} strokeWidth="3.4" fill="none" opacity="0.95">
          <rect x="76" y="94" width="34" height="26" rx="9"/><rect x="118" y="94" width="34" height="26" rx="9"/>
          <path d="M110,106 L118,106"/><path d="M76,102 L58,106"/><path d="M152,102 L170,106"/>
        </g>}
        {traits.headset && <g stroke={palette.accent} strokeWidth="5" fill="none">
          <path d="M56,110 C56,62 164,62 164,110"/>
          <rect x="44" y="104" width="16" height="26" rx="7" fill={palette.accent} stroke="none"/>
          <rect x="160" y="104" width="16" height="26" rx="7" fill={palette.accent} stroke="none"/>
          <path d="M60,126 Q80,140 96,136" strokeWidth="3"/>
        </g>}
      </g>
    </svg>
  )
}
