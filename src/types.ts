// ─────────────────────────────────────────────────────────────────────────────
// types.ts — Centralne typy całej aplikacji
//
// NOWE POLA:
//   MUSIC_VOLUME   — osobna głośność muzyki tła (0–100)
//   SFX_VOLUME     — osobna głośność efektów dźwiękowych (0–100)
//   VOICE_PASS     — 0 = głosowy "pas" wyłączony (tylko klawiatura), 1 = włączony
//   MAX_PASSES     — 0 = nielimitowany, N = max pasów na pojedynek zanim forfeit
//   SHOW_ANSWER_HINT — 0 = nie, 1 = pokaż pierwszą literę po 10s
//   ROUND_TIMER    — 0 = normalny, 1 = limit rund (MAX_ROUNDS)
//   MAX_ROUNDS     — maks. rund przy ROUND_TIMER=1
//   TILE_FLIP_ANIM — 0 = brak, 1 = animacja flip przy zmianie właściciela
//   SOUND_VOLUME   — (zachowane dla wstecznej kompatybilności, master fallback)
// ─────────────────────────────────────────────────────────────────────────────

export interface GameConfig {
  // ── Plansza ──────────────────────────────────────────────────────────────
  GRID_COLS:   number   // legacy (override)
  GRID_ROWS:   number   // legacy (override)
  TILE_SIZE:   number
  BOARD_SHAPE: number   // 0=4×3, 1=6×2, 2=3×4, 3=4×4, 4=5×3, 5=6×4

  // ── Rozgrywka ─────────────────────────────────────────────────────────────
  DUEL_TIME:    number   // czas każdego gracza (s)
  PASS_PENALTY: number   // kara za pas (s)
  FEEDBACK_MS:  number   // czas wyświetlania odpowiedzi (ms)
  WIN_CLOSE_MS: number   // auto-zamknięcie popupu wygranej (ms)
  TOAST_MS:     number   // czas toastów (ms)
  RANDOM_TILES: number   // 0 = kolejność, 1 = losowe przypisanie kategorii
  MAX_PASSES:   number   // 0 = bez limitu, N = maks. pasów na pojedynek

  // ── Dźwięk ───────────────────────────────────────────────────────────────
  SOUND_VOLUME:  number  // master fallback (0–100)
  MUSIC_VOLUME:  number  // głośność muzyki tła (0–100)
  SFX_VOLUME:    number  // głośność efektów (0–100)

  // ── Rozpoznawanie mowy ────────────────────────────────────────────────────
  VOICE_PASS:   number   // 0 = wyłączone (tylko klawiatura), 1 = włączone

  // ── Wyświetlanie ──────────────────────────────────────────────────────────
  SHOW_STATS:       number  // 0 = ukryte domyślnie, 1 = widoczne
  SHOW_ANSWER_HINT: number  // 0 = nie, 1 = pierwsza litera po 10s
  TILE_FLIP_ANIM:   number  // 0 = brak, 1 = animacja flip (przyszłe)

  // ── Timer rund ────────────────────────────────────────────────────────────
  ROUND_TIMER: number  // 0 = normalny tryb, 1 = tryb rund (przyszłe)
  MAX_ROUNDS:  number  // maks. rund przy ROUND_TIMER=1 (przyszłe)
}

export interface PlayerSettings {
  name:  string
  color: string
}

export type SpeechLang = 'pl-PL' | 'en-US' | 'both'

export interface Category {
  id:         string
  name:       string
  emoji:      string
  lang:       SpeechLang
  created_at: string
}

export interface Question {
  id:          string
  category_id: string
  image_path:  string | null
  answer:      string
  synonyms:    string[]
  created_at:  string
}

export type TileOwner = 'gold' | 'silver'

export interface Tile {
  x:            number
  y:            number
  categoryId:   string
  categoryName: string
  owner:        TileOwner
}

export interface DuelState {
  tileIdx:         number
  categoryId:      string
  categoryName:    string
  emoji:           string
  questions:       Question[]
  usedIds:         Set<string>
  timer1:          number
  timer2:          number
  active:          1 | 2
  paused:          boolean
  started:         boolean
  currentQuestion: Question | null
  lang:            SpeechLang
  passCount:       number   // licznik pasów (dla MAX_PASSES)
}

export interface GameStats {
  goldTiles:   number
  silverTiles: number
  totalTiles:  number
  goldPct:     number
  silverPct:   number
}

// ─────────────────────────────────────────────────────────────────────────────
// Future Feature Scaffolding
// Interfejsy przygotowane pod rozbudowę — nieużywane w bieżącej wersji.
// Oznaczone @future — nie importuj ich bezpośrednio, dopóki funkcja nie jest gotowa.
// ─────────────────────────────────────────────────────────────────────────────

/** @future — historia rund/gier */
export interface GameRound {
  roundId:    string
  tileIdx:    number
  winnerId:   'gold' | 'silver' | 'draw'
  duration:   number       // ms
  passCount:  number
  timestamp:  number
}

/** @future — statystyki sesji */
export interface GameSession {
  sessionId:  string
  startedAt:  number
  rounds:     GameRound[]
  finalScore: { gold: number; silver: number }
}

/** @future — feature flags (bez przebudowy typów) */
export interface FeatureFlags {
  MULTIPLAYER_ONLINE: boolean    // Gra online w czasie rzeczywistym
  GAME_HISTORY:       boolean    // Historia i statystyki gier
  VISUAL_THEMES:      boolean    // Motywy wizualne
  ROUND_MODE:         boolean    // Tryb rund z limitem
  POWER_UPS:          boolean    // Specjalne umiejętności graczy
  LEADERBOARD:        boolean    // Tablica wyników
}

export const FEATURE_FLAGS_DEFAULT: FeatureFlags = {
  MULTIPLAYER_ONLINE: false,
  GAME_HISTORY:       false,
  VISUAL_THEMES:      false,
  ROUND_MODE:         false,
  POWER_UPS:          false,
  LEADERBOARD:        false,
}
