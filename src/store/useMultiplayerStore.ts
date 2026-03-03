// src/store/useMultiplayerStore.ts
// Architektura: BROADCAST-FIRST
//   - Zdarzenia gry przez Supabase Realtime broadcast (natychmiastowe)
//   - DB używana tylko do inicjalizacji i zapisu końcowego
//   - Zero race condition: każdy gracz broadcast swój wynik, oba klienty liczą deterministycznie

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { UserProfile } from '../types'

// ── Typy ─────────────────────────────────────────────────────────────────────

export type MPGamePhase = 'countdown' | 'select_tile' | 'duel' | 'round_end' | 'game_over'
export type MPTileOwner = 'host' | 'guest' | null

export interface MPTile {
  idx: number
  categoryId: string
  categoryName: string
  emoji: string
  owner: MPTileOwner
}

export interface MPQuestion {
  id: string
  answer: string
  synonyms: string[]
  image_path: string | null
  categoryName: string
  emoji: string
  lang: string
}

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

// Re-eksport dla kompatybilności
export type { MPGameState as GameState, MPGamePhase as GamePhase }

export interface RoomInfo {
  id: string; code: string
  hostId: string; guestId: string
  config: { rounds: number; duel_time: number; board_shape: number }
}

export interface PlayerInfo {
  id: string; username: string; avatar: string; xp: number; wins: number; losses: number
}

// ── Zdarzenia broadcast ───────────────────────────────────────────────────────

type BroadcastEvent =
  | { type: 'state_sync';   payload: MPGameState }
  | { type: 'answer';       payload: { role: 'host' | 'guest'; correct: boolean } }
  | { type: 'tile_select';  payload: { tileIdx: number; question: MPQuestion; duelTimer: number } }

// ── Helperki ─────────────────────────────────────────────────────────────────

