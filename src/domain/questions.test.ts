import { describe, expect, it } from 'vitest'
import { pickNextQuestionId } from './questions'

describe('pickNextQuestionId', () => {
  it('returns empty for an empty pool', () => {
    expect(pickNextQuestionId([], [])).toEqual({ questionId: '', usedIds: [] })
  })

  it('always returns the only question and tracks it as used', () => {
    const r = pickNextQuestionId(['a'], [])
    expect(r.questionId).toBe('a')
    expect(r.usedIds).toEqual(['a'])
  })

  it('never repeats until the pool is exhausted', () => {
    const ids = ['a', 'b', 'c']
    let used: string[] = []
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      const r = pickNextQuestionId(ids, used)
      seen.push(r.questionId)
      used = r.usedIds
    }
    expect([...seen].sort()).toEqual(['a', 'b', 'c']) // each shown exactly once
  })

  it('resets history once every question has been used', () => {
    const ids = ['a', 'b']
    const r = pickNextQuestionId(ids, ['a', 'b'])
    // history reset → exactly one id used again
    expect(ids).toContain(r.questionId)
    expect(r.usedIds).toEqual([r.questionId])
  })

  it('appends the pick to the prior used list', () => {
    const r = pickNextQuestionId(['a', 'b', 'c'], ['a'])
    expect(r.usedIds).toContain('a')
    expect(r.usedIds).toHaveLength(2)
    expect(r.questionId).not.toBe('a') // 'a' still available to avoid
  })
})
