# Качество учебного контента

Собрано 09.09.2026, 12:25:48 за 383 мс.

| Периметр | Ошибки | Предупреждения | Наблюдения |
|---|---:|---:|---:|
| Старый контент | 361 | 271 | 56 |
| Учебный материал | 0 | 5 | 30 |
| Тестовые фикстуры | 0 | 1 | 0 |

Дефектов целостности: 0 (допустимо ноль в любом периметре).

Покрытие ниже — это характеристика программы, а не конкретного человека: оно отвечает на вопрос «есть ли в REQuest обучение по этому пункту». Готовность человека считается отдельно, по журналу его попыток.

Корпус: 75 курсов, 1761 старых заданий, 23 заданий новой модели, 44 навыков, 87 официальных вопросов вузов.

## По правилам

| Правило | Уровень | Периметр | Находок |
|---|---|---|---:|
| C3.duplicate-prompt | error | legacy | 193 |
| C2.exact-answer-in-theory | error | legacy | 163 |
| C4.duplicate-options | error | legacy | 3 |
| C2.normalized-answer-in-theory | error | legacy | 2 |
| C2.free-check | warning | legacy | 140 |
| C3.duplicate-intro | warning | legacy | 83 |
| C5.fragile-substring | warning | legacy | 25 |
| C4.longest-is-correct | warning | legacy | 21 |
| C7.no-introduction | warning | production | 5 |
| C2.paraphrased-answer | warning | legacy | 2 |
| C1.missing-source | warning | fixture | 1 |
| C3.template-course | info | legacy | 54 |
| C7.progression | info | production | 26 |
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