const BOARD_PRESETS: Record<number, { cols: number; rows: number }> = {
  0: { cols: 4, rows: 3 }, 1: { cols: 6, rows: 2 }, 2: { cols: 3, rows: 4 },
  3: { cols: 4, rows: 4 }, 4: { cols: 5, rows: 3 }, 5: { cols: 6, rows: 4 },
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildInitialGameState(cats: any[], config: RoomInfo['config']): MPGameState {
  const preset = BOARD_PRESETS[config.board_shape ?? 0] ?? BOARD_PRESETS[0]
  const total  = preset.cols * preset.rows
  const pool   = shuffle(cats)
  const tiles: MPTile[] = Array.from({ length: total }, (_, i) => {
    const cat = pool[i % Math.max(pool.length, 1)]
    return { idx: i, categoryId: cat?.id ?? '', categoryName: cat?.name ?? 'Kategoria', emoji: cat?.emoji ?? '🎯', owner: null }
  })
  return {
    phase: 'countdown', tiles,
    currentTurn: 'host', selectedTileIdx: null, currentQuestion: null,
    usedQuestionIds: [], round: 1, totalRounds: config.rounds ?? 5,
    hostScore: 0, guestScore: 0, duelTimer: config.duel_time ?? 45,
    hostAnswered: false, guestAnswered: false, roundWinner: null, winner: null,
    startedAt: Date.now(),
  }
}

// ── Czysta funkcja resolveRound ───────────────────────────────────────────────

export function resolveRound(state: MPGameState): MPGameState {
  const winner  = state.roundWinner
  const tileIdx = state.selectedTileIdx
  const tiles   = state.tiles.map((t, i) => {
    if (i === tileIdx && winner && winner !== 'draw') return { ...t, owner: winner as MPTileOwner }
    return t
  })
  let { hostScore, guestScore } = state
  if (winner === 'host')  hostScore++
  else if (winner === 'guest') guestScore++

  const nextRound  = state.round + 1
  const allOwned   = tiles.every(t => t.owner !== null)
  const isGameOver = nextRound > state.totalRounds || allOwned

  let gameWinner: MPGameState['winner'] = null
  if (isGameOver) {
    const h = tiles.filter(t => t.owner === 'host').length
    const g = tiles.filter(t => t.owner === 'guest').length
    gameWinner = h > g ? 'host' : h < g ? 'guest' : 'draw'
  }

  return {
    ...state, tiles, hostScore, guestScore,
    phase: isGameOver ? 'game_over' : 'round_end',
    round: isGameOver ? state.round : nextRound,
    currentTurn: state.currentTurn === 'host' ? 'guest' : 'host',
    selectedTileIdx: null,
    roundWinner: winner ?? 'draw',
    winner: gameWinner,
    hostAnswered: false, guestAnswered: false, currentQuestion: null,
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface MPStore {
  room:       RoomInfo | null
  gameState:  MPGameState | null
  myRole:     'host' | 'guest' | null
  me:         PlayerInfo | null
  opponent:   PlayerInfo | null
  categories: any[]
  imageUrl:   string
  connected:  boolean

  initGame:       (roomId: string, profile: UserProfile) => Promise<void>
  selectTile:     (tileIdx: number) => Promise<void>
  submitAnswer:   (correct: boolean) => void
  pass:           () => void
  continueAfterRound: () => Promise<void>
  loadImage:      (path: string) => void
  cleanup:        () => void
  _channel:       ReturnType<typeof supabase.channel> | null
  _pollInterval:  ReturnType<typeof setInterval> | null
}

export const useMultiplayerStore = create<MPStore>((set, get) => ({
  room: null, gameState: null, myRole: null, me: null,
  opponent: null, categories: [], imageUrl: '', connected: false,
  _channel: null, _pollInterval: null,

  // ── Inicjalizacja ──────────────────────────────────────────────────────────
  initGame: async (roomId, profile) => {
    // Wyczyść poprzednią sesję
    get().cleanup()

    // 1. Pobierz dane pokoju
    const { data: roomData } = await supabase
      .from('game_rooms').select('*').eq('id', roomId).single()
    if (!roomData) return

    const room: RoomInfo = {
      id: roomData.id, code: roomData.code,
      hostId: roomData.host_id, guestId: roomData.guest_id,
      config: roomData.config,
    }
    const myRole: 'host' | 'guest' = profile.id === room.hostId ? 'host' : 'guest'
    const opponentId = myRole === 'host' ? room.guestId : room.hostId

    // 2. Pobierz dane graczy i kategorie równolegle
    const [{ data: oppData }, { data: cats }] = await Promise.all([
      supabase.from('profiles').select('id,username,avatar,xp,wins,losses').eq('id', opponentId).single(),
      supabase.from('categories').select('id,name,emoji,lang,questions(id,answer,synonyms,image_path)').order('created_at'),
    ])
    const categories = cats ?? []

    const me: PlayerInfo = {
      id: profile.id, username: profile.username, avatar: profile.avatar,
      xp: profile.xp, wins: profile.wins, losses: profile.losses,
    }

    set({ room, myRole, me, opponent: oppData as PlayerInfo, categories })

    // 3. Subskrybuj kanał broadcast (unikalny per-room)
    const channelName = `game_broadcast_${roomId}`
    const channel = supabase.channel(channelName, { config: { broadcast: { self: false } } })

    channel
      .on('broadcast', { event: 'state_sync' }, ({ payload }: { payload: MPGameState }) => {
        set({ gameState: payload })
        if (payload.phase === 'duel' && payload.currentQuestion?.image_path) {
          get().loadImage(payload.currentQuestion.image_path)
        }
      })
      .on('broadcast', { event: 'tile_select' }, ({ payload }: { payload: { tileIdx: number; question: MPQuestion; duelTimer: number } }) => {
        // Gość odbiera wybór kafelka od hosta
        const gs = get().gameState
        if (!gs) return
        const updated: MPGameState = {
          ...gs,
          phase: 'duel',
          selectedTileIdx: payload.tileIdx,
          currentQuestion: payload.question,
          duelTimer: payload.duelTimer,
          hostAnswered: false, guestAnswered: false, roundWinner: null,
        }
        set({ gameState: updated })
        if (payload.question.image_path) get().loadImage(payload.question.image_path)
      })
      .on('broadcast', { event: 'answer' }, ({ payload }: { payload: { role: 'host' | 'guest'; correct: boolean } }) => {
        // Odbieramy odpowiedź przeciwnika — obliczamy wynik lokalnie (deterministycznie)
        const { gameState, myRole } = get()
        if (!gameState || gameState.phase !== 'duel') return
        // Ignoruj własną odpowiedź (self: false, ale to zabezpieczenie)
        if (payload.role === myRole) return

        let updated = { ...gameState }
        if (payload.role === 'host') {
          updated.hostAnswered = true
          if (payload.correct && !updated.roundWinner) updated.roundWinner = 'host'
        } else {
          updated.guestAnswered = true
          if (payload.correct && !updated.roundWinner) updated.roundWinner = 'guest'
        }

        const bothAnswered = updated.hostAnswered && updated.guestAnswered
        const someoneWon   = !!updated.roundWinner
        if (someoneWon || bothAnswered) {
          if (!updated.roundWinner) updated.roundWinner = 'draw'
          updated = resolveRound(updated)
        }
        set({ gameState: updated })
      })
      .subscribe((status) => {
        set({ connected: status === 'SUBSCRIBED' })
      })

    set({ _channel: channel })

    // 4. Polling jako fallback (co 3s) — synchronizuje game_state z DB jeśli broadcast nie działa
    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('game_rooms').select('game_state').eq('id', roomId).single()
      if (data?.game_state) {
        const dbState = data.game_state as MPGameState
        const current = get().gameState
        // Przyjmuj tylko jeśli DB ma nowszy stan (więcej rund lub inną fazę)
        if (!current || dbState.round > current.round ||
           (dbState.phase === 'game_over' && current.phase !== 'game_over')) {
          set({ gameState: dbState })
        }
      }
    }, 3000)
    set({ _pollInterval: pollInterval })

    // 5. Ustal stan początkowy
    let gameState: MPGameState
    if (roomData.game_state && (roomData.game_state as MPGameState).phase !== 'countdown') {
      // Gra już trwa — odtwórz z DB
      gameState = roomData.game_state as MPGameState
    } else if (myRole === 'host') {
      // Host tworzy stan i zapisuje do DB
      gameState = buildInitialGameState(categories, room.config)
      await supabase.from('game_rooms').update({ game_state: gameState }).eq('id', roomId)
      // Czekaj aż kanał się połączy potem broadcast
      setTimeout(async () => {
        const ch = get()._channel
        if (ch) {
          await ch.send({ type: 'broadcast', event: 'state_sync', payload: get().gameState })
        }
        // Odliczanie → select_tile po 3s
        setTimeout(async () => {
          const gs = get().gameState
          if (!gs) return
          const next = { ...gs, phase: 'select_tile' as MPGamePhase }
          set({ gameState: next })
          await supabase.from('game_rooms').update({ game_state: next }).eq('id', roomId)
          const ch2 = get()._channel
          if (ch2) await ch2.send({ type: 'broadcast', event: 'state_sync', payload: next })
        }, 3200)
      }, 800)
    } else {
      // Gość: pobierz stan od hosta lub poczekaj
      let attempts = 0
      while (attempts < 8) {
        await new Promise(r => setTimeout(r, 600))
        const { data: fresh } = await supabase.from('game_rooms').select('game_state').eq('id', roomId).single()
        if (fresh?.game_state) { gameState = fresh.game_state as MPGameState; break }
        attempts++
      }
      gameState = gameState! ?? buildInitialGameState(categories, room.config)
    }
    set({ gameState })
    if (gameState.phase === 'duel' && gameState.currentQuestion?.image_path) {
      get().loadImage(gameState.currentQuestion.image_path)
    }
  },

  // ── Wybór kafelka (tylko aktywny gracz) ───────────────────────────────────
  selectTile: async (tileIdx) => {
    const { gameState, myRole, room, categories, _channel } = get()
    if (!gameState || !room) return
    if (gameState.phase !== 'select_tile') return
    if (gameState.currentTurn !== myRole) return
    if (gameState.tiles[tileIdx]?.owner !== null) return

    const tile = gameState.tiles[tileIdx]
    const cat  = categories.find((c: any) => c.id === tile.categoryId)
    if (!cat?.questions?.length) return

    const available = cat.questions.filter((q: any) => !gameState.usedQuestionIds.includes(q.id))
    const pool = available.length > 0 ? available : cat.questions
    const q    = pool[Math.floor(Math.random() * pool.length)]

    const question: MPQuestion = {
      id: q.id, answer: q.answer, synonyms: q.synonyms ?? [],
      image_path: q.image_path ?? null,
      categoryName: tile.categoryName, emoji: tile.emoji,
      lang: cat.lang ?? 'pl-PL',
    }

    const updated: MPGameState = {
      ...gameState, phase: 'duel', selectedTileIdx: tileIdx,
      currentQuestion: question, duelTimer: room.config.duel_time ?? 45,
      hostAnswered: false, guestAnswered: false, roundWinner: null,
      usedQuestionIds: [...gameState.usedQuestionIds, q.id],
    }
    set({ gameState: updated })
    if (q.image_path) get().loadImage(q.image_path)

    // Broadcast do przeciwnika przez dedykowane zdarzenie (szybsze niż state_sync)
    if (_channel) {
      await _channel.send({
        type: 'broadcast', event: 'tile_select',
        payload: { tileIdx, question, duelTimer: room.config.duel_time ?? 45 },
      })
    }
    // Zapisz do DB (backup)
    await supabase.from('game_rooms').update({ game_state: updated }).eq('id', room.id)
  },

  // ── Odpowiedź gracza ──────────────────────────────────────────────────────
  submitAnswer: (correct) => {
    const { gameState, myRole, room, _channel } = get()
    if (!gameState || gameState.phase !== 'duel' || !myRole) return
    const alreadyAnswered = myRole === 'host' ? gameState.hostAnswered : gameState.guestAnswered
    if (alreadyAnswered) return

    // Lokalna aktualizacja stanu
    let updated = { ...gameState }
    if (myRole === 'host') {
      updated.hostAnswered = true
      if (correct && !updated.roundWinner) updated.roundWinner = 'host'
    } else {
      updated.guestAnswered = true
      if (correct && !updated.roundWinner) updated.roundWinner = 'guest'
    }

    const bothAnswered = updated.hostAnswered && updated.guestAnswered
    const someoneWon   = !!updated.roundWinner

    if (someoneWon || bothAnswered) {
      if (!updated.roundWinner) updated.roundWinner = 'draw'
      updated = resolveRound(updated)
    }
    set({ gameState: updated })

    // Broadcast odpowiedzi do przeciwnika (nie czekamy na async)
    if (_channel) {
      _channel.send({
        type: 'broadcast', event: 'answer',
        payload: { role: myRole, correct },
      }).catch(console.warn)
    }

    // Jeśli runda się zakończyła — zapisz do DB
    if (updated.phase !== 'duel' && room) {
      supabase.from('game_rooms')
        .update({ game_state: updated })
        .eq('id', room.id)
        .then()
        .catch(console.warn)
    }
  },

  // ── Pas (timeout lub ręczny) ──────────────────────────────────────────────
  pass: () => {
    get().submitAnswer(false)
  },

  // ── Kontynuuj po rundzie ──────────────────────────────────────────────────
  continueAfterRound: async () => {
    const { gameState, room, _channel, myRole } = get()
    if (!gameState || gameState.phase !== 'round_end') return
    const next = { ...gameState, phase: 'select_tile' as MPGamePhase, roundWinner: null }
    set({ gameState: next })

    // Tylko aktywny gracz (currentTurn) broadcast'uje przejście
    if (myRole === gameState.currentTurn && _channel) {
      await _channel.send({ type: 'broadcast', event: 'state_sync', payload: next })
      if (room) await supabase.from('game_rooms').update({ game_state: next }).eq('id', room.id)
    }
  },

  // ── Ładowanie obrazka ─────────────────────────────────────────────────────
  loadImage: (path) => {
    const url = supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl
    set({ imageUrl: url })
  },

  // ── Cleanup ───────────────────────────────────────────────────────────────
  cleanup: () => {
    const { _channel, _pollInterval } = get()
    if (_channel)      supabase.removeChannel(_channel).catch(() => {})
    if (_pollInterval) clearInterval(_pollInterval)
    set({ room: null, gameState: null, myRole: null, me: null, opponent: null,
          categories: [], imageUrl: '', connected: false, _channel: null, _pollInterval: null })
  },
}))
