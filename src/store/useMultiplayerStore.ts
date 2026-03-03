// src/store/useMultiplayerStore.ts — ZAKTUALIZOWANY
// Używa typów z types.ts i helperów z lib/realtime.ts

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { subscribeToRoom } from '../lib/realtime'
import {
  MPGamePhase,
  MPGameState,
  MPQuestion,
  MPTile,
  MPTileOwner,
  RoomConfig,
  UserProfile,
} from '../types'

// ── Re-eksporty dla wstecznej kompatybilności ─────────────────
export type { MPGameState as GameState, MPGamePhase as GamePhase, MPTile, MPQuestion }
export type TileOwner = MPTileOwner

// ── Typy lokalne ──────────────────────────────────────────────

export interface RoomInfo {
  id: string
  code: string
  hostId: string
  guestId: string
  config: RoomConfig
}

export interface PlayerInfo {
  id: string
  username: string
  avatar: string
  xp: number
  wins: number
  losses: number
}

// ── Helpery ───────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const BOARD_PRESETS: Record<number, { cols: number; rows: number }> = {
  0: { cols: 4, rows: 3 },
  1: { cols: 6, rows: 2 },
  2: { cols: 3, rows: 4 },
  3: { cols: 4, rows: 4 },
  4: { cols: 5, rows: 3 },
  5: { cols: 6, rows: 4 },
}

export function buildInitialGameState(
  categories: any[],
  config: RoomConfig,
): MPGameState {
  const preset = BOARD_PRESETS[config.board_shape ?? 0] ?? BOARD_PRESETS[0]
  const total  = preset.cols * preset.rows

  const shuffledCats = shuffle(categories)
  const tiles: MPTile[] = Array.from({ length: total }, (_, i) => {
    const cat = shuffledCats[i % Math.max(shuffledCats.length, 1)]
    return {
      idx: i,
      categoryId: cat?.id ?? '',
      categoryName: cat?.name ?? 'Kategoria',
      emoji: cat?.emoji ?? '🎯',
      owner: null,
    }
  })

  return {
    phase: 'countdown',
    tiles,
    currentTurn: 'host',
    selectedTileIdx: null,
    currentQuestion: null,
    usedQuestionIds: [],
    round: 1,
    totalRounds: config.rounds ?? 5,
    hostScore: 0,
    guestScore: 0,
    duelTimer: config.duel_time ?? 45,
    hostAnswered: false,
    guestAnswered: false,
    roundWinner: null,
    winner: null,
    startedAt: Date.now(),
  }
}

// ── Store interface ────────────────────────────────────────────

interface MPStore {
  room: RoomInfo | null
  gameState: MPGameState | null
  myRole: 'host' | 'guest' | null
  me: PlayerInfo | null
  opponent: PlayerInfo | null
  categories: any[]
  cleanupFn: (() => void) | null
  imageUrl: string

  initGame: (roomId: string, myProfile: UserProfile) => Promise<void>
  selectTile: (tileIdx: number) => Promise<void>
  submitAnswer: (correct: boolean) => Promise<void>
  syncGameState: (newState: MPGameState) => Promise<void>
  loadQuestionImage: (imagePath: string) => void
  cleanup: () => void
}

// ── Store ──────────────────────────────────────────────────────

