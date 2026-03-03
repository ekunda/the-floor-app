/**
 * useMultiplayerStore — state & logic for online multiplayer
 *
 * Architecture:
 *  - game_rooms table stores persistent state (tiles, duel, scores)
 *  - Supabase Realtime channel broadcasts real-time events between players
 *  - Host is authoritative: runs timer, sends ticks, decides state transitions
 *  - Guest receives events and reflects state changes
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import {
  Category, MPActivePlayer, MPDuelState, MPEvent,
  MPGameState, MPRole, MPStatus, Question,
  SpeechLang, Tile, TileOwner,
} from '../types'
import { BOARD_PRESETS, useConfigStore } from './useConfigStore'

// ── Module-level timer refs ────────────────────────────────────────────────────
let tickerInterval: ReturnType<typeof setInterval> | null = null
let cursorDebounce: ReturnType<typeof setTimeout> | null = null

// ── Local player identity ────────────────────────────────────────────────────
const PLAYER_KEY = 'mp_player_id'
const NAME_KEY   = 'mp_player_name'

export function getLocalPlayerId(): string {
  let id = localStorage.getItem(PLAYER_KEY)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(PLAYER_KEY, id) }
  return id
}
export function getLocalPlayerName(): string {
  return localStorage.getItem(NAME_KEY) ?? 'GRACZ'
}
export function setLocalPlayerName(name: string) {
  localStorage.setItem(NAME_KEY, name)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export function getCatEmoji(name: string, customEmoji?: string): string {
  if (customEmoji && customEmoji !== '🎯') return customEmoji
  return '🎯'
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type FeedbackType = 'correct' | 'pass' | 'timeout' | 'voice' | ''

export interface MPStore {
  playerId: string
  playerName: string
  roomId: string | null
  roomCode: string | null
  role: MPRole | null
  status: MPStatus
  opponentId: string | null
  opponentName: string | null
  hostScore: number
  guestScore: number
  categories: (Category & { questions: Question[] })[]
  tiles: Tile[]
  cursor: number
  gridCols: number
  gridRows: number
  duel: MPDuelState | null
  currentQuestion: Question | null
  blockInput: boolean
  feedback: { text: string; type: FeedbackType }
  feedbackTimer: ReturnType<typeof setTimeout> | null
  winner: MPActivePlayer | 'draw' | null
  countdown: string | null
  error: string | null
  toastText: string
  showStats: boolean
  channel: ReturnType<typeof supabase.channel> | null
  chatMessages: { from: string; text: string; ts: number }[]
  gameSettings: { rounds: number; duelTime: number; categoriesCount: number }

  setPlayerName: (name: string) => void
  loadCategories: () => Promise<void>
  createRoom: () => Promise<string | null>
  joinRoom: (code: string) => Promise<boolean>
  leaveRoom: () => Promise<void>
  moveCursor: (dir: 'up' | 'down' | 'left' | 'right') => void
  startChallenge: () => void
  startFight: () => void
  markCorrect: () => void
  pass: () => void
  closeDuel: () => void
  showFeedback: (text: string, type: FeedbackType) => void
  showToast: (text: string) => void
  _broadcastEvent: (event: MPEvent) => void
  sendChatMessage: (text: string) => void
  updateGameSettings: (s: Partial<{ rounds: number; duelTime: number; categoriesCount: number }>) => void
}

// ── Store factory ─────────────────────────────────────────────────────────────
export const useMultiplayerStore = create<MPStore>((set, get) => {

  // ── Closures: internal helpers ─────────────────────────────────────────────

  function buildTiles(cats: (Category & { questions: Question[] })[]): { tiles: Tile[]; cols: number; rows: number } {
    const cfg = useConfigStore.getState().config
    const preset = BOARD_PRESETS[cfg.BOARD_SHAPE] ?? BOARD_PRESETS[0]
    const { cols, rows } = preset
    const pool = shuffle(cats)
    const tiles: Tile[] = Array.from({ length: cols * rows }, (_, i) => {
      const cat = pool[i % Math.max(pool.length, 1)]
      const x = i % cols
      const y = Math.floor(i / cols)
      const owner: TileOwner = x < cols / 2 ? 'gold' : 'silver'
      return { x, y, categoryId: cat?.id ?? '', categoryName: cat?.name ?? 'Kategoria', owner }
    })
    return { tiles, cols, rows }
  }

  function resolveQ(qId: string): Question | null {
    for (const cat of get().categories) {
      const q = cat.questions.find(q => q.id === qId)
      if (q) return q
    }
    return null
  }

  function pickNext(duel: MPDuelState): { questionId: string; usedIds: string[] } {
    const cat = get().categories.find(c => c.id === duel.categoryId)
    const qs  = cat?.questions ?? []
    let used  = [...duel.usedQuestionIds]
    if (used.length >= qs.length) used = []
    const avail = qs.filter(q => !used.includes(q.id))
    const pool  = avail.length > 0 ? avail : qs
    const q     = pool[Math.floor(Math.random() * pool.length)]
    if (q) used.push(q.id)
    return { questionId: q?.id ?? '', usedIds: used }
  }

  function broadcast(event: MPEvent) {
    get().channel?.send({ type: 'broadcast', event: 'game', payload: event })
  }

  async function writeDB(patch: {
    tiles?: Tile[]; cursor?: number; duel?: MPDuelState | null
    host_score?: number; guest_score?: number; status?: string
  }) {
    const { roomId } = get()
    if (!roomId) return
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.tiles !== undefined || patch.cursor !== undefined || patch.duel !== undefined) {
      upd.game_state = {
        tiles:  patch.tiles  !== undefined ? patch.tiles  : get().tiles,
        cursor: patch.cursor !== undefined ? patch.cursor : get().cursor,
        duel:   patch.duel   !== undefined ? patch.duel   : get().duel,
      }
    }
    if (patch.host_score  !== undefined) upd.host_score  = patch.host_score
    if (patch.guest_score !== undefined) upd.guest_score = patch.guest_score
    if (patch.status      !== undefined) upd.status      = patch.status
    await supabase.from('game_rooms').update(upd).eq('id', roomId)
  }

  function stopTicker() {
    if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null }
  }

  function startTicker() {
    stopTicker()
    tickerInterval = setInterval(() => {
      const { duel, role } = get()
      if (!duel?.started || duel.paused || role !== 'host') { stopTicker(); return }
      const key   = duel.active === 'host' ? 'timerHost' : 'timerGuest'
      const newVal = Math.max(0, duel[key] - 1)
      const updated = { ...duel, [key]: newVal }
      set({ duel: updated })
      broadcast({ type: 'tick', timerHost: updated.timerHost, timerGuest: updated.timerGuest })
      if (newVal <= 0) { stopTicker(); set({ duel: { ...updated, paused: true } }); onTimeout(updated) }
    }, 1000)
  }

  function onTimeout(duel: MPDuelState) {
    const winner: MPActivePlayer = duel.active === 'host' ? 'guest' : 'host'
    get().showFeedback('⏰ Czas minął!', 'timeout')
    setTimeout(() => endRound(winner, duel), 1200)
  }

  function endRound(winner: MPActivePlayer | 'draw', duel: MPDuelState) {
    const { tiles, role } = get()
    const owner: TileOwner = winner === 'host' ? 'gold' : winner === 'guest' ? 'silver' : tiles[duel.tileIdx]?.owner ?? 'gold'
    const newTiles = tiles.map((t, i) => i === duel.tileIdx ? { ...t, owner } : t)
    set({ tiles: newTiles, winner })
    if (role === 'host') {
      const { hostScore, guestScore } = get()
      const hs = winner === 'host'  ? hostScore  + 1 : hostScore
      const gs = winner === 'guest' ? guestScore + 1 : guestScore
      set({ hostScore: hs, guestScore: gs })
      broadcast({ type: 'round_end', winner, tileIdx: duel.tileIdx, timerHost: duel.timerHost, timerGuest: duel.timerGuest })
      writeDB({ tiles: newTiles, cursor: get().cursor, duel: null, host_score: hs, guest_score: gs })
    }
  }

  function runCountdown() {
    [
      [0,   '3'], [1000, '2'], [2000, '1'], [3000, 'START!'],
    ].forEach(([delay, label]) => setTimeout(() => set({ countdown: label as string }), delay as number))
    setTimeout(() => {
      set({ countdown: null })
      const { duel } = get()
      if (!duel) return
      set({ duel: { ...duel, paused: false } })
      if (get().role === 'host') startTicker()
    }, 4300)
  }

  function localStartFight() {
    const { duel } = get()
    if (!duel) return
    set({ duel: { ...duel, started: true, active: 'host', paused: true }, countdown: null, winner: null })
    runCountdown()
  }

  function subscribeRoom(roomId: string) {
    const { channel: old } = get()
    if (old) old.unsubscribe()

    const ch = supabase.channel(`room:${roomId}`, { config: { broadcast: { self: false } } })

    ch.on('broadcast', { event: 'game' }, (pl) => onEvent(pl.payload as MPEvent))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}`,
      }, (pl) => {
        const room = pl.new as {
          guest_id: string | null; status: string; game_state: MPGameState | null
          host_score: number; guest_score: number
        }
        const { role, status } = get()

        // Host: guest joined
        if (role === 'host' && room.guest_id && status === 'waiting') {
          supabase.from('profiles').select('username').eq('id', room.guest_id).maybeSingle()
            .then(({ data }) => {
              set({
                status: 'playing', opponentId: room.guest_id!,
                opponentName: (data as { username: string } | null)?.username ?? 'GOŚĆ',
                hostScore: room.host_score ?? 0, guestScore: room.guest_score ?? 0,
              })
            })
        }

        // Guest: sync board state
        if (role === 'guest') {
          const gs = room.game_state
          if (gs?.tiles)              set({ tiles: gs.tiles })
          if (gs?.cursor !== undefined) set({ cursor: gs.cursor })
          set({
            hostScore:  room.host_score  ?? get().hostScore,
            guestScore: room.guest_score ?? get().guestScore,
          })
          if (room.status === 'finished') set({ status: 'finished' })
        }
      })
      .subscribe()

    set({ channel: ch })

    // Load opponent name for guest
    const { role, opponentId } = get()
    if (role === 'guest' && opponentId) {
      supabase.from('profiles').select('username').eq('id', opponentId).maybeSingle()
        .then(({ data }) => {
          set({ opponentName: (data as { username: string } | null)?.username ?? 'PRZECIWNIK' })
        })
    }
  }

  function onEvent(ev: MPEvent) {
    const { role } = get()

    switch (ev.type) {
      case 'cursor_move':
        set({ cursor: ev.idx })
        break

      case 'duel_start':
        if (role === 'guest') {
          const cfg = useConfigStore.getState().config
          const cat = get().categories.find(c => c.id === ev.categoryId)
          const q   = cat?.questions.find(q => q.id === ev.questionId) ?? null
          set({
            duel: {
              tileIdx: ev.tileIdx, categoryId: ev.categoryId,
              categoryName: ev.categoryName, emoji: ev.emoji,
              questionId: ev.questionId, usedQuestionIds: [ev.questionId],
              timerHost: cfg.DUEL_TIME, timerGuest: cfg.DUEL_TIME,
              active: 'host', started: false, paused: false, lang: ev.lang,
            },
            currentQuestion: q, winner: null, feedback: { text: '', type: '' },
          })
        }
        break

      case 'fight_start':
        if (role === 'guest') localStartFight()
        break

      case 'tick':
        if (role === 'guest') {
          const { duel } = get()
          if (duel) set({ duel: { ...duel, timerHost: ev.timerHost, timerGuest: ev.timerGuest } })
        }
        break

      case 'correct':
        if (role === 'guest') get().showFeedback(`✓ ${ev.answer}`, ev.player === 'guest' ? 'correct' : 'voice')
        break

      case 'pass':
        if (role === 'guest') get().showFeedback('⏱ PAS', 'pass')
        break

      case 'next_question':
        if (role === 'guest') {
          const { duel } = get()
          if (!duel) return
          set({
            duel: {
              ...duel, questionId: ev.questionId,
              usedQuestionIds: [...duel.usedQuestionIds, ev.questionId],
              active: ev.active, timerHost: ev.timerHost, timerGuest: ev.timerGuest, paused: false,
            },
            currentQuestion: resolveQ(ev.questionId), blockInput: false,
          })
        }
        break

      case 'round_end': {
        const { tiles } = get()
        const owner: TileOwner = ev.winner === 'host' ? 'gold' : ev.winner === 'guest' ? 'silver' : tiles[ev.tileIdx]?.owner ?? 'gold'
        const newTiles = tiles.map((t, i) => i === ev.tileIdx ? { ...t, owner } : t)
        set({ tiles: newTiles, winner: ev.winner })
        if (role === 'guest') {
          const { duel } = get()
          if (duel) set({ duel: { ...duel, timerHost: ev.timerHost, timerGuest: ev.timerGuest, paused: true } })
        }
        break
      }

      case 'duel_close':
        if (role === 'guest') {
          stopTicker()
          set({ duel: null, currentQuestion: null, winner: null, countdown: null, blockInput: false })
        }
        break

      case 'feedback':
        get().showFeedback(ev.text, ev.feedbackType)
        break

      case 'game_end':
        set({ status: 'finished' })
        break

      case 'chat_message':
        set(s => ({ chatMessages: [...s.chatMessages.slice(-99), { from: ev.from, text: ev.text, ts: ev.ts }] }))
        break

      case 'game_settings':
        set({ gameSettings: { rounds: ev.rounds, duelTime: ev.duelTime, categoriesCount: ev.categoriesCount } })
        break
    }
  }

  // ── Store return value ────────────────────────────────────────────────────────
  return {
    playerId: getLocalPlayerId(),
    playerName: getLocalPlayerName(),
    setPlayerName: (name) => { setLocalPlayerName(name); set({ playerName: name }) },

    roomId: null, roomCode: null, role: null, status: 'idle',
    opponentId: null, opponentName: null, hostScore: 0, guestScore: 0,
    categories: [], tiles: [], cursor: 0, gridCols: 4, gridRows: 3,
    duel: null, currentQuestion: null, blockInput: false,
    feedback: { text: '', type: '' }, feedbackTimer: null,
    winner: null, countdown: null, error: null, toastText: '', showStats: true,
    chatMessages: [],
    gameSettings: { rounds: 5, duelTime: 30, categoriesCount: 9 },
    channel: null,

    loadCategories: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name, emoji, lang, created_at, questions(id, category_id, image_path, answer, synonyms, created_at)')
        .order('created_at')
      const cats = (data ?? []).map((c: Record<string, unknown>) => ({
        ...c, lang: (c.lang as string) ?? 'pl-PL',
        questions: (Array.isArray(c.questions) ? c.questions : []).map((q: Record<string, unknown>) => ({
          ...q, synonyms: Array.isArray(q.synonyms) ? q.synonyms : [],
        })),
      })) as (Category & { questions: Question[] })[]
      set({ categories: cats })
    },

    createRoom: async () => {
      const { playerId, playerName } = get()
      set({ status: 'creating', error: null })
      await get().loadCategories()
      const { tiles, cols, rows } = buildTiles(get().categories)
      const cfg    = useConfigStore.getState().config
      const preset = BOARD_PRESETS[cfg.BOARD_SHAPE] ?? BOARD_PRESETS[0]
      const gs: MPGameState = { tiles, cursor: Math.floor(tiles.length / 2) - 1, duel: null }

      await supabase.from('profiles').insert({ id: playerId, username: playerName })

      let code = generateCode()
      for (let i = 0; i < 5; i++) {
        const { data: ex } = await supabase.from('game_rooms').select('id').eq('code', code).limit(1).maybeSingle()
        if (!ex) break
        code = generateCode()
      }

      const { data: room, error } = await supabase
        .from('game_rooms')
        .insert({
          code, host_id: playerId, guest_id: null, status: 'waiting',
          game_state: gs, host_score: 0, guest_score: 0, current_round: 0,
          config: { cols: preset.cols, rows: preset.rows, duelTime: cfg.DUEL_TIME, passPenalty: cfg.PASS_PENALTY },
        })
        .select().single()

      if (error || !room) { set({ status: 'idle', error: 'Nie udało się utworzyć pokoju' }); return null }

      const r = room as { id: string }
      set({ roomId: r.id, roomCode: code, role: 'host', status: 'waiting', tiles, cursor: gs.cursor, gridCols: cols, gridRows: rows })
      subscribeRoom(r.id)
      return code
    },

    joinRoom: async (code) => {
      const { playerId, playerName } = get()
      set({ status: 'joining', error: null })

      const { data: room, error } = await supabase
        .from('game_rooms').select('*').eq('code', code.toUpperCase()).eq('status', 'waiting').maybeSingle()

      if (error || !room) { set({ status: 'idle', error: 'Nie znaleziono pokoju o podanym kodzie' }); return false }

      const r = room as {
        id: string; code: string; host_id: string; game_state: MPGameState | null
        host_score: number; guest_score: number; config: Record<string, number>
      }

      if (r.host_id === playerId) { set({ status: 'idle', error: 'Nie możesz dołączyć do własnego pokoju' }); return false }

      await supabase.from('profiles').insert({ id: playerId, username: playerName })

      const { error: upErr } = await supabase
        .from('game_rooms').update({ guest_id: playerId, status: 'playing', updated_at: new Date().toISOString() }).eq('id', r.id)

      if (upErr) { set({ status: 'idle', error: 'Nie udało się dołączyć do pokoju' }); return false }

      await get().loadCategories()
      const gs   = r.game_state ?? { tiles: [], cursor: 0, duel: null }
      const cols = r.config?.cols ?? 4
      const rows = r.config?.rows ?? 3

      set({
        roomId: r.id, roomCode: r.code, role: 'guest', status: 'playing',
        opponentId: r.host_id, tiles: gs.tiles ?? [], cursor: gs.cursor ?? 0,
        gridCols: cols, gridRows: rows, duel: null,
        hostScore: r.host_score ?? 0, guestScore: r.guest_score ?? 0,
      })
      subscribeRoom(r.id)
      return true
    },

    leaveRoom: async () => {
      const { channel, roomId, role } = get()
      stopTicker()
      channel?.unsubscribe()
      if (roomId && role === 'host') await supabase.from('game_rooms').update({ status: 'finished' }).eq('id', roomId)
      set({
        roomId: null, roomCode: null, role: null, status: 'idle',
        opponentId: null, opponentName: null, tiles: [], cursor: 0,
        duel: null, currentQuestion: null, winner: null, countdown: null,
        hostScore: 0, guestScore: 0, channel: null, error: null,
      })
    },

    moveCursor: (dir) => {
      const { role, duel, cursor, gridCols, tiles } = get()
      if (role !== 'host' || duel) return
      let next = cursor
      if (dir === 'up')    next = cursor - gridCols
      if (dir === 'down')  next = cursor + gridCols
      if (dir === 'left')  next = cursor - 1
      if (dir === 'right') next = cursor + 1
      if (next < 0 || next >= tiles.length) return
      set({ cursor: next })
      broadcast({ type: 'cursor_move', idx: next })
      if (cursorDebounce) clearTimeout(cursorDebounce)
      cursorDebounce = setTimeout(() => writeDB({ cursor: next }), 400)
    },

    startChallenge: () => {
      const { role, duel, tiles, cursor, categories } = get()
      if (role !== 'host' || duel) return
      const tile = tiles[cursor]
      if (!tile) return
      const cat = categories.find(c => c.id === tile.categoryId)
      const qs  = cat?.questions ?? []
      if (!qs.length) { get().showToast('❌ Brak pytań w tej kategorii'); return }
      const cfg = useConfigStore.getState().config
      const q   = qs[Math.floor(Math.random() * qs.length)]
      const lang = (cat?.lang ?? 'pl-PL') as SpeechLang
      const newDuel: MPDuelState = {
        tileIdx: cursor, categoryId: tile.categoryId, categoryName: tile.categoryName,
        emoji: getCatEmoji(tile.categoryName, cat?.emoji),
        questionId: q.id, usedQuestionIds: [q.id],
        timerHost: cfg.DUEL_TIME, timerGuest: cfg.DUEL_TIME,
        active: 'host', started: false, paused: false, lang,
      }
      set({ duel: newDuel, currentQuestion: q, winner: null, feedback: { text: '', type: '' } })
      broadcast({ type: 'duel_start', tileIdx: cursor, categoryId: tile.categoryId, categoryName: tile.categoryName, emoji: newDuel.emoji, questionId: q.id, lang })
    },

    startFight: () => {
      const { duel, role } = get()
      if (!duel || duel.started || role !== 'host') return
      broadcast({ type: 'fight_start' })
      localStartFight()
    },

    markCorrect: () => {
      const { duel, role, blockInput, countdown } = get()
      if (!duel?.started || duel.paused || blockInput || countdown) return
      if (duel.active !== role) return
      set({ blockInput: true })
      stopTicker()
      const ans = get().currentQuestion?.answer ?? '???'
      get().showFeedback(`✓ ${ans}`, 'correct')
      broadcast({ type: 'correct', player: role as MPActivePlayer, answer: ans })
      const cfg = useConfigStore.getState().config
      setTimeout(() => {
        const { duel } = get()
        if (!duel) return
        const next: MPActivePlayer = role === 'host' ? 'guest' : 'host'
        const { questionId, usedIds } = pickNext(duel)
        const q = resolveQ(questionId)
        const updated = { ...duel, active: next, questionId, usedQuestionIds: usedIds, paused: false }
        set({ duel: updated, currentQuestion: q, blockInput: false })
        if (role === 'host') {
          broadcast({ type: 'next_question', questionId, active: next, timerHost: updated.timerHost, timerGuest: updated.timerGuest })
          startTicker()
        }
      }, cfg.FEEDBACK_MS)
    },

    pass: () => {
      const { duel, role, blockInput, countdown } = get()
      if (!duel?.started || duel.paused || blockInput || countdown) return
      if (duel.active !== role) return
      set({ blockInput: true })
      stopTicker()
      const ans = get().currentQuestion?.answer ?? '???'
      get().showFeedback(`⏱ PAS · ${ans}`, 'pass')
      broadcast({ type: 'pass', player: role as MPActivePlayer })
      const cfg = useConfigStore.getState().config
      const key = role === 'host' ? 'timerHost' : 'timerGuest'
      const pen = Math.max(0, duel[key] - cfg.PASS_PENALTY)
      set({ duel: { ...duel, [key]: pen } })
      setTimeout(() => {
        const { duel } = get()
        if (!duel) return
        const { questionId, usedIds } = pickNext(duel)
        const q = resolveQ(questionId)
        const updated = { ...duel, questionId, usedQuestionIds: usedIds, paused: false }
        set({ duel: updated, currentQuestion: q, blockInput: false })
        if (role === 'host') {
          broadcast({ type: 'next_question', questionId, active: duel.active, timerHost: updated.timerHost, timerGuest: updated.timerGuest })
          if (pen <= 0) { stopTicker(); set({ duel: { ...updated, paused: true } }); onTimeout(updated) }
          else startTicker()
        }
      }, cfg.FEEDBACK_MS)
    },

    closeDuel: () => {
      stopTicker()
      set({ duel: null, currentQuestion: null, winner: null, countdown: null, blockInput: false, feedback: { text: '', type: '' } })
      if (get().role === 'host') {
        broadcast({ type: 'duel_close' })
        writeDB({ tiles: get().tiles, cursor: get().cursor, duel: null })
      }
    },

    showFeedback: (text, type) => {
      const { feedbackTimer } = get()
      if (feedbackTimer) clearTimeout(feedbackTimer)
      const cfg = useConfigStore.getState().config
      const t = setTimeout(() => set({ feedback: { text: '', type: '' } }), cfg.FEEDBACK_MS + 300)
      set({ feedback: { text, type }, feedbackTimer: t })
    },

    showToast: (text) => {
      set({ toastText: text })
      setTimeout(() => set({ toastText: '' }), 2500)
    },

    _broadcastEvent: (event) => broadcast(event),

    sendChatMessage: (text) => {
      const { playerName } = get()
      const msg = { from: playerName, text, ts: Date.now() }
      set(s => ({ chatMessages: [...s.chatMessages.slice(-99), msg] }))
      broadcast({ type: 'chat_message', ...msg })
    },

    updateGameSettings: (s) => {
      const next = { ...get().gameSettings, ...s }
      set({ gameSettings: next })
      broadcast({ type: 'game_settings', rounds: next.rounds, duelTime: next.duelTime, categoriesCount: next.categoriesCount })
    },
  }
})
