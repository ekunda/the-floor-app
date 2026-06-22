import { describe, expect, it } from 'vitest'
import { applyMatchResult, playerXpDelta, xpRewards, type ProfileStats } from './xp'

const base = (over: Partial<ProfileStats> = {}): ProfileStats => ({
  xp: 0, wins: 0, losses: 0, win_streak: 0, best_streak: 0, ...over,
})

describe('xpRewards', () => {
  it('normal result: winner gets categoriesCount, loser 0, draw half', () => {
    expect(xpRewards(12)).toEqual({ win: 12, loss: 0, draw: 6 })
  })
  it('forfeit: winner gets 1.5×, loser is docked half', () => {
    expect(xpRewards(12, true)).toEqual({ win: 18, loss: -6, draw: 6 })
  })
})

describe('playerXpDelta', () => {
  const r = xpRewards(10)
  it('gives the winner the win reward and the loser the loss reward', () => {
    expect(playerXpDelta('host', 'host', r)).toBe(10)
    expect(playerXpDelta('guest', 'host', r)).toBe(0)
  })
  it('gives both players the draw reward on a draw', () => {
    expect(playerXpDelta('host', 'draw', r)).toBe(5)
    expect(playerXpDelta('guest', 'draw', r)).toBe(5)
  })
})

describe('applyMatchResult', () => {
  const r = xpRewards(12) // win 12, loss 0, draw 6

  it('host win: host gains xp/win/streak, guest gains a loss with streak reset', () => {
    const { host, guest } = applyMatchResult(base({ xp: 5, win_streak: 2, best_streak: 3 }), base({ xp: 4, win_streak: 1, best_streak: 1 }), 'host', r)
    expect(host).toEqual({ xp: 17, wins: 1, losses: 0, win_streak: 3, best_streak: 3 })
    expect(guest).toEqual({ xp: 4, wins: 0, losses: 1, win_streak: 0, best_streak: 1 })
  })

  it('updates best_streak when the new streak exceeds it', () => {
    const { host } = applyMatchResult(base({ win_streak: 3, best_streak: 3 }), base(), 'host', r)
    expect(host.win_streak).toBe(4)
    expect(host.best_streak).toBe(4)
  })

  it('draw: both gain draw xp, streaks reset, no win/loss change', () => {
    const { host, guest } = applyMatchResult(base({ xp: 10, win_streak: 2 }), base({ xp: 8, win_streak: 1 }), 'draw', r)
    expect(host).toEqual({ xp: 16, wins: 0, losses: 0, win_streak: 0, best_streak: 0 })
    expect(guest).toEqual({ xp: 14, wins: 0, losses: 0, win_streak: 0, best_streak: 0 })
  })

  it('forfeit loss never drives XP below zero', () => {
    const forfeit = xpRewards(12, true) // loss -6
    const { guest } = applyMatchResult(base(), base({ xp: 2 }), 'host', forfeit)
    expect(guest.xp).toBe(0) // 2 - 6 clamped to 0
  })

  it('does not mutate the input stats', () => {
    const host = base({ xp: 5 })
    applyMatchResult(host, base(), 'host', r)
    expect(host.xp).toBe(5)
  })
})
