import { useEffect } from 'react'
import { useConfigStore } from '../store/useConfigStore'
import { GameConfig } from '../types'

const LABELS: Record<keyof GameConfig, string> = {
	GRID_COLS: 'Kolumny planszy',
	GRID_ROWS: 'Wiersze planszy',
	TILE_SIZE: 'Rozmiar kafelka (px)',
	DUEL_TIME: 'Czas gracza (sekundy)',
	PASS_PENALTY: 'Kara za pas (sekundy)',
	FEEDBACK_MS: 'Czas feedbacku (ms)',
	WIN_CLOSE_MS: 'Czas popupu wygranej (ms)',
	TOAST_MS: 'Czas toastu (ms)',
}

export default function AdminConfig() {
	const { config, fetch, update } = useConfigStore()
	useEffect(() => {
		fetch()
	}, [])

	return (
		<div className="min-h-screen bg-dark text-white p-8 max-w-xl mx-auto">
			<h1 className="text-gold text-3xl font-bold mb-8">⚙️ Konfiguracja gry</h1>
			<div className="space-y-4">
				{(Object.keys(LABELS) as (keyof GameConfig)[]).map(key => (
					<div
						key={key}
						className="flex justify-between items-center
            bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3">
						<label className="text-silver">{LABELS[key]}</label>
						<input
							type="number"
							value={config[key]}
							onChange={e => update(key, Number(e.target.value))}
							className="w-24 bg-zinc-800 border border-zinc-600 rounded px-2 py-1
                text-right text-gold font-mono"
						/>
					</div>
				))}
			</div>
		</div>
	)
}
