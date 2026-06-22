// ─────────────────────────────────────────────────────────────────────────────
// domain/categories.ts — Pure normalization of category/question rows
//
// Supabase returns loosely-typed rows (jsonb columns, nullable fields). Both
// stores used to normalize them inline with slightly different code; this is the
// single, pure, tested version.
// ─────────────────────────────────────────────────────────────────────────────
import type { Category, Question } from '../types'

export type CategoryWithQuestions = Category & { questions: Question[] }

/**
 * Coerce raw category rows into well-formed domain objects: default a missing
 * `lang` to Polish and guarantee `questions[].synonyms` is always an array.
 */
export function normalizeCategories(raw: unknown[]): CategoryWithQuestions[] {
  return (raw ?? []).map(row => {
    const cat = row as Record<string, unknown>
    const questions = Array.isArray(cat.questions) ? cat.questions : []
    return {
      ...cat,
      lang: (cat.lang as string) ?? 'pl-PL',
      questions: questions.map(q => {
        const question = q as Record<string, unknown>
        return { ...question, synonyms: Array.isArray(question.synonyms) ? question.synonyms : [] }
      }),
    } as CategoryWithQuestions
  })
}
