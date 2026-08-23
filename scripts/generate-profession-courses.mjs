import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { backendCurricula } from './curricula/backend.mjs'
import { frontendCurricula } from './curricula/frontend.mjs'
import { devopsCurricula } from './curricula/devops.mjs'
import { securityCurricula } from './curricula/security.mjs'
import { dataScientistCurricula } from './curricula/data_scientist.mjs'

const root = resolve(import.meta.dirname, '..')
const knowledgeRoot = resolve(root, 'knowledge')
const storyRoot = resolve(knowledgeRoot, 'story/cases')

const curricula = {
  'data-analyst': {
    domain: 'data',
    cast: ['mira', 'oleg', 'lena'],
    courses: [
      {
        id: 'analyst-metrics', prefix: 'ANM', title: 'Метрики без самообмана', category: 'Основы аналитики', level: 'База',
        description: 'Переводим бизнес-вопросы в метрики с явной формулой, детализацией, ограничениями и владельцем.',
        caseTitle: 'Три правды об одном продукте', setting: 'Еженедельный продуктовый комитет получил три разных значения активной аудитории.',
        topics: [
          { title: 'Бизнес-вопрос и решение', fact: 'Метрика полезна только вместе с решением, которое команда примет по её значению.', wrong: ['Красивое число уже является решением.', 'Чем больше метрик, тем точнее ответ.'], action: 'Сначала зафиксировать решение и вопрос, затем выбирать показатель.', artifact: 'карточку решения' },
          { title: 'Числитель, знаменатель и окно', fact: 'Формула метрики должна явно задавать числитель, знаменатель и временное окно.', wrong: ['Достаточно названия метрики.', 'Знаменатель всегда равен всем пользователям за всё время.'], action: 'Записать формулу и проверить обе части на одном временном окне.', artifact: 'паспорт формулы' },
          { title: 'Детализация и единица анализа', fact: 'Одна строка исходных данных и единица метрики должны быть названы до агрегации.', wrong: ['Детализация не влияет на результат JOIN.', 'Любую таблицу можно агрегировать одинаково.'], action: 'Определить grain каждой таблицы и только потом соединять данные.', artifact: 'карту детализации' },
          { title: 'North Star и защитные метрики', fact: 'Основная метрика показывает ценность, а защитные метрики не дают улучшить её ценой вреда продукту.', wrong: ['У продукта должна быть только одна метрика.', 'Защитные метрики нужны лишь после инцидента.'], action: 'Связать основную метрику с качеством, риском и ограничениями.', artifact: 'контракт метрик' },
        ],
      },
      {
        id: 'product-analytics', prefix: 'PRA', title: 'Продуктовая аналитика', category: 'Продукт', level: 'Средний',
        description: 'Исследуем события, воронки, когорты, удержание и экономику продукта без ошибок детализации.',
        caseTitle: 'Исчезнувшие пользователи', setting: 'После редизайна конверсия выросла, но выручка и повторные покупки неожиданно упали.',
        topics: [
          { title: 'События и план отслеживания', fact: 'Событие должно описывать действие пользователя, иметь стабильное имя и проверяемые свойства.', wrong: ['Событие можно переименовывать без версии.', 'Для аналитики достаточно хранить только экран.'], action: 'Составить tracking plan с событием, свойствами, владельцем и правилом проверки.', artifact: 'план событий' },
          { title: 'Воронка', fact: 'Шаги воронки считают на одной сущности и в согласованном порядке внутри заданного окна.', wrong: ['Каждый шаг можно считать по разной сущности.', 'Порядок событий в воронке не важен.'], action: 'Зафиксировать сущность, порядок шагов и допустимое окно прохождения.', artifact: 'схему воронки' },
          { title: 'Когорты и удержание', fact: 'Когорта объединяет пользователей по общему стартовому событию и периоду его наступления.', wrong: ['Когорта — любой сегмент пользователей.', 'Retention всегда считают от календарного месяца.'], action: 'Выбрать стартовое событие и сравнить одинаковый возраст когорт.', artifact: 'когортную таблицу' },
          { title: 'Юнит-экономика и сегменты', fact: 'LTV и CAC сравнивают для согласованных сегментов, горизонтов и правил атрибуции.', wrong: ['Средний LTV одинаково полезен для всех каналов.', 'CAC не зависит от окна атрибуции.'], action: 'Разделить каналы и сверить горизонт дохода с окном затрат.', artifact: 'модель экономики' },
        ],
      },
      {
        id: 'analytics-communication', prefix: 'ANC', title: 'Аналитика, которая меняет решение', category: 'Коммуникация', level: 'Средний',
        description: 'Выбираем честную визуальную форму, показываем неопределённость и защищаем вывод перед командой.',
        caseTitle: 'Пять минут до совета директоров', setting: 'Лена должна вынести решение о запуске, но график скрывает риск и спорит с исходными данными.',
        topics: [
          { title: 'Тезис и аудитория', fact: 'Аналитическая записка начинается с решения и тезиса, а не с перечня выполненных запросов.', wrong: ['Нужно показать все расчёты до вывода.', 'Один и тот же отчёт подходит любой аудитории.'], action: 'Сформулировать решение, тезис и необходимую аудитории степень детализации.', artifact: 'одностраничную записку' },
          { title: 'Честная визуализация', fact: 'Тип графика выбирают по вопросу, а шкалы и агрегации не должны искажать сравнение.', wrong: ['Обрезанная ось всегда делает график понятнее.', 'Круговая диаграмма подходит для временного ряда.'], action: 'Выбрать форму по задаче и проверить шкалу, сортировку и подписи.', artifact: 'макет графика' },
          { title: 'Неопределённость и ограничения', fact: 'Сильный вывод явно отделяет наблюдение от причинного объяснения и называет ограничения данных.', wrong: ['Ограничения ослабляют отчёт, поэтому их скрывают.', 'Корреляция автоматически доказывает причину.'], action: 'Добавить диапазон неопределённости, альтернативы и границы применимости.', artifact: 'реестр ограничений' },
          { title: 'Защита рекомендации', fact: 'Рекомендация должна содержать действие, ожидаемый эффект, риск и способ проверить результат.', wrong: ['Достаточно завершить презентацию выводом.', 'Риск должен оценить только заказчик.'], action: 'Предложить действие, контрольную метрику и условие остановки.', artifact: 'план решения' },
        ],
      },
    ],
  },
  'ml-engineer': {
    domain: 'data',
    cast: ['mira', 'oleg', 'vadim'],
    courses: [
      {
        id: 'ml-engineering', prefix: 'MLE', title: 'Инженерия обучения моделей', category: 'ML Engineering', level: 'Средний',
        description: 'Превращаем эксперимент в воспроизводимый конвейер данных, признаков, обучения и регистрации модели.',
        caseTitle: 'Модель, которую невозможно повторить', setting: 'Лучшая модель команды исчезла вместе с окружением ноутбука, а релиз назначен на утро.',
        topics: [
          { title: 'Воспроизводимое окружение', fact: 'Версии кода, зависимостей, данных и параметров должны однозначно определять запуск обучения.', wrong: ['Достаточно сохранить итоговый файл модели.', 'Версия Python не влияет на воспроизводимость.'], action: 'Зафиксировать окружение и связать запуск с версией кода.', artifact: 'манифест запуска' },
          { title: 'Эксперименты и артефакты', fact: 'Эксперимент связывает параметры, метрики и артефакты в одной отслеживаемой записи.', wrong: ['Метрики можно хранить только в имени файла.', 'Лучший запуск определяют по памяти автора.'], action: 'Записать параметры, метрики, датасет и артефакт под единым run id.', artifact: 'карточку эксперимента' },
          { title: 'Конвейер обучения', fact: 'Этапы подготовки, обучения и оценки должны иметь явные входы, выходы и условия повторного запуска.', wrong: ['Пайплайн нужен только для расписания.', 'Все этапы безопаснее объединить в одну функцию.'], action: 'Разделить конвейер на идемпотентные этапы с контрактами.', artifact: 'граф конвейера' },
          { title: 'Реестр моделей', fact: 'В production выпускают версионированную модель с происхождением, проверками и состоянием жизненного цикла.', wrong: ['Достаточно скопировать model.pkl на сервер.', 'Стадия модели не связана с проверками.'], action: 'Зарегистрировать версию, её lineage и результаты приёмки.', artifact: 'запись реестра' },
        ],
      },
      {
        id: 'model-serving', prefix: 'MSV', title: 'Сервинг и релиз моделей', category: 'ML Systems', level: 'Продвинутый',
        description: 'Проектируем контракт инференса, пакетную и онлайн-обработку, бюджет задержки и безопасный выпуск.',
        caseTitle: 'Сто миллисекунд доверия', setting: 'Новый скоринг точнее старого, но под реальной нагрузкой начинает задерживать оформление заказов.',
        topics: [
          { title: 'Контракт инференса', fact: 'Контракт модели фиксирует схему входа, схему выхода, версию и поведение при ошибке.', wrong: ['Модель сама определит формат любого входа.', 'Версию достаточно хранить только в Git.'], action: 'Описать и валидировать схему запроса и ответа.', artifact: 'API-контракт' },
          { title: 'Batch и online serving', fact: 'Пакетный и онлайн-инференс выбирают по требованиям свежести, объёма и задержки.', wrong: ['Онлайн-инференс всегда лучше.', 'Batch нельзя повторно выполнить.'], action: 'Сопоставить SLA продукта с режимом применения модели.', artifact: 'матрицу режима' },
          { title: 'Производительность и деградация', fact: 'Бюджет задержки включает подготовку признаков, очередь, инференс и сериализацию.', wrong: ['Измерять нужно только predict().', 'При перегрузке сервис должен ждать бесконечно.'], action: 'Разложить latency и определить timeout, лимиты и fallback.', artifact: 'бюджет задержки' },
          { title: 'Безопасный релиз', fact: 'Canary и shadow-проверки ограничивают риск новой модели до полного переключения трафика.', wrong: ['Новую модель сразу включают на 100%.', 'Откат не нужен при высокой offline-метрике.'], action: 'Задать долю трафика, критерии успеха и автоматический откат.', artifact: 'план релиза' },
        ],
      },
      {
        id: 'ml-observability', prefix: 'MLO', title: 'Наблюдаемость ML-систем', category: 'MLOps', level: 'Продвинутый',
        description: 'Связываем здоровье сервиса, качество данных и поведение модели с бизнес-результатом.',
        caseTitle: 'Тихий дрейф', setting: 'Сервис отвечает без ошибок, но одобрения стали хуже после изменения поведения клиентов.',
        topics: [
          { title: 'Метрики сервиса и модели', fact: 'Нужно одновременно наблюдать доступность, задержку, входные данные, предсказания и бизнес-исход.', wrong: ['HTTP 200 доказывает качество модели.', 'Бизнес-метрика не относится к мониторингу ML.'], action: 'Связать технические, модельные и продуктовые сигналы.', artifact: 'карту сигналов' },
          { title: 'Дрейф данных', fact: 'Data drift означает изменение распределения входов и не всегда равен падению качества.', wrong: ['Любой дрейф требует переобучения.', 'Дрейф можно заметить только по ошибкам API.'], action: 'Сравнить распределения по важным сегментам и оценить влияние.', artifact: 'отчёт о дрейфе' },
          { title: 'Качество с задержанной разметкой', fact: 'При поздней истине используют прокси-сигналы, выборочную разметку и последующий backfill качества.', wrong: ['Без мгновенной разметки мониторинг невозможен.', 'Прокси полностью заменяет целевую метрику.'], action: 'Настроить ранние сигналы и пересчёт после появления истины.', artifact: 'контур качества' },
          { title: 'Переобучение и инциденты', fact: 'Переобучение запускают по проверяемому условию и проводят через те же проверки, что обычный релиз.', wrong: ['Переобучение по расписанию всегда безопасно.', 'Новая модель автоматически лучше текущей.'], action: 'Определить триггер, приёмку, canary и откат.', artifact: 'регламент переобучения' },
        ],
      },
    ],
  },
  'data-engineer': {
    domain: 'data',
    cast: ['vadim', 'gleb', 'lena'],
    courses: [
      {
        id: 'data-pipelines', prefix: 'DEP', title: 'Надёжные конвейеры данных', category: 'Data Engineering', level: 'Средний',
        description: 'Строим идемпотентные пакетные загрузки с контрактами, контрольными точками и обработкой опоздавших данных.',
        caseTitle: 'Повторная загрузка', setting: 'Ночной конвейер перезапустили вручную, и выручка в витрине удвоилась.',
        topics: [
          { title: 'ETL, ELT и границы этапов', fact: 'Граница преобразования определяется доступной вычислительной средой, контролем качества и стоимостью повторного запуска.', wrong: ['ETL всегда современнее ELT.', 'Место преобразования не влияет на контроль данных.'], action: 'Разделить извлечение, загрузку и преобразование явными контрактами.', artifact: 'схему потока' },
          { title: 'Идемпотентность', fact: 'Повтор одного и того же входа не должен создавать дополнительный бизнес-эффект.', wrong: ['Retry всегда безопасен.', 'Дубликаты удаляют только вручную.'], action: 'Добавить ключ операции, upsert или атомарную замену партиции.', artifact: 'стратегию повтора' },
          { title: 'Инкремент и контрольная точка', fact: 'Checkpoint хранит подтверждённую границу обработки, а не просто время старта задания.', wrong: ['Текущее время подходит для любого инкремента.', 'После ошибки checkpoint нужно продвинуть вперёд.'], action: 'Фиксировать границу только после успешной записи и проверки.', artifact: 'контракт checkpoint' },
          { title: 'Опоздавшие данные и backfill', fact: 'Late data требует окна допустимого опоздания и управляемого пересчёта затронутых партиций.', wrong: ['Опоздавшие события всегда отбрасывают.', 'Backfill можно запускать без оценки области изменений.'], action: 'Задать watermark, окно и безопасный план backfill.', artifact: 'план восстановления' },
        ],
      },
      {
        id: 'streaming-platforms', prefix: 'DES', title: 'Потоковые платформы', category: 'Streaming', level: 'Продвинутый',
        description: 'Разбираемся с логом событий, партициями, порядком, доставкой и состоянием потоковой обработки.',
        caseTitle: 'События пришли дважды', setting: 'Платёжный поток восстановился после сбоя, но часть сообщений обработалась повторно и не по порядку.',
        topics: [
          { title: 'Топики, партиции и порядок', fact: 'Порядок гарантируется внутри партиции, поэтому ключ определяет границу упорядочивания.', wrong: ['Kafka гарантирует глобальный порядок топика.', 'Ключ влияет только на имя сообщения.'], action: 'Выбрать ключ по сущности, для которой критичен порядок.', artifact: 'схему партиционирования' },
          { title: 'Семантика доставки', fact: 'At-least-once допускает повтор, поэтому потребитель должен корректно обрабатывать дубликаты.', wrong: ['At-least-once исключает повтор.', 'Exactly-once отменяет ошибки бизнес-логики.'], action: 'Согласовать доставку с идемпотентностью обработчика.', artifact: 'контракт доставки' },
          { title: 'Event time и watermark', fact: 'Event time описывает время события, а watermark ограничивает ожидание опоздавших данных.', wrong: ['Processing time всегда совпадает с event time.', 'Watermark удаляет все поздние события.'], action: 'Выбрать временную семантику и политику поздних событий.', artifact: 'временной контракт' },
          { title: 'Состояние и восстановление', fact: 'Stateful-оператор должен сохранять согласованный snapshot и уметь восстановить его вместе с позицией чтения.', wrong: ['Состояние можно держать только в памяти.', 'Offset и snapshot не связаны.'], action: 'Связать checkpoint состояния с подтверждением входа.', artifact: 'план восстановления' },
        ],
      },
      {
        id: 'data-platform-reliability', prefix: 'DER', title: 'Надёжность платформы данных', category: 'Data Platform', level: 'Продвинутый',
        description: 'Вводим контракты, lineage, наблюдаемость, стоимость и эксплуатационные правила платформы данных.',
        caseTitle: 'Зелёный пайплайн, красный отчёт', setting: 'Все задания завершились успешно, но ключевой отчёт пуст из-за незаметного изменения схемы источника.',
        topics: [
          { title: 'Контракты данных', fact: 'Контракт задаёт схему, семантику, качество, владельца и правила совместимого изменения.', wrong: ['Контракт равен списку колонок.', 'Потребители обязаны адаптироваться к любому изменению.'], action: 'Версионировать контракт и проверять совместимость до публикации.', artifact: 'контракт набора' },
          { title: 'Lineage и область влияния', fact: 'Lineage связывает источник, преобразования и потребителей для оценки последствий изменения.', wrong: ['Lineage нужен только аудиторам.', 'Достаточно знать последний шаг пайплайна.'], action: 'Построить зависимости до критичных витрин и отчётов.', artifact: 'граф происхождения' },
          { title: 'SLA, SLO и наблюдаемость', fact: 'Надёжность данных измеряют свежестью, полнотой, качеством и доступностью для потребителя.', wrong: ['Успех scheduler означает выполнение SLO.', 'Freshness не относится к качеству сервиса.'], action: 'Задать SLO потребителя и сигналы нарушения.', artifact: 'паспорт SLO' },
          { title: 'Стоимость и управление платформой', fact: 'Стоимость нужно связывать с владельцем, нагрузкой и ценностью, а оптимизацию проверять по SLO.', wrong: ['Самый дешёвый запрос всегда лучший.', 'Стоимость хранилища нельзя распределить по продуктам.'], action: 'Разметить затраты и оптимизировать без нарушения обязательств.', artifact: 'карту стоимости' },
        ],
      },
    ],
  },
  'ai-engineer': {
    domain: 'data',
    cast: ['mira', 'sonya', 'oleg'],
    courses: [
      {
        id: 'llm-applications', prefix: 'AIA', title: 'LLM-приложения', category: 'ИИ-продукты', level: 'Средний',
        description: 'Проектируем управляемые LLM-функции со структурированным выводом, инструментами, состоянием и бюджетом.',
        caseTitle: 'Ассистент отправил не тот ответ', setting: 'Новый помощник уверенно придумал статус заказа и отправил клиенту обещание, которого система не давала.',
        topics: [
          { title: 'Контекст и инструкция', fact: 'Инструкция должна отделять цель, данные, ограничения и формат ответа от недоверенного пользовательского ввода.', wrong: ['Длинный prompt автоматически надёжен.', 'Пользовательский текст можно считать системной инструкцией.'], action: 'Разделить роли сообщений и явно задать границы поведения.', artifact: 'контракт запроса' },
          { title: 'Структурированный вывод', fact: 'Схема вывода позволяет валидировать результат модели до использования приложением.', wrong: ['JSON в тексте всегда валиден.', 'Валидация не нужна при низкой temperature.'], action: 'Задать схему и обработать отказ валидации.', artifact: 'схему ответа' },
          { title: 'Tool calling', fact: 'Модель предлагает вызов инструмента, а приложение проверяет аргументы, права и выполняет действие.', wrong: ['Модель должна напрямую выполнять любую команду.', 'Описание инструмента заменяет авторизацию.'], action: 'Разделить предложение, проверку и выполнение инструмента.', artifact: 'реестр инструментов' },
          { title: 'Стоимость, задержка и fallback', fact: 'Архитектура LLM-функции учитывает токены, latency, retries, кэш и безопасную деградацию.', wrong: ['Крупнейшая модель нужна для каждого запроса.', 'Retry можно выполнять без лимита.'], action: 'Задать бюджет и лестницу fallback-сценариев.', artifact: 'бюджет запроса' },
        ],
      },
      {
        id: 'rag-systems', prefix: 'RAG', title: 'RAG и корпоративные знания', category: 'Retrieval', level: 'Продвинутый',
        description: 'Строим поиск, разбиение, ранжирование и цитирование для ответов на основе проверяемых источников.',
        caseTitle: 'Ответ без источника', setting: 'Ассистент сослался на отменённый регламент, хотя новая версия уже лежит в базе знаний.',
        topics: [
          { title: 'Подготовка и разбиение документов', fact: 'Chunking сохраняет смысловые границы и метаданные, необходимые для фильтрации и ссылки на источник.', wrong: ['Все документы режут на одинаковое число символов.', 'Метаданные не влияют на поиск.'], action: 'Разбить по структуре документа и сохранить версию, раздел и права.', artifact: 'схему индексации' },
          { title: 'Гибридный поиск', fact: 'Семантический и лексический поиск покрывают разные типы совпадений и могут объединяться ранжированием.', wrong: ['Embeddings всегда находят точный артикул.', 'BM25 понимает любой смысловой перефраз.'], action: 'Сравнить каналы поиска и объединить кандидатов.', artifact: 'план retrieval' },
          { title: 'Reranking и контекст', fact: 'Reranker уточняет порядок небольшого набора кандидатов, а контекст собирается в пределах бюджета.', wrong: ['В prompt нужно отправить весь индекс.', 'Первый векторный результат всегда лучший.'], action: 'Переранжировать кандидатов и собрать непротиворечивый контекст.', artifact: 'контекстный пакет' },
          { title: 'Цитаты, freshness и доступ', fact: 'Ответ должен опираться на разрешённые актуальные фрагменты и сохранять проверяемые ссылки.', wrong: ['Права проверяют после генерации.', 'Дата документа не влияет на ответ.'], action: 'Фильтровать до поиска, учитывать версию и возвращать цитаты.', artifact: 'протокол ответа' },
        ],
      },
      {
        id: 'ai-evaluation-safety', prefix: 'AIE', title: 'Оценка и безопасность ИИ', category: 'AI Quality', level: 'Продвинутый',
        description: 'Создаём наборы оценивания, трассировку, защитные ограничения и контролируемый выпуск ИИ-функций.',
        caseTitle: 'Успешный тест, опасный релиз', setting: 'Средняя оценка ассистента выросла, но в одном сегменте он раскрывает служебные инструкции.',
        topics: [
          { title: 'Набор оценивания', fact: 'Eval-набор покрывает реальные сценарии, риски, сегменты и ожидаемые критерии, а не только удобные примеры.', wrong: ['Десяти случайных запросов достаточно.', 'Средняя оценка заменяет анализ сегментов.'], action: 'Собрать репрезентативные и риск-ориентированные случаи.', artifact: 'матрицу eval' },
          { title: 'Метрики и судьи', fact: 'Автоматический judge требует калибровки на человеческой разметке и контроля смещения.', wrong: ['LLM-судья объективен по определению.', 'Одна метрика покрывает полезность и безопасность.'], action: 'Разделить критерии и проверить согласие с людьми.', artifact: 'протокол оценки' },
          { title: 'Prompt injection и границы доверия', fact: 'Недоверенный контент не должен менять системные правила или расширять права инструментов.', wrong: ['Фильтр слов полностью решает injection.', 'RAG-документу можно доверять как system prompt.'], action: 'Разделить доверенные инструкции, данные и разрешения.', artifact: 'модель угроз' },
          { title: 'Трассировка и выпуск', fact: 'Трасса связывает вход, retrieval, вызовы инструментов, версии и результат для анализа и отката.', wrong: ['Логировать нужно только финальный текст.', 'Версия prompt не относится к релизу.'], action: 'Версионировать цепочку и задать canary, мониторинг и rollback.', artifact: 'план безопасного выпуска' },
        ],
      },
    ],
  },
}

