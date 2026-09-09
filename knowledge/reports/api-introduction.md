# Введение конструкций до требования

Собирается автоматически: `npm run api:audit`.

Правило: ни одна миссия не может требовать написать конструкцию, функцию, метод или вызов
библиотеки, синтаксис которых человеку нигде не показывали. Для функций и методов показом
считается только реальный пример вызова: имя, названное в прозе, показом не является.
Подсказки в показ не входят, комментарий в стартовом файле кодом не считается.

Курсов с кодом: 50. Из них с нарушениями: 9.
Требований без показа: 19. Миссий с несколькими новыми сущностями сразу: 35.
Проверок, выполненных стартовым файлом: 137 (критических: 0).
Подсказок, выдающих ответ: 11 (критических: 7).

| Курс | Язык | Кодовых миссий | Требуется без показа | Показ и требование сразу | Много нового сразу | Проверка на старте | Ответ в подсказке |
|---|---|---:|---:|---:|---:|---:|---:|
| `javascript-core` | javascript | 14 | 0 | 18 | 6 | 0 | 2 |
| `java-core` | java | 13 | 4 | 16 | 7 | 0 | 1 |
| `go-core` | go | 12 | 2 | 14 | 6 | 0 | 2 |
| `go-network-services` | go | 10 | 0 | 16 | 6 | 0 | 1 |
| `polars` | python | 22 | 6 | 0 | 1 | 0 | 0 |
| `go-core-concurrency` | go | 11 | 1 | 12 | 3 | 0 | 2 |
| `go-production` | go | 9 | 0 | 9 | 3 | 0 | 2 |
| `react-core` | javascript | 13 | 1 | 7 | 2 | 1 | 0 |
| `react-architecture` | javascript | 9 | 7 | 0 | 2 | 1 | 1 |
| `data-modeling` | python | 25 | 5 | 0 | 1 | 0 | 0 |
| `frontend-delivery` | javascript | 9 | 0 | 0 | 0 | 9 | 0 |
| `frontend-quality` | javascript | 9 | 0 | 0 | 0 | 9 | 0 |
| `java-core-jvm` | java | 9 | 0 | 0 | 0 | 9 | 0 |
| `java-production` | java | 9 | 0 | 0 | 0 | 9 | 0 |
| `react-production` | javascript | 9 | 0 | 0 | 0 | 9 | 0 |
| `spring-services` | java | 9 | 0 | 0 | 0 | 9 | 0 |
| `web-platform-foundations` | javascript | 9 | 0 | 0 | 0 | 9 | 0 |
| `production-incidents` | python | 12 | 5 | 0 | 1 | 0 | 0 |
| `data-final-project` | python | 6 | 4 | 0 | 1 | 0 | 0 |
| `ai-evaluation-safety` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `analytics-communication` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `boosting` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `data-pipelines` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `data-platform-reliability` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `linear-algebra` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `llm-applications` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `ml-baseline` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `ml-engineering` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `ml-observability` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `model-serving` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `product-analytics` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `production` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `python-databases-async` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `python-service-production` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `python-web-api` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `rag-systems` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `streaming-platforms` | python | 9 | 0 | 0 | 0 | 4 | 0 |
| `data-quality` | python | 28 | 1 | 0 | 0 | 0 | 0 |
| `data-visualization` | python | 21 | 1 | 0 | 0 | 0 | 0 |
| `etl-elt` | python | 19 | 1 | 0 | 0 | 0 | 0 |
| `large-data` | python | 15 | 1 | 0 | 0 | 0 | 0 |
| `data-cleaning` | python | 29 | 0 | 0 | 0 | 0 | 0 |
| `data-formats` | python | 8 | 0 | 0 | 0 | 0 | 0 |
| `exploratory-data-analysis` | python | 24 | 0 | 0 | 0 | 0 | 0 |
| `numpy` | python | 24 | 0 | 0 | 0 | 0 | 0 |
| `pandas` | python | 41 | 0 | 0 | 0 | 0 | 0 |
| `python-core` | python | 42 | 0 | 0 | 0 | 0 | 0 |
| `python-first-steps` | python | 19 | 0 | 0 | 0 | 0 | 0 |
| `statistics` | python | 33 | 0 | 0 | 0 | 0 | 0 |
| `technical-foundations` | python | 0 | 0 | 0 | 0 | 0 | 0 |

Полный список с миссиями и токенами: `knowledge/reports/api-introduction.json`.
