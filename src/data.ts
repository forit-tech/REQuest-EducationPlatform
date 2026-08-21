import type { Mission, MissionType, Room } from './types'
import professionPrograms from '../knowledge/professions/programs.json'

interface CourseFile {
  id: string
  title: string
  description: string
  category: string
  level: string
  skills: string[]
  missions: unknown[]
}

interface CourseProgramEntry { id: string; prerequisites?: string[] }
const programModules = import.meta.glob('../knowledge/*/programs.json', { eager: true, import: 'default' }) as Record<string, unknown[]>
const canonicalPrograms = Object.values(programModules).flat().filter((entry): entry is CourseProgramEntry => Boolean(entry && typeof entry === 'object' && 'id' in entry))

const fromCourse = (course: CourseFile, accent: string): RoomDefinition => ({
  id: course.id,
  title: course.title,
  category: course.category,
  level: course.level as Room['level'],
  accent,
  description: course.description,
  skills: course.skills,
  missions: course.missions as Mission[],
  prerequisites: canonicalPrograms.find(program => program.id === course.id)?.prerequisites ?? [],
})

const courseModules = import.meta.glob('../knowledge/**/course.json', { eager: true, import: 'default' }) as Record<string, CourseFile>
const dataCourseFiles: CourseFile[] = Object.values(courseModules)

const dataCourseAccents = ['#38bdf8', '#6ce5c1', '#7da2ff', '#e0b875', '#d98cff', '#ff8d74']
const catalogRooms = dataCourseFiles.map((course, index) => fromCourse(course, dataCourseAccents[index % dataCourseAccents.length]))

type RoomDefinition = Omit<Room, 'index'>

const roomDefinitions: RoomDefinition[] = [
  ...catalogRooms,
]

export const rooms: Room[] = roomDefinitions.map((room, index) => ({
  ...room,
  index: String(index + 1).padStart(2, '0'),
}))

export function courseIdsForProfession(professionId: string) {
  const program = professionPrograms.find(item => item.professionId === professionId)
  return program?.stages.flatMap(stage => stage.courseIds) ?? []
}

export function roomsForProfession(professionId: string) {
  const program = professionPrograms.find(item => item.professionId === professionId)
  if (!program) return []
  const roomById = new Map(rooms.map(room => [room.id, room]))
  const routeIds = new Set(program.stages.flatMap(stage => stage.courseIds))
  const route: Room[] = []
  for (const stage of program.stages) {
    stage.courseIds.forEach(courseId => {
      const room = roomById.get(courseId)
      if (!room) return
      const routePrerequisites = (room.prerequisites ?? []).filter(prerequisite => routeIds.has(prerequisite))
      route.push({
        ...room,
        index: String(route.length + 1).padStart(2, '0'),
        prerequisites: routePrerequisites.length ? routePrerequisites : stage.prerequisites,
      })
    })
  }
  return route
}

export const missionTypeLabels: Record<MissionType, string> = {
  story: 'История', quiz: 'Квиз', code: 'Код', lab: 'Лаборатория', case: 'Кейс', boss: 'Испытание',
}