Object.assign(curricula, backendCurricula, frontendCurricula, devopsCurricula, securityCurricula, dataScientistCurricula)

const missionTypes = ['story', 'code', 'lab']

const historyFacts = {
  'data-scientist': { title: 'Перцептрон появился задолго до современных нейросетей', text: 'Идею обучаемого перцептрона Фрэнк Розенблатт развивал в конце 1950-х. Современные модели стали значительно сложнее, но обучение параметров на примерах осталось центральной идеей.', sourceLabel: 'Smithsonian Institution', sourceUrl: 'https://americanhistory.si.edu/collections/object/nmah_334414' },
  'data-analyst': { title: 'Реляционная модель появилась раньше SQL', text: 'В 1970 году Эдгар Кодд описал реляционную модель данных. SQL появился позже как практический язык работы с этой моделью.', sourceLabel: 'IBM Research', sourceUrl: 'https://research.ibm.com/publications/a-relational-model-of-data-for-large-shared-data-banks' },
  'ml-engineer': { title: 'Transformer начинался с машинного перевода', text: 'Архитектуру Transformer представили в 2017 году. В исходной работе она строилась только на механизме внимания и проверялась прежде всего на переводе.', sourceLabel: 'Google Research', sourceUrl: 'https://research.google/pubs/attention-is-all-you-need/' },
  'data-engineer': { title: 'MapReduce превратил кластер в понятную модель', text: 'Работа Google 2004 года описала обработку больших данных через две операции — map и reduce — с автоматическим распределением задач и восстановлением после сбоев.', sourceLabel: 'Google Research', sourceUrl: 'https://research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/' },
  'ai-engineer': { title: 'Современные LLM выросли из идеи внимания', text: 'В 2017 году исследователи предложили Transformer без рекуррентных и свёрточных слоёв. Параллельность обучения стала одной из причин влияния архитектуры.', sourceLabel: 'Google Research', sourceUrl: 'https://research.google/pubs/attention-is-all-you-need/' },
  'java-developer': { title: 'Java сначала называлась Oak', text: 'Язык проектировали для встраиваемой бытовой электроники, а затем переориентировали на интернет, существенно переработали и переименовали в Java.', sourceLabel: 'Oracle Java Language Specification', sourceUrl: 'https://docs.oracle.com/javase/specs/jls/se6/html/j.preface.html' },
  'python-backend': { title: 'Python родился во время рождественских каникул', text: 'Гвидо ван Россум начал реализацию в конце 1989 года, а в феврале 1991 года опубликовал Python в Usenet. Название связано с Monty Python, а не со змеёй.', sourceLabel: 'Python Documentation', sourceUrl: 'https://docs.python.org/3/faq/general.html' },
  'go-developer': { title: 'Go проектировали для многопроцессорного мира', text: 'Работа над Go началась в Google в 2007 году, а 10 ноября 2009 года проект стал публичным. Конкурентность была одной из исходных задач языка.', sourceLabel: 'Go FAQ', sourceUrl: 'https://go.dev/doc/faq' },
  'frontend-developer': { title: 'Первый сайт объяснял сам Web', text: 'Тим Бернерс-Ли создал Web в CERN в 1989 году. Первый сайт работал на его компьютере NeXT и рассказывал о проекте World Wide Web.', sourceLabel: 'CERN', sourceUrl: 'https://home.cern/science/computing/birth-web' },
  'react-developer': { title: 'React отделил описание UI от ручного изменения DOM', text: 'Публичное развитие React закрепило декларативную модель: интерфейс описывается как функция состояния, а библиотека согласует результат с DOM.', sourceLabel: 'React Documentation', sourceUrl: 'https://react.dev/learn/describing-the-ui' },
  'devops-engineer': { title: 'Контейнеры опираются на старые идеи изоляции', text: 'Современные контейнерные платформы объединили изоляцию процессов, контроль ресурсов и воспроизводимые образы в единый процесс доставки приложений.', sourceLabel: 'Kubernetes Documentation', sourceUrl: 'https://kubernetes.io/docs/concepts/containers/' },
  'sre-engineer': { title: 'SRE началась как инженерный ответ эксплуатации', text: 'В 2003 году Бен Трейнор Слосс спроектировал production-команду Google так, как программный инженер проектировал бы операционную систему работы.', sourceLabel: 'Google SRE Book', sourceUrl: 'https://sre.google/sre-book/introduction/' },
  'cybersecurity-specialist': { title: 'OWASP существует с 2001 года', text: 'OWASP запустили 1 декабря 2001 года как открытое сообщество для улучшения безопасности программного обеспечения.', sourceLabel: 'OWASP Foundation', sourceUrl: 'https://owasp.org/about/' },
  pentester: { title: 'Web-проверка стала открытой методологией', text: 'OWASP Web Security Testing Guide систематизирует проверку приложений так, чтобы находки были воспроизводимыми, ограниченными scope и полезными для исправления.', sourceLabel: 'OWASP WSTG', sourceUrl: 'https://owasp.org/www-project-web-security-testing-guide/' },
  'soc-analyst': { title: 'ATT&CK описывает поведение, а не список вредоносных файлов', text: 'Матрица MITRE ATT&CK связывает наблюдаемое поведение противника с тактиками и техниками, помогая строить проверяемое покрытие детектирования.', sourceLabel: 'MITRE ATT&CK', sourceUrl: 'https://attack.mitre.org/resources/' },
}

