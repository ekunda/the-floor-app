// src/types.ts — ROZSZERZONY O TYPY MULTIPLAYER
// Oryginalne typy Singleplayer pozostają bez zmian

// ─────────────────────────────────────────────────────────────
// ORYGINALNE TYPY (bez zmian)
// ─────────────────────────────────────────────────────────────

export interface GameConfig {
  // Board
  GRID_COLS: number
  GRID_ROWS: number
  TILE_SIZE: number
  // Gameplay
  DUEL_TIME: number
  PASS_PENALTY: number
  FEEDBACK_MS: number
  WIN_CLOSE_MS: number
  TOAST_MS: number
  // New options
  RANDOM_TILES: number       // 0 = sequential, 1 = random category placement
  SHOW_STATS: number         // 0 = hidden by default, 1 = shown by default
  SOUND_VOLUME: number       // 0–100 master volume
  BOARD_SHAPE: number        // 0 = rectangle, 1 = wide (6x2), 2 = tall (3x4), 3 = square (4x4)
}

export interface PlayerSettings {
  name: string
  color: string
}

export type SpeechLang = 'pl-PL' | 'en-US' | 'both'

export interface Category {
  id: string
  name: string
  emoji: string
  lang: SpeechLang
  created_at: string
}

export interface Question {
  id: string
  category_id: string
  image_path: string | null
  answer: string
  synonyms: string[]
  created_at: string
}

export type TileOwner = 'gold' | 'silver'

export interface Tile {
  x: number
  y: number
  categoryId: string
  categoryName: string
  owner: TileOwner
}

export interface DuelState {
  tileIdx: number
  categoryId: string
  categoryName: string
  emoji: string
  questions: Question[]
  usedIds: Set<string>
  timer1: number
  timer2: number
  active: 1 | 2
  paused: boolean
  started: boolean
  currentQuestion: Question | null
  lang: SpeechLang
}

export interface GameStats {
  goldTiles: number
  silverTiles: number
  totalTiles: number
  goldPct: number
  silverPct: number
}

// ─────────────────────────────────────────────────────────────
// NOWE TYPY — MULTIPLAYER / AUTH
// ─────────────────────────────────────────────────────────────

/** Publiczny profil gracza (tabela: profiles) */
export interface UserProfile {
  id: string
  username: string
  avatar: string          // emoji
  xp: number
  wins: number
  losses: number
  win_streak: number
  best_streak: number
  is_admin: boolean
  created_at: string
  updated_at: string
}

/** Ranga gracza na podstawie XP */
export interface Rank {
  min: number
  max: number
  name: string
  icon: string
  color: string
}

/** Pokój gry multiplayer (tabela: game_rooms) */
export interface GameRoom {
  id: string
  code: string            // 6-znakowy kod pokoju
  host_id: string
  guest_id: string | null
  status: 'waiting' | 'playing' | 'finished' | 'cancelled'
  config: RoomConfig
  current_round: number
  host_score: number
  guest_score: number
  game_state: MPGameState | null
  current_turn: 'host' | 'guest'
  created_at: string
  updated_at: string
}

/** Konfiguracja pokoju */
export interface RoomConfig {
  rounds: number
  duel_time: number
  board_shape: number
  random_tiles?: boolean
}

/** Kafelek w grze multiplayer */
export type MPTileOwner = 'host' | 'guest' | null

export interface MPTile {
  idx: number
  categoryId: string
  categoryName: string
  emoji: string
  owner: MPTileOwner
}

/** Faza gry multiplayer */
export type MPGamePhase =
  | 'countdown'    // odliczanie startowe 3-2-1
  | 'select_tile'  // gracz wybiera kafelek
  | 'duel'         // obaj grają duel
  | 'round_end'    // podsumowanie rundy
  | 'game_over'    // koniec gry

/** Pytanie w trybie multiplayer */
export interface MPQuestion {
  id: string
  answer: string
  synonyms: string[]
  image_path: string | null
  categoryName: string
  emoji: string
}

/** Pełny stan gry MP (zapisywany w game_rooms.game_state) */
export interface MPGameState {
  phase: MPGamePhase
  tiles: MPTile[]
  currentTurn: 'host' | 'guest'
  selectedTileIdx: number | null
  currentQuestion: MPQuestion | null
  usedQuestionIds: string[]
  round: number
  totalRounds: number
  hostScore: number
  guestScore: number
  duelTimer: number
  hostAnswered: boolean
  guestAnswered: boolean
  roundWinner: 'host' | 'guest' | 'draw' | null
  winner: 'host' | 'guest' | 'draw' | null
  startedAt: number
}

/** Wpis w historii gier (tabela: game_history) */
export interface GameHistoryEntry {
  id: string
  room_id: string | null
  winner_id: string | null
  loser_id: string | null
  winner_score: number
  loser_score: number
  rounds_total: number
  duration_sec: number
  is_draw: boolean
  played_at: string
}

/** Wpis w kolejce matchmakingu (tabela: matchmaking_queue) */
export interface MatchmakingEntry {
  id: string
  player_id: string
  elo: number
  joined_at: string
}

/** Wiersz tabeli liderów (widok: leaderboard) */
export interface LeaderboardEntry {
  id: string
  username: string
  avatar: string
  xp: number
  wins: number
  losses: number
  win_streak: number
  best_streak: number
  win_rate: number
  rank: number
}
