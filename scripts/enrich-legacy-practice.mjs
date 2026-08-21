import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const knowledgeRoot = resolve(root, 'knowledge')

const facts = {
  python: { title: 'Python назван не в честь змеи', text: 'Гвидо ван Россум начал писать Python в конце 1989 года, а название выбрал под впечатлением от комедийного шоу Monty Python.', sourceLabel: 'Python Documentation', sourceUrl: 'https://docs.python.org/3/faq/general.html' },
  sql: { title: 'Реляционная модель появилась раньше SQL', text: 'В 1970 году Эдгар Кодд предложил хранить данные как отношения и отделить логическое представление от физического хранения.', sourceLabel: 'IBM Research', sourceUrl: 'https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks' },
  numpy: { title: 'NumPy вырос из двух конкурирующих библиотек', text: 'NumPy появился в 2005 году на основе Numeric и Numarray; открытая библиотека стала фундаментом научных вычислений на Python.', sourceLabel: 'NumPy Project', sourceUrl: 'https://numpy.org/about/' },
  pandas: { title: 'Pandas начинался внутри финансовой компании', text: 'Разработка pandas началась в AQR Capital Management в 2008 году, а к концу 2009 года проект открыли для сообщества.', sourceLabel: 'pandas Project', sourceUrl: 'https://pandas.pydata.org/about/index.html' },
  postgres: { title: 'История PostgreSQL началась в Беркли', text: 'Проект POSTGRES стартовал в Калифорнийском университете в Беркли в 1986 году; SQL-интерпретатор появился в наследнике Postgres95.', sourceLabel: 'PostgreSQL Documentation', sourceUrl: 'https://www.postgresql.org/docs/current/history.html' },
  statistics: { title: 'Статистика помогала спасать жизни до компьютеров', text: 'Флоренс Найтингейл использовала статистические диаграммы, чтобы показать причины смертности солдат и добиться санитарных реформ.', sourceLabel: 'Science Museum', sourceUrl: 'https://www.sciencemuseum.org.uk/objects-and-stories/florence-nightingale-pioneer-statistician' },
  data: { title: 'Данные стали независимы от способа хранения', text: 'Реляционная модель Кодда отделила логическую структуру данных от деталей их физического размещения — принцип, важный и для современных платформ.', sourceLabel: 'IBM Research', sourceUrl: 'https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks' },
}

const sqlCourses = new Set(['sql-foundations', 'advanced-sql', 'relational-databases', 'analytical-databases', 'clickhouse', 'duckdb', 'postgresql'])

function factFor(courseId) {
  if (courseId === 'numpy') return facts.numpy
  if (courseId === 'pandas' || courseId === 'polars') return facts.pandas
  if (courseId === 'postgresql' || courseId === 'production-incidents') return facts.postgres
  if (courseId === 'statistics' || courseId === 'exploratory-data-analysis' || courseId === 'data-visualization') return facts.statistics
  if (courseId === 'python-core' || courseId === 'technical-foundations') return facts.python
  if (sqlCourses.has(courseId)) return facts.sql
  return facts.data
}

function sqlKeyword(mission) {
  const terms = `${mission.title} ${(mission.termIds ?? []).join(' ')}`.toLowerCase()
  if (terms.includes('join') || terms.includes('соедин')) return 'JOIN'
  if (terms.includes('group') || terms.includes('агрег')) return 'GROUP BY'
  if (terms.includes('where') || terms.includes('фильтр')) return 'WHERE'
  if (terms.includes('window') || terms.includes('окн')) return 'OVER ('
  if (terms.includes('cte') || terms.includes('with')) return 'WITH '
  if (terms.includes('sort') || terms.includes('order')) return 'ORDER BY'
  return 'SELECT '
}

