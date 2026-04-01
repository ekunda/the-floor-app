/**
 * useMultiplayerStore — AUTHORITATIVE HOST ARCHITECTURE
 *
 * RULES:
 *  1. HOST runs the timer (ticker) and drives ALL state transitions.
 *  2. Guest sends INTENT events (guest_correct, guest_pass) — host validates & advances.
 *  3. Host broadcasts results to both sides via next_question / round_end.
 *  4. Both players have SEPARATE equal timers per duel (fair).
 *  5. First active player in each duel is RANDOMLY selected.
 *  6. Auth user ID is always used when the player is logged in.
 *  7. Profiles are upserted (never duplicated).
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import {
  Category, MPActivePlayer, MPDuelState, MPEvent,
  MPGameState, MPRole, MPStatus, Question, SpeechLang, Tile, TileOwner,
} from '../types'
import { BOARD_PRESETS, useConfigStore } from './useConfigStore'
import { useAuthStore } from './useAuthStore'

// ── Module-level timer (only host runs it) ─────────────────────────────────────
let tickerInterval: ReturnType<typeof setInterval> | null = null

function stopTicker() {
  if (tickerInterval) { clearInterval(tickerInterval); tickerInterval = null }
}

// ── Player identity ───────────────────────────────────────────────────────────
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

/** Always prefer auth user ID to avoid profile duplication */
function effectivePlayerId(): string {
  return useAuthStore.getState().user?.id ?? getLocalPlayerId()
}
function effectivePlayerName(): string {
  return useAuthStore.getState().user?.username ?? getLocalPlayerName()
}
function effectivePlayerAvatar(): string {
  return useAuthStore.getState().user?.avatar ?? '🎮'
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
  playerId:       string
  playerName:     string
  roomId:         string | null
  roomCode:       string | null
  role:           MPRole | null
  status:         MPStatus
  opponentId:     string | null
  opponentName:   string | null
  opponentAvatar: string
  hostScore:      number
  guestScore:     number
  categories:     (Category & { questions: Question[] })[]
  tiles:          Tile[]
  cursor:         number
  gridCols:       number
  gridRows:       number
  duel:           MPDuelState | null
  currentQuestion: Question | null
  blockInput:     boolean
  feedback:       { text: string; type: FeedbackType }
  winner:         MPActivePlayer | 'draw' | null
  countdown:      string | null
  error:          string | null
  toastText:      string
  channel:        ReturnType<typeof supabase.channel> | null
  chatMessages:   { from: string; text: string; ts: number }[]
  gameSettings:   { duelTime: number; categoriesCount: number }
  guestReady:     boolean  // host sees this when guest joined lobby

  setPlayerName:       (name: string) => void
  loadCategories:      () => Promise<void>
  createRoom:          () => Promise<string | null>
  joinRoom:            (code: string) => Promise<boolean>
  startGame:           () => void       // host only: start game from lobby
  leaveRoom:           () => Promise<void>
  moveCursor:          (dir: 'up'|'down'|'left'|'right') => void
  startChallenge:      () => void
  startFight:          () => void
  markCorrect:         () => void
  pass:                () => void
  closeDuel:           () => void
  showFeedback:        (text: string, type: FeedbackType) => void
  showToast:           (text: string) => void
  sendChatMessage:     (text: string) => void
  updateGameSettings:  (s: Partial<{ duelTime: number; categoriesCount: number }>) => void
  _broadcastEvent:     (event: MPEvent) => void
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useMultiplayerStore = create<MPStore>((set, get) => {

  // ── Internal helpers ──────────────────────────────────────────────────────

  function broadcast(event: MPEvent) {
    get().channel?.send({ type: 'broadcast', event: 'game', payload: event })
  }

  function resolveQ(qId: string): Question | null {
    for (const cat of get().categories) {
      const q = cat.questions.find(q => q.id === qId)
      if (q) return q
    }
    return null
  }

  function pickNext(duel: MPDuelState): { questionId: string; usedIds: string[] } {
    const cat   = get().categories.find(c => c.id === duel.categoryId)
    const qs    = cat?.questions ?? []
    let used    = [...duel.usedQuestionIds]
    if (used.length >= qs.length) used = []
    const avail = qs.filter(q => !used.includes(q.id))
    const pool  = avail.length > 0 ? avail : qs
    const q     = pool[Math.floor(Math.random() * pool.length)]
    if (q) used.push(q.id)
    return { questionId: q?.id ?? '', usedIds: used }
  }

  function buildTiles(cats: (Category & { questions: Question[] })[]) {
    const cfg    = useConfigStore.getState().config
    const preset = BOARD_PRESETS[cfg.BOARD_SHAPE] ?? BOARD_PRESETS[0]
    const { cols, rows } = preset
    const pool   = shuffle(cats)
    const tiles: Tile[] = Array.from({ length: cols * rows }, (_, i) => {
      const cat  = pool[i % Math.max(pool.length, 1)]
      const x    = i % cols
      const y    = Math.floor(i / cols)
      // Neutral start: all tiles owned by 'gold', territory changes by winning duels
      const owner: TileOwner = x < Math.ceil(cols / 2) ? 'gold' : 'silver'
      return { x, y, categoryId: cat?.id ?? '', categoryName: cat?.name ?? 'Kategoria', owner }
    })
    return { tiles, cols, rows }
  }

  async function writeDB(patch: { tiles?: Tile[]; cursor?: number; host_score?: number; guest_score?: number; status?: string }) {
    const { roomId } = get()
    if (!roomId) return
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.tiles !== undefined || patch.cursor !== undefined) {
      upd.game_state = { tiles: patch.tiles ?? get().tiles, cursor: patch.cursor ?? get().cursor, duel: null }
    }
    if (patch.host_score  !== undefined) upd.host_score  = patch.host_score
    if (patch.guest_score !== undefined) upd.guest_score = patch.guest_score
    if (patch.status      !== undefined) upd.status      = patch.status
    await supabase.from('game_rooms').update(upd).eq('id', roomId)
  }

  /** Upsert profile — never creates duplicates, never overwrites existing stats */
  async function ensureProfile(id: string, username: string, avatar: string) {
    // If auth user exists, their profile is managed by useAuthStore — just update status
    const authUser = useAuthStore.getState().user
    if (authUser && authUser.id === id) {
      await supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', id)
      return
    }
    // Guest player — upsert minimal anonymous profile
    await supabase.from('profiles').upsert(
      { id, username, avatar, xp: 0, wins: 0, losses: 0, win_streak: 0, best_streak: 0, status: 'online', last_seen: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'id', ignoreDuplicates: true }
    )
  }

  // ── Timer (HOST only) ─────────────────────────────────────────────────────

  function startTicker() {
    stopTicker()
    tickerInterval = setInterval(() => {
      const { duel, role } = get()
      if (!duel?.started || duel.paused || role !== 'host') { stopTicker(); return }

      const key    = duel.active === 'host' ? 'timerHost' : 'timerGuest'
      const newVal = Math.max(0, duel[key] - 1)
      const updated = { ...duel, [key]: newVal }
      set({ duel: updated })
      broadcast({ type: 'tick', timerHost: updated.timerHost, timerGuest: updated.timerGuest })

      if (newVal <= 0) {
        stopTicker()
        set({ duel: { ...updated, paused: true } })
        onTimeout(updated)
      }
    }, 1000)
  }

  function runCountdown(cb: () => void) {
    const labels = ['3', '2', '1', 'START!']
    labels.forEach((label, i) => setTimeout(() => set({ countdown: label }), i * 900))
    setTimeout(() => { set({ countdown: null }); cb() }, labels.length * 900 + 100)
  }

  // ── State transitions (ALL called only on HOST) ────────────────────────────

  function onTimeout(duel: MPDuelState) {
    // Player who ran out of time loses the tile
    const loser:  MPActivePlayer = duel.active
    const winner: MPActivePlayer = loser === 'host' ? 'guest' : 'host'
    get().showFeedback('⏰ Czas minął!', 'timeout')
    broadcast({ type: 'feedback', text: '⏰ Czas minął!', feedbackType: 'timeout' })
    setTimeout(() => hostEndRound(winner, duel), 1200)
  }

  function hostEndRound(winner: MPActivePlayer | 'draw', duel: MPDuelState) {
    const { tiles } = get()
    const owner: TileOwner = winner === 'host' ? 'gold' : winner === 'guest' ? 'silver' : tiles[duel.tileIdx]?.owner ?? 'gold'
    const newTiles = tiles.map((t, i) => i === duel.tileIdx ? { ...t, owner } : t)
    const { hostScore, guestScore } = get()
    const hs = winner === 'host'  ? hostScore  + 1 : hostScore
    const gs = winner === 'guest' ? guestScore + 1 : guestScore
    set({ tiles: newTiles, winner, hostScore: hs, guestScore: gs })
    broadcast({ type: 'round_end', winner, tileIdx: duel.tileIdx, hostScore: hs, guestScore: gs })
    writeDB({ tiles: newTiles, cursor: get().cursor, host_score: hs, guest_score: gs })
  }

  /**
   * Core: advance to next question after a correct answer.
   * Called by HOST only (for both host's own action and guest_correct event).
   * @param who - who answered correctly
   */
  function hostAdvanceAfterCorrect(who: MPActivePlayer) {
    const { duel } = get()
    if (!duel) return
    stopTicker()
    const ans = get().currentQuestion?.answer ?? '???'
    // Show feedback
    get().showFeedback(`✓ ${ans}`, who === get().role ? 'correct' : 'voice')
    broadcast({ type: 'correct', player: who, answer: ans })

    const cfg = useConfigStore.getState().config
    setTimeout(() => {
      const { duel } = get()
      if (!duel) return
      // Switch active player
      const next: MPActivePlayer = who === 'host' ? 'guest' : 'host'
      const { questionId, usedIds } = pickNext(duel)
      const q       = resolveQ(questionId)
      const updated = { ...duel, active: next, questionId, usedQuestionIds: usedIds, paused: false }
      set({ duel: updated, currentQuestion: q, blockInput: false })
      broadcast({ type: 'next_question', questionId, active: next, timerHost: updated.timerHost, timerGuest: updated.timerGuest })
      startTicker()
    }, cfg.FEEDBACK_MS)
  }

  /**
   * Core: advance to next question after a pass.
   * Called by HOST only.
   * @param who - who passed
   */
  function hostAdvanceAfterPass(who: MPActivePlayer) {
    const { duel } = get()
    if (!duel) return
    stopTicker()
    const ans = get().currentQuestion?.answer ?? '???'
    const cfg = useConfigStore.getState().config
    const key = who === 'host' ? 'timerHost' : 'timerGuest'
    const pen = Math.max(0, duel[key] - cfg.PASS_PENALTY)
    get().showFeedback(`⏱ PAS · ${ans}`, 'pass')
    broadcast({ type: 'pass', player: who, answer: ans })

    setTimeout(() => {
      const { duel } = get()
      if (!duel) return
      const { questionId, usedIds } = pickNext(duel)
      const q       = resolveQ(questionId)
      const updated = { ...duel, active: who, questionId, usedQuestionIds: usedIds, [key]: pen, paused: false }
      set({ duel: updated, currentQuestion: q, blockInput: false })
      broadcast({ type: 'next_question', questionId, active: who, timerHost: updated.timerHost, timerGuest: updated.timerGuest })
      if (pen <= 0) { stopTicker(); set({ duel: { ...updated, paused: true } }); onTimeout(updated) }
      else startTicker()
    }, cfg.FEEDBACK_MS)
  }

  // ── Realtime event handler ─────────────────────────────────────────────────

  function onEvent(ev: MPEvent) {
    const { role } = get()

    switch (ev.type) {
      // ── Navigation ──────────────────────────────────────────────────────────
      case 'cursor_move':
        if (role === 'guest') set({ cursor: ev.idx })
        break

      case 'game_start':
        if (role === 'guest') set({ status: 'playing' })
        break

      // ── Duel lifecycle ───────────────────────────────────────────────────────
      case 'duel_start': {
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
              active: ev.firstActive, started: false, paused: false, lang: ev.lang,
            },
            currentQuestion: q, winner: null, feedback: { text: '', type: '' }, blockInput: false,
          })
        }
        break
      }

      case 'fight_start':
        if (role === 'guest') {
          const { duel } = get()
          if (!duel) break
          set({ duel: { ...duel, started: true, paused: true }, countdown: null, winner: null, blockInput: false })
          runCountdown(() => {
            const { duel } = get()
            if (duel) set({ duel: { ...duel, paused: false } })
          })
        }
        break

      case 'tick':
        // Guest syncs timer display from host
        if (role === 'guest') {
          const { duel } = get()
          if (duel) set({ duel: { ...duel, timerHost: ev.timerHost, timerGuest: ev.timerGuest } })
        }
        break

      // ── Guest intent signals → HOST processes ──────────────────────────────
      case 'guest_correct':
        if (role === 'host') {
          const { duel, blockInput } = get()
          // Validate: must be guest's turn and game active
          if (!duel?.started || duel.paused || blockInput || duel.active !== 'guest') break
          set({ blockInput: true })
          hostAdvanceAfterCorrect('guest')
        }
        break

      case 'guest_pass':
        if (role === 'host') {
          const { duel, blockInput } = get()
          if (!duel?.started || duel.paused || blockInput || duel.active !== 'guest') break
          set({ blockInput: true })
          hostAdvanceAfterPass('guest')
        }
        break

      // ── Sync events (guest receives from host) ─────────────────────────────
      case 'correct':
        // Guest shows feedback (host already showed it locally)
        if (role === 'guest') get().showFeedback(`✓ ${ev.answer}`, ev.player === 'guest' ? 'correct' : 'voice')
        break

      case 'pass':
        if (role === 'guest') get().showFeedback(`⏱ PAS · ${ev.answer}`, 'pass')
        break

      case 'next_question': {
        // Both sides sync (host already set locally, guest syncs here)
        if (role === 'guest') {
          const { duel } = get()
          if (!duel) break
          const q = resolveQ(ev.questionId)
          set({
            duel: { ...duel, questionId: ev.questionId, usedQuestionIds: [...duel.usedQuestionIds, ev.questionId], active: ev.active, timerHost: ev.timerHost, timerGuest: ev.timerGuest, paused: false },
            currentQuestion: q, blockInput: false,
          })
        }
        break
      }

      case 'round_end': {
        // Both update tiles and scores; host already set locally
        if (role === 'guest') {
          const { tiles } = get()
          const owner: TileOwner = ev.winner === 'host' ? 'gold' : ev.winner === 'guest' ? 'silver' : tiles[ev.tileIdx]?.owner ?? 'gold'
          const newTiles = tiles.map((t, i) => i === ev.tileIdx ? { ...t, owner } : t)
          set({ tiles: newTiles, winner: ev.winner, hostScore: ev.hostScore, guestScore: ev.guestScore })
        } else {
          // Host: pause duel to show winner overlay
          const { duel } = get()
          if (duel) set({ duel: { ...duel, paused: true } })
        }
        break
      }

      case 'duel_close':
        if (role === 'guest') {
          stopTicker()
          set({ duel: null, currentQuestion: null, winner: null, countdown: null, blockInput: false, feedback: { text:'', type:'' } })
        }
        break

      case 'feedback':
        // Guest receives explicit feedback broadcast
        if (role === 'guest') get().showFeedback(ev.text, ev.feedbackType)
        break

      // ── Meta events ──────────────────────────────────────────────────────────
      case 'game_end':
        set({ status: 'finished' })
        break

      case 'chat_message':
        set(s => ({ chatMessages: [...s.chatMessages.slice(-99), { from: ev.from, text: ev.text, ts: ev.ts }] }))
        break

      case 'game_settings':
        set({ gameSettings: { duelTime: ev.duelTime, categoriesCount: ev.categoriesCount } })
        break

      case 'opponent_name':
        set({ opponentName: ev.name, opponentAvatar: ev.avatar })
        break
    }
  }

  // ── Room subscription ─────────────────────────────────────────────────────

  let _reconnectTimer: ReturnType<typeof setTimeout> | null = null

  function subscribeRoom(roomId: string) {
    const { channel: old } = get()
    if (old) old.unsubscribe()
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }

    const ch = supabase.channel(`room:${roomId}`, { config: { broadcast: { self: false } } })

    ch.on('broadcast', { event: 'game' }, (pl) => onEvent(pl.payload as MPEvent))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, (pl) => {
        const room = pl.new as { guest_id: string | null; status: string; game_state: MPGameState | null; host_score: number; guest_score: number }
        const { role, status } = get()

        if (role === 'host' && room.guest_id && status === 'waiting') {
          // Guest joined — fetch their name and move to lobby
          supabase.from('profiles').select('username,avatar').eq('id', room.guest_id).maybeSingle().then(({ data }) => {
            const d = data as { username: string; avatar: string } | null
            const name   = d?.username ?? 'GOŚĆ'
            const avatar = d?.avatar   ?? '🎮'
            set({ status: 'lobby', opponentId: room.guest_id!, opponentName: name, opponentAvatar: avatar, guestReady: true })
            // Tell guest our name
            broadcast({ type: 'opponent_name', name: get().playerName, avatar: effectivePlayerAvatar() })
          })
        }

        if (role === 'guest') {
          const gs = room.game_state
          if (gs?.tiles) set({ tiles: gs.tiles })
          if (gs?.cursor !== undefined) set({ cursor: gs.cursor })
          set({ hostScore: room.host_score ?? 0, guestScore: room.guest_score ?? 0 })
          if (room.status === 'finished') set({ status: 'finished' })
        }
      })
      .subscribe((chStatus, err) => {
        // Auto-reconnect on channel error or unexpected close
        if (chStatus === 'CHANNEL_ERROR' || chStatus === 'CLOSED') {
          const { roomId: curRoom, status: curStatus } = get()
          if (curRoom && curStatus !== 'idle' && curStatus !== 'finished') {
            console.warn('[MP] Kanał zamknięty, reconnect za 2s…', err)
            _reconnectTimer = setTimeout(() => subscribeRoom(curRoom), 2000)
          }
        }
      })

    set({ channel: ch })
  }

  // ── Store initial state & actions ─────────────────────────────────────────

  return {
    playerId:       getLocalPlayerId(),
    playerName:     getLocalPlayerName(),
    roomId:         null, roomCode: null, role: null, status: 'idle',
    opponentId:     null, opponentName: null, opponentAvatar: '🎮',
    hostScore:      0, guestScore: 0,
    categories:     [], tiles: [], cursor: 0, gridCols: 4, gridRows: 3,
    duel:           null, currentQuestion: null, blockInput: false,
    feedback:       { text: '', type: '' },
    winner:         null, countdown: null, error: null, toastText: '', channel: null,
    chatMessages:   [],
    gameSettings:   { duelTime: 30, categoriesCount: 9 },
    guestReady:     false,

    setPlayerName: (name) => { setLocalPlayerName(name); set({ playerName: name }) },

    loadCategories: async () => {
      const { data } = await supabase
        .from('categories')
        .select('id,name,emoji,lang,created_at,questions(id,category_id,image_path,answer,synonyms,created_at)')
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
      // Require auth
      const authUser = useAuthStore.getState().user
      if (!authUser) {
        set({ error: 'Musisz być zalogowany, aby utworzyć pokój.' })
        return null
      }

      const playerId   = effectivePlayerId()
      const playerName = effectivePlayerName()
      set({ status: 'creating', error: null, playerName })

      await get().loadCategories()
      const { tiles, cols, rows } = buildTiles(get().categories)
      const cfg    = useConfigStore.getState().config
      const gs: MPGameState = { tiles, cursor: Math.floor(tiles.length / 2) - 1, duel: null }

      await ensureProfile(playerId, playerName, effectivePlayerAvatar())

      // Unique room code
      let code = generateCode()
      for (let i = 0; i < 8; i++) {
        const { data: ex } = await supabase.from('game_rooms').select('id').eq('code', code).limit(1).maybeSingle()
        if (!ex) break
        code = generateCode()
      }

      const { data: room, error } = await supabase
        .from('game_rooms')
        .insert({
          code, host_id: playerId, guest_id: null, status: 'waiting',
          game_state: gs, host_score: 0, guest_score: 0, current_round: 0,
          config: { cols, rows, duelTime: cfg.DUEL_TIME, passPenalty: cfg.PASS_PENALTY },
        })
        .select().single()

      if (error || !room) { set({ status: 'idle', error: 'Nie udało się utworzyć pokoju' }); return null }

      const r = room as { id: string }
      set({ roomId: r.id, roomCode: code, role: 'host', status: 'waiting', tiles, cursor: gs.cursor, gridCols: cols, gridRows: rows, playerId, playerName, guestReady: false })
      subscribeRoom(r.id)
      return code
    },

    joinRoom: async (code) => {
      const playerId   = effectivePlayerId()
      const playerName = effectivePlayerName()
      set({ status: 'joining', error: null, playerId, playerName })

      const { data: room, error } = await supabase
        .from('game_rooms').select('*').eq('code', code.toUpperCase()).in('status', ['waiting']).maybeSingle()

      if (error || !room) { set({ status: 'idle', error: 'Nie znaleziono pokoju o podanym kodzie. Sprawdź czy pokój czeka na gracza.' }); return false }

      const r = room as { id: string; code: string; host_id: string; game_state: MPGameState | null; host_score: number; guest_score: number; config: Record<string, number> }

      if (r.host_id === playerId) { set({ status: 'idle', error: 'Nie możesz dołączyć do własnego pokoju' }); return false }

      await ensureProfile(playerId, playerName, effectivePlayerAvatar())

      // Set status to 'lobby' so host sees us (triggers postgres_changes)
      const { error: upErr } = await supabase
        .from('game_rooms')
        .update({ guest_id: playerId, status: 'lobby', updated_at: new Date().toISOString() })
        .eq('id', r.id)

      if (upErr) { set({ status: 'idle', error: 'Nie udało się dołączyć do pokoju' }); return false }

      await get().loadCategories()
      const gs   = r.game_state ?? { tiles: [], cursor: 0, duel: null }
      const cols = r.config?.cols ?? 4
      const rows = r.config?.rows ?? 3

      set({
        roomId: r.id, roomCode: r.code, role: 'guest', status: 'lobby',
        opponentId: r.host_id, tiles: gs.tiles ?? [], cursor: gs.cursor ?? 0,
        gridCols: cols, gridRows: rows, duel: null,
        hostScore: r.host_score ?? 0, guestScore: r.guest_score ?? 0,
        playerId, playerName,
      })
      subscribeRoom(r.id)

      // Tell host our name immediately
      setTimeout(() => broadcast({ type: 'opponent_name', name: playerName, avatar: effectivePlayerAvatar() }), 500)

      return true
    },

    startGame: () => {
      const { role, status } = get()
      if (role !== 'host' || status !== 'lobby') return
      set({ status: 'playing' })
      broadcast({ type: 'game_start' })
      writeDB({ status: 'playing' })
    },

    leaveRoom: async () => {
      const { channel, roomId, role } = get()
      stopTicker()
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
      if (channel) await channel.unsubscribe()
      if (roomId && role === 'host') {
        await supabase.from('game_rooms').update({ status: 'finished', updated_at: new Date().toISOString() }).eq('id', roomId)
      }
      set({
        roomId: null, roomCode: null, role: null, status: 'idle',
        opponentId: null, opponentName: null, opponentAvatar: '🎮',
        tiles: [], cursor: 0, duel: null, currentQuestion: null, winner: null,
        countdown: null, hostScore: 0, guestScore: 0, channel: null, error: null,
        blockInput: false, feedback: { text:'', type:'' }, chatMessages: [], guestReady: false,
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
    },

    startChallenge: () => {
      const { role, duel, tiles, cursor, categories } = get()
      if (role !== 'host' || duel) return
      const tile = tiles[cursor]
      if (!tile) return
      const cat = categories.find(c => c.id === tile.categoryId)
      const qs  = cat?.questions ?? []
      if (!qs.length) { get().showToast('❌ Brak pytań w tej kategorii'); return }

      const cfg         = useConfigStore.getState().config
      const q           = qs[Math.floor(Math.random() * qs.length)]
      const lang        = (cat?.lang ?? 'pl-PL') as SpeechLang
      // FAIR: random first player each duel
      const firstActive: MPActivePlayer = Math.random() < 0.5 ? 'host' : 'guest'

      const newDuel: MPDuelState = {
        tileIdx: cursor, categoryId: tile.categoryId, categoryName: tile.categoryName,
        emoji: getCatEmoji(tile.categoryName, cat?.emoji),
        questionId: q.id, usedQuestionIds: [q.id],
        timerHost: cfg.DUEL_TIME, timerGuest: cfg.DUEL_TIME,
        active: firstActive, started: false, paused: false, lang,
      }
      set({ duel: newDuel, currentQuestion: q, winner: null, feedback: { text:'', type:'' }, blockInput: false })
      broadcast({ type: 'duel_start', tileIdx: cursor, categoryId: tile.categoryId, categoryName: tile.categoryName, emoji: newDuel.emoji, questionId: q.id, lang, firstActive })
    },

    startFight: () => {
      const { duel, role } = get()
      if (!duel || duel.started || role !== 'host') return
      set({ duel: { ...duel, started: true, paused: true }, countdown: null, winner: null, blockInput: false })
      broadcast({ type: 'fight_start' })
      runCountdown(() => {
        const { duel } = get()
        if (!duel) return
        set({ duel: { ...duel, paused: false } })
        startTicker()
      })
    },

    /**
     * markCorrect — handles both host and guest:
     *  - Host: directly advances state (authoritative)
     *  - Guest: sends intent event to host; host validates & advances
     */
    markCorrect: () => {
      const { duel, role, blockInput, countdown } = get()
      if (!duel?.started || duel.paused || blockInput || countdown) return
      if (duel.active !== role) return  // not your turn

      set({ blockInput: true })

      if (role === 'host') {
        hostAdvanceAfterCorrect('host')
      } else {
        // Optimistic UI: show feedback immediately, wait for host to advance state
        const ans = get().currentQuestion?.answer ?? '???'
        get().showFeedback(`✓ ${ans}`, 'correct')
        broadcast({ type: 'guest_correct' })
        // Safety: if host doesn't respond in 4s, unblock (shouldn't happen)
        setTimeout(() => { if (get().blockInput) set({ blockInput: false }) }, 4000)
      }
    },

    pass: () => {
      const { duel, role, blockInput, countdown } = get()
      if (!duel?.started || duel.paused || blockInput || countdown) return
      if (duel.active !== role) return

      set({ blockInput: true })

      if (role === 'host') {
        hostAdvanceAfterPass('host')
      } else {
        const ans = get().currentQuestion?.answer ?? '???'
        get().showFeedback(`⏱ PAS · ${ans}`, 'pass')
        broadcast({ type: 'guest_pass' })
        setTimeout(() => { if (get().blockInput) set({ blockInput: false }) }, 4000)
      }
    },

    closeDuel: () => {
      stopTicker()
      set({ duel: null, currentQuestion: null, winner: null, countdown: null, blockInput: false, feedback: { text:'', type:'' } })
      if (get().role === 'host') {
        broadcast({ type: 'duel_close' })
        writeDB({ tiles: get().tiles, cursor: get().cursor })
      }
    },

    showFeedback: (text, type) => {
      const cfg = useConfigStore.getState().config
      set({ feedback: { text, type } })
      setTimeout(() => {
        if (get().feedback.text === text) set({ feedback: { text:'', type:'' } })
      }, cfg.FEEDBACK_MS + 300)
    },

    showToast: (text) => {
      set({ toastText: text })
      setTimeout(() => set({ toastText: '' }), 2500)
    },

    sendChatMessage: (text) => {
      const { playerName } = get()
      const msg = { from: playerName, text, ts: Date.now() }
      set(s => ({ chatMessages: [...s.chatMessages.slice(-99), msg] }))
      broadcast({ type: 'chat_message', ...msg })
    },

    updateGameSettings: (s) => {
      const next = { ...get().gameSettings, ...s }
      set({ gameSettings: next })
      broadcast({ type: 'game_settings', duelTime: next.duelTime, categoriesCount: next.categoriesCount })
    },

    _broadcastEvent: (event) => broadcast(event),
  }
})
