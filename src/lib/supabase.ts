// src/lib/supabase.ts — ZAKTUALIZOWANY
// Zachowano: wszystkie oryginalne eksporty (session helpers, cache helpers)
// Dodano: user auth helpers dla systemu multiplayer

import { createClient } from '@supabase/supabase-js'

const URL  = import.meta.env.VITE_SUPABASE_URL  as string
const ANON = import.meta.env.VITE_SUPABASE_ANON as string

export const supabase = createClient(URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'thefloor_auth',
  },
  realtime: {
    params: { eventsPerSecond: 20 },         // higher throughput for fast game events
  },
  db: {
    schema: 'public',
  },
  global: {
    headers: { 'x-client-info': 'thefloor' },
  },
})

// ─────────────────────────────────────────────────────────────
// ADMIN SESSION HELPERS (oryginalne — bez zmian)
// ─────────────────────────────────────────────────────────────

const ADMIN_SESSION_KEY = 'thefloor_login_at'
export const SESSION_DURATION_MS = 60 * 60 * 1000 // 1 godzina

export function recordLogin(): void {
  sessionStorage.setItem(ADMIN_SESSION_KEY, String(Date.now()))
}

export function sessionAge(): number {
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY)
  if (!raw) return SESSION_DURATION_MS + 1
  return Date.now() - Number(raw)
}

export function sessionRemainingMs(): number {
  return Math.max(0, SESSION_DURATION_MS - sessionAge())
}

export function isSessionValid(): boolean {
  return sessionAge() < SESSION_DURATION_MS
}

export function clearSession(): void {
  sessionStorage.removeItem(ADMIN_SESSION_KEY)
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────
// CACHE HELPERS (oryginalne — bez zmian)
// ─────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  ts: number
}

const _cache = new Map<string, CacheEntry<unknown>>()

/** Odczytuje wartość z cache. Zwraca null jeśli nie istnieje lub wygasła. */
export function getCached<T>(key: string, ttlMs = 60_000): T | null {
  const hit = _cache.get(key) as CacheEntry<T> | undefined
  if (!hit) return null
  if (Date.now() - hit.ts > ttlMs) { _cache.delete(key); return null }
  return hit.data
}

/** Zapisuje wartość w cache. */
export function setCached<T>(key: string, data: T): void {
  _cache.set(key, { data, ts: Date.now() })
}

/** Usuwa pojedynczy wpis lub czyści cały cache. */
export function invalidateCache(key?: string): void {
  if (key) _cache.delete(key)
  else _cache.clear()
}

// ─────────────────────────────────────────────────────────────
// USER AUTH HELPERS (nowe — dla systemu multiplayer)
// ─────────────────────────────────────────────────────────────

/** Pobiera aktualnie zalogowanego użytkownika. Zwraca null jeśli nikt. */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Pobiera profil gracza z tabeli `profiles`. */
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data
}

/** Generuje publiczne URL obrazka z Supabase Storage. */
export function getPublicImageUrl(path: string): string {
  return supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl
}
