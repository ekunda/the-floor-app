import { describe, expect, it } from 'vitest'
import { computeStats, countOwned, evaluateBoardOutcome, shuffle } from './board'
import type { Tile } from '../types'

const tile = (owner: Tile['owner']): Tile => ({ x: 0, y: 0, categoryId: 'c', categoryName: 'C', owner })

describe('countOwned', () => {
  it('counts tiles by owner', () => {
    const tiles = [tile('gold'), tile('gold'), tile('silver'), tile('neutral')]
    expect(countOwned(tiles, 'gold')).toBe(2)
    expect(countOwned(tiles, 'silver')).toBe(1)
    expect(countOwned(tiles, 'neutral')).toBe(1)
  })
})

describe('computeStats', () => {
  it('returns zeroed stats for an empty board', () => {
    expect(computeStats([])).toEqual({
      goldTiles: 0, silverTiles: 0, totalTiles: 0, goldPct: 0, silverPct: 0,
    })
  })

  it('computes counts and rounded percentages', () => {
    const tiles = [tile('gold'), tile('gold'), tile('gold'), tile('silver')]
    const s = computeStats(tiles)
    expect(s.goldTiles).toBe(3)
    expect(s.silverTiles).toBe(1)
    expect(s.totalTiles).toBe(4)
    expect(s.goldPct).toBe(75)
    expect(s.silverPct).toBe(25)
  })
})

describe('evaluateBoardOutcome', () => {
  it('is not over below the threshold', () => {
    const tiles = [tile('gold'), tile('silver'), tile('neutral'), tile('neutral')]
    expect(evaluateBoardOutcome(tiles).isOver).toBe(false)
  })

  it('ends when a player controls 75% (ceil) of the board', () => {
    // 4 tiles → winAt = ceil(4*0.75) = 3
    const tiles = [tile('gold'), tile('gold'), tile('gold'), tile('silver')]
    const out = evaluateBoardOutcome(tiles)
    expect(out.isOver).toBe(true)
    expect(out.winner).toBe('gold')
  })

  it('reports a draw when colours are tied', () => {
    const tiles = [tile('gold'), tile('gold'), tile('gold'), tile('silver'), tile('silver'), tile('silver')]
    // winAt = ceil(6*0.75) = 5; neither reaches it → not over, but winner tie-breaks to draw
    const out = evaluateBoardOutcome(tiles)
    expect(out.winner).toBe('draw')
  })

  it('respects a custom threshold', () => {
    const tiles = [tile('gold'), tile('silver')]
    expect(evaluateBoardOutcome(tiles, 0.5).isOver).toBe(true)
  })
})

describe('shuffle', () => {
  it('preserves length and elements without mutating the input', () => {
    const input = [1, 2, 3, 4, 5]
    const copy = [...input]
    const out = shuffle(input)
    expect(out).toHaveLength(5)
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5])
    expect(input).toEqual(copy) // original untouched
  })
})
