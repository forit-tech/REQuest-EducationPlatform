# Качество учебного контента

Собрано 02.09.2026, 15:46:15 за 351 мс.

| Периметр | Ошибки | Предупреждения | Наблюдения |
|---|---:|---:|---:|
| Старый контент | 398 | 306 | 60 |
| Учебный материал | 0 | 7 | 28 |
| Тестовые фикстуры | 0 | 1 | 0 |

Дефектов целостности: 0 (допустимо ноль в любом периметре).

Покрытие ниже — это характеристика программы, а не конкретного человека: оно отвечает на вопрос «есть ли в REQuest обучение по этому пункту». Готовность человека считается отдельно, по журналу его попыток.

Корпус: 74 курсов, 1765 старых заданий, 11 заданий новой модели, 44 навыков, 87 официальных вопросов вузов.

## По правилам

| Правило | Уровень | Периметр | Находок |
|---|---|---|---:|
| C3.duplicate-prompt | error | legacy | 226 |
| C2.exact-answer-in-theory | error | legacy | 163 |
| C2.normalized-answer-in-theory | error | legacy | 5 |
| C4.duplicate-options | error | legacy | 4 |
| C2.free-check | warning | legacy | 145 |
| C3.duplicate-intro | warning | legacy | 83 |
| C5.fragile-substring | warning | legacy | 49 |
| C4.longest-is-correct | warning | legacy | 27 |
| C7.no-introduction | warning | production | 7 |
| C2.paraphrased-answer | warning | legacy | 2 |
| C1.missing-source | warning | fixture | 1 |
| C3.template-course | info | legacy | 58 |
| C7.progression | info | production | 24 |
| C8.coverage | info | production | 3 |
| C3.duplicate-reach | info | legacy | 1 |
| C4.option-count | info | legacy | 1 |
| C9.inventory | info | production | 1 |

## Покрытие требований вузов

| Программа | Официальных вопросов | Структурных записей | Закрыто | Готово к экзамену |
|---|---:|---:|---:|---:|
| fa-ml-engineer-2026 | 0 | 1 | 0 | 0 |
| itmo-ai-talent-hub-2026 | 0 | 6 | 0 | 0 |
| itmo-deep-learning-genai-2026 | 87 | 0 | 0 | 0 |

Полный отчёт: `knowledge/reports/content-quality.json`.
