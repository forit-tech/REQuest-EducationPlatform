import type { Mission } from '../../types'
import { missionEnvironment } from '../tasks'
import type { DifficultyLevel, FormField, MasteryDimension, Task } from './types'

/**
 * Мост между старым контентом и моделью V2.
 *
 * Старые 1765 миссий не переписываются: они переводятся на лету при чтении.
 * Массовая перегенерация JSON — это одноразовый риск сломать всё сразу ради
 * косметики, а адаптер даёт то же самое обратимо и проверяемо.
 *
 * Важно: адаптер обязан сохранять поведение проверки один в один. Кодовая
 * миссия старого раннера засчитывалась, только если верна и выбранная гипотеза,
 * и все обязательные фрагменты кода, — поэтому она превращается не в кодовое
 * задание, а в составное из двух полей.
 */

const difficultyByLabel: Record<string, DifficultyLevel> = {
  'основа': 'L0',
  'начальный': 'L1',
  'средний': 'L2',
  'продвинутый': 'L4',
}

const evidencesByType: Record<Mission['type'], MasteryDimension[]> = {
  story: ['recall'],
  quiz: ['recall', 'understanding'],
  case: ['understanding', 'reasoning'],
  code: ['coding', 'understanding'],
  lab: ['coding', 'understanding'],
  boss: ['understanding', 'reasoning'],
}

const intentByType: Record<Mission['type'], Task['intent']> = {
  story: 'concept',
  quiz: 'practice',
  case: 'reasoning',
  code: 'coding',
  lab: 'coding',
  boss: 'boss',
}

function optionId(index: number) {
  return `option-${index + 1}`
}

/** Строит задание V2 из старой миссии. Данные на диске не меняются. */
export function taskFromMission(mission: Mission, courseId: string): Task | undefined {
  const legacyTask = mission.task
  if (!legacyTask) return undefined

  const options = legacyTask.options ?? []
  const correctIndex = options.findIndex(option => option.trim() === legacyTask.answer.trim())
  const choiceOptions = options.map((text, index) => ({ id: optionId(index), text }))
  const base = {
    id: mission.id,
    title: mission.title,
    intent: mission.type === 'boss' ? 'boss' as const : intentByType[mission.type],
    difficulty: mission.type === 'boss' ? 'L5' as DifficultyLevel : difficultyByLabel[mission.difficulty ?? 'начальный'] ?? 'L1',
    prompt: legacyTask.prompt,
    environment: missionEnvironment(mission),
    evidences: evidencesByType[mission.type],
    topicId: `legacy:${courseId}`,
    // У старого контента нет разметки навыков: один курс — один навык-заглушка.
    // Настоящие навыки появятся вместе с новым содержанием, а не задним числом.
    skills: [{ skillId: `legacy:${courseId}`, role: 'primary' as const }],
    hints: mission.hints,
    explanation: legacyTask.explanation,
    legacy: { missionId: mission.id },
  }

  const checks = legacyTask.codeChecks ?? []
  if (checks.length) {
    const file = {
      path: legacyTask.workspaceFile ?? 'solution.py',
      language: 'python',
      content: legacyTask.starterCode ?? '',
      editable: true,
    }
    const codeField: FormField = {
      id: 'code',
      label: 'Решение',
      response: { kind: 'code', files: [file], entry: file.path },
      evaluation: { type: 'legacy-substring', checks: checks.map(check => ({ label: check.label, fragment: check.includes })) },
      evidences: ['coding'],
    }
    // Гипотеза была отдельным шагом старого раннера и учитывалась в зачёте.
    const fields: FormField[] = options.length
      ? [{
          id: 'hypothesis',
          label: 'Гипотеза',
          response: { kind: 'choice', options: choiceOptions, select: 'one' },
          evaluation: { type: 'choice', correct: correctIndex >= 0 ? [optionId(correctIndex)] : [] },
          evidences: ['understanding'],
        }, codeField]
      : [codeField]
    return { ...base, response: { kind: 'form', fields }, evaluation: { type: 'form' } }
  }

  if (options.length) {
    return {
      ...base,
      response: { kind: 'choice', options: choiceOptions, select: 'one' },
      evaluation: { type: 'choice', correct: correctIndex >= 0 ? [optionId(correctIndex)] : [] },
    }
  }

  return {
    ...base,
    response: { kind: 'text', multiline: true },
    evaluation: { type: 'text', accept: [{ kind: 'equals', value: legacyTask.answer }] },
  }
}
