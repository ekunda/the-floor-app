export interface GameConfig {
  // Board
  GRID_COLS: number; GRID_ROWS: number; TILE_SIZE: number; BOARD_SHAPE: number
  // Gameplay
  DUEL_TIME: number; PASS_PENALTY: number; FEEDBACK_MS: number
  WIN_CLOSE_MS: number; TOAST_MS: number; RANDOM_TILES: number
  MAX_PASSES: number; ROUND_TIMER: number; MAX_ROUNDS: number
  // Sound
  SOUND_VOLUME: number; MUSIC_VOLUME: number; SFX_VOLUME: number
  // Voice
  VOICE_PASS: number
  // Display
  SHOW_STATS: number; SHOW_ANSWER_HINT: number; TILE_FLIP_ANIM: number
  // Multiplayer
  MP_DUEL_TIME: number; MP_PASS_PENALTY: number; MP_FEEDBACK_MS: number
  MP_WIN_CLOSE_MS: number; MP_XP_WIN: number; MP_XP_DRAW: number; MP_XP_LOSS: number
}

export interface PlayerSettings { name: string; color: string }
export type SpeechLang = 'pl-PL' | 'en-US' | 'both'

export interface Category {
  id: string; name: string; emoji: string; lang: SpeechLang; created_at: string
}
export interface Question {
  id: string; category_id: string; image_path: string | null
  answer: string; synonyms: string[]; created_at: string
}
export type TileOwner = 'gold' | 'silver'
export interface Tile { x: number; y: number; categoryId: string; categoryName: string; owner: TileOwner }

export interface DuelState {
  tileIdx: number; categoryId: string; categoryName: string; emoji: string
  questions: Question[]; usedIds: Set<string>; timer1: number; timer2: number
  active: 1 | 2; paused: boolean; started: boolean; currentQuestion: Question | null; lang: SpeechLang
  passCount: number
}
export interface GameStats {
  goldTiles: number; silverTiles: number; totalTiles: number; goldPct: number; silverPct: number
}

// ── Multiplayer ────────────────────────────────────────────────────────────────
export type MPRole   = 'host' | 'guest'
// lobby = both joined, waiting for host to start game
export type MPStatus = 'idle' | 'creating' | 'joining' | 'waiting' | 'lobby' | 'playing' | 'finished'
export type MPRoomStatus  = 'waiting' | 'lobby' | 'playing' | 'finished'
export type MPActivePlayer = 'host' | 'guest'

export interface MPDuelState {
  tileIdx:         number
  categoryId:      string
  categoryName:    string
  emoji:           string
  questionId:      string
  usedQuestionIds: string[]
  timerHost:       number   // own countdown, ticks only when active='host'
  timerGuest:      number   // own countdown, ticks only when active='guest'
  active:          MPActivePlayer   // whose turn it is
  started:         boolean          // false = pre-fight screen
  paused:          boolean
  lang:            SpeechLang
}

export interface MPGameState {
  tiles: Tile[]; cursor: number; duel: MPDuelState | null
}

export interface MPRoom {
  id: string; code: string; host_id: string; guest_id: string | null
  status: MPRoomStatus; game_state: MPGameState | null
  host_score: number; guest_score: number; created_at: string; updated_at: string
}

// ── Events broadcast over Supabase Realtime ────────────────────────────────────
// Architecture: HOST is authoritative. All state transitions initiated by host.
// Guest sends INTENT events → host validates & advances state → host broadcasts results.
export type MPEvent =
  | { type: 'cursor_move';   idx: number }
  // timerHost/timerGuest carry the lobby-configured duelTime so guest uses correct values
  | { type: 'duel_start';    tileIdx: number; categoryId: string; categoryName: string; emoji: string; questionId: string; lang: SpeechLang; firstActive: MPActivePlayer; timerHost: number; timerGuest: number }
  | { type: 'fight_start' }
  | { type: 'tick';          timerHost: number; timerGuest: number }
  | { type: 'correct';       player: MPActivePlayer; answer: string }
  | { type: 'pass';          player: MPActivePlayer; answer: string }
  // Guest-to-host intent signals (host processes, then broadcasts next_question/round_end)
  | { type: 'guest_correct' }
  | { type: 'guest_pass' }
  | { type: 'duel_close' }
  | { type: 'next_question'; questionId: string; active: MPActivePlayer; timerHost: number; timerGuest: number }
  | { type: 'round_end';     winner: MPActivePlayer | 'draw'; tileIdx: number; hostScore: number; guestScore: number }
  | { type: 'feedback';      text: string; feedbackType: 'correct' | 'pass' | 'timeout' | 'voice' }
  | { type: 'game_start' }
  | { type: 'game_end' }
  | { type: 'chat_message';  from: string; text: string; ts: number }
  | { type: 'game_settings'; duelTime: number; categoriesCount: number; gameMode: string; passPenalty: number }
  | { type: 'opponent_name'; name: string; avatar: string }
  | { type: 'opponent_left' }   // one player left — other should exit to lobby
