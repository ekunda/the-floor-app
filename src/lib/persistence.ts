/**
 * Game Session Persistence
 *
 * WERSJA 2 — wymuszone odrzucenie starych zapisów z błędną strukturą kafelka.
 * Stara wersja 1 miała kafelki {index, col, row} zamiast {x, y} →
 * canvas rysował w pozycji NaN → niewidoczne kategorie + czarny ekran.
 */

import { DuelState, Tile } from '../types'

const STORAGE_KEY     = 'thefloor_game_v1'
const CURRENT_VERSION = 2  // ← BUMP: odrzuca stare zapisy z wersji 1

/** Subset of DuelState that gets persisted */
export interface SavedDuel {
  tileIdx:           number
  categoryId:        string
  categoryName:      string
  emoji:             string
  timer1:            number
  timer2:            number
  active:            1 | 2
  paused:            boolean
  started:           boolean
  usedIds:           string[]
  currentQuestionId: string | null
}

export interface SavedGameState {
  version:   number
  savedAt:   number
  tiles:     Tile[]
  cursor:    number
  showStats: boolean
  duel:      SavedDuel | null
}

// ── Serialize ─────────────────────────────────────────────────────────────────

export function serializeDuel(duel: DuelState): SavedDuel {
  return {
    tileIdx:           duel.tileIdx,
    categoryId:        duel.categoryId,
    categoryName:      duel.categoryName,
    emoji:             duel.emoji,
    timer1:            duel.timer1,
    timer2:            duel.timer2,
    active:            duel.active,
    paused:            true,
    started:           duel.started,
    usedIds:           Array.from(duel.usedIds),
    currentQuestionId: duel.currentQuestion?.id ?? null,
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

export function saveGameState(
  tiles:     Tile[],
  cursor:    number,
  showStats: boolean,
  duel:      DuelState | null,
): void {
  if (tiles.length === 0) return

  const state: SavedGameState = {
    version:   CURRENT_VERSION,
    savedAt:   Date.now(),
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

// ── Load ──────────────────────────────────────────────────────────────────────

export function loadGameState(): SavedGameState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed: SavedGameState = JSON.parse(raw)

    // Odrzuć stare/niezgodne zapisy (wersja 1 miała błędną strukturę Tile)
    if (parsed.version !== CURRENT_VERSION) {
      clearGameState()
      return null
    }

    // Odrzuć zapisy starsze niż 24h
    if (Date.now() - parsed.savedAt > 24 * 60 * 60 * 1000) {
      clearGameState()
      return null
    }

    // Dodatkowa walidacja — upewnij się, że kafelki mają poprawną strukturę {x, y}
    const firstTile = parsed.tiles?.[0]
    if (
      !firstTile ||
      typeof firstTile.x !== 'number' ||
      typeof firstTile.y !== 'number' ||
      (firstTile.owner !== 'gold' && firstTile.owner !== 'silver')
    ) {
      clearGameState()
      return null
    }

    return parsed
  } catch {
    return null
  }
}

// ── Check ─────────────────────────────────────────────────────────────────────

export function hasGameState(): boolean {
  return loadGameState() !== null
}

// ── Clear ─────────────────────────────────────────────────────────────────────

export function clearGameState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}
