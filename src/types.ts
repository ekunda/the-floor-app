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

// ── Multiplayer types ──────────────────────────────────────────────────────

export type MPRole = 'host' | 'guest'
export type MPStatus = 'idle' | 'creating' | 'joining' | 'waiting' | 'playing' | 'finished'
export type MPRoomStatus = 'waiting' | 'playing' | 'finished'
export type MPActivePlayer = 'host' | 'guest'

export interface MPDuelState {
  tileIdx: number
  categoryId: string
  categoryName: string
  emoji: string
  questionId: string
  usedQuestionIds: string[]
  timerHost: number
  timerGuest: number
  active: MPActivePlayer
  started: boolean
  paused: boolean
  lang: SpeechLang
}

export interface MPGameState {
  tiles: Tile[]
  cursor: number
  duel: MPDuelState | null
}

export interface MPRoom {
  id: string
  code: string
  host_id: string
  guest_id: string | null
  status: MPRoomStatus
  game_state: MPGameState | null
  host_score: number
  guest_score: number
  created_at: string
  updated_at: string
}

export interface MPProfile {
  id: string
  username: string
}

// Events broadcast over Supabase Realtime channel
export type MPEvent =
  | { type: 'cursor_move'; idx: number }
  | { type: 'duel_start'; tileIdx: number; categoryId: string; categoryName: string; emoji: string; questionId: string; lang: SpeechLang }
  | { type: 'fight_start' }
  | { type: 'tick'; timerHost: number; timerGuest: number }
  | { type: 'correct'; player: MPActivePlayer; answer: string }
  | { type: 'pass'; player: MPActivePlayer }
  | { type: 'duel_close' }
  | { type: 'next_question'; questionId: string; active: MPActivePlayer; timerHost: number; timerGuest: number }
  | { type: 'round_end'; winner: MPActivePlayer | 'draw'; tileIdx: number; timerHost: number; timerGuest: number }
  | { type: 'feedback'; text: string; feedbackType: 'correct' | 'pass' | 'timeout' | 'voice' }
  | { type: 'game_end' }
  | { type: 'chat_message'; from: string; text: string; ts: number }
  | { type: 'game_settings'; rounds: number; duelTime: number; categoriesCount: number }
