import { describe, expect, it } from 'vitest'
import { parseNumericValue, parsePlayers, parseTileCategories } from './config'
import type { PlayerSettings } from '../types'

const DEFAULTS: [PlayerSettings, PlayerSettings] = [
  { name: 'ZŁOTY', color: '#D4AF37' },
  { name: 'SREBRNY', color: '#C0C0C0' },
]

describe('parseNumericValue', () => {
  it('accepts numbers', () => {
    expect(parseNumericValue(42)).toBe(42)
    expect(parseNumericValue(0)).toBe(0)
  })
  it('accepts numeric strings (jsonb stored as text)', () => {
    expect(parseNumericValue('45')).toBe(45)
    expect(parseNumericValue('3.5')).toBe(3.5)
  })
  it('rejects NaN, non-numeric strings, and other types', () => {
    expect(parseNumericValue(NaN)).toBeNull()
    expect(parseNumericValue('abc')).toBeNull()
    expect(parseNumericValue(null)).toBeNull()
    expect(parseNumericValue({})).toBeNull()
  })
})

describe('parseTileCategories', () => {
  it('passes through a string array, dropping non-strings', () => {
    expect(parseTileCategories(['a', 'b', 3, null])).toEqual(['a', 'b'])
  })
  it('parses a JSON-encoded array string', () => {
    expect(parseTileCategories('["x","y"]')).toEqual(['x', 'y'])
  })
  it('returns [] for malformed or non-array input', () => {
    expect(parseTileCategories('not json')).toEqual([])
    expect(parseTileCategories('{"a":1}')).toEqual([])
    expect(parseTileCategories(42)).toEqual([])
  })
})

describe('parsePlayers', () => {
  it('parses an array of two players', () => {
    const r = parsePlayers([{ name: 'A', color: '#111' }, { name: 'B', color: '#222' }], DEFAULTS)
    expect(r).toEqual([{ name: 'A', color: '#111' }, { name: 'B', color: '#222' }])
  })
  it('parses a JSON-encoded string', () => {
    const r = parsePlayers('[{"name":"A","color":"#111"},{"name":"B","color":"#222"}]', DEFAULTS)
    expect(r?.[0].name).toBe('A')
  })
  it('falls back to default colours when colour is missing', () => {
    const r = parsePlayers([{ name: 'A' }, { name: 'B' }], DEFAULTS)
    expect(r).toEqual([{ name: 'A', color: '#D4AF37' }, { name: 'B', color: '#C0C0C0' }])
  })
  it('returns null for unusable shapes (so the caller keeps its value)', () => {
    expect(parsePlayers([{ name: 'only-one' }], DEFAULTS)).toBeNull()
    expect(parsePlayers('garbage', DEFAULTS)).toBeNull()
    expect(parsePlayers([{ noName: 1 }, { noName: 2 }], DEFAULTS)).toBeNull()
    expect(parsePlayers(null, DEFAULTS)).toBeNull()
  })
})
