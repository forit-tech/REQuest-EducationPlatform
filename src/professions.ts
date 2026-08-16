import { BarChart3, Bot, BrainCircuit, CloudCog, Code2, GitBranch, MonitorSmartphone, ServerCog, ShieldCheck, Workflow, type LucideIcon } from 'lucide-react'

export type CareerDomainId = 'data-ai' | 'backend' | 'frontend' | 'devops' | 'cybersecurity'
export type ProfessionId =
  | 'data-scientist' | 'data-analyst' | 'ml-engineer' | 'data-engineer' | 'ai-engineer'
  | 'java-developer' | 'python-backend' | 'go-developer'
  | 'frontend-developer' | 'react-developer'
  | 'devops-engineer' | 'sre-engineer'
  | 'cybersecurity-specialist' | 'pentester' | 'soc-analyst'

export interface CareerDomain {
  id: CareerDomainId
  title: string
  description: string
  Icon: LucideIcon
}

export interface ProfessionStage {
  title: string
  goal: string
  blocks: string[]
  stack: string[]
  sharedSkills?: string[]
  roomId?: string
}

export interface Profession {
  id: ProfessionId
  domainId: CareerDomainId
  title: string
  subtitle: string
  description: string
  Icon: LucideIcon
  status: 'Доступен' | 'Скоро'
  stack: string[]
  stages: ProfessionStage[]
}

export const careerDomains: CareerDomain[] = [
  { id: 'data-ai', title: 'Данные и ИИ', description: 'Аналитика, модели и ИИ-продукты', Icon: BrainCircuit },
  { id: 'backend', title: 'Серверная разработка', description: 'Сервисы, API и архитектура', Icon: ServerCog },
  { id: 'frontend', title: 'Веб-интерфейсы', description: 'Клиентские приложения и сайты', Icon: MonitorSmartphone },
  { id: 'devops', title: 'DevOps и инфраструктура', description: 'Доставка и надёжность систем', Icon: CloudCog },
  { id: 'cybersecurity', title: 'Кибербезопасность', description: 'Защита, аудит и реагирование', Icon: ShieldCheck },
]

export const sharedSkillNames = new Set(['Основы Python', 'Python', 'SQL', 'Git', 'Linux', 'Docker', 'Сети', 'Статистика'])

function roadmap(stages: Array<[string, string, string[], string[]]>): ProfessionStage[] {
  return stages.map(([title, goal, blocks, stack]) => ({
    title, goal, blocks, stack,
    sharedSkills: blocks.filter(block => sharedSkillNames.has(block)),
  }))
}

