import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string
const ANON = import.meta.env.VITE_SUPABASE_ANON as string

export const supabase = createClient(URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: false, // sesja wygaśnie po 1h
  },
})

/* ── Session helpers (1-hour limit) ── */
const SESSION_KEY = 'thefloor_login_at'
export const SESSION_DURATION_MS = 60 * 60 * 1000 // 1 godzina

export function recordLogin() {
  sessionStorage.setItem(SESSION_KEY, String(Date.now()))
}

export function sessionAge(): number {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return SESSION_DURATION_MS + 1 // treat as expired
  return Date.now() - Number(raw)
}

export function sessionRemainingMs(): number {
  return Math.max(0, SESSION_DURATION_MS - sessionAge())
}

export function isSessionValid(): boolean {
  return sessionAge() < SESSION_DURATION_MS
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
