// ─────────────────────────────────────────────────────────────────────────────
// useConfigStore.ts — Konfiguracja gry + gracze
//
// NAPRAWA nazw graczy:
//   - Wcześniej zapisywano TYLKO do localStorage → utrata po czyszczeniu
//   - Teraz: zapis do Supabase (config row 'PLAYER_SETTINGS') + localStorage jako cache
//   - fetch() najpierw czyta z Supabase, localStorage jako fallback
//
// NAPRAWA suwaka głośności:
//   - Usunięto SOUND_VOLUME (master)
//   - Dodano MUSIC_VOLUME (0–100) i SFX_VOLUME (0–100)
//   - SoundEngine.init() wywoływane po fetch()
//
// NAPRAWA jsonb:
//   - value może być liczbą, stringiem lub tablicą (jsonb)
//   - parseNumericValue() i parseTileCategories() obsługują oba formaty
// ─────────────────────────────────────────────────────────────────────────────
import { create } from 'zustand'
import { SoundEngine } from '../lib/SoundEngine'
import { getCachedStale, invalidateCache, setCached, supabase } from '../lib/supabase'
import { GameConfig, PlayerSettings } from '../types'

export const DEFAULTS: GameConfig = {
	// Plansza
	GRID_COLS: 4,
	GRID_ROWS: 3,
	TILE_SIZE: 230,
	BOARD_SHAPE: 0,
	// Rozgrywka
	DUEL_TIME: 45,
	PASS_PENALTY: 2,
	FEEDBACK_MS: 1000,
	WIN_CLOSE_MS: 3000,
	TOAST_MS: 1600,
	RANDOM_TILES: 0,
	MAX_PASSES: 0,
	// Dźwięk
	SOUND_VOLUME: 80, // legacy fallback
	MUSIC_VOLUME: 70,
	SFX_VOLUME: 85,
	// Mowa
	VOICE_PASS: 1,
	// Wyświetlanie
	SHOW_STATS: 1,
	SHOW_ANSWER_HINT: 0,
	TILE_FLIP_ANIM: 1,
	// Tryb rund (przyszłe)
	ROUND_TIMER: 0,
	MAX_ROUNDS: 10,

	MP_DUEL_TIME: 45,
	MP_PASS_PENALTY: 2,
	MP_FEEDBACK_MS: 1000,
	MP_WIN_CLOSE_MS: 3000,
	MP_XP_WIN: 10,
	MP_XP_DRAW: 5,
	MP_XP_LOSS: 0,
}

export const BOARD_PRESETS: Record<number, { cols: number; rows: number; label: string }> = {
	0: { cols: 4, rows: 3, label: 'Prostokąt (4×3)' },
	1: { cols: 6, rows: 2, label: 'Szeroka (6×2)' },
	2: { cols: 3, rows: 4, label: 'Wysoka (3×4)' },
	3: { cols: 4, rows: 4, label: 'Kwadrat (4×4)' },
	4: { cols: 5, rows: 3, label: 'Duża (5×3)' },
	5: { cols: 6, rows: 4, label: 'Bardzo duża (6×4)' },
}

export const DEFAULT_PLAYERS: [PlayerSettings, PlayerSettings] = [
	{ name: 'ZŁOTY', color: '#D4AF37' },
	{ name: 'SREBRNY', color: '#C0C0C0' },
]

const TILE_CATEGORIES_KEY = 'TILE_CATEGORIES'
const PLAYER_SETTINGS_KEY = 'PLAYER_SETTINGS' // nowy klucz w tabeli config
const LS_PLAYERS_KEY = 'thefloor_players'
const CACHE_KEY_CFG = 'config_all_v2'
const CACHE_TTL_CFG = 10 * 60 * 1000

interface ConfigStore {
	config: GameConfig
	players: [PlayerSettings, PlayerSettings]
	tileCategories: string[]
	loading: boolean

	fetch: () => Promise<void>
	update: (key: keyof GameConfig, value: number) => Promise<void>
	updatePlayer: (idx: 0 | 1, field: keyof PlayerSettings, value: string) => Promise<void>
	setTileCategory: (tileIdx: number, categoryId: string, totalTiles: number) => Promise<void>
	resetTileCategories: () => Promise<void>
	resetAll: () => Promise<void>
}

// ── Bezpieczny parser wartości jsonb → number ─────────────────────────────────
function parseNumericValue(value: unknown): number | null {
	if (typeof value === 'number' && !isNaN(value)) return value
	if (typeof value === 'string') {
		const n = Number(value)
		if (!isNaN(n)) return n
	}
	return null
}

// ── Bezpieczny parser wartości jsonb → string[] ───────────────────────────────
function parseTileCategories(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter(v => typeof v === 'string')
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value)
			if (Array.isArray(parsed)) return parsed.filter((v: unknown) => typeof v === 'string')
		} catch {}
	}
	return []
}

