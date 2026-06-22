import { describe, expect, it } from 'vitest'
import {
  applyPassPenalty, nextPickerAfterRound, opponentOf, ownerForWinner,
  resolveRound, winnerAfterTimeout,
} from './duel'
import type { Tile } from '../types'

const tile = (owner: Tile['owner']): Tile => ({ x: 0, y: 0, categoryId: 'c', categoryName: 'C', owner })

describe('opponentOf / winnerAfterTimeout', () => {
  it('returns the other player', () => {
    expect(opponentOf('host')).toBe('guest')
    expect(opponentOf('guest')).toBe('host')
  })
  it('the player whose clock expired loses', () => {
    expect(winnerAfterTimeout('host')).toBe('guest')
    expect(winnerAfterTimeout('guest')).toBe('host')
  })
})

describe('applyPassPenalty', () => {
  it('subtracts the penalty', () => {
    expect(applyPassPenalty(30, 5)).toBe(25)
  })
  it('clamps at zero', () => {
    expect(applyPassPenalty(3, 5)).toBe(0)
  })
})

describe('ownerForWinner', () => {
  it('maps host→gold and guest→silver', () => {
    expect(ownerForWinner('host', 'neutral')).toBe('gold')
    expect(ownerForWinner('guest', 'neutral')).toBe('silver')
  })
  it('leaves the tile unchanged on a draw', () => {
    expect(ownerForWinner('draw', 'gold')).toBe('gold')
    expect(ownerForWinner('draw', 'neutral')).toBe('neutral')
  })
})

describe('nextPickerAfterRound', () => {
  it('hands the pick to the round loser', () => {
    expect(nextPickerAfterRound('host', 'host')).toBe('guest')
    expect(nextPickerAfterRound('guest', 'guest')).toBe('host')
  })
  it('alternates from the current picker on a draw', () => {
    expect(nextPickerAfterRound('draw', 'host')).toBe('guest')
    expect(nextPickerAfterRound('draw', 'guest')).toBe('host')
  })
})

describe('resolveRound', () => {
  it('claims the tile, recounts scores, and advances the picker', () => {
    const tiles = [tile('neutral'), tile('gold'), tile('neutral')]
    const r = resolveRound(tiles, 0, 'host', 'host')
    expect(r.tiles[0].owner).toBe('gold')
    expect(r.hostScore).toBe(2)   // tile 0 (new) + tile 1 (existing gold)
    expect(r.guestScore).toBe(0)
    expect(r.nextPicker).toBe('guest')
    expect(tiles[0].owner).toBe('neutral') // input not mutated
  })

  it('leaves the board untouched for a negative tile index (game-end summary)', () => {
    const tiles = [tile('gold'), tile('silver')]
    const r = resolveRound(tiles, -1, 'host', 'guest')
    expect(r.tiles).toBe(tiles)
    expect(r.hostScore).toBe(1)
    expect(r.guestScore).toBe(1)
  })

  it('keeps the tile colour on a draw', () => {
    const tiles = [tile('silver')]
    const r = resolveRound(tiles, 0, 'draw', 'host')
    expect(r.tiles[0].owner).toBe('silver')
  })
})