function practiceProfile(professionId) {
  if (professionId === 'java-developer') return 'java'
  if (professionId === 'go-developer') return 'go'
  if (professionId === 'frontend-developer' || professionId === 'react-developer') return 'javascript'
  if (professionId === 'devops-engineer' || professionId === 'sre-engineer' || professionId.includes('security') || professionId === 'pentester' || professionId === 'soc-analyst') return 'yaml'
  return 'python'
}

function practiceTask(professionId, course, topic, advanced = false) {
  const profile = practiceProfile(professionId)
  const artifact = topic.artifact.replaceAll('"', '\\"')
  const action = topic.action.replaceAll('"', '\\"')
  if (profile === 'java') return {
    workspaceFile: 'Solution.java',
    starterCode: `import java.util.List;\n\npublic class Solution {\n    static Plan buildPlan() {\n        // TODO: назови артефакт и добавь проверяемое действие\n        String artifact = "";\n        List<String> steps = List.of();\n        return new Plan(artifact, steps);\n    }\n\n    record Plan(String artifact, List<String> steps) {}\n}\n`,
    codeChecks: [
      { label: `Создаётся ${topic.artifact}`, includes: `String artifact = "${artifact}"` },
      { label: 'Действие записано в план', includes: `List.of("${action}")` },
      { label: 'Метод возвращает типизированный результат', includes: 'return new Plan(artifact, steps)' },
    ],
  }
  if (profile === 'go') return {
    workspaceFile: 'solution.go',
    starterCode: `package main\n\nimport "fmt"\n\ntype Plan struct {\n    Artifact string\n    Steps []string\n}\n\nfunc buildPlan() Plan {\n    // TODO: собери проверяемый план решения\n    return Plan{}\n}\n\nfunc main() { fmt.Printf("%+v\\n", buildPlan()) }\n`,
    codeChecks: [
      { label: `Создаётся ${topic.artifact}`, includes: `Artifact: "${artifact}"` },
      { label: 'Действие записано в срез', includes: `Steps: []string{"${action}"}` },
      { label: 'Функция возвращает Plan', includes: 'return Plan{' },
    ],
  }
  if (profile === 'javascript') return {
    workspaceFile: professionId === 'react-developer' ? 'solution.jsx' : 'solution.js',
    starterCode: `const incident = ${JSON.stringify(course.setting)};\n\nfunction buildPlan() {\n  // TODO: верни артефакт и массив проверяемых действий\n  const artifact = "";\n  const steps = [];\n  return { artifact, steps };\n}\n\nconsole.log(buildPlan());\n`,
    codeChecks: [
      { label: `Создаётся ${topic.artifact}`, includes: `const artifact = "${artifact}"` },
      { label: 'Действие записано в массив', includes: `const steps = ["${action}"]` },
      { label: 'Результат возвращается из функции', includes: 'return { artifact, steps }' },
    ],
  }
  if (profile === 'yaml') return {
    workspaceFile: professionId === 'devops-engineer' || professionId === 'sre-engineer' ? 'plan.yaml' : 'control.yaml',
    starterCode: `apiVersion: request.dev/v1\nkind: InvestigationPlan\nmetadata:\n  name: ${course.id}\nspec:\n  artifact: ""\n  actions: []\n  verification:\n    enabled: false\n`,
    codeChecks: [
      { label: `Назван артефакт «${topic.artifact}»`, includes: `artifact: "${artifact}"` },
      { label: 'Добавлено проверяемое действие', includes: `- "${action}"` },
      { label: 'Включена автоматическая проверка', includes: 'enabled: true' },
    ],
  }
  return {
    workspaceFile: 'solution.py',
    starterCode: `case_context = ${JSON.stringify(course.setting)}\n\ndef build_plan():\n    # TODO: назови артефакт и добавь воспроизводимый шаг\n    artifact = ""\n    steps = []\n    return {"artifact": artifact, "steps": steps}\n\nplan = build_plan()\n${advanced ? '# TODO: добавь проверку результата через assert\n' : ''}print(plan)\n`,
    codeChecks: [
      { label: `Создаётся ${topic.artifact}`, includes: `artifact = "${artifact}"` },
      { label: 'Действие записано в список', includes: `steps = ["${action}"]` },
      { label: advanced ? 'Результат защищён проверкой' : 'Функция возвращает структуру результата', includes: advanced ? 'assert plan["steps"]' : 'return {"artifact": artifact, "steps": steps}' },
    ],
  }
}

