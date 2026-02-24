export interface GameConfig {
  GRID_COLS: number
  GRID_ROWS: number
  TILE_SIZE: number
  DUEL_TIME: number
  PASS_PENALTY: number
  FEEDBACK_MS: number
  WIN_CLOSE_MS: number
  TOAST_MS: number
}

export interface Category {
  id: string
  name: string
  emoji: string
  created_at: string
}

export interface Question {
  id: string
  category_id: string
  image_path: string | null
  answer: string
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
}