export const professions: Profession[] = [
  {
    id: 'data-scientist', domainId: 'data-ai', title: 'Специалист по данным', subtitle: 'От анализа до внедрения моделей', status: 'Доступен', Icon: BrainCircuit,
    description: 'Статистика, анализ данных, машинное обучение и внедрение моделей.',
    stack: ['Python', 'SQL', 'Pandas', 'scikit-learn', 'CatBoost', 'Docker'],
    stages: [
      { title: 'Технический фундамент', goal: 'Уверенно работать с кодом и окружением.', blocks: ['Устройство компьютера', 'Linux и терминал', 'Git', 'Основы Python'], stack: ['Bash', 'Git', 'Python', 'pytest'], roomId: 'technical-foundations' },
      { title: 'Работа с данными', goal: 'Собирать, очищать и исследовать данные.', blocks: ['Основы данных', 'NumPy', 'Pandas и Polars', 'SQL', 'Очистка данных', 'Разведочный анализ и визуализация'], stack: ['NumPy', 'Pandas', 'Polars', 'PostgreSQL', 'Plotly'], roomId: 'data-foundations' },
      { title: 'Математика и статистика', goal: 'Обосновывать выводы, а не угадывать.', blocks: ['Вероятность', 'Статистика', 'Линейная алгебра', 'A/B-тесты'], stack: ['SciPy', 'statsmodels', 'Jupyter'], roomId: 'statistics' },
      { title: 'Машинное обучение', goal: 'Строить и честно оценивать модели.', blocks: ['Подготовка признаков', 'Регрессия', 'Классификация', 'Деревья и ансамбли', 'Бустинг'], stack: ['scikit-learn', 'CatBoost', 'XGBoost', 'LightGBM', 'SHAP'], roomId: 'ml-baseline' },
      { title: 'Внедрение и MLOps', goal: 'Доводить модель до надёжного сервиса.', blocks: ['API моделей', 'Контейнеры', 'Эксперименты', 'Мониторинг', 'Дрейф данных'], stack: ['FastAPI', 'Docker', 'MLflow', 'DVC', 'Prometheus'], roomId: 'production' },
    ],
  },
  {
    id: 'data-analyst', domainId: 'data-ai', title: 'Аналитик данных', subtitle: 'От метрик до решений', status: 'Скоро', Icon: BarChart3,
    description: 'SQL, продуктовая аналитика, визуализация, A/B-тесты и бизнес-кейсы.',
    stack: ['Excel', 'SQL', 'Python', 'Pandas', 'Power BI', 'ClickHouse'],
    stages: [
      { title: 'Основы аналитики', goal: 'Понимать данные, метрики и бизнес-задачи.', blocks: ['Типы данных', 'Бизнес-метрики', 'Таблицы и формулы', 'Проверка качества'], stack: ['Excel', 'Google Sheets', 'CSV'] },
      { title: 'SQL и базы данных', goal: 'Самостоятельно получать нужные срезы.', blocks: ['SELECT и фильтрация', 'JOIN', 'Агрегации', 'CTE', 'Оконные функции'], stack: ['PostgreSQL', 'ClickHouse', 'DuckDB'] },
      { title: 'Python для анализа', goal: 'Автоматизировать очистку и расчёты.', blocks: ['Основы Python', 'Pandas', 'Визуализация', 'Разведочный анализ данных'], stack: ['Python', 'Pandas', 'NumPy', 'Jupyter'] },
      { title: 'Продуктовая аналитика', goal: 'Находить причины изменений в продукте.', blocks: ['Воронки', 'Когорты', 'Retention', 'Юнит-экономика', 'Сегментация'], stack: ['SQL', 'Metabase', 'Power BI'] },
      { title: 'Эксперименты и коммуникация', goal: 'Проверять гипотезы и защищать выводы.', blocks: ['Статистика', 'A/B-тесты', 'Дашборды', 'Аналитическая записка'], stack: ['SciPy', 'statsmodels', 'Power BI', 'Plotly'] },
    ],
  },
  {
    id: 'ml-engineer', domainId: 'data-ai', title: 'Инженер машинного обучения', subtitle: 'Модели как надёжные системы', status: 'Скоро', Icon: Workflow,
    description: 'Пайплайны обучения, сервисы моделей, мониторинг и ML-платформы.',
    stack: ['Python', 'PyTorch', 'FastAPI', 'Docker', 'Kubernetes', 'MLflow'],
    stages: [
      { title: 'Инженерная база', goal: 'Писать поддерживаемый промышленный код.', blocks: ['Продвинутый Python', 'Алгоритмы', 'Архитектура', 'Тестирование', 'Linux'], stack: ['Python', 'Git', 'pytest', 'Bash'] },
      { title: 'Модели и данные', goal: 'Понимать полный цикл обучения модели.', blocks: ['Основы машинного обучения', 'Подготовка признаков', 'Валидация', 'Бустинг', 'Глубокое обучение'], stack: ['scikit-learn', 'CatBoost', 'PyTorch'] },
      { title: 'Конвейеры обучения', goal: 'Воспроизводимо обучать и версионировать модели.', blocks: ['Оркестрация', 'Отслеживание экспериментов', 'Версии данных', 'Хранилище признаков (Feature Store)'], stack: ['Airflow', 'MLflow', 'DVC', 'Feast'] },
      { title: 'Запуск моделей в сервисе', goal: 'Обслуживать модели под реальной нагрузкой.', blocks: ['FastAPI', 'Контейнеры', 'Очереди', 'Пакетное применение модели', 'Онлайн-применение модели'], stack: ['FastAPI', 'Docker', 'Redis', 'Kafka'] },
      { title: 'ML-платформа', goal: 'Масштабировать и контролировать ML-системы.', blocks: ['Kubernetes', 'CI/CD', 'Мониторинг', 'Дрейф данных', 'Архитектура ML-систем'], stack: ['Kubernetes', 'GitHub Actions', 'Prometheus', 'Grafana'] },
    ],
  },
  {
    id: 'data-engineer', domainId: 'data-ai', title: 'Инженер данных', subtitle: 'От событий до витрин', status: 'Скоро', Icon: GitBranch,
    description: 'Хранилища, ETL/ELT, оркестрация, потоковая обработка и качество данных.',
    stack: ['Python', 'SQL', 'Airflow', 'Kafka', 'Spark', 'ClickHouse'],
    stages: [
      { title: 'Инженерный фундамент', goal: 'Работать с системами, кодом и сетью.', blocks: ['Linux', 'Git', 'Python', 'Сети', 'Docker'], stack: ['Bash', 'Git', 'Python', 'Docker'] },
      { title: 'Хранилища данных', goal: 'Выбирать и проектировать подходящее хранилище.', blocks: ['SQL', 'Моделирование данных', 'OLTP и OLAP', 'Партиционирование'], stack: ['PostgreSQL', 'ClickHouse', 'DuckDB', 'Redis'] },
      { title: 'Пакетные конвейеры', goal: 'Строить надёжные ETL/ELT-процессы.', blocks: ['ETL и ELT', 'Оркестрация', 'Форматы данных', 'Озеро данных (Data Lake)'], stack: ['Airflow', 'dbt', 'Parquet', 'S3'] },
      { title: 'Большие и потоковые данные', goal: 'Обрабатывать данные в масштабе и реальном времени.', blocks: ['Распределённые вычисления', 'Стриминг', 'Очереди', 'CDC'], stack: ['Spark', 'Kafka', 'Flink', 'Debezium'] },
      { title: 'Платформа данных', goal: 'Обеспечивать качество, наблюдаемость и доступность.', blocks: ['Качество данных', 'Происхождение данных (lineage)', 'Мониторинг', 'CI/CD', 'Архитектура платформы'], stack: ['Great Expectations', 'OpenLineage', 'Grafana', 'Kubernetes'] },
    ],
  },
  {
    id: 'ai-engineer', domainId: 'data-ai', title: 'ИИ-инженер', subtitle: 'LLM-продукты и агенты', status: 'Скоро', Icon: Bot,
    description: 'Transformer, RAG, fine-tuning, evaluation и агентные приложения.',
    stack: ['Python', 'PyTorch', 'Transformers', 'RAG', 'MCP', 'FastAPI'],
    stages: [
      { title: 'База ИИ-разработки', goal: 'Понимать код, математику и классическое машинное обучение.', blocks: ['Python', 'Линейная алгебра', 'Вероятность', 'Машинное обучение'], stack: ['Python', 'NumPy', 'scikit-learn'] },
      { title: 'Глубокое обучение и обработка текста', goal: 'Понимать, как модели работают с текстом.', blocks: ['Нейронные сети', 'PyTorch', 'Токенизация', 'Векторное представление (embedding)', 'Архитектура Transformer'], stack: ['PyTorch', 'Hugging Face', 'Transformers'] },
      { title: 'LLM-приложения', goal: 'Создавать полезные приложения поверх моделей.', blocks: ['Prompt Engineering', 'Structured Output', 'Tool Calling', 'Evaluation'], stack: ['OpenAI API', 'Pydantic', 'LiteLLM'] },
      { title: 'RAG и агенты', goal: 'Подключать знания и сложные сценарии действий.', blocks: ['Поиск', 'Векторные базы', 'RAG', 'Агенты', 'MCP'], stack: ['Qdrant', 'pgvector', 'LangGraph', 'MCP'] },
      { title: 'Внедрение ИИ', goal: 'Надёжно выпускать и контролировать ИИ-функции.', blocks: ['Дообучение (fine-tuning)', 'Защитные ограничения', 'Трассировка', 'Стоимость и задержка', 'Архитектура ИИ-систем'], stack: ['LoRA', 'FastAPI', 'Docker', 'OpenTelemetry'] },
    ],
  },
  {
    id: 'java-developer', domainId: 'backend', title: 'Java-разработчик', subtitle: 'Надёжные сервисы на JVM', status: 'Скоро', Icon: ServerCog,
    description: 'Серверная разработка на Java: от языка и JVM до Spring и распределённых систем.',
    stack: ['Java', 'Spring Boot', 'PostgreSQL', 'Kafka', 'Docker'],
    stages: roadmap([
      ['Основы Java', 'Освоить язык и инструменты разработки.', ['Основы Java', 'Git', 'Тестирование'], ['Java', 'Git', 'JUnit']],
      ['Объектная модель', 'Проектировать поддерживаемые программы.', ['OOP', 'Collections', 'Generics', 'Exceptions'], ['Java', 'Maven']],
      ['JVM и Spring', 'Строить серверные приложения.', ['JVM', 'Основы Spring', 'Spring Boot'], ['JVM', 'Spring Boot']],
      ['Данные и API', 'Создавать прикладные сервисы.', ['SQL', 'REST', 'Безопасность', 'Интеграционные тесты'], ['PostgreSQL', 'Hibernate', 'OpenAPI']],
      ['Эксплуатация сервисов', 'Запускать сервисы под реальной нагрузкой.', ['Docker', 'Kafka', 'Наблюдаемость', 'Распределённые системы'], ['Docker', 'Kafka', 'Prometheus']],
    ]),
  },
  {
    id: 'python-backend', domainId: 'backend', title: 'Backend-разработчик на Python', subtitle: 'API и серверные сервисы', status: 'Скоро', Icon: Code2,
    description: 'Серверная разработка на Python: API, базы данных, очереди и production-практики.',
    stack: ['Python', 'FastAPI', 'Django', 'PostgreSQL', 'Redis'],
    stages: roadmap([
      ['Основы Python', 'Уверенно писать и тестировать код.', ['Основы Python', 'Git', 'pytest'], ['Python', 'Git', 'pytest']],
      ['Основы серверной разработки', 'Понять устройство веб-сервисов.', ['HTTP', 'REST', 'Архитектура приложений'], ['FastAPI', 'Pydantic']],
      ['Данные', 'Хранить состояние приложения.', ['SQL', 'ORM', 'Миграции'], ['PostgreSQL', 'SQLAlchemy']],
      ['Асинхронность', 'Обрабатывать фоновые и сетевые задачи.', ['asyncio', 'Очереди', 'Кеширование'], ['Celery', 'Redis', 'RabbitMQ']],
      ['Эксплуатация', 'Надёжно выпускать сервисы.', ['Docker', 'CI/CD', 'Мониторинг'], ['Docker', 'GitHub Actions', 'Grafana']],
    ]),
  },
  {
    id: 'go-developer', domainId: 'backend', title: 'Go-разработчик', subtitle: 'Быстрые сетевые сервисы', status: 'Скоро', Icon: Workflow,
    description: 'Сетевые и высоконагруженные сервисы на Go с понятной конкурентностью.',
    stack: ['Go', 'PostgreSQL', 'gRPC', 'Kafka', 'Docker'],
    stages: roadmap([
      ['Основы Go', 'Освоить язык и набор инструментов.', ['Основы Go', 'Git', 'Тестирование'], ['Go', 'Git']],
      ['Конкурентность', 'Проектировать параллельные процессы.', ['Goroutines', 'Channels', 'Context'], ['Go', 'pprof']],
      ['Сервисы', 'Создавать сетевые приложения.', ['HTTP', 'REST', 'gRPC'], ['Chi', 'gRPC']],
      ['Данные', 'Работать с хранилищами и событиями.', ['SQL', 'Транзакции', 'Kafka'], ['PostgreSQL', 'Kafka']],
      ['Эксплуатация', 'Масштабировать и наблюдать сервисы.', ['Docker', 'Kubernetes', 'Наблюдаемость'], ['Docker', 'Kubernetes', 'Prometheus']],
    ]),
  },
  {
    id: 'frontend-developer', domainId: 'frontend', title: 'Разработчик веб-интерфейсов', subtitle: 'Современные клиентские приложения', status: 'Скоро', Icon: MonitorSmartphone,
    description: 'Интерфейсы, доступность и клиентская архитектура от HTML до production.',
    stack: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React'],
    stages: roadmap([
      ['Веб-фундамент', 'Собирать семантичные адаптивные страницы.', ['HTML', 'CSS', 'Доступность'], ['HTML', 'CSS', 'DevTools']],
      ['JavaScript', 'Управлять логикой интерфейса.', ['Основы JavaScript', 'DOM', 'Асинхронность'], ['JavaScript', 'Git']],
      ['TypeScript', 'Создавать типобезопасные приложения.', ['TypeScript', 'Модули', 'Сборка'], ['TypeScript', 'Vite']],
      ['Приложения', 'Строить сложные интерфейсы.', ['React', 'Состояние', 'API', 'Тестирование'], ['React', 'TanStack Query', 'Vitest']],
      ['Выпуск и эксплуатация', 'Оптимизировать и выпускать продукт.', ['Производительность', 'Безопасность', 'CI/CD'], ['Lighthouse', 'Playwright', 'Docker']],
    ]),
  },
  {
    id: 'react-developer', domainId: 'frontend', title: 'React-разработчик', subtitle: 'Продуктовые приложения', status: 'Скоро', Icon: Code2,
    description: 'Углублённый React-маршрут: состояние, архитектура, тесты и производительность.',
    stack: ['TypeScript', 'React', 'Next.js', 'Playwright'],
    stages: roadmap([
      ['JavaScript и DOM', 'Закрыть базу браузерной разработки.', ['Основы JavaScript', 'DOM', 'Git'], ['JavaScript', 'Git']],
      ['Основы React', 'Понимать компонентную модель.', ['Компоненты', 'Хуки', 'Формы'], ['React', 'Vite']],
      ['Данные и состояние', 'Управлять сложным состоянием.', ['Server State', 'State Management', 'REST'], ['TanStack Query', 'Zustand']],
      ['Архитектура', 'Масштабировать кодовую базу.', ['TypeScript', 'Routing', 'Design System'], ['TypeScript', 'Next.js']],
      ['Качество', 'Доставлять стабильные интерфейсы.', ['Тестирование', 'Производительность', 'CI/CD'], ['Vitest', 'Playwright', 'Lighthouse']],
    ]),
  },
  {
    id: 'devops-engineer', domainId: 'devops', title: 'DevOps-инженер', subtitle: 'От Linux до Kubernetes', status: 'Скоро', Icon: CloudCog,
    description: 'Автоматизация инфраструктуры, доставки и наблюдаемости систем.',
    stack: ['Linux', 'Docker', 'Kubernetes', 'Terraform', 'Prometheus'],
    stages: roadmap([
      ['Системный фундамент', 'Управлять ОС и сетевым окружением.', ['Linux', 'Сети', 'Bash', 'Git'], ['Linux', 'Bash', 'Git']],
      ['Контейнеры', 'Упаковывать приложения одинаково.', ['Docker', 'Образы', 'Compose'], ['Docker', 'Docker Compose']],
      ['Доставка', 'Автоматизировать путь кода в production.', ['CI/CD', 'Артефакты', 'Секреты'], ['GitHub Actions', 'GitLab CI']],
      ['Оркестрация и IaC', 'Управлять инфраструктурой как кодом.', ['Kubernetes', 'Terraform', 'Helm'], ['Kubernetes', 'Terraform', 'Helm']],
      ['Надёжность', 'Наблюдать и восстанавливать системы.', ['Мониторинг', 'Логи', 'SLO', 'Облачные платформы'], ['Prometheus', 'Grafana', 'Loki']],
    ]),
  },
  {
    id: 'sre-engineer', domainId: 'devops', title: 'SRE-инженер', subtitle: 'Надёжность как инженерная задача', status: 'Скоро', Icon: Workflow,
    description: 'SLO, автоматизация, observability и управление инцидентами.',
    stack: ['Linux', 'Kubernetes', 'Prometheus', 'Grafana', 'Go'],
    stages: roadmap([
      ['Системы и сети', 'Диагностировать поведение инфраструктуры.', ['Linux', 'Сети', 'Git'], ['Linux', 'Git']],
      ['Автоматизация', 'Убирать ручные операции.', ['Python', 'Go', 'CI/CD'], ['Python', 'Go']],
      ['Платформа', 'Понимать среду выполнения сервисов.', ['Docker', 'Kubernetes', 'Облачные платформы'], ['Docker', 'Kubernetes']],
      ['Наблюдаемость', 'Измерять здоровье систем.', ['Метрики', 'Логи', 'Трейсы', 'SLO'], ['Prometheus', 'Grafana', 'OpenTelemetry']],
      ['Инциденты', 'Управлять отказами и риском.', ['Реагирование на инциденты', 'Разбор после сбоя', 'Планирование мощности'], ['PagerDuty', 'Chaos Mesh']],
    ]),
  },
  {
    id: 'cybersecurity-specialist', domainId: 'cybersecurity', title: 'Специалист по ИБ', subtitle: 'Системная защита инфраструктуры', status: 'Скоро', Icon: ShieldCheck,
    description: 'Широкий маршрут по защите сетей, систем, приложений и реагированию.',
    stack: ['Linux', 'Wireshark', 'Burp Suite', 'SIEM', 'Python'],
    stages: roadmap([
      ['Техническая база', 'Понимать защищаемые системы.', ['Сети', 'Linux', 'Web', 'Python'], ['Linux', 'Wireshark', 'Python']],
      ['Принципы защиты', 'Оценивать угрозы и риски.', ['Криптография', 'Threat Modeling', 'IAM'], ['OpenSSL', 'MITRE ATT&CK']],
      ['Безопасность приложений', 'Находить типовые уязвимости.', ['OWASP', 'Безопасность веб-приложений', 'Безопасная разработка'], ['Burp Suite', 'OWASP ZAP']],
      ['Контроль и аудит', 'Обнаруживать подозрительную активность.', ['SIEM', 'Логи', 'Vulnerability Management'], ['Wazuh', 'Nmap']],
      ['Реагирование', 'Локализовать и расследовать атаки.', ['Реагирование на инциденты', 'Цифровая криминалистика', 'Поиск угроз'], ['Velociraptor', 'YARA']],
    ]),
  },
  {
    id: 'pentester', domainId: 'cybersecurity', title: 'Пентестер', subtitle: 'Практический аудит защищённости', status: 'Скоро', Icon: Code2,
    description: 'Поиск, проверка и ответственное описание уязвимостей.',
    stack: ['Kali Linux', 'Nmap', 'Burp Suite', 'Metasploit'],
    stages: roadmap([
      ['База атакующего', 'Понимать сети, ОС и веб.', ['Сети', 'Linux', 'Web', 'Python'], ['Kali Linux', 'Python']],
      ['Разведка', 'Собирать поверхность атаки.', ['OSINT', 'Сканирование', 'Enumeration'], ['Nmap', 'Amass']],
      ['Пентест веб-приложений', 'Проверять веб-приложения.', ['OWASP', 'Burp Suite', 'Безопасность API'], ['Burp Suite', 'ffuf']],
      ['Инфраструктура', 'Работать с корпоративной средой.', ['Active Directory', 'Privilege Escalation', 'Pivoting'], ['BloodHound', 'Metasploit']],
      ['Профессиональная практика', 'Фиксировать риск и доказательства.', ['Отчётность', 'Rules of Engagement', 'Ретест'], ['CVSS', 'Markdown']],
    ]),
  },
  {
    id: 'soc-analyst', domainId: 'cybersecurity', title: 'SOC-аналитик', subtitle: 'Обнаружение и расследование атак', status: 'Скоро', Icon: BarChart3,
    description: 'Мониторинг событий, триаж алертов, threat hunting и реагирование.',
    stack: ['SIEM', 'EDR', 'Wireshark', 'YARA', 'MITRE ATT&CK'],
    stages: roadmap([
      ['Сети и ОС', 'Читать технические следы активности.', ['Сети', 'Linux', 'Windows'], ['Wireshark', 'Sysmon']],
      ['Телеметрия', 'Работать с событиями безопасности.', ['Логи', 'SIEM', 'Нормализация'], ['Wazuh', 'Elastic']],
      ['Детектирование', 'Создавать качественные правила.', ['MITRE ATT&CK', 'Sigma', 'YARA'], ['Sigma', 'YARA']],
      ['Расследование', 'Связывать события в атаку.', ['Триаж', 'Поиск угроз', 'Цифровая криминалистика'], ['Velociraptor', 'Timesketch']],
      ['Реагирование', 'Сдерживать угрозу и улучшать защиту.', ['Реагирование на инциденты', 'Сценарии реагирования', 'Разбор после инцидента'], ['SOAR', 'TheHive']],
    ]),
  },
]