function missionFor(professionId, course, topic, topicIndex, step) {
  const serial = topicIndex * 3 + step + 1
  const id = `${course.prefix}-${String(serial).padStart(3, '0')}`
  const type = missionTypes[step]
  const titles = [`Сцена: ${topic.title}`, `Код: ${topic.title}`, `Лаборатория: ${topic.title}`]
  const prompts = [
    `Какой принцип поможет команде правильно разобрать блок «${topic.title}»?`,
    `Какое действие нужно выполнить, чтобы вывод можно было воспроизвести и проверить?`,
    `Что следует положить в ${topic.artifact}, прежде чем передавать результат Лене?`,
  ]
  const answers = [topic.fact, 'Код проходит обязательные проверки.', 'Решение воспроизводимо и защищено автоматической проверкой.']
  const options = [
    [topic.fact, ...topic.wrong],
    [topic.action, 'Сразу показать итоговое число без промежуточной проверки.', 'Отложить определение до конца исследования.'],
    [`${topic.action} Затем зафиксировать результат и ограничение.`, 'Добавить только красивый график без источника.', 'Передать устный вывод без проверяемого артефакта.'],
  ]
  const practice = step > 0 ? practiceTask(professionId, course, topic, step === 2) : undefined
  return {
    id, title: titles[step], type, minutes: 8 + step * 3, xp: 65 + step * 20 + topicIndex * 5,
    difficulty: topicIndex < 1 ? 'начальный' : topicIndex < 3 ? 'средний' : 'продвинутый',
    objectives: [`понять принцип «${topic.title}»`, `применить его в рабочем решении`],
    intro: `${course.setting} ${step === 0 ? 'Наставник просит сначала назвать принцип, а не угадывать ответ.' : step === 1 ? 'Команда собрала факты, но результат нужно сделать воспроизводимым.' : `Команда готовит ${topic.artifact}; от твоего выбора зависит следующий шаг дела.`}`,
    productionContext: `${topic.fact} В этой миссии ошибка не учебная: неверное решение попадёт в рабочую систему.`,
    historicalFact: topicIndex === 0 && step === 0 ? historyFacts[professionId] : undefined,
    task: step === 0
      ? { prompt: prompts[step], options: options[step], answer: answers[step], explanation: `${topic.fact} Практический следующий шаг: ${topic.action}` }
      : { prompt: `${topic.action} Заполни рабочий файл так, чтобы все автоматические проверки стали зелёными.`, answer: answers[step], explanation: `${topic.fact} Код оставляет воспроизводимый ${topic.artifact}.`, ...practice },
    hints: [`Отдели наблюдение от решения. ${topic.fact}`],
  }
}

