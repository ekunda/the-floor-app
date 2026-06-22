// ─────────────────────────────────────────────────────────────────────────────
// domain/xp.ts — Pure XP / ranking math
//
// The reward values and how a match result mutates each player's profile stats
// are pure functions of their inputs. The actual database reads/writes live in
// lib/profileService.ts; this module knows nothing about Supabase.
// ─────────────────────────────────────────────────────────────────────────────
import type { MPActivePlayer } from '../types'
import type { RoundWinner } from './duel'

/** Persisted per-player ranking stats (mirrors the columns we read/write). */
export interface ProfileStats {
  xp:          number
  wins:        number
  losses:      number
  win_streak:  number
  best_streak: number
}

export interface XpRewards {
  win:  number
  loss: number
  draw: number
}

/**
 * XP awarded for a match. A forfeit rewards the winner more and docks the loser;
 * a normal result never reduces XP.
 */
export function xpRewards(categoriesCount: number, forfeit = false): XpRewards {
  return {
    win:  forfeit ? Math.round(categoriesCount * 1.5) : categoriesCount,
    loss: forfeit ? -Math.floor(categoriesCount / 2) : 0,
    draw: Math.floor(categoriesCount / 2),
  }
}

/** XP delta a given player sees for a result — used for end-of-game display. */
export function playerXpDelta(player: MPActivePlayer, winner: RoundWinner, rewards: XpRewards): number {
  if (winner === 'draw') return rewards.draw
  return winner === player ? rewards.win : rewards.loss
}

type Outcome = 'win' | 'loss' | 'draw'

function applyOutcome(s: ProfileStats, outcome: Outcome, r: XpRewards): ProfileStats {
  if (outcome === 'win') {
    const streak = s.win_streak + 1
    return { xp: s.xp + r.win, wins: s.wins + 1, losses: s.losses, win_streak: streak, best_streak: Math.max(s.best_streak, streak) }
  }
  if (outcome === 'loss') {
    return { xp: Math.max(0, s.xp + r.loss), wins: s.wins, losses: s.losses + 1, win_streak: 0, best_streak: s.best_streak }
  }
  // draw: small XP, streak resets, win/loss counts unchanged
  return { xp: s.xp + r.draw, wins: s.wins, losses: s.losses, win_streak: 0, best_streak: s.best_streak }
}

/**
 * Compute both players' updated stats from a finished match. Pure — returns new
 * objects and never mutates the inputs.
 */
export function applyMatchResult(
  host:   ProfileStats,
  guest:  ProfileStats,
  winner: RoundWinner,
  rewards: XpRewards,
): { host: ProfileStats; guest: ProfileStats } {
  const hostOutcome:  Outcome = winner === 'draw' ? 'draw' : winner === 'host'  ? 'win' : 'loss'
  const guestOutcome: Outcome = winner === 'draw' ? 'draw' : winner === 'guest' ? 'win' : 'loss'
  return {
    host:  applyOutcome(host,  hostOutcome,  rewards),
    guest: applyOutcome(guest, guestOutcome, rewards),
  }
}
