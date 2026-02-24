/**
 * Game Session Persistence
 *
 * Saves the current game state to sessionStorage so it survives page refreshes.
 * sessionStorage is tab-scoped and cleared when the browser/tab is closed —
 * perfect for a single game session.
 *
 * DuelState.usedIds is a Set<string> which isn't JSON-serializable,
 * so we convert it to/from an array on save/load.
 */

import { DuelState, Tile } from '../types'

const STORAGE_KEY = 'thefloor_game_v1'
const CURRENT_VERSION = 1

/** Subset of DuelState that gets persisted (questions are re-fetched from Supabase) */
export interface SavedDuel {
  tileIdx: number
  categoryId: string
  categoryName: string
  emoji: string
  timer1: number
  timer2: number
  active: 1 | 2
  paused: boolean
  started: boolean
  usedIds: string[]          // serialized from Set<string>
  currentQuestionId: string | null
}

export interface SavedGameState {
  version: number
  savedAt: number            // Date.now()
  tiles: Tile[]              // full tile array with owner info
  cursor: number
  showStats: boolean
  duel: SavedDuel | null
}

// ── Serialize ───────────────────────────────────────────────────────────────

export function serializeDuel(duel: DuelState): SavedDuel {
  return {
    tileIdx: duel.tileIdx,
    categoryId: duel.categoryId,
    categoryName: duel.categoryName,
    emoji: duel.emoji,
    timer1: duel.timer1,
    timer2: duel.timer2,
    active: duel.active,
    // If duel was in fight, restore as paused so players can resume deliberately
    paused: true,
    started: duel.started,
    usedIds: Array.from(duel.usedIds),
    currentQuestionId: duel.currentQuestion?.id ?? null,
  }
}

// ── Save ────────────────────────────────────────────────────────────────────

export function saveGameState(
  tiles: Tile[],
  cursor: number,
  showStats: boolean,
  duel: DuelState | null,
): void {
  // Don't save if game hasn't started yet (no tiles)
  if (tiles.length === 0) return

  const state: SavedGameState = {
    version: CURRENT_VERSION,
    savedAt: Date.now(),
    tiles,
    cursor,
    showStats,
    duel: duel ? serializeDuel(duel) : null,
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('[Persistence] Failed to save game state', e)
  }
}

// ── Load ────────────────────────────────────────────────────────────────────

export function loadGameState(): SavedGameState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: SavedGameState = JSON.parse(raw)

    // Version check — discard stale/incompatible saves
    if (parsed.version !== CURRENT_VERSION) {
      clearGameState()
      return null
    }

    // Discard saves older than 24 hours
    if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      clearGameState()
      return null
    }

    return parsed
  } catch {
    return null
  }
}

// ── Check ───────────────────────────────────────────────────────────────────

export function hasGameState(): boolean {
  return loadGameState() !== null
}

// ── Clear ───────────────────────────────────────────────────────────────────

export function clearGameState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}