function buildCourse(course, professionId) {
  const missions = course.topics.flatMap((topic, topicIndex) => [0, 1, 2].map(step => missionFor(professionId, course, topic, topicIndex, step)))
  const finalTopic = { title: course.caseTitle, action: course.topics.map(topic => topic.action).join('; '), artifact: 'итоговый план дела' }
  const finalPractice = practiceTask(professionId, course, finalTopic, true)
  missions.push({
    id: `${course.prefix}-013`, title: `Итоговое дело: ${course.caseTitle}`, type: 'boss', minutes: 24, xp: 320, difficulty: 'продвинутый',
    objectives: course.topics.map(topic => `связать «${topic.title}» с итоговым решением`),
    intro: `${course.setting} До финального созвона остался час: нужно собрать доказательства в одну непротиворечивую версию.`,
    productionContext: 'Итог должен выдержать повторный расчёт, вопрос руководителя и изменение исходных данных.',
    task: { prompt: 'Собери итоговый план дела в коде или конфигурации и защити его автоматической проверкой.', answer: 'Итоговый файл проходит все обязательные проверки.', explanation: 'Финальное решение связывает артефакты блока в воспроизводимый технический результат.', ...finalPractice },
    hints: ['Вернись к четырём артефактам дела и выстрой их от вопроса к решению.'],
  })
  return {
    id: course.id, title: course.title, description: course.description, category: course.category, level: course.level,
    skills: course.topics.map(topic => topic.title), missions,
  }
}

