// ─────────────────────────────────────────────────────────────────────────────
// domain/board.ts — Pure board & scoring rules
//
// Framework-free. No React, Zustand, or Supabase imports. Everything here is a
// pure function of its inputs, which makes it trivially unit-testable and keeps
// the game rules in one place instead of duplicated across the stores.
// ─────────────────────────────────────────────────────────────────────────────
import type { GameStats, Tile, TileOwner } from '../types'

/** Fisher–Yates shuffle. Returns a new array; does not mutate the input. */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Count tiles owned by a given player. */
export function countOwned(tiles: Tile[], owner: TileOwner): number {
  return tiles.reduce((n, t) => (t.owner === owner ? n + 1 : n), 0)
}

/** Single-player scoreboard stats (gold vs silver share of the board). */
export function computeStats(tiles: Tile[]): GameStats {
  const gold   = countOwned(tiles, 'gold')
  const silver = countOwned(tiles, 'silver')
  const total  = tiles.length
  return {
    goldTiles: gold, silverTiles: silver, totalTiles: total,
    goldPct:   total > 0 ? Math.round((gold   / total) * 100) : 0,
    silverPct: total > 0 ? Math.round((silver / total) * 100) : 0,
  }
}

export interface BoardOutcome {
  /** True once a player controls enough tiles to end the game. */
  isOver: boolean
  gold:   number
  silver: number
  /** Decided in terms of tile colour; callers map gold→player1/host, silver→player2/guest. */
  winner: 'gold' | 'silver' | 'draw'
}

/**
 * Evaluate whether the board has been won.
 * @param threshold fraction of the board a player must control to win (default 75%).
 */
export function evaluateBoardOutcome(tiles: Tile[], threshold = 0.75): BoardOutcome {
  const total  = tiles.length
  const gold   = countOwned(tiles, 'gold')
  const silver = countOwned(tiles, 'silver')
  const winAt  = Math.ceil(total * threshold)
  const isOver = gold >= winAt || silver >= winAt
  const winner: BoardOutcome['winner'] = gold > silver ? 'gold' : silver > gold ? 'silver' : 'draw'
  return { isOver, gold, silver, winner }
}
