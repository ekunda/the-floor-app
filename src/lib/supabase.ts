// ─────────────────────────────────────────────────────────────────────────────
// supabase.ts — Klient Supabase + cache warstwy + helpers sesji admina
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'

const URL  = import.meta.env.VITE_SUPABASE_URL  as string
const ANON = import.meta.env.VITE_SUPABASE_ANON as string

export const supabase = createClient(URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: false, // sesja wygaśnie po 1h — obsługujemy ręcznie
  },
  global: {
    headers: {
      'x-app-version': '1.0.0',
    },
  },
  // Optymalizacja połączeń — realtime wyłączony (nie używamy go)
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
})

// ─────────────────────────────────────────────────────────────────────────────
// Cache warstwy — dwupoziomowy (pamięć + localStorage)
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  ts: number
}

const MEM_CACHE = new Map<string, CacheEntry<unknown>>()

const CACHE_PREFIX   = 'tfcache_'
const DEFAULT_TTL_MS = 5 * 60 * 1000  // 5 minut
const MAX_LS_SIZE    = 2 * 1024 * 1024 // 2MB guard

/** Zapisz do cache (pamięć + localStorage) */
export function setCached<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  const entry: CacheEntry<T> = { data, ts: Date.now() }
  MEM_CACHE.set(key, entry as CacheEntry<unknown>)
  try {
    const raw = JSON.stringify(entry)
    if (raw.length < MAX_LS_SIZE) {
      localStorage.setItem(`${CACHE_PREFIX}${key}`, raw)
    }
  } catch {
    // localStorage pełny — czyść stare wpisy
    _evictLocalStorage()
  }
  void ttlMs // TTL respektowany przy odczycie
}

/** Pobierz z cache — najpierw pamięć, potem localStorage */
export function getCached<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  // 1. pamięć
  const mem = MEM_CACHE.get(key) as CacheEntry<T> | undefined
  if (mem && Date.now() - mem.ts < ttlMs) return mem.data

  // 2. localStorage
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`)
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEntry<T>
      if (Date.now() - parsed.ts < ttlMs) {
        // przywróć do pamięci
        MEM_CACHE.set(key, parsed as CacheEntry<unknown>)
        return parsed.data
      } else {
        // wygasłe — usuń
        localStorage.removeItem(`${CACHE_PREFIX}${key}`)
      }
    }
  } catch {}

  return null
}

/** Unieważnij wpis (pamięć + localStorage) */
export function invalidateCache(key: string): void {
  MEM_CACHE.delete(key)
  try { localStorage.removeItem(`${CACHE_PREFIX}${key}`) } catch {}
}

/** Wyczyść cały cache aplikacji */
export function clearAllCache(): void {
  MEM_CACHE.clear()
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX))
    keys.forEach(k => localStorage.removeItem(k))
  } catch {}
}

/** Usuń najstarsze wpisy z localStorage gdy brakuje miejsca */
function _evictLocalStorage(): void {
  try {
    const cacheKeys = Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .map(k => {
        try {
          const entry = JSON.parse(localStorage.getItem(k) ?? '{}') as { ts?: number }
          return { key: k, ts: entry.ts ?? 0 }
        } catch {
          return { key: k, ts: 0 }
        }
      })
      .sort((a, b) => a.ts - b.ts) // najstarsze pierwsze

    // usuń połowę najstarszych
    cacheKeys.slice(0, Math.max(1, Math.floor(cacheKeys.length / 2)))
      .forEach(({ key }) => localStorage.removeItem(key))
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry wrapper — automatyczny retry dla niestabilnych połączeń
// ─────────────────────────────────────────────────────────────────────────────

interface RetryOptions {
  attempts?: number
  delayMs?:  number
  backoff?:  boolean
}

export async function withRetry<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>,
  opts: RetryOptions = {},
): Promise<{ data: T | null; error: unknown }> {
  const { attempts = 3, delayMs = 500, backoff = true } = opts
  let lastError: unknown

  for (let i = 0; i < attempts; i++) {
    try {
      const result = await fn()
      if (!result.error) return result
      lastError = result.error
    } catch (e) {
      lastError = e
    }

    if (i < attempts - 1) {
      const wait = backoff ? delayMs * Math.pow(2, i) : delayMs
      await new Promise(r => setTimeout(r, wait))
    }
  }

  console.warn('[Supabase] Wszystkie próby nieudane:', lastError)
  return { data: null, error: lastError }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session helpers — 1-godzinna sesja admina
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY      = 'thefloor_login_at'
export const SESSION_DURATION_MS = 60 * 60 * 1000 // 1 godzina

export function recordLogin(): void {
  sessionStorage.setItem(SESSION_KEY, String(Date.now()))
}

export function sessionAge(): number {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) return SESSION_DURATION_MS + 1 // traktuj jako wygasłe
  return Date.now() - Number(raw)
}

export function sessionRemainingMs(): number {
  return Math.max(0, SESSION_DURATION_MS - sessionAge())
}

export function isSessionValid(): boolean {
  return sessionAge() < SESSION_DURATION_MS
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
}

export function formatRemaining(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
