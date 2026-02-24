import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { GameConfig } from '../types'

const DEFAULTS: GameConfig = {
	GRID_COLS: 4,
	GRID_ROWS: 3,
	TILE_SIZE: 230,
	DUEL_TIME: 45,
	PASS_PENALTY: 2,
	FEEDBACK_MS: 1000,
	WIN_CLOSE_MS: 3000,
	TOAST_MS: 1600,
}

interface ConfigStore {
	config: GameConfig
	loading: boolean
	fetch: () => Promise<void>
	update: (key: keyof GameConfig, value: number) => Promise<void>
}

export const useConfigStore = create<ConfigStore>(set => ({
	config: DEFAULTS,
	loading: false,

	fetch: async () => {
		set({ loading: true })
		try {
			const { data } = await supabase.from('config').select('*')
			if (data && data.length > 0) {
				const merged = { ...DEFAULTS }
				data.forEach(({ key, value }: { key: string; value: string }) => {
					if (key in merged) (merged as Record<string, number>)[key] = Number(value)
				})
				set({ config: merged })
			}
		} catch (e) {
			console.warn('[Config] fallback to defaults', e)
		}
		set({ loading: false })
	},

	update: async (key, value) => {
		await supabase.from('config').upsert({ key, value: String(value) })
		set(s => ({ config: { ...s.config, [key]: value } }))
	},
}))
