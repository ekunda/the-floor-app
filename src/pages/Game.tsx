import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Board from '../components/Board'
import DuelModal from '../components/DuelModal'
import LoadingScreen from '../components/game/LoadingScreen'
import ScoreBar from '../components/game/ScoreBar'
import SplashScreen from '../components/game/SplashScreen'
import { SoundEngine } from '../lib/SoundEngine'
import { hasGameState } from '../lib/persistence'
import { useConfigStore } from '../store/useConfigStore'
import { computeStats, useGameStore } from '../store/useGameStore'
import { gameCSS, styles } from './Game.styles'

type AppState = 'splash' | 'restoring' | 'loading' | 'game'

export default function Game() {
	const navigate = useNavigate()
	const loadCategories = useGameStore(s => s.loadCategories)
	const restoreSession = useGameStore(s => s.restoreSession)
	const newGame = useGameStore(s => s.newGame)
	const moveCursor = useGameStore(s => s.moveCursor)
	const startChallenge = useGameStore(s => s.startChallenge)
	const lotteryPick = useGameStore(s => s.lotteryPick)
	const duel = useGameStore(s => s.duel)
	const toastText = useGameStore(s => s.toastText)
	const tiles = useGameStore(s => s.tiles)
	const showStats = useGameStore(s => s.showStats)
	const toggleStats = useGameStore(s => s.toggleStats)
	const { fetch: fetchConfig, players, config } = useConfigStore()
	const lotteryEnabled = config.LOTTERY_PICK === 1

	const [appState, setAppState] = useState<AppState>('splash')

	const stats = computeStats(tiles)

	// ── On mount: check if there's a saved game to restore ──
	useEffect(() => {
		if (hasGameState()) {
			setAppState('restoring')
			SoundEngine.startBg('bgMusic', 0.3)
			restoreSession().then(ok => {
				setAppState(ok ? 'game' : 'splash')
			})
		}
	}, [])

	// ── Start fresh game ──
	const handleStart = async () => {
		SoundEngine.startBg('bgMusic', 0.3)
		setAppState('loading')
		await Promise.all([fetchConfig(), loadCategories()])
		setAppState('game')
	}

	// ── Go to multiplayer lobby ──
	const handleMultiplayer = () => {
		navigate('/multiplayer')
	}

	// ── Keyboard controls ──
	useEffect(() => {
		if (appState !== 'game' || duel) return
		const handler = (e: KeyboardEvent) => {
			if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault()
					moveCursor('up')
					break
				case 'ArrowDown':
					e.preventDefault()
					moveCursor('down')
					break
				case 'ArrowLeft':
					e.preventDefault()
					moveCursor('left')
					break
				case 'ArrowRight':
					e.preventDefault()
					moveCursor('right')
					break
				case 'Enter':
					e.preventDefault()
					startChallenge()
					break
				case 'n':
				case 'N':
					if (!e.ctrlKey) newGame()
					break
				case 's':
				case 'S':
					if (!e.ctrlKey) toggleStats()
					break
				case 'l':
				case 'L':
					if (!e.ctrlKey && lotteryEnabled) {
						e.preventDefault()
						lotteryPick()
					}
					break
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
	// Zustand actions są stabilnymi referencjami — nie trzeba ich w deps.
	// duel i appState zmieniają się i faktycznie wpływają na handler.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [appState, duel, lotteryEnabled])

	if (appState === 'splash')    return <SplashScreen onStart={handleStart} onMultiplayer={handleMultiplayer} />
	if (appState === 'restoring') return <LoadingScreen label="Wznawianie gry…" />
	if (appState === 'loading')   return <LoadingScreen />

	/* ── MAIN GAME ── */
	return (
		<div style={styles.gameRoot}>
			<style>{gameCSS}</style>
			<div style={styles.vignette} />

			{/* Header */}
			<header style={styles.header}>
				<div style={styles.headerLogo}>THE FLOOR</div>
			</header>

			{/* Board */}
			<main style={styles.boardArea}>
				<Board />
			</main>

			{/* Stats panel */}
			{showStats && !duel && tiles.length > 0 && <ScoreBar players={players} stats={stats} />}

			{/* Footer */}
			{!duel && (
				<footer style={styles.footer}>
					<OpBtn onClick={newGame}>🎮 Nowa gra</OpBtn>
					<OpBtn onClick={startChallenge} gold>
						▶ Pojedynek
					</OpBtn>
					<OpBtn onClick={toggleStats}>{showStats ? '📊 Ukryj' : '📊 Statystyki'}</OpBtn>
					<OpBtn onClick={() => navigate('/multiplayer')}>🌐 Online</OpBtn>
				</footer>
			)}

			{/* Key hint */}
			{!duel && (
				<div style={styles.keyHint}>
					↑↓←→ poruszanie · ENTER pojedynek · S statystyki · N nowa gra
					{lotteryEnabled ? ' · L losuj kategorię' : ''}
				</div>
			)}

			{/* Toast */}
			{toastText && <div style={styles.toast}>{toastText}</div>}

			<DuelModal />
		</div>
	)
}

function OpBtn({ children, onClick, gold }: { children: React.ReactNode; onClick: () => void; gold?: boolean }) {
	return (
		<button onClick={onClick} className={gold ? 'op-btn op-btn-gold' : 'op-btn'}>
			{children}
		</button>
	)
}