function buildStory(profession, course, courseIndex) {
  const [companion, mentor, stakeholder] = profession.cast
  const first = `${course.prefix}-001`
  const third = `${course.prefix}-003`
  const seventh = `${course.prefix}-007`
  const tenth = `${course.prefix}-010`
  return {
    caseId: `case-${course.id}`, courseId: course.id, number: String(courseIndex + 1).padStart(2, '0'), title: course.caseTitle,
    logline: course.setting, setting: 'Продуктовая компания «Север»', cast: profession.cast,
    acts: [
      {
        id: `${course.id}-start`, title: course.caseTitle, trigger: { on: 'caseStart' }, beats: [
          { kind: 'comic', panels: [
            { speaker: companion, emotion: 'surprised', scene: 'office', caption: course.setting },
            { speaker: mentor, emotion: 'determined', scene: 'screen', caption: 'Сначала строим цепочку доказательств. Красивый ответ без проверки не принимается.' },
            { speaker: stakeholder, emotion: 'worried', scene: 'meeting', caption: 'Решение нужно сегодня. Ошибка изменит план команды на квартал.' },
          ] },
          { kind: 'line', speaker: mentor, emotion: 'determined', text: `Это дело про «${course.title}». Не проходи уроки отдельно: каждый найденный факт станет уликой в общем расследовании.` },
        ],
      },
      { id: `${course.id}-brief`, title: 'Первая версия', trigger: { on: 'beforeMission', missionId: first }, beats: [
        { kind: 'line', speaker: companion, emotion: 'happy', text: 'Я уже собрала материалы. Давай сначала договоримся, какой вопрос мы вообще пытаемся решить.' },
        { kind: 'line', speaker: mentor, emotion: 'neutral', text: 'Хорошее начало. Зафиксируй принцип — после этого рабочая станция откроет первую улику.' },
      ] },
      { id: `${course.id}-evidence`, title: 'Улика не сходится', trigger: { on: 'afterMission', missionId: third }, beats: [
        { kind: 'line', speaker: companion, emotion: 'worried', text: 'Проверка изменила число. Значит, первая версия была удобной, но неверной.' },
        { kind: 'line', speaker: mentor, emotion: 'happy', text: 'Именно поэтому мы оставляем воспроизводимые шаги. Ошибка, найденная до решения, — полезная улика.' },
      ] },
      { id: `${course.id}-choice`, title: 'Давление срока', trigger: { on: 'beforeMission', missionId: seventh }, beats: [
        { kind: 'line', speaker: stakeholder, emotion: 'worried', text: 'Мне нужна рекомендация через двадцать минут. Можно не показывать спорный сегмент?' },
        { kind: 'choice', id: `${course.id}-deadline-choice`, prompt: 'Как ты ответишь?', options: [
          { id: 'transparent', text: 'Покажу спорный риск и объясню, как он влияет на решение.', reply: 'Руководитель кивает: неприятный риск лучше скрытой ошибки.', trust: { [stakeholder]: 2, [mentor]: 1 }, flags: [`${course.id}-transparent`] },
          { id: 'fast', text: 'Уберу спорный риск ради короткого ответа.', reply: 'Наставник ничего не говорит, но просит сохранить эту версию отдельно.', trust: { [mentor]: -1 }, flags: [`${course.id}-rushed`] },
        ] },
      ] },
      { id: `${course.id}-turn`, title: 'Решение выдерживает проверку', trigger: { on: 'afterMission', missionId: tenth }, beats: [
        { kind: 'line', speaker: companion, emotion: 'happy', text: 'Теперь вывод не рассыпается, даже если изменить период и открыть сегменты.' },
        { kind: 'line', speaker: stakeholder, emotion: 'determined', text: 'Хорошо. Доводи доказательства до итоговой рекомендации — я защищу её перед командой.' },
      ] },
    ],
    endings: [
      { id: `${course.id}-gold`, title: 'Доказательство принято', summary: 'Команда получила воспроизводимый вывод и безопасный следующий шаг.', minTrust: { [mentor]: 1, [stakeholder]: 1 }, rank: 'золото' },
      { id: `${course.id}-silver`, title: 'Решение с оговорками', summary: 'Вывод принят, но часть рисков придётся перепроверить после запуска.', rank: 'серебро' },
    ],
  }
}

