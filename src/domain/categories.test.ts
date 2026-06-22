import { describe, expect, it } from 'vitest'
import { normalizeCategories } from './categories'

describe('normalizeCategories', () => {
  it('returns an empty array for empty/nullish input', () => {
    expect(normalizeCategories([])).toEqual([])
    // tolerates a nullish argument (defensive)
    expect(normalizeCategories(undefined as unknown as unknown[])).toEqual([])
  })

  it('defaults a missing lang to pl-PL', () => {
    const [c] = normalizeCategories([{ id: '1', name: 'Zwierzęta', questions: [] }])
    expect(c.lang).toBe('pl-PL')
  })

  it('keeps an explicit lang', () => {
    const [c] = normalizeCategories([{ id: '1', name: 'Cities', lang: 'en-US', questions: [] }])
    expect(c.lang).toBe('en-US')
  })

  it('guarantees questions[].synonyms is always an array', () => {
    const [c] = normalizeCategories([{
      id: '1', name: 'X', questions: [
        { id: 'q1', answer: 'a', synonyms: ['b'] },
        { id: 'q2', answer: 'c', synonyms: null },
        { id: 'q3', answer: 'd' },
      ],
    }])
    expect(c.questions[0].synonyms).toEqual(['b'])
    expect(c.questions[1].synonyms).toEqual([])
    expect(c.questions[2].synonyms).toEqual([])
  })

  it('tolerates a missing questions array', () => {
    const [c] = normalizeCategories([{ id: '1', name: 'X' }])
    expect(c.questions).toEqual([])
  })

  it('preserves other fields', () => {
    const [c] = normalizeCategories([{ id: '42', name: 'Sport', emoji: '⚽', questions: [] }])
    expect(c.id).toBe('42')
    expect(c.name).toBe('Sport')
    expect(c.emoji).toBe('⚽')
  })
})
