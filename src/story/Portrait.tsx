import type { Character, Emotion } from './types'

const brows: Record<Emotion, { left: string; right: string }> = {
  neutral: { left: 'M30,40 L44,38', right: 'M56,38 L70,40' },
  happy: { left: 'M30,39 L44,36', right: 'M56,36 L70,39' },
  worried: { left: 'M30,36 L44,41', right: 'M56,41 L70,36' },
  surprised: { left: 'M30,34 L44,32', right: 'M56,32 L70,34' },
  tired: { left: 'M30,40 L44,42', right: 'M56,42 L70,40' },
  determined: { left: 'M29,41 L45,36', right: 'M55,36 L71,41' },
}

const mouths: Record<Emotion, string> = {
  neutral: 'M42,68 Q50,71 58,68',
  happy: 'M40,66 Q50,76 60,66',
  worried: 'M42,71 Q50,66 58,71',
  surprised: 'M46,66 Q50,64 54,66 Q54,73 50,73 Q46,73 46,66',
  tired: 'M43,70 L57,70',
  determined: 'M42,69 L58,67',
}

function Hair({ style, color }: { style: Character['traits']['hair']; color: string }) {
  switch (style) {
    case 'bob':
      return <path d="M22,48 C20,22 80,22 78,48 L78,34 C78,18 22,18 22,34 Z M20,46 C16,58 20,70 24,72 L26,44 Z M80,46 C84,58 80,70 76,72 L74,44 Z" fill={color}/>
    case 'long':
      return <path d="M22,46 C20,20 80,20 78,46 L78,32 C78,16 22,16 22,32 Z M18,44 C14,66 18,88 22,94 L28,44 Z M82,44 C86,66 82,88 78,94 L72,44 Z" fill={color}/>
    case 'ponytail':
      return <><path d="M22,46 C20,20 80,20 78,46 L78,32 C78,16 22,16 22,32 Z" fill={color}/><path d="M76,34 C90,38 92,60 84,74 C82,60 78,48 72,42 Z" fill={color}/></>
    case 'short':
      return <path d="M22,46 C20,20 80,20 78,46 L78,33 C78,19 22,19 22,33 Z" fill={color}/>
    case 'buzz':
      return <path d="M24,42 C24,22 76,22 76,42 L76,36 C76,24 24,24 24,36 Z" fill={color} opacity="0.85"/>
    default:
      return null
  }
}

export function Portrait({ character, emotion = 'neutral', size = 96, speaking = false }: { character: Character; emotion?: Emotion; size?: number; speaking?: boolean }) {
  const { palette, traits } = character
  const brow = brows[emotion]
  const eyeOpen = emotion === 'tired' ? 2.2 : emotion === 'surprised' ? 6 : 4.4
  return (
    <svg className={`portrait-svg ${speaking ? 'is-speaking' : ''}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${character.name}, ${character.role}`}>
      <defs>
        <clipPath id={`clip-${character.id}`}><circle cx="50" cy="50" r="48"/></clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={palette.cloth}/>
      <g clipPath={`url(#clip-${character.id})`}>
        <circle cx="50" cy="50" r="48" fill={`${palette.accent}22`}/>
        <path d="M50,74 C28,74 16,88 14,104 L86,104 C84,88 72,74 50,74 Z" fill={palette.cloth}/>
        <path d="M50,74 L44,104 L56,104 Z" fill={palette.accent} opacity="0.7"/>
        <ellipse cx="50" cy="52" rx="26" ry="30" fill={palette.skin}/>
        <ellipse cx="24" cy="54" rx="4" ry="7" fill={palette.skin}/>
        <ellipse cx="76" cy="54" rx="4" ry="7" fill={palette.skin}/>
        <Hair style={traits.hair} color={palette.hair}/>
        {traits.freckles && <g fill={palette.hair} opacity="0.28">
          <circle cx="36" cy="60" r="1.2"/><circle cx="41" cy="63" r="1.1"/><circle cx="59" cy="63" r="1.1"/><circle cx="64" cy="60" r="1.2"/>
        </g>}
        <path d={brow.left} stroke={palette.hair} strokeWidth="3" strokeLinecap="round" fill="none"/>
        <path d={brow.right} stroke={palette.hair} strokeWidth="3" strokeLinecap="round" fill="none"/>
        <ellipse cx="38" cy="52" rx="5" ry={eyeOpen} fill="#f8fbff"/>
        <ellipse cx="62" cy="52" rx="5" ry={eyeOpen} fill="#f8fbff"/>
        <circle cx="38" cy="52" r={Math.min(2.6, eyeOpen)} fill="#20262f"/>
        <circle cx="62" cy="52" r={Math.min(2.6, eyeOpen)} fill="#20262f"/>
        {traits.beard && <path d="M32,62 C34,82 66,82 68,62 C64,76 36,76 32,62 Z" fill={palette.hair} opacity="0.9"/>}
        <path d={mouths[emotion]} stroke="#8d4a4a" strokeWidth="2.4" fill={emotion === 'surprised' ? '#8d4a4a' : 'none'} strokeLinecap="round"/>
        {traits.glasses && <g stroke={palette.accent} strokeWidth="2.4" fill="none" opacity="0.95">
          <rect x="29" y="45" width="18" height="14" rx="5"/><rect x="53" y="45" width="18" height="14" rx="5"/><path d="M47,52 L53,52"/><path d="M29,50 L22,52"/><path d="M71,50 L78,52"/>
        </g>}
        {traits.headset && <g stroke={palette.accent} strokeWidth="3" fill="none">
          <path d="M22,50 C22,28 78,28 78,50"/><rect x="16" y="48" width="9" height="14" rx="4" fill={palette.accent} stroke="none"/><rect x="75" y="48" width="9" height="14" rx="4" fill={palette.accent} stroke="none"/>
        </g>}
      </g>
      <circle cx="50" cy="50" r="47" fill="none" stroke={palette.accent} strokeWidth="2" opacity="0.85"/>
    </svg>
  )
}
