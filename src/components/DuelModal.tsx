import { useCallback, useEffect, useRef, useState } from 'react'
import { SoundEngine } from '../lib/SoundEngine'
import { supabase } from '../lib/supabase'
import { useConfigStore } from '../store/useConfigStore'
import { useGameStore } from '../store/useGameStore'

type FeedbackType = 'correct' | 'pass' | 'timeout' | ''
type WinnerNum = 1 | 2 | 'draw' | null

export default function DuelModal() {
	const duel = useGameStore(s => s.duel)
	const markCorrect = useGameStore(s => s.markCorrect)
	const pass = useGameStore(s => s.pass)
	const closeDuel = useGameStore(s => s.closeDuel)
	const startFight = useGameStore(s => s.startFight)
	const blockInput = useGameStore(s => s.blockInput)
	const nextQuestion = useGameStore(s => s.nextQuestion)
	const endDuelWithWinner = useGameStore(s => s.endDuelWithWinner)
	const endDuelDraw = useGameStore(s => s.endDuelDraw)
	const { config, players } = useConfigStore()

	const [countdown, setCountdown] = useState<string | null>(null)
	const [imageUrl, setImageUrl] = useState<string>('')
	const [feedback, setFeedback] = useState<{ text: string; type: FeedbackType }>({ text: '', type: '' })
	const [winner, setWinner] = useState<WinnerNum>(null)
	const [intervalId, setIntervalId] = useState<ReturnType<typeof setInterval> | null>(null)

	const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const winnerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const winnerHandled = useRef(false)
	// ── FIX: track all countdown timeouts so ESC can cancel them ──
	const countdownTimeouts = useRef<ReturnType<typeof setTimeout>[]>([])

	const isOpen = !!duel

	/* ── Stop bgMusic when modal opens ── */
	useEffect(() => {
		if (isOpen) SoundEngine.stopBg(1000)
	}, [isOpen])

	/* ── Resolve image URL ── */
	const resolveImageUrl = useCallback((imagePath: string | null | undefined): string => {
		if (!imagePath) return ''
		return supabase.storage.from('question-images').getPublicUrl(imagePath).data.publicUrl
	}, [])

	/* ── Update image when question changes ── */
	useEffect(() => {
		if (!duel?.currentQuestion) {
			setImageUrl('')
			return
		}
		setImageUrl(resolveImageUrl(duel.currentQuestion.image_path))
	}, [duel?.currentQuestion?.id, resolveImageUrl])

	/* ── Ticker: start/stop based on duel state ── */
	useEffect(() => {
		const shouldRun = duel?.started && !duel.paused
		if (!shouldRun) {
			if (intervalId) {
				clearInterval(intervalId)
				setIntervalId(null)
			}
			return
		}
		if (intervalId) return
		const tick = useGameStore.getState().tick
		const id = setInterval(tick, 1000)
		setIntervalId(id)
		return () => {
			clearInterval(id)
			setIntervalId(null)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [duel?.started, duel?.paused])

	/* ── Handle timer expiry ── */
	useEffect(() => {
		const d = duel
		if (!d?.started || !d.paused || winnerHandled.current) return
		if (d.timer1 > 0 && d.timer2 > 0) return

		if (intervalId) {
			clearInterval(intervalId)
			setIntervalId(null)
		}
		winnerHandled.current = true

		const loserIsP1 = d.timer1 <= 0
		const loserIsP2 = d.timer2 <= 0

		showFeedback('⏰ Czas minął!', 'timeout')

		winnerTimer.current = setTimeout(() => {
			if (loserIsP1 && loserIsP2) {
				setWinner('draw')
				endDuelDraw()
				SoundEngine.play('applause', volumeFactor(0.6))
				winnerTimer.current = setTimeout(handleClose, config.WIN_CLOSE_MS)
			} else {
				const winnerNum: 1 | 2 = loserIsP1 ? 2 : 1
				setWinner(winnerNum)
				endDuelWithWinner(winnerNum)
				SoundEngine.play('applause', volumeFactor(0.9))
				winnerTimer.current = setTimeout(handleClose, config.WIN_CLOSE_MS)
			}
		}, 1200)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [duel?.timer1, duel?.timer2, duel?.paused])

	/* ── Cleanup on duel close ── */
	useEffect(() => {
		if (!duel) {
			if (intervalId) {
				clearInterval(intervalId)
				setIntervalId(null)
			}
			setCountdown(null)
			setFeedback({ text: '', type: '' })
			setWinner(null)
			setImageUrl('')
			winnerHandled.current = false
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [duel])

	/* ── Volume helper ── */
	const volumeFactor = (base: number) => base * (config.SOUND_VOLUME / 100)

	/* ── Cancel all pending countdown timeouts ── */
	const cancelCountdown = useCallback(() => {
		countdownTimeouts.current.forEach(id => clearTimeout(id))
		countdownTimeouts.current = []
		setCountdown(null)
	}, [])

	/* ── Countdown animation ── */
	const runCountdown = useCallback(() => {
		SoundEngine.play('countdown', volumeFactor(0.85))

		const steps = [
			{ label: '3', delay: 0 },
			{ label: '2', delay: 1000 },
			{ label: '1', delay: 2000 },
			{ label: 'START!', delay: 3000 },
		]

		// Store each timeout ID so we can cancel them on ESC
		steps.forEach(({ label, delay }) => {
			const id = setTimeout(() => setCountdown(label), delay)
			countdownTimeouts.current.push(id)
		})

		const finalId = setTimeout(() => {
			setCountdown(null)
			countdownTimeouts.current = []
			const q = nextQuestion()
			useGameStore.setState(s => ({
				duel: s.duel ? { ...s.duel, paused: false, currentQuestion: q } : null,
			}))
			SoundEngine.startBg('duelMusic', volumeFactor(0.22))
		}, 4300)
		countdownTimeouts.current.push(finalId)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [nextQuestion, config.SOUND_VOLUME])

	/* ── Keyboard handler ── */
	useEffect(() => {
		if (!isOpen) return
		const handler = (e: KeyboardEvent) => {
			if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return

			if (!duel?.started) {
				if (e.key === 'Enter') {
					e.preventDefault()
					handleStartFight()
				}
				if (e.key === 'Escape') {
					e.preventDefault()
					handleClose()
				}
				return
			}

			switch (e.key) {
				case 'a':
				case 'A':
					e.preventDefault()
					handleCorrect(1)
					break
				case 'd':
				case 'D':
					e.preventDefault()
					handleCorrect(2)
					break
				case 'p':
				case 'P':
				case ' ':
					e.preventDefault()
					handlePass()
					break
				case 'Escape':
					e.preventDefault()
					handleClose()
					break
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, duel?.started, blockInput, countdown])

	/* ── Helpers ── */
	const showFeedback = (text: string, type: FeedbackType) => {
		setFeedback({ text, type })
		if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
		feedbackTimer.current = setTimeout(() => setFeedback({ text: '', type: '' }), config.FEEDBACK_MS + 300)
	}

	const handleStartFight = () => {
		startFight()
		setTimeout(runCountdown, 50)
	}

	const handleCorrect = (playerNum: 1 | 2) => {
		if (!duel?.started || blockInput || countdown) return
		if (duel.active !== playerNum) return
		const ans = duel.currentQuestion?.answer ?? '???'
		SoundEngine.play('correct', volumeFactor(0.75))
		showFeedback(`✓  ${ans}`, 'correct')
		markCorrect(playerNum)
	}

	const handlePass = () => {
		if (!duel?.started || blockInput || countdown) return
		const ans = duel.currentQuestion?.answer ?? '???'
		SoundEngine.play('buzzer', volumeFactor(0.4))
		showFeedback(`⏱ PAS  ·  ${ans}`, 'pass')
		pass()
	}

	const handleClose = () => {
		// ── FIX: cancel all pending countdown timeouts first ──
		cancelCountdown()

		if (intervalId) {
			clearInterval(intervalId)
			setIntervalId(null)
		}
		if (winnerTimer.current) clearTimeout(winnerTimer.current)
		if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
		SoundEngine.stopBg(500)
		setTimeout(() => SoundEngine.startBg('bgMusic', volumeFactor(0.3)), 600)
		closeDuel()
	}

	if (!duel) return null

	const t1 = duel.timer1
	const t2 = duel.timer2
	const p1 = players[0]
	const p2 = players[1]

	const timerColor = (t: number) => (t <= 5 ? '#ef4444' : t <= 15 ? '#facc15' : '#ffffff')
	const timerGlow = (t: number) =>
		t <= 5 ? '0 0 30px rgba(239,68,68,0.7)' : t <= 15 ? '0 0 20px rgba(250,204,21,0.5)' : 'none'

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				zIndex: 50,
				display: 'flex',
				alignItems: 'stretch',
				background: 'rgba(0,0,0,0.92)',
				backdropFilter: 'blur(10px)',
				padding: '10px',
			}}>
			<div
				style={{
					position: 'relative',
					background: 'linear-gradient(160deg, #111 0%, #0a0a0a 100%)',
					border: '1px solid rgba(212,175,55,0.35)',
					borderRadius: 14,
					height: '100%',
					boxShadow: '0 0 80px rgba(212,175,55,0.15)',
					width: '100%',
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
				}}>
				{/* Header */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 10,
						padding: '12px 48px',
						borderBottom: '1px solid rgba(255,255,255,0.06)',
						background: 'rgba(255,255,255,0.02)',
						flexShrink: 0,
					}}>
					<span style={{ fontSize: '1.4rem' }}>{duel.emoji}</span>
					<span
						style={{
							fontFamily: "'Bebas Neue', sans-serif",
							fontSize: '1.5rem',
							letterSpacing: 6,
							color: '#D4AF37',
						}}>
						{duel.categoryName}
					</span>
				</div>

				{/* START SCREEN */}
				{!duel.started && (
					<div
						style={{
							flex: 1,
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 20,
							padding: '40px 24px',
						}}>
						<div style={{ fontSize: '6rem', lineHeight: 1 }}>{duel.emoji}</div>
						<div
							style={{
								fontFamily: "'Bebas Neue', sans-serif",
								fontSize: '2.5rem',
								letterSpacing: 8,
								color: '#fff',
							}}>
							{duel.categoryName}
						</div>
						<div
							style={{
								display: 'flex',
								gap: 32,
								color: 'rgba(255,255,255,0.35)',
								fontSize: '0.8rem',
								letterSpacing: 2,
							}}>
							<span>
								<kbd className="kbd">ENTER</kbd> Rozpocznij
							</span>
							<span>
								<kbd className="kbd">ESC</kbd> Anuluj
							</span>
						</div>
						<button
							onClick={handleStartFight}
							style={{
								marginTop: 12,
								padding: '14px 48px',
								fontFamily: "'Bebas Neue', sans-serif",
								fontSize: '1.4rem',
								letterSpacing: 6,
								background: 'linear-gradient(135deg, #D4AF37, #FFD700)',
								color: '#000',
								border: 'none',
								borderRadius: 50,
								cursor: 'pointer',
								boxShadow: '0 0 30px rgba(212,175,55,0.35)',
								transition: 'all 0.2s',
							}}>
							▶ ROZPOCZNIJ
						</button>
					</div>
				)}

				{/* FIGHT SCREEN */}
				{duel.started && (
					<div
						style={{
							flex: 1,
							display: 'grid',
							gridTemplateColumns: 'min(18vw, 200px) 1fr min(18vw, 200px)',
							minHeight: 0,
							overflow: 'hidden',
						}}>
						{/* Gold */}
						<PlayerPanel
							name={p1.name}
							shortcut="A"
							timer={t1}
							active={duel.active === 1}
							color={p1.color}
							borderSide="right"
							timerColor={timerColor(t1)}
							timerGlow={timerGlow(t1)}
						/>

						{/* Center */}
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								padding: '16px 20px 12px',
								gap: 0,
								position: 'relative',
								overflow: 'hidden',
							}}>
							{/* Image */}
							<div
								style={{
									flex: 1,
									width: '100%',
									minHeight: 0,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									borderRadius: '12px 12px 0 0',
									overflow: 'hidden',
									background: 'rgba(255,255,255,0.03)',
									border: '1px solid rgba(255,255,255,0.07)',
									borderBottom: 'none',
								}}>
								{imageUrl ? (
									<img
										src={imageUrl}
										alt="Pytanie"
										style={{
											width: '100%',
											height: '100%',
											objectFit: 'contain',
											borderRadius: '12px 12px 0 0',
										}}
									/>
								) : (
									<div
										style={{
											display: 'flex',
											flexDirection: 'column',
											alignItems: 'center',
											justifyContent: 'center',
											gap: 8,
											padding: 40,
										}}>
										<span style={{ fontSize: '5rem' }}>{duel.emoji}</span>
										<span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', letterSpacing: 2 }}>
											WCZYTYWANIE PYTANIA
										</span>
									</div>
								)}
							</div>

							{/* Answer bar */}
							<div
								style={{
									width: '100%',
									minHeight: 64,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: feedback.text
										? feedback.type === 'correct'
											? 'rgba(34,197,94,0.15)'
											: feedback.type === 'pass'
												? 'rgba(251,146,60,0.15)'
												: 'rgba(248,113,113,0.12)'
										: 'rgba(255,255,255,0.04)',
									border: `1px solid ${
										feedback.text
											? feedback.type === 'correct'
												? 'rgba(34,197,94,0.4)'
												: feedback.type === 'pass'
													? 'rgba(251,146,60,0.4)'
													: 'rgba(248,113,113,0.35)'
											: 'rgba(255,255,255,0.07)'
									}`,
									borderRadius: '0 0 12px 12px',
									padding: '10px 20px',
									transition: 'background 0.25s, border-color 0.25s',
								}}>
								<span
									style={{
										fontFamily: "'Bebas Neue', sans-serif",
										fontSize: 'clamp(1.4rem, 3.5vh, 2.2rem)',
										letterSpacing: 5,
										fontWeight: 700,
										color: '#ffffff',
										textShadow: feedback.text
											? feedback.type === 'correct'
												? '0 0 30px rgba(34,197,94,0.8), 0 2px 4px rgba(0,0,0,0.8)'
												: feedback.type === 'pass'
													? '0 0 30px rgba(251,146,60,0.8), 0 2px 4px rgba(0,0,0,0.8)'
													: '0 0 30px rgba(248,113,113,0.8), 0 2px 4px rgba(0,0,0,0.8)'
											: 'none',
										opacity: feedback.text ? 1 : 0.2,
										transition: 'all 0.2s',
										textAlign: 'center',
									}}>
									{feedback.text || '— — —'}
								</span>
							</div>

							{/* Controls hint */}
							<div
								style={{
									display: 'flex',
									gap: 16,
									color: 'rgba(255,255,255,0.18)',
									fontSize: '0.68rem',
									letterSpacing: 1.5,
									textAlign: 'center',
									marginTop: 10,
									flexShrink: 0,
								}}>
								<span>
									<kbd className="kbd">P</kbd> / <kbd className="kbd">SPACJA</kbd> pas (−{config.PASS_PENALTY}s)
								</span>
								<span>·</span>
								<span>
									<kbd className="kbd">ESC</kbd> zakończ
								</span>
							</div>
						</div>

						{/* Silver */}
						<PlayerPanel
							name={p2.name}
							shortcut="D"
							timer={t2}
							active={duel.active === 2}
							color={p2.color}
							borderSide="left"
							timerColor={timerColor(t2)}
							timerGlow={timerGlow(t2)}
						/>
					</div>
				)}

				{/* Countdown overlay */}
				{countdown && (
					<div
						style={{
							position: 'absolute',
							inset: 0,
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							background: 'rgba(0,0,0,0.92)',
							borderRadius: 14,
							zIndex: 10,
						}}>
						<div
							style={{
								fontFamily: "'Bebas Neue', sans-serif",
								fontSize: countdown === 'START!' ? '6rem' : '10rem',
								lineHeight: 1,
								color: countdown === 'START!' ? '#4ade80' : countdown === '1' ? '#f97316' : '#FFD700',
								textShadow: '0 0 100px currentColor, 0 0 40px currentColor',
								userSelect: 'none',
								animation: 'countPop 0.3s ease-out',
							}}>
							{countdown}
						</div>
					</div>
				)}

				{/* Winner popup */}
				{winner && <WinnerOverlay winner={winner} players={players} />}

				{/* Close button */}
				<button
					onClick={handleClose}
					style={{
						position: 'absolute',
						top: 12,
						right: 16,
						background: 'none',
						border: 'none',
						color: 'rgba(255,255,255,0.3)',
						fontSize: '1.2rem',
						cursor: 'pointer',
						transition: 'color 0.2s',
						lineHeight: 1,
					}}
					onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
					onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
					✕
				</button>
			</div>

			<style>{`
        @keyframes countPop {
          from { transform: scale(1.4); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes winnerReveal {
          from { transform: scale(0.8) translateY(20px); opacity: 0; }
          to   { transform: scale(1)   translateY(0);    opacity: 1; }
        }
        @keyframes confettiDrop {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
        }
      `}</style>
		</div>
	)
}

/* ── Player Panel ── */
function PlayerPanel({
	name,
	shortcut,
	timer,
	active,
	color,
	borderSide,
	timerColor,
	timerGlow,
}: {
	name: string
	shortcut: string
	timer: number
	active: boolean
	color: string
	borderSide: 'left' | 'right'
	timerColor: string
	timerGlow: string
}) {
	const bgActive = `${color}14`
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 'clamp(8px, 2vh, 20px)',
				padding: 'clamp(16px, 3vh, 40px) 12px',
				borderLeft: borderSide === 'left' ? '1px solid rgba(255,255,255,0.08)' : 'none',
				borderRight: borderSide === 'right' ? '1px solid rgba(255,255,255,0.08)' : 'none',
				background: active ? bgActive : 'transparent',
				opacity: active ? 1 : 0.4,
				transition: 'all 0.4s ease',
				position: 'relative',
			}}>
			<div
				style={{
					width: 8,
					height: 8,
					borderRadius: '50%',
					background: active ? color : 'rgba(255,255,255,0.1)',
					boxShadow: active ? `0 0 16px ${color}, 0 0 32px ${color}40` : 'none',
					transition: 'all 0.3s',
				}}
			/>
			<div
				style={{
					fontFamily: "'Bebas Neue', sans-serif",
					fontSize: '0.95rem',
					letterSpacing: 5,
					color,
				}}>
				{name}
			</div>
			<div
				style={{
					fontFamily: "'Bebas Neue', sans-serif",
					fontSize: 'clamp(3.5rem, 9vh, 8rem)',
					lineHeight: 1,
					color: timerColor,
					textShadow: timerGlow,
					transition: 'color 0.5s, text-shadow 0.5s',
				}}>
				{timer}
			</div>
			<div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', letterSpacing: 2 }}>
				<kbd className="kbd">{shortcut}</kbd> poprawna
			</div>
			{active && (
				<div
					style={{
						position: 'absolute',
						top: '25%',
						bottom: '25%',
						[borderSide]: 0,
						width: 3,
						borderRadius: 4,
						background: color,
						boxShadow: `0 0 12px ${color}`,
					}}
				/>
			)}
		</div>
	)
}

