import type { Mission, MissionType, Room } from './types'
import { glossaryTermIds } from './glossary'
import technicalFoundationsCourse from '../knowledge/data/technical-foundations/course.json'
import dataFoundationsCourse from '../knowledge/data/data-foundations/course.json'
import pythonCoreCourse from '../knowledge/data/python-core/course.json'
import dataFormatsCourse from '../knowledge/data/data-formats/course.json'
import sqlFoundationsCourse from '../knowledge/data/sql-foundations/course.json'
import numpyCourse from '../knowledge/data/numpy/course.json'
import relationalDatabasesCourse from '../knowledge/data/relational-databases/course.json'
import pandasCourse from '../knowledge/data/pandas/course.json'
import polarsCourse from '../knowledge/data/polars/course.json'
import dataCleaningCourse from '../knowledge/data/data-cleaning/course.json'
import exploratoryDataAnalysisCourse from '../knowledge/data/exploratory-data-analysis/course.json'
import dataVisualizationCourse from '../knowledge/data/data-visualization/course.json'
import statisticsCourse from '../knowledge/data/statistics/course.json'
import advancedSqlCourse from '../knowledge/data/advanced-sql/course.json'
import postgresqlCourse from '../knowledge/data/postgresql/course.json'
import analyticalDatabasesCourse from '../knowledge/data/analytical-databases/course.json'
import clickhouseCourse from '../knowledge/data/clickhouse/course.json'
import duckdbCourse from '../knowledge/data/duckdb/course.json'
import dataModelingCourse from '../knowledge/data/data-modeling/course.json'
import dataQualityCourse from '../knowledge/data/data-quality/course.json'
import largeDataCourse from '../knowledge/data/large-data/course.json'
import etlEltCourse from '../knowledge/data/etl-elt/course.json'
import productionIncidentsCourse from '../knowledge/data/production-incidents/course.json'
import dataFinalProjectCourse from '../knowledge/data/data-final-project/course.json'
import dataPrograms from '../knowledge/data/programs.json'

interface CourseFile {
  id: string
  title: string
  description: string
  category: string
  level: string
  skills: string[]
  missions: unknown[]
}

const fromCourse = (course: CourseFile, accent: string): RoomDefinition => ({
  id: course.id,
  title: course.title,
  category: course.category,
  level: course.level as Room['level'],
  accent,
  description: course.description,
  skills: course.skills,
  missions: course.missions as Mission[],
  prerequisites: dataPrograms.find(program => program.id === course.id)?.prerequisites ?? [],
})

const dataCourseFiles: CourseFile[] = [
  technicalFoundationsCourse,
  dataFoundationsCourse,
  pythonCoreCourse,
  dataFormatsCourse,
  numpyCourse,
  pandasCourse,
  polarsCourse,
  dataCleaningCourse,
  exploratoryDataAnalysisCourse,
  dataVisualizationCourse,
  statisticsCourse,
  sqlFoundationsCourse,
  advancedSqlCourse,
  relationalDatabasesCourse,
  postgresqlCourse,
  analyticalDatabasesCourse,
  clickhouseCourse,
  duckdbCourse,
  dataModelingCourse,
  dataQualityCourse,
  largeDataCourse,
  etlEltCourse,
  productionIncidentsCourse,
  dataFinalProjectCourse,
]

const dataCourseAccents = ['#38bdf8', '#6ce5c1', '#7da2ff', '#e0b875', '#d98cff', '#ff8d74']
const catalogRooms = dataCourseFiles.map((course, index) => fromCourse(course, dataCourseAccents[index % dataCourseAccents.length]))

const kinds: MissionType[] = ['story', 'quiz', 'code', 'lab', 'code', 'case']

const missions = (room: string, names: string[]): Mission[] => names.map((title, index) => ({
  id: `${room}-${index + 1}`,
  title,
  type: index === names.length - 1 ? 'boss' : kinds[index % kinds.length],
  minutes: index === names.length - 1 ? 25 : 5 + (index % 4) * 3,
  xp: index === names.length - 1 ? 320 : 55 + index * 10,
  termIds: glossaryTermIds(title),
}))

