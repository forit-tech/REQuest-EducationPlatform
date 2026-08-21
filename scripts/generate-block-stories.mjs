import { readdir, readFile, writeFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const knowledgeRoot = resolve(root, 'knowledge')
const storiesRoot = resolve(knowledgeRoot, 'story/cases')

const scenarios = {
  'advanced-sql': ['Запрос, который съел отчёт', 'Ночной расчёт отчёта не успевает к утренней планёрке, а ускорение меняет цифры.', 'оптимизированный запрос'],
  'analytical-databases': ['Витрина с двойным дном', 'Аналитическая база отвечает быстро, но один и тот же показатель расходится между партициями.', 'схему аналитической витрины'],
  clickhouse: ['Секунда до тайм-аута', 'Поток событий вырос в десять раз, и неверный ключ сортировки остановил оперативный отчёт.', 'план таблицы ClickHouse'],
  'data-cleaning': ['Архив невозможных значений', 'В медицинской выгрузке появились отрицательный возраст, разные единицы и незаметные дубликаты.', 'протокол очистки'],
  'data-final-project': ['Защита перед советом', 'Команде нужен воспроизводимый проект от сырого источника до решения, которое выдержит вопросы экспертов.', 'досье итогового проекта'],
  'data-modeling': ['Сущность без имени', 'Два отдела по-разному считают клиента, заказ и возврат, поэтому их отчёты невозможно соединить.', 'модель данных'],
  'data-quality': ['Зелёный монитор, неверные данные', 'Конвейер формально успешен, но свежая витрина содержит тихое нарушение бизнес-правил.', 'контракт качества'],
  'data-visualization': ['График, который обвиняет не тех', 'Диаграмма показывает резкий рост, созданный обрезанной осью и неверной агрегацией.', 'честную визуализацию'],
  duckdb: ['Расследование в одном файле', 'Большая локальная выгрузка не помещается в привычный процесс, а сервер базы недоступен.', 'локальный аналитический запрос'],
  'etl-elt': ['Пакет не прибыл', 'Часть данных исчезла между источником и витриной, хотя все шаги загрузки отмечены успешными.', 'карту конвейера'],
  'exploratory-data-analysis': ['Шум под красивой средней', 'Среднее значение выглядит спокойно, но один сегмент скрывает разворачивающийся сбой.', 'профиль исследования'],
  'large-data': ['Миллиард строк до рассвета', 'Алгоритм работает на выборке, но на полном объёме заканчивает память и нарушает срок.', 'план масштабирования'],
  pandas: ['Семь версий одной таблицы', 'После цепочки преобразований строки исчезают, типы меняются, а итог нельзя воспроизвести.', 'проверяемый DataFrame-пайплайн'],
  polars: ['Ленивый план', 'Новый табличный движок обещает скорость, но неоптимальный план читает лишние данные.', 'ленивый вычислительный план'],
  postgresql: ['Блокировка в час пик', 'Транзакция удерживает очередь платежей, а поспешное завершение процесса грозит потерей данных.', 'план безопасной диагностики'],
  'production-incidents': ['Красный график в 03:17', 'Метрика рухнула ночью, и команде нужно восстановить сервис, сохранив доказательства причины.', 'хронологию инцидента'],
  'relational-databases': ['Ключ от потерянной записи', 'Связи между заказами и клиентами повреждены, а исправление без ограничений создаст новые ошибки.', 'реляционную схему'],
  statistics: ['Эксперимент с ложной победой', 'Новая версия кажется лучше, но выборка, множественные проверки и случайность спорят с выводом.', 'статистический протокол'],
}

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

const courses = []
for (const domain of await readdir(knowledgeRoot, { withFileTypes: true })) {
  if (!domain.isDirectory() || ['story', 'professions', 'content-factory'].includes(domain.name)) continue
  const domainRoot = resolve(knowledgeRoot, domain.name)
  for (const entry of await readdir(domainRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const coursePath = resolve(domainRoot, entry.name, 'course.json')
    if (await exists(coursePath)) courses.push(JSON.parse(await readFile(coursePath, 'utf8')))
  }
}

let created = 0
for (const course of courses) {
  const storyPath = resolve(storiesRoot, `${course.id}.json`)
  if (await exists(storyPath)) continue
  const [title, logline, artifact] = scenarios[course.id] ?? [
    `Дело: ${course.title}`,
    `${course.description} Команде нужен проверяемый результат, а не догадка.`,
    `рабочий артефакт блока «${course.title}»`,
  ]
  const ids = course.missions.map(mission => mission.id)
  const at = index => ids[Math.min(index, ids.length - 1)]
  const story = {
    caseId: `case-${course.id}`,
    courseId: course.id,
    number: String(created + 1).padStart(2, '0'),
    title,
    logline,
    setting: `Учебная экспедиция · ${course.category}`,
    cast: ['mira', 'oleg', 'lena'],
    acts: [
      {
        id: `${course.id}-start`, title: 'Новая экспедиция', trigger: { on: 'caseStart' },
        beats: [
          { kind: 'comic', panels: [
            { speaker: 'mira', emotion: 'surprised', scene: 'office', caption: logline },
            { speaker: 'oleg', emotion: 'determined', scene: 'screen', caption: `Курс «${course.title}» станет отдельным делом: каждую версию решения проверяем кодом.` },
            { speaker: 'lena', emotion: 'worried', scene: 'meeting', caption: `Результат нужен команде, но неподтверждённый ответ только ухудшит ситуацию.` },
          ] },
          { kind: 'line', speaker: 'oleg', emotion: 'determined', text: `Цель дела — собрать ${artifact}. Теория даст ориентир, но уликами станут только воспроизводимые действия и проверки.` },
        ],
      },
      {
        id: `${course.id}-brief`, title: 'Первая гипотеза', trigger: { on: 'beforeMission', missionId: at(0) },
        beats: [
          { kind: 'line', speaker: 'mira', emotion: 'happy', text: `Я открыла материалы по теме «${course.skills?.[0] ?? course.title}». Сначала зафиксируем вопрос, потом напишем проверку.` },
          { kind: 'line', speaker: 'oleg', emotion: 'neutral', text: 'Не подгоняй решение под красивый результат. Оставь следующий участник команды способ повторить каждый шаг.' },
        ],
      },
      {
        id: `${course.id}-evidence`, title: 'След расходится', trigger: { on: 'afterMission', missionId: at(Math.max(1, Math.floor(ids.length / 4))) },
        beats: [
          { kind: 'line', speaker: 'mira', emotion: 'worried', text: 'Первая проверка не подтвердила удобную гипотезу. Зато теперь мы знаем, где искать дальше.' },
          { kind: 'line', speaker: 'oleg', emotion: 'happy', text: 'Отлично. Отрицательный результат — тоже улика, если код и исходные условия сохранены.' },
        ],
      },
      {
        id: `${course.id}-choice`, title: 'Цена скорости', trigger: { on: 'beforeMission', missionId: at(Math.floor(ids.length / 2)) },
        beats: [
          { kind: 'line', speaker: 'lena', emotion: 'worried', text: 'Срок сжимается. Можно показать только итог и убрать неоднозначную проверку?' },
          { kind: 'choice', id: `${course.id}-deadline-choice`, prompt: 'Как поступить?', options: [
            { id: 'transparent', text: 'Покажу ограничение и приложу воспроизводимую проверку.', reply: 'Команда видит риск и принимает решение осознанно.', trust: { lena: 2, oleg: 1 }, flags: [`${course.id}-transparent`] },
            { id: 'fast', text: 'Спрячу ограничение ради быстрого ответа.', reply: 'Ответ принимают, но наставник просит сохранить сомнительную версию отдельно.', trust: { oleg: -1 }, flags: [`${course.id}-rushed`] },
          ] },
        ],
      },
      {
        id: `${course.id}-turn`, title: 'Доказательство собрано', trigger: { on: 'afterMission', missionId: at(Math.max(2, ids.length - 3)) },
        beats: [
          { kind: 'line', speaker: 'mira', emotion: 'happy', text: `Теперь ${artifact} можно повторить с нуля: исходные условия, код и проверки лежат рядом.` },
          { kind: 'line', speaker: 'lena', emotion: 'determined', text: 'Такой результат я могу защищать. Заверши последнюю миссию и зафиксируй ограничения.' },
        ],
      },
    ],
    endings: [
      { id: `${course.id}-gold`, title: 'Дело выдержало проверку', summary: `Команда получила ${artifact} и понимает границы применимости решения.`, minTrust: { oleg: 1, lena: 1 }, rank: 'золото' },
      { id: `${course.id}-silver`, title: 'Результат с оговорками', summary: 'Рабочая версия принята, но спорные места придётся перепроверить перед следующим решением.', rank: 'серебро' },
    ],
  }
  await writeFile(storyPath, `${JSON.stringify(story, null, 2)}\n`, 'utf8')
  created += 1
}

console.log(`Сюжетные дела: создано — ${created}; всего курсов — ${courses.length}`)