function practice(course, mission, serial) {
  if (sqlCourses.has(course.id)) {
    const keyword = sqlKeyword(mission)
    return {
      workspaceFile: 'solution.sql',
      starterCode: `-- Дело: ${course.title}\n-- Эпизод: ${mission.title}\n-- TODO: напиши запрос и оставь диагностическую проверку результата\n\n`,
      codeChecks: [
        { label: 'Запрос выбирает данные', includes: 'SELECT ' },
        { label: `Использован оператор ${keyword.trim()}`, includes: keyword },
        { label: 'Запрос завершён и готов к запуску', includes: ';' },
      ],
    }
  }
  if (course.id === 'numpy') return {
    workspaceFile: 'solution.py',
    starterCode: `# Дело: ${course.title}\n# Эпизод: ${mission.title}\n# TODO: собери массив, выполни векторную операцию и проверь форму результата\n\n`,
    codeChecks: [
      { label: 'NumPy подключён явно', includes: 'import numpy as np' },
      { label: 'Создан массив для вычисления', includes: 'np.array(' },
      { label: 'Форма результата проверена', includes: 'assert ' },
    ],
  }
  if (course.id === 'pandas' || course.id === 'polars') {
    const library = course.id === 'pandas' ? ['pandas', 'pd'] : ['polars', 'pl']
    return {
      workspaceFile: 'solution.py',
      starterCode: `# Дело: ${course.title}\n# Эпизод: ${mission.title}\n# TODO: создай воспроизводимое преобразование таблицы и проверь результат\n\n`,
      codeChecks: [
        { label: `${course.title} подключён явно`, includes: `import ${library[0]} as ${library[1]}` },
        { label: 'Преобразование оформлено функцией', includes: 'def transform(' },
        { label: 'Результат защищён проверкой', includes: 'assert ' },
      ],
    }
  }
  return {
    workspaceFile: 'solution.py',
    starterCode: `# Дело: ${course.title}\n# Эпизод: ${mission.title}\n# TODO: преврати гипотезу в функцию и добавь автоматическую проверку\n\ncase_id = ${JSON.stringify(`${course.id}-${serial}`)}\n`,
    codeChecks: [
      { label: 'Решение оформлено функцией', includes: 'def solve(' },
      { label: 'Функция возвращает проверяемый результат', includes: 'return ' },
      { label: 'Добавлена автоматическая проверка', includes: 'assert ' },
    ],
  }
}

let changedCourses = 0
let changedMissions = 0
for (const domain of await readdir(knowledgeRoot, { withFileTypes: true })) {
  if (!domain.isDirectory() || ['story', 'professions', 'content-factory'].includes(domain.name)) continue
  const domainRoot = resolve(knowledgeRoot, domain.name)
  for (const entry of await readdir(domainRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const coursePath = resolve(domainRoot, entry.name, 'course.json')
    let course
    try { course = JSON.parse(await readFile(coursePath, 'utf8')) } catch { continue }
    let practical = course.missions.filter(mission => mission.task?.starterCode).length
    const target = Math.ceil(course.missions.length * 0.65)
    if (practical >= target && course.missions.some(mission => mission.historicalFact?.sourceUrl)) continue
    if (!course.missions.some(mission => mission.historicalFact?.sourceUrl)) course.missions[0].historicalFact = factFor(course.id)
    const candidates = course.missions
      .map((mission, index) => ({ mission, index }))
      .filter(({ mission }) => mission.type !== 'story' && !mission.task?.starterCode)
      .sort((a, b) => {
        const weight = mission => ['code', 'lab'].includes(mission.type) ? 0 : mission.type === 'case' ? 1 : mission.type === 'quiz' ? 2 : 3
        return weight(a.mission) - weight(b.mission) || a.index - b.index
      })
    for (const { mission, index } of candidates) {
      if (practical >= target) break
      mission.type = mission.type === 'boss' ? 'boss' : index % 2 ? 'code' : 'lab'
      mission.task = {
        ...mission.task,
        prompt: `${mission.task.prompt} Реализуй решение в рабочем файле и добейся прохождения трёх автоматических проверок.`,
        ...practice(course, mission, index + 1),
      }
      practical += 1
      changedMissions += 1
    }
    await writeFile(coursePath, `${JSON.stringify(course, null, 2)}\n`, 'utf8')
    changedCourses += 1
  }
}

console.log(`Практика усилена: курсов — ${changedCourses}; миссий с кодом — ${changedMissions}`)
