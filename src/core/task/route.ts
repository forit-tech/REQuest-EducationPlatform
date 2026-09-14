/** Вычисляет реальные блокировки курса внутри одного профессионального пути. */
export function coursePrerequisitesInRoute(
  stage: { courseIds: string[]; prerequisites: string[] },
  courseIndex: number,
  canonicalPrerequisites: string[],
  routeIds: ReadonlySet<string>,
) {
  const previousInStage = courseIndex > 0 ? [stage.courseIds[courseIndex - 1]] : stage.prerequisites
  const availableCanonical = canonicalPrerequisites.filter(prerequisite => routeIds.has(prerequisite))
  return [...new Set([...previousInStage, ...availableCanonical])]
}
