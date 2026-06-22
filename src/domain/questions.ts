// ─────────────────────────────────────────────────────────────────────────────
// domain/questions.ts — Pure question-selection rules
//
// Both the single-player and multiplayer stores need to pick the "next" question
// from a category while avoiding immediate repeats and recycling once the pool is
// exhausted. This is that logic, in one pure place.
// ─────────────────────────────────────────────────────────────────────────────

export interface NextQuestionPick {
  /** Chosen question id, or '' when the pool is empty. */
  questionId: string
  /** Updated list of used ids (the pick appended; reset first if exhausted). */
  usedIds: string[]
}

/**
 * Pick a random not-recently-used question id.
 * When every id has been used, the history resets and selection starts over.
 *
 * @param questionIds all candidate question ids for the category
 * @param usedIds     ids already shown this duel
 */
export function pickNextQuestionId(questionIds: string[], usedIds: string[]): NextQuestionPick {
  if (questionIds.length === 0) return { questionId: '', usedIds: [] }

  let used = [...usedIds]
  if (used.length >= questionIds.length) used = []

  const available = questionIds.filter(id => !used.includes(id))
  const pool      = available.length > 0 ? available : questionIds
  const questionId = pool[Math.floor(Math.random() * pool.length)]

  used.push(questionId)
  return { questionId, usedIds: used }
}
