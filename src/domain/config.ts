// ─────────────────────────────────────────────────────────────────────────────
// domain/config.ts — Pure parsers for jsonb config values
//
// The `config` table stores values as jsonb, so a value may arrive as a number,
// a string, or an array depending on how it was written. These tolerant parsers
// (which previously fixed real coercion bugs) are pure and worth pinning with
// tests, so they live here instead of inside the store.
// ─────────────────────────────────────────────────────────────────────────────
import type { PlayerSettings } from '../types'

/** jsonb → number. Accepts numbers and numeric strings; null on anything else. */
export function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && !isNaN(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    if (!isNaN(n)) return n
  }
  return null
}

/** jsonb → string[]. Accepts a real array or a JSON-encoded array string. */
export function parseTileCategories(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string')
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.filter((v: unknown) => typeof v === 'string')
    } catch { /* ignore */ }
  }
  return []
}

/**
 * jsonb → the two player settings. Accepts an array or a JSON-encoded array
 * string; falls back to `defaults` colours when a colour is missing. Returns
 * null when the shape is unusable so the caller can keep its current value.
 */
export function parsePlayers(
  value: unknown,
  defaults: [PlayerSettings, PlayerSettings],
): [PlayerSettings, PlayerSettings] | null {
  try {
    const arr: unknown = typeof value === 'string' ? JSON.parse(value) : value
    if (Array.isArray(arr) && arr.length >= 2 && typeof arr[0]?.name === 'string' && typeof arr[1]?.name === 'string') {
      return [
        { name: arr[0].name, color: arr[0].color ?? defaults[0].color },
        { name: arr[1].name, color: arr[1].color ?? defaults[1].color },
      ]
    }
  } catch { /* ignore */ }
  return null
}