async function registerCourses(domain, professionId, courses) {
  const domainRoot = resolve(knowledgeRoot, domain)
  const programsPath = resolve(domainRoot, 'programs.json')
  const manifestPath = resolve(domainRoot, 'manifest.json')
  const programs = JSON.parse(await readFile(programsPath, 'utf8'))
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  for (const course of courses) {
    const entry = {
      id: course.id,
      phase: `Профессия · ${professionId}`,
      title: course.title,
      goal: course.description,
      missionCount: 13,
      status: 'ready',
      prerequisites: course.prerequisites ?? [],
      blocks: course.topics.map(topic => topic.title),
    }
    const index = programs.findIndex(item => item.id === course.id)
    if (index >= 0) programs[index] = entry
    else programs.push(entry)
    if (!manifest.courses.includes(course.id)) manifest.courses.push(course.id)
  }
  await writeFile(programsPath, `${JSON.stringify(programs, null, 2)}\n`, 'utf8')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

const requested = process.argv.slice(2)
const professionIds = requested.length ? requested : Object.keys(curricula)
for (const professionId of professionIds) {
  const profession = curricula[professionId]
  if (!profession) throw new Error(`Неизвестная профессия: ${professionId}`)
  for (const [courseIndex, course] of profession.courses.entries()) {
    const courseDir = resolve(knowledgeRoot, profession.domain, course.id)
    await mkdir(courseDir, { recursive: true })
    await writeFile(resolve(courseDir, 'course.json'), `${JSON.stringify(buildCourse(course, professionId), null, 2)}\n`, 'utf8')
    await mkdir(storyRoot, { recursive: true })
    await writeFile(resolve(storyRoot, `${course.id}.json`), `${JSON.stringify(buildStory(profession, course, courseIndex), null, 2)}\n`, 'utf8')
  }
  await registerCourses(profession.domain, professionId, profession.courses)
  console.log(`${professionId}: создано курсов — ${profession.courses.length}; миссий — ${profession.courses.length * 13}`)
}