type RoomDefinition = Omit<Room, 'index'>

const roomDefinitions: RoomDefinition[] = [
  ...catalogRooms,
  {
    id: 'linear-algebra', title: 'Линейная алгебра для ML', category: 'Математика', level: 'Средний', accent: '#e0b875', locked: true, prerequisites: ['statistics'],
    description: 'Векторы и матрицы становятся инструментами: от расстояний до сжатия признаков и PCA.',
    skills: ['векторы', 'матрицы', 'SVD', 'PCA'],
    missions: missions('la', ['Карта пространства', 'Векторы признаков', 'Скалярное произведение', 'Нормы и расстояния', 'Матрицы данных', 'Умножение матриц', 'Линейные преобразования', 'Ранг', 'Собственные векторы', 'Сингулярное разложение (SVD)', 'Метод главных компонент (PCA) на пальцах', 'Итоговое испытание: сжатие эмбеддингов']),
  },
  {
    id: 'ml-baseline', title: 'Первая модель машинного обучения', category: 'Машинное обучение', level: 'Средний', accent: '#d98cff', locked: true, prerequisites: ['linear-algebra', 'statistics'],
    description: 'Строим базовое решение для прогноза оттока, не допуская утечки данных и самообмана при проверке качества.',
    skills: ['базовая модель', 'валидация', 'метрики', 'конвейер'],
    missions: missions('ml', ['Задача от бизнеса', 'Что предсказываем', 'Базовое решение (baseline)', 'Обучающая и тестовая выборки', 'Утечка данных', 'Линейная регрессия', 'Логистическая регрессия', 'Метрики классификации', 'Дисбаланс классов', 'Кросс-валидация', 'Предобработка (preprocessing)', 'Конвейер обработки (pipeline)', 'Интерпретация', 'Итоговое испытание: защита модели']),
  },
  {
    id: 'boosting', title: 'Бустинг на табличных данных', category: 'Машинное обучение', level: 'Продвинутый', accent: '#d98cff', locked: true, prerequisites: ['ml-baseline'],
    description: 'Сравниваем CatBoost, XGBoost и LightGBM, а затем укладываем качество в ограничения сервиса.',
    skills: ['деревья решений', 'CatBoost', 'подбор параметров', 'SHAP'],
    missions: missions('boost', ['Слабые модели вместе', 'Дерево решений', 'Бэггинг и бустинг', 'Градиентный бустинг', 'CatBoost', 'XGBoost', 'LightGBM', 'Категориальные признаки', 'Переобучение (overfitting)', 'Подбор параметров', 'Объяснение модели с SHAP', 'Бюджет задержки ответа', 'Итоговое испытание: модель скоринга']),
  },
  {
    id: 'production', title: 'Модель выходит в прод', category: 'MLOps', level: 'Продвинутый', accent: '#ff8d74', locked: true, prerequisites: ['boosting'],
    description: 'Превращаем ноутбук в сервис: API, контейнер, мониторинг качества и безопасный релиз.',
    skills: ['FastAPI', 'Docker', 'мониторинг', 'дрейф данных'],
    missions: missions('prod', ['Ноутбук — не сервис', 'Контракт модели', 'Точка доступа FastAPI (endpoint)', 'Валидация входа', 'Образ Docker', 'Версии артефактов', 'Логирование', 'Метрики сервиса', 'Дрейф данных (data drift)', 'Дрейф концепции (concept drift)', 'Канареечный релиз (canary deployment)', 'Откат модели', 'Итоговое испытание: ночной инцидент']),
  },
]

export const rooms: Room[] = roomDefinitions.map((room, index) => ({
  ...room,
  index: String(index + 1).padStart(2, '0'),
}))

export const missionTypeLabels: Record<MissionType, string> = {
  story: 'История', quiz: 'Квиз', code: 'Код', lab: 'Лаборатория', case: 'Кейс', boss: 'Испытание',
}
