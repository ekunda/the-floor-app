// ─────────────────────────────────────────────────────────────────────────────
// domain/duel.ts — Pure multiplayer round-resolution rules
//
// These encode the *rules* of a multiplayer duel round (who claims a tile, the
// resulting score, who picks next, timeout/penalty handling). They used to be
// inlined — and duplicated between the host and guest code paths — inside
// useMultiplayerStore. Keeping them here removes that drift risk and makes the
// rules unit-testable in isolation from realtime/Zustand side effects.
// ─────────────────────────────────────────────────────────────────────────────
import type { MPActivePlayer, Tile, TileOwner } from '../types'
import { countOwned } from './board'

export type RoundWinner = MPActivePlayer | 'draw'

/** The other player. */
export function opponentOf(player: MPActivePlayer): MPActivePlayer {
  return player === 'host' ? 'guest' : 'host'
}

/** On timeout, the active player (whose clock ran out) loses. */
export function winnerAfterTimeout(active: MPActivePlayer): MPActivePlayer {
  return opponentOf(active)
}

/** Apply a pass penalty to a timer, clamped at zero. */
export function applyPassPenalty(timer: number, penalty: number): number {
  return Math.max(0, timer - penalty)
}

/**
 * Tile colour claimed by a round winner. Host→gold, guest→silver; a draw leaves
 * the tile as it was.
 */
export function ownerForWinner(winner: RoundWinner, currentOwner: TileOwner): TileOwner {
  if (winner === 'host')  return 'gold'
  if (winner === 'guest') return 'silver'
  return currentOwner
}

/**
 * Who picks the next tile. The loser of the round picks; on a draw the pick
 * simply alternates from the current picker.
 */
export function nextPickerAfterRound(winner: RoundWinner, currentPicker: MPActivePlayer): MPActivePlayer {
  if (winner === 'host')  return 'guest'
  if (winner === 'guest') return 'host'
  return opponentOf(currentPicker)
}

export interface RoundResolution {
  tiles:      Tile[]
  hostScore:  number
  guestScore: number
  nextPicker: MPActivePlayer
}

/**
 * Resolve a finished round into the next board state. Claims the tile at
 * `tileIdx` for the winner (a negative index leaves the board untouched — used
 * for game-end summaries), recounts scores, and decides the next picker.
 */
export function resolveRound(
  tiles:         Tile[],
  tileIdx:       number,
  winner:        RoundWinner,
  currentPicker: MPActivePlayer,
): RoundResolution {
  const newTiles = tileIdx >= 0
    ? tiles.map((t, i) => (i === tileIdx ? { ...t, owner: ownerForWinner(winner, t.owner) } : t))
    : tiles
  return {
    tiles:      newTiles,
    hostScore:  countOwned(newTiles, 'gold'),
    guestScore: countOwned(newTiles, 'silver'),
    nextPicker: nextPickerAfterRound(winner, currentPicker),
  }
}
