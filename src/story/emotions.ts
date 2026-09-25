/**
 * Контракт эмоций: что сцена умеет показывать и что из этого нарисовано.
 *
 * До этого файла набор эмоций жил в трёх местах сразу: тип `Emotion`, ручной
 * каталог в `Sprite.tsx` и список поз в python-скрипте. Расходились они молча.
 * Хуже того, каталог подставлял чужую картинку: `tired: miraWorried` выглядит
 * как обычная строчка кода, а на деле означает, что усталости у героя нет — и
 * восемь реплик, написанных под усталость, играются тревогой.
 *
 * Теперь недостающая поза объявлена: `status: 'planned'` и явное `shownAs`.
 * Сцена по-прежнему что-то показывает (пустой герой хуже), но подмена больше не
 * прячется — её видно в контракте и считает `npm run audit:course`.
 *
 * Файл собирается движком (`tsconfig.engine.json`), поэтому аудит импортирует
 * ровно этот контракт, а не пересказывает его разбором исходников.
 */

const contract = [
  { id: 'neutral', label: 'спокойствие', status: 'drawn' },
  { id: 'happy', label: 'радость', status: 'drawn' },
  { id: 'worried', label: 'тревога', status: 'drawn' },
  { id: 'surprised', label: 'удивление', status: 'drawn' },
  { id: 'determined', label: 'решимость', status: 'drawn' },
  // Заказаны вместе с перерисовкой состава в высоком разрешении. Замена выбрана
  // по ближайшей мимике, а не по алфавиту: пока позы нет, лучше показать
  // соседнее состояние, чем спокойное лицо на грустной реплике.
  { id: 'tired', label: 'усталость', status: 'planned', shownAs: 'worried' },
  { id: 'sad', label: 'грусть', status: 'planned', shownAs: 'worried' },
  { id: 'angry', label: 'злость', status: 'planned', shownAs: 'determined' },
  { id: 'embarrassed', label: 'смущение', status: 'planned', shownAs: 'surprised' },
] as const

export type Emotion = typeof contract[number]['id']

export type EmotionStatus = 'drawn' | 'planned'

export interface EmotionContract {
  id: Emotion
  /** Русское название для отчётов и брифов художнику. */
  label: string
  /** drawn — поза есть у каждого героя; planned — заказана, но ещё не нарисована. */
  status: EmotionStatus
  /** Чем сцена заменяет ненарисованную позу. Только у planned. */
  shownAs?: Emotion
}

export const emotions: readonly EmotionContract[] = contract

export const emotionIds: readonly Emotion[] = contract.map(item => item.id)

/** Эмоции, для которых обязан существовать файл спрайта у каждого героя. */
export const drawnEmotionIds: readonly Emotion[] = contract
  .filter(item => item.status === 'drawn')
  .map(item => item.id)

export function emotionContract(emotion: Emotion): EmotionContract | undefined {
  return emotions.find(item => item.id === emotion)
}

/**
 * Какая поза окажется на экране. Для нарисованной эмоции — она сама, для
 * запланированной — объявленная замена. Цепочка замен не строится: замена
 * обязана быть нарисованной, это проверяет аудит.
 */
export function shownEmotion(emotion: Emotion): Emotion {
  const declared = emotionContract(emotion)
  if (!declared || declared.status === 'drawn') return emotion
  return declared.shownAs ?? 'neutral'
}
