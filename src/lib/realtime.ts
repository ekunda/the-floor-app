// src/lib/realtime.ts — NOWY
// Helpery dla Supabase Realtime — subskrypcje, broadcast, presence

import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────
// TYPY
// ─────────────────────────────────────────────────────────────

export type ChannelStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface RealtimeMessage<T = unknown> {
  event: string
  payload: T
}

// ─────────────────────────────────────────────────────────────
// KANAŁ POKOJU (game_rooms)
// Subskrybuje UPDATE na konkretnym pokoju przez postgres_changes
// ─────────────────────────────────────────────────────────────

/**
 * Subskrybuje zmiany stanu pokoju.
 * @returns funkcja cleanup do wywołania w useEffect cleanup
 */
export function subscribeToRoom(
  roomId: string,
  onUpdate: (newRoom: Record<string, unknown>) => void,
  onStatus?: (status: ChannelStatus) => void,
): () => void {
  const channel = supabase
    .channel(`room_changes:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_rooms',
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        onUpdate(payload.new as Record<string, unknown>)
      },
    )
    .subscribe((status) => {
      if (onStatus) {
        if (status === 'SUBSCRIBED') onStatus('connected')
        else if (status === 'CHANNEL_ERROR') onStatus('error')
        else if (status === 'CLOSED') onStatus('disconnected')
        else onStatus('connecting')
      }
    })

  return () => { supabase.removeChannel(channel) }
}

// ─────────────────────────────────────────────────────────────
// KANAŁ CZATU W POKOJU
// Broadcast wiadomości między graczami w poczekalni
// ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  from: string     // "avatar username"
  text: string
  ts: number
}

export function createRoomChatChannel(roomId: string): RealtimeChannel {
  return supabase.channel(`room_chat:${roomId}`)
}

export async function sendChatMessage(
  channel: RealtimeChannel,
  message: ChatMessage,
): Promise<void> {
  await channel.send({
    type: 'broadcast',
    event: 'chat',
    payload: message,
  })
}

// ─────────────────────────────────────────────────────────────
// KANAŁ MATCHMAKINGU
// Używany do sygnalizowania obu graczom ID pokoju
// ─────────────────────────────────────────────────────────────

export function createMatchChannel(
  hostId: string,
  guestId: string,
): RealtimeChannel {
  // Deterministyczna nazwa kanału (posortowane ID dla spójności)
  const [a, b] = [hostId, guestId].sort()
  return supabase.channel(`match:${a}:${b}`)
}

export async function broadcastMatchReady(
  channel: RealtimeChannel,
  roomId: string,
): Promise<void> {
  await channel.send({
    type: 'broadcast',
    event: 'match_ready',
    payload: { room_id: roomId },
  })
}

// ─────────────────────────────────────────────────────────────
// SUBSKRYPCJA MATCHMAKING QUEUE
// Nasłuchuje na INSERT w kolejce matchmakingu
// ─────────────────────────────────────────────────────────────

export function subscribeToMatchmakingQueue(
  onNewPlayer: (playerId: string, elo: number) => void,
): () => void {
  const channel = supabase
    .channel('matchmaking_inserts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'matchmaking_queue',
      },
      (payload) => {
        const row = payload.new as { player_id: string; elo: number }
        onNewPlayer(row.player_id, row.elo)
      },
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}

// ─────────────────────────────────────────────────────────────
// PRESENCE (opcjonalne — kto jest online w pokoju)
// ─────────────────────────────────────────────────────────────

export interface PresenceState {
  userId: string
  username: string
  avatar: string
}

export function createPresenceChannel(
  roomId: string,
  myState: PresenceState,
  onSync: (states: PresenceState[]) => void,
): () => void {
  const channel = supabase
    .channel(`presence:${roomId}`, {
      config: { presence: { key: myState.userId } },
    })
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<PresenceState>()
      const players = Object.values(state)
        .flatMap(arr => arr)
        .map(p => p as unknown as PresenceState)
      onSync(players)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(myState)
      }
    })

  return () => { supabase.removeChannel(channel) }
}

// ─────────────────────────────────────────────────────────────
// HELPER: bezpieczne odsubskrybowanie
// ─────────────────────────────────────────────────────────────

export function safeUnsubscribe(channel: RealtimeChannel | null): void {
  if (channel) {
    supabase.removeChannel(channel).catch(() => {/* ignore */})
  }
}
