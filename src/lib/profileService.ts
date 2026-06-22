// ─────────────────────────────────────────────────────────────────────────────
// lib/profileService.ts — Supabase adapter for the `profiles` / `game_history`
// tables.
//
// This is the ONLY place that knows the column layout of those tables. The
// multiplayer store talks to it in domain terms (ProfileStats) and never touches
// raw Supabase queries for ranking data. XP math lives in domain/xp.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabase'
import type { ProfileStats } from '../domain/xp'

const STATS_COLUMNS = 'xp,wins,losses,win_streak,best_streak'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStats(row: any): ProfileStats {
  return {
    xp:          row.xp ?? 0,
    wins:        row.wins ?? 0,
    losses:      row.losses ?? 0,
    win_streak:  row.win_streak ?? 0,
    best_streak: row.best_streak ?? 0,
  }
}

/** Read both players' ranking stats. Returns null if either profile is missing. */
export async function fetchMatchStats(
  hostId: string,
  guestId: string,
): Promise<{ host: ProfileStats; guest: ProfileStats } | null> {
  const [{ data: hp }, { data: gp }] = await Promise.all([
    supabase.from('profiles').select(STATS_COLUMNS).eq('id', hostId).maybeSingle(),
    supabase.from('profiles').select(STATS_COLUMNS).eq('id', guestId).maybeSingle(),
  ])
  if (!hp || !gp) return null
  return { host: toStats(hp), guest: toStats(gp) }
}

/** Persist both players' updated ranking stats. */
export async function saveMatchStats(
  hostId: string, host: ProfileStats,
  guestId: string, guest: ProfileStats,
): Promise<void> {
  const updated_at = new Date().toISOString()
  await Promise.all([
    supabase.from('profiles').update({ ...host, updated_at }).eq('id', hostId),
    supabase.from('profiles').update({ ...guest, updated_at }).eq('id', guestId),
  ])
}

export interface GameHistoryRecord {
  winnerId:    string
  loserId:     string
  winnerScore: number
  loserScore:  number
}

/** Append a finished (non-draw) match to the history table. */
export async function recordGameHistory(r: GameHistoryRecord): Promise<void> {
  await supabase.from('game_history').insert({
    winner_id:    r.winnerId,
    loser_id:     r.loserId,
    winner_score: r.winnerScore,
    loser_score:  r.loserScore,
    is_draw:      false,
  }).select()
}

/**
 * Mark a player online, creating a lightweight guest profile if needed.
 * For the signed-in user's own profile we only touch presence; for an ad-hoc
 * guest id we upsert a fresh row (without clobbering an existing one).
 */
export async function ensureProfileOnline(
  id: string, username: string, avatar: string, isOwnAuthedProfile: boolean,
): Promise<void> {
  const now = new Date().toISOString()
  if (isOwnAuthedProfile) {
    await supabase.from('profiles').update({ status: 'online', last_seen: now }).eq('id', id)
    return
  }
  await supabase.from('profiles').upsert(
    { id, username, avatar, xp: 0, wins: 0, losses: 0, win_streak: 0, best_streak: 0, status: 'online', last_seen: now, updated_at: now },
    { onConflict: 'id', ignoreDuplicates: true },
  )
}