export const useMultiplayerStore = create<MPStore>((set, get) => ({
  room: null,
  gameState: null,
  myRole: null,
  me: null,
  opponent: null,
  categories: [],
  cleanupFn: null,
  imageUrl: '',

  // ── Inicjalizacja gry ─────────────────────────────────────
  initGame: async (roomId, myProfile) => {
    // 1. Pobierz dane pokoju
    const { data: roomData } = await supabase
      .from('game_rooms').select('*').eq('id', roomId).single()
    if (!roomData) return

    const room: RoomInfo = {
      id: roomData.id, code: roomData.code,
      hostId: roomData.host_id, guestId: roomData.guest_id,
      config: roomData.config as RoomConfig,
    }

    const myRole: 'host' | 'guest' =
      myProfile.id === room.hostId ? 'host' : 'guest'
    const opponentId = myRole === 'host' ? room.guestId : room.hostId

    // 2. Pobierz profil przeciwnika
    const { data: oppData } = await supabase
      .from('profiles')
      .select('id, username, avatar, xp, wins, losses')
      .eq('id', opponentId).single()

    const me: PlayerInfo = {
      id: myProfile.id, username: myProfile.username,
      avatar: myProfile.avatar, xp: myProfile.xp,
      wins: myProfile.wins, losses: myProfile.losses,
    }

    // 3. Pobierz kategorie z pytaniami
    const { data: cats } = await supabase
      .from('categories')
      .select('id, name, emoji, lang, questions(id, answer, synonyms, image_path)')
      .order('created_at')
    const categories = cats ?? []

    set({ room, myRole, me, opponent: oppData as PlayerInfo, categories })

    // 4. Ustal stan gry — host tworzy, guest odbiera
    let gameState: MPGameState
    if (roomData.game_state) {
      gameState = roomData.game_state as MPGameState
    } else if (myRole === 'host') {
      gameState = buildInitialGameState(categories, room.config)
      await supabase.from('game_rooms')
        .update({ game_state: gameState }).eq('id', roomId)
    } else {
      // Guest czeka krótko na game_state od hosta
      await new Promise(r => setTimeout(r, 1200))
      const { data: fresh } = await supabase
        .from('game_rooms').select('game_state').eq('id', roomId).single()
      gameState = (fresh?.game_state as MPGameState)
        ?? buildInitialGameState(categories, room.config)
    }
    set({ gameState })

    // 5. Subskrybuj Realtime
    const cleanup = subscribeToRoom(roomId, (newRoom) => {
      if (newRoom.game_state) {
        const gs = newRoom.game_state as MPGameState
        set({ gameState: gs })
        if (gs.phase === 'duel' && gs.currentQuestion?.image_path) {
          get().loadQuestionImage(gs.currentQuestion.image_path)
        }
      }
    })
    set({ cleanupFn: cleanup })

    // 6. Host uruchamia odliczanie po 300ms
    if (myRole === 'host') {
      setTimeout(async () => {
        const updated = { ...get().gameState!, phase: 'select_tile' as MPGamePhase }
        await get().syncGameState(updated)
      }, 3000)
    }
  },

  // ── Wybór kafelka ─────────────────────────────────────────
  selectTile: async (tileIdx) => {
    const { gameState, myRole, room, categories } = get()
    if (!gameState || !room) return
    if (gameState.phase !== 'select_tile') return
    if (gameState.currentTurn !== myRole) return
    if (gameState.tiles[tileIdx]?.owner !== null) return

    const tile = gameState.tiles[tileIdx]
    const cat  = categories.find((c: any) => c.id === tile.categoryId)
    if (!cat?.questions?.length) return

    const available = cat.questions.filter(
      (q: any) => !gameState.usedQuestionIds.includes(q.id)
    )
    const pool = available.length > 0 ? available : cat.questions
    const q    = pool[Math.floor(Math.random() * pool.length)]

    const question: MPQuestion = {
      id: q.id, answer: q.answer,
      synonyms: q.synonyms ?? [],
      image_path: q.image_path ?? null,
      categoryName: tile.categoryName,
      emoji: tile.emoji,
    }

    const updated: MPGameState = {
      ...gameState,
      phase: 'duel',
      selectedTileIdx: tileIdx,
      currentQuestion: question,
      usedQuestionIds: [...gameState.usedQuestionIds, q.id],
      duelTimer: room.config.duel_time ?? 45,
      hostAnswered: false,
      guestAnswered: false,
      roundWinner: null,
    }

    await get().syncGameState(updated)
    if (q.image_path) get().loadQuestionImage(q.image_path)
  },

  // ── Odpowiedź gracza ──────────────────────────────────────
  submitAnswer: async (correct) => {
    const { gameState, myRole } = get()
    if (!gameState || gameState.phase !== 'duel') return

    const isHost   = myRole === 'host'
    const answered = isHost ? gameState.hostAnswered : gameState.guestAnswered
    if (answered) return

    let updated = { ...gameState }
    if (isHost)   { updated.hostAnswered  = true; if (correct) updated.roundWinner = 'host'  }
    else          { updated.guestAnswered = true; if (correct) updated.roundWinner = 'guest' }

    const bothAnswered = updated.hostAnswered && updated.guestAnswered
    const someoneWon   = updated.roundWinner !== null

    if (someoneWon || bothAnswered) {
      updated = resolveRound(updated)
    }

    await get().syncGameState(updated)
  },

  // ── Synchronizacja stanu ──────────────────────────────────
  syncGameState: async (newState) => {
    const { room } = get()
    if (!room) return
    set({ gameState: newState })
    await supabase.from('game_rooms')
      .update({ game_state: newState, current_turn: newState.currentTurn })
      .eq('id', room.id)
  },

  // ── Ładowanie obrazka ─────────────────────────────────────
  loadQuestionImage: (imagePath) => {
    const url = supabase.storage.from('question-images').getPublicUrl(imagePath).data.publicUrl
    set({ imageUrl: url })
  },

  // ── Cleanup ───────────────────────────────────────────────
  cleanup: () => {
    const { cleanupFn } = get()
    if (cleanupFn) cleanupFn()
    set({ room: null, gameState: null, channel: null, myRole: null, imageUrl: '', cleanupFn: null })
  },
}))

// ── Czysta funkcja resolveRound (poza store) ──────────────────

function resolveRound(state: MPGameState): MPGameState {
  const winner   = state.roundWinner
  const tileIdx  = state.selectedTileIdx

  const tiles = state.tiles.map((t, i) => {
    if (i === tileIdx && winner && winner !== 'draw') {
      return { ...t, owner: winner as MPTileOwner }
    }
    return t
  })

  let hostScore  = state.hostScore
  let guestScore = state.guestScore
  if (winner === 'host')  hostScore++
  else if (winner === 'guest') guestScore++

  const nextRound   = state.round + 1
  const allOwned    = tiles.every(t => t.owner !== null)
  const isGameOver  = nextRound > state.totalRounds || allOwned

  let gameWinner: MPGameState['winner'] = null
  if (isGameOver) {
    const h = tiles.filter(t => t.owner === 'host').length
    const g = tiles.filter(t => t.owner === 'guest').length
    gameWinner = h > g ? 'host' : h < g ? 'guest' : 'draw'
  }

  const nextTurn: 'host' | 'guest' =
    state.currentTurn === 'host' ? 'guest' : 'host'

  return {
    ...state, tiles, hostScore, guestScore,
    phase:         isGameOver ? 'game_over' : 'round_end',
    round:         isGameOver ? state.round : nextRound,
    currentTurn:   nextTurn,
    selectedTileIdx: null,
    roundWinner:   winner ?? 'draw',
    winner:        gameWinner,
  }
}
