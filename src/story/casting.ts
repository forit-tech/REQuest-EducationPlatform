/**
 * Кастинг сквозной новеллы: кто выйдет на сцену вместо авторского героя.
 *
 * Одно и то же дело играется в нескольких профессиях, а постоянная команда у
 * каждой своя. Раньше замена бралась по позиции в массиве (`targetIds[0]`), и
 * это давало не грамматическую, а смысловую подмену: вместо напарницы-стажёра
 * выходил руководитель отдела, а её реплика «я сама всё проверила» доставалась
 * мужчине.
 *
 * Правила замены:
 *   1. авторский герой остаётся, если он есть в команде профессии;
 *   2. замена ищется только среди совместимых по полу и сюжетной роли;
 *   3. порядок перебора задаётся списком персонажей, а не составом команды,
 *      поэтому результат не зависит от того, как записан состав;
 *   4. если совместимого нет — замены не происходит. Функция возвращает отказ с
 *      причиной и списком доступных кандидатов, аудит показывает адрес сцены, а
 *      приложение оставляет авторского героя: чужой человек в кадре — меньшее
 *      зло, чем реплика в чужом роде, и он виден на сборке.
 *
 * Модуль чистый и ничего не читает с диска: данные подаёт вызывающий. Так один
 * и тот же код работает и в приложении, и в аудите (scripts/audit).
 */

export interface CastingMember {
  id: string
  name?: string
  gender?: string
  archetype?: string
}

export interface CastingBook {
  /** Персонажи в каноническом порядке. Он же — порядок перебора кандидатов. */
  cast: readonly CastingMember[]
  /** Сюжетная роль → роли, которыми её разрешено закрывать, по убыванию близости. */
  archetypeFallbacks: Record<string, readonly string[]>
  /** Значения пола, между которыми вообще возможна замена. */
  castableGenders: readonly string[]
}

export type CastingRefusal = 'unknown-source' | 'ungendered-source' | 'no-candidate'

export type CastingResult =
  | { ok: true; id: string; kept: boolean }
  | { ok: false; reason: CastingRefusal; sourceId: string; candidates: CastingMember[] }

/** Собирает справочник кастинга из cast.json и casting.json. */
export function castingBook(cast: readonly CastingMember[], casting: {
  archetypeFallbacks?: Record<string, readonly string[]>
  castableGenders?: readonly string[]
}): CastingBook {
  return {
    cast,
    archetypeFallbacks: casting.archetypeFallbacks ?? {},
    castableGenders: casting.castableGenders ?? ['male', 'female'],
  }
}

/**
 * Кандидаты в порядке справочника, а не в порядке команды: перестановка состава
 * профессии не должна менять того, кто выйдет на сцену.
 */
function teamMembers(teamIds: readonly string[], book: CastingBook) {
  const wanted = new Set(teamIds)
  return book.cast.filter(member => wanted.has(member.id))
}

export function castCharacter(sourceId: string, teamIds: readonly string[], book: CastingBook): CastingResult {
  const source = book.cast.find(member => member.id === sourceId)
  const candidates = teamMembers(teamIds, book)
  if (!source) return { ok: false, reason: 'unknown-source', sourceId, candidates }
  if (teamIds.includes(sourceId)) return { ok: true, id: sourceId, kept: true }

  // Пол без явного значения не делает героя универсальным дублёром: рассказчик
  // и незаполненная карточка не могут закрыть ни мужскую, ни женскую роль.
  if (!source.gender || !book.castableGenders.includes(source.gender)) {
    return { ok: false, reason: 'ungendered-source', sourceId, candidates }
  }

  const sameGender = candidates.filter(member => member.gender === source.gender)
  const chain = book.archetypeFallbacks[source.archetype ?? ''] ?? (source.archetype ? [source.archetype] : [])
  for (const archetype of chain) {
    const match = sameGender.find(member => member.archetype === archetype)
    if (match) return { ok: true, id: match.id, kept: false }
  }
  return { ok: false, reason: 'no-candidate', sourceId, candidates }
}

/** Человеческое описание отказа. Одна формулировка на приложение и на аудит. */
export function refusalReason(result: Extract<CastingResult, { ok: false }>, source?: CastingMember) {
  if (result.reason === 'unknown-source') return `персонажа ${result.sourceId} нет в составе платформы`
  if (result.reason === 'ungendered-source') return `у персонажа ${result.sourceId} не указан пол, замена запрещена`
  const role = source?.archetype ? `роль «${source.archetype}»` : 'его роль'
  const gender = source?.gender === 'female' ? 'женского' : 'мужского'
  return `в команде профессии некому закрыть ${role} ${gender} рода`
}