// ── Parser ustawień graczy ────────────────────────────────────────────────────
function parsePlayers(value: unknown): [PlayerSettings, PlayerSettings] | null {
	try {
		let arr: unknown
		if (typeof value === 'string') arr = JSON.parse(value)
		else arr = value
		if (Array.isArray(arr) && arr.length >= 2 && typeof arr[0]?.name === 'string' && typeof arr[1]?.name === 'string') {
			return [
				{ name: arr[0].name, color: arr[0].color ?? DEFAULT_PLAYERS[0].color },
				{ name: arr[1].name, color: arr[1].color ?? DEFAULT_PLAYERS[1].color },
			]
		}
	} catch {}
	return null
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
	config: DEFAULTS,
	players: DEFAULT_PLAYERS,
	tileCategories: [],
	loading: false,

	fetch: async () => {
		set({ loading: true })
		try {
			// 1. Stale-while-revalidate — natychmiastowe UI z cache
			const cached = getCachedStale<{
				config: GameConfig
				tileCategories: string[]
				players: [PlayerSettings, PlayerSettings]
			}>(CACHE_KEY_CFG, CACHE_TTL_CFG)
			if (cached) {
				set({ config: cached.data.config, tileCategories: cached.data.tileCategories, players: cached.data.players })
				SoundEngine.init(cached.data.config.MUSIC_VOLUME, cached.data.config.SFX_VOLUME)
				// If cache is fresh, skip network fetch entirely
				if (cached.fresh) { set({ loading: false }); return }
			}

			// 2. Supabase — revalidate (only when cache is stale or missing)
			const { data } = await supabase.from('config').select('key,value')
			if (data && data.length > 0) {
				const merged = { ...DEFAULTS }
				let tileCats: string[] = []
				let players: [PlayerSettings, PlayerSettings] = [...DEFAULT_PLAYERS] as [PlayerSettings, PlayerSettings]
				let playersFromSupabase = false

				data.forEach(({ key, value }: { key: string; value: unknown }) => {
					if (key === TILE_CATEGORIES_KEY) {
						tileCats = parseTileCategories(value)
					} else if (key === PLAYER_SETTINGS_KEY) {
						const p = parsePlayers(value)
						if (p) {
							players = p
							playersFromSupabase = true
						}
					} else if (key in merged) {
						const n = parseNumericValue(value)
						if (n !== null) (merged as Record<string, number>)[key] = n
					}
				})

				// Fallback do localStorage jeśli nie ma w Supabase
				if (!playersFromSupabase) {
					try {
						const ls = localStorage.getItem(LS_PLAYERS_KEY)
						if (ls) {
							const p = parsePlayers(ls)
							if (p) players = p
						}
					} catch {}
				}

				// Aktualizuj SoundEngine
				SoundEngine.init(merged.MUSIC_VOLUME, merged.SFX_VOLUME)

				setCached(CACHE_KEY_CFG, { config: merged, tileCategories: tileCats, players })
				set({ config: merged, tileCategories: tileCats, players })
			}
		} catch (e) {
			// Fallback: localStorage
			try {
				const ls = localStorage.getItem(LS_PLAYERS_KEY)
				if (ls) {
					const p = parsePlayers(ls)
					if (p) set({ players: p })
				}
			} catch {}
			console.warn('[Config] Błąd Supabase, używam defaults:', e)
		}
		set({ loading: false })
	},

	update: async (key, value) => {
		// 1. Optimistic update — UI reaguje natychmiast
		set(s => ({ config: { ...s.config, [key]: value } }))

		// Aktualizuj SoundEngine natychmiast (bez czekania na sieć)
		if (key === 'MUSIC_VOLUME') SoundEngine.setMusicVolume(value)
		if (key === 'SFX_VOLUME') SoundEngine.setSfxVolume(value)

		// 2. Persist do Supabase (jeśli fail — toast, rollback nie jest potrzebny,
		//    bo lokalny state już jest poprawny; user odświeży stronę żeby resync)
		try {
			const { error } = await supabase.from('config').upsert({ key, value })
			if (error) throw new Error(error.message)
			invalidateCache(CACHE_KEY_CFG)
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Błąd zapisu konfiguracji'
			console.warn('[ConfigStore] update error:', msg)
			throw e instanceof Error ? e : new Error(msg)
		}
	},

	// ── NAPRAWA: Zapis do Supabase + localStorage ──────────────────────────────
	updatePlayer: async (idx, field, value) => {
		const currentPlayers = [...get().players] as [PlayerSettings, PlayerSettings]
		currentPlayers[idx] = { ...currentPlayers[idx], [field]: value }
		set({ players: currentPlayers })

		// Zapis do localStorage (natychmiastowy cache)
		try {
			localStorage.setItem(LS_PLAYERS_KEY, JSON.stringify(currentPlayers))
		} catch {}

		// Zapis do Supabase (trwały, synchronizowany między urządzeniami)
		try {
			await supabase.from('config').upsert({
				key: PLAYER_SETTINGS_KEY,
				value: currentPlayers,
			})
			invalidateCache(CACHE_KEY_CFG)
		} catch (e) {
			console.warn('[Config] Nie udało się zapisać graczy do Supabase:', e)
		}
	},

	setTileCategory: async (tileIdx, categoryId, totalTiles) => {
		const current = [...get().tileCategories]
		while (current.length < totalTiles) current.push('')
		current[tileIdx] = categoryId
		set({ tileCategories: current })
		invalidateCache(CACHE_KEY_CFG)
		await supabase.from('config').upsert({ key: TILE_CATEGORIES_KEY, value: current })
	},

	resetTileCategories: async () => {
		set({ tileCategories: [] })
		invalidateCache(CACHE_KEY_CFG)
		await supabase.from('config').delete().eq('key', TILE_CATEGORIES_KEY)
	},

	resetAll: async () => {
		await supabase.from('config').delete().neq('key', '__never__')
		const rows = Object.entries(DEFAULTS).map(([key, value]) => ({ key, value }))
		await supabase.from('config').upsert(rows)
		try {
			localStorage.removeItem(LS_PLAYERS_KEY)
		} catch {}
		invalidateCache(CACHE_KEY_CFG)
		SoundEngine.init(DEFAULTS.MUSIC_VOLUME, DEFAULTS.SFX_VOLUME)
		set({ config: DEFAULTS, players: DEFAULT_PLAYERS, tileCategories: [] })
	},
}))