/* ── Winner Overlay ── */
function WinnerOverlay({
	winner,
	players,
}: {
	winner: 1 | 2 | 'draw'
	players: [{ name: string; color: string }, { name: string; color: string }]
}) {
	const isDraw = winner === 'draw'
	const color = isDraw ? '#C0C0C0' : winner === 1 ? players[0].color : players[1].color
	const label = isDraw ? 'REMIS' : winner === 1 ? `${players[0].name} ZWYCIĘŻA!` : `${players[1].name} ZWYCIĘŻA!`
	const sublabel = isDraw ? 'Pole bez zmian' : 'Pole przejęte!'
	const icon = isDraw ? '⚖️' : winner === 1 ? '🥇' : '🥈'

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				background: 'rgba(0,0,0,0.93)',
				borderRadius: 14,
				zIndex: 20,
				gap: 16,
			}}>
			{!isDraw &&
				Array.from({ length: 16 }).map((_, i) => (
					<div
						key={i}
						style={{
							position: 'absolute',
							top: `${10 + Math.random() * 30}%`,
							left: `${5 + (i / 16) * 90}%`,
							width: 8,
							height: 8,
							borderRadius: i % 3 === 0 ? '50%' : 2,
							background: i % 2 === 0 ? color : i % 3 === 0 ? '#fff' : 'rgba(255,255,255,0.4)',
							animation: `confettiDrop ${1.2 + Math.random() * 1.2}s ease-in ${Math.random() * 0.5}s both`,
						}}
					/>
				))}
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					gap: 16,
					animation: 'winnerReveal 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
				}}>
				<div style={{ fontSize: '6rem', lineHeight: 1 }}>{icon}</div>
				<div
					style={{
						fontFamily: "'Bebas Neue', sans-serif",
						fontSize: 'clamp(2rem, 6vw, 3.5rem)',
						letterSpacing: 8,
						color,
						textShadow: `0 0 40px ${color}80, 0 0 80px ${color}40`,
					}}>
					{label}
				</div>
				<div
					style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', letterSpacing: 4, textTransform: 'uppercase' }}>
					{sublabel}
				</div>
				<div style={{ marginTop: 8, color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', letterSpacing: 2 }}>
					Automatyczne zamknięcie…
				</div>
			</div>
		</div>
	)
}
