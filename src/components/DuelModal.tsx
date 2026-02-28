// ─────────────────────────────────────────────────────────────────────────────
// DuelModal.tsx — Modal pojedynku
//
// KLUCZOWA NAPRAWA PODWÓJNEGO PASA:
//   Problem: "pas" wykrywany ZARÓWNO w interim JAK I final wynikach rozpoznawania.
//   Chrome wysyła: interim:"pa" → interim:"pas" → final:"pas"
//   Po interim "pas" → pytanie zmienia się po FEEDBACK_MS → nowy questionId
//   → final "pas" trafia na NOWE pytanie → drugi pas się wykonuje.
//
//   Rozwiązanie: tryVoiceMatch(transcript, isFinal)
//   isPassCommand() wywoływane TYLKO gdy isFinal === true.
//   Interim sprawdza TYLKO odpowiedzi (time-sensitive), nigdy pas.
//
// NOWE FUNKCJE:
//   - config.VOICE_PASS = 0 → głosowy pas wyłączony całkowicie
//   - config.MAX_PASSES = N → limit pasów, po N pasach forfeit
//   - config.SHOW_ANSWER_HINT = 1 → pierwsza litera po 10s braku aktywności
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { SoundEngine } from '../lib/SoundEngine'
import { supabase } from '../lib/supabase'
import type { MatchData } from '../lib/useSpeechRecognition'
import {
	buildMatchData,
	isAnswerMatchFast,
	isPassCommand,
	isSpeechRecognitionSupported,
	useSpeechRecognition,
} from '../lib/useSpeechRecognition'
import { useConfigStore } from '../store/useConfigStore'
import { useGameStore } from '../store/useGameStore'

type FeedbackType = 'correct' | 'pass' | 'timeout' | 'voice' | 'forfeit' | ''
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
	const [speechEnabled, setSpeechEnabled] = useState(true)
	const [hintLetter, setHintLetter] = useState<string | null>(null)

	const speechSupported = isSpeechRecognitionSupported()
	const voicePassEnabled = config.VOICE_PASS !== 0
	const maxPasses = config.MAX_PASSES ?? 0

	// ── Interval jako REF (nie state — eliminuje stale closure) ───────────────
	const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null)

	// ── Stable refs ───────────────────────────────────────────────────────────
	const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const winnerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
	const winnerHandled = useRef(false)
	const countdownTimeouts = useRef<ReturnType<typeof setTimeout>[]>([])

	const duelRef = useRef(duel)
	const blockRef = useRef(blockInput)
	const countdownRef = useRef(countdown)
	const activePlayerRef = useRef<1 | 2>(1)
	const voicePassRef = useRef(voicePassEnabled)

	// OPTYMALIZACJA: pre-obliczone dane pytania (normalized + regex cache)
	// Obliczane RAZ przy zmianie pytania, nie przy każdym zdarzeniu mowy
	const matchDataRef = useRef<MatchData | null>(null)
	const updateGrammarRef = useRef<((a: string, s?: string[]) => void) | null>(null)

	const handlePassRef = useRef<() => void>(() => {})
	const handleCorrectRef = useRef<(p: 1 | 2, fromVoice?: boolean) => void>(() => {})
	const handleCloseRef = useRef<() => void>(() => {})

	const matchedQuestionIdRef = useRef<string | null>(null)
	const passedQuestionIdRef = useRef<string | null>(null)
	const prevActiveTimerRef = useRef<number | null>(null)
	const pasDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Aktualizuj refs co render
	duelRef.current = duel
	blockRef.current = blockInput
	countdownRef.current = countdown
	activePlayerRef.current = duel?.active ?? 1
	voicePassRef.current = voicePassEnabled

	const isOpen = !!duel
	const vol = (base: number) => base // SoundEngine używa wewnętrznie SFX_VOLUME

	// ── Reset + pre-obliczanie danych pytania ─────────────────────────────────
	useEffect(() => {
		const q = duel?.currentQuestion
		const answer = q?.answer ?? ''
		const synonyms = Array.isArray(q?.synonyms) ? q!.synonyms : []

		// Pre-oblicz normalized phrases + skompiluj regexy — RAZ na zmianę pytania
		matchDataRef.current = answer ? buildMatchData(answer, synonyms) : null

		// Zaktualizuj gramatykę w recognition (poprawia trafność Chrome ASR)
		if (answer && updateGrammarRef.current) {
			updateGrammarRef.current(answer, synonyms)
		}

		matchedQuestionIdRef.current = null
		passedQuestionIdRef.current = null
		setHintLetter(null)

		if (hintTimer.current) clearTimeout(hintTimer.current)
		if (config.SHOW_ANSWER_HINT === 1 && q?.answer) {
			hintTimer.current = setTimeout(() => {
				setHintLetter(q.answer[0]?.toUpperCase() ?? null)
			}, 10000)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [duel?.currentQuestion?.id])

	useEffect(() => {
		if (isOpen) SoundEngine.stopBg(600)
	}, [isOpen])

	// ── Beepy timera 3·2·1 ───────────────────────────────────────────────────
	useEffect(() => {
		if (!duel?.started || duel.paused || countdown) {
			prevActiveTimerRef.current = null
			return
		}
		const activeTimer = duel.active === 1 ? duel.timer1 : duel.timer2
		const prev = prevActiveTimerRef.current
		prevActiveTimerRef.current = activeTimer
		if (prev !== null && activeTimer < prev && activeTimer >= 1 && activeTimer <= 3) {
			SoundEngine.timerBeep(activeTimer as 1 | 2 | 3, vol(1))
		}
	}, [duel?.timer1, duel?.timer2, duel?.active, duel?.started, duel?.paused, countdown])

	// ── Image URL ─────────────────────────────────────────────────────────────
	useEffect(() => {
		if (!duel?.currentQuestion?.image_path) {
			setImageUrl('')
			return
		}
		const { data } = supabase.storage.from('question-images').getPublicUrl(duel.currentQuestion.image_path)
		setImageUrl(data.publicUrl)
	}, [duel?.currentQuestion?.id])

	// ── Ticker ────────────────────────────────────────────────────────────────
	useEffect(() => {
		const shouldRun = duel?.started && !duel.paused
		if (!shouldRun) {
			if (intervalIdRef.current) {
				clearInterval(intervalIdRef.current)
				intervalIdRef.current = null
			}
			return
		}
		if (intervalIdRef.current) return
		intervalIdRef.current = setInterval(useGameStore.getState().tick, 1000)
		return () => {
			if (intervalIdRef.current) {
				clearInterval(intervalIdRef.current)
				intervalIdRef.current = null
			}
		}
	}, [duel?.started, duel?.paused])

	// ── Koniec timera ─────────────────────────────────────────────────────────
	useEffect(() => {
		const d = duel
		if (!d?.started || !d.paused || winnerHandled.current) return
		if (d.timer1 > 0 && d.timer2 > 0) return
		if (intervalIdRef.current) {
			clearInterval(intervalIdRef.current)
			intervalIdRef.current = null
		}

		winnerHandled.current = true
		showFeedback('⏰ Czas minął!', 'timeout')

		winnerTimer.current = setTimeout(() => {
			const p1Lost = d.timer1 <= 0
			const p2Lost = d.timer2 <= 0
			if (p1Lost && p2Lost) {
				setWinner('draw')
				endDuelDraw()
				SoundEngine.play('applause', vol(0.6))
			} else {
				const w: 1 | 2 = p1Lost ? 2 : 1
				setWinner(w)
				endDuelWithWinner(w)
				SoundEngine.play('applause', vol(0.9))
			}
			winnerTimer.current = setTimeout(() => handleCloseRef.current(), config.WIN_CLOSE_MS)
		}, 1200)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [duel?.timer1, duel?.timer2, duel?.paused])

	// ── Cleanup gdy modal zamknięty ───────────────────────────────────────────
	useEffect(() => {
		if (!duel) {
			if (intervalIdRef.current) {
				clearInterval(intervalIdRef.current)
				intervalIdRef.current = null
			}
			if (hintTimer.current) {
				clearTimeout(hintTimer.current)
				hintTimer.current = null
			}
			if (pasDebounceTimer.current) {
				clearTimeout(pasDebounceTimer.current)
				pasDebounceTimer.current = null
			}
			setCountdown(null)
			setFeedback({ text: '', type: '' })
			setWinner(null)
			setImageUrl('')
			setHintLetter(null)
			winnerHandled.current = false
			matchedQuestionIdRef.current = passedQuestionIdRef.current = null
			prevActiveTimerRef.current = null
		}
	}, [duel])

	const cancelCountdown = useCallback(() => {
		countdownTimeouts.current.forEach(clearTimeout)
		countdownTimeouts.current = []
		setCountdown(null)
	}, [])

	const showFeedback = (text: string, type: FeedbackType) => {
		if (hintTimer.current) clearTimeout(hintTimer.current)
		setHintLetter(null)
		setFeedback({ text, type })
		if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
		feedbackTimer.current = setTimeout(() => setFeedback({ text: '', type: '' }), config.FEEDBACK_MS + 300)
	}

	const runCountdown = useCallback(() => {
		SoundEngine.play('countdown', vol(0.85))
		;[
			{ label: '3', delay: 0 },
			{ label: '2', delay: 1000 },
			{ label: '1', delay: 2000 },
			{ label: 'START!', delay: 3000 },
		].forEach(({ label, delay }) => {
			const id = setTimeout(() => setCountdown(label), delay)
			countdownTimeouts.current.push(id)
		})
		const finalId = setTimeout(() => {
			setCountdown(null)
			countdownTimeouts.current = []
			prevActiveTimerRef.current = null
			const q = nextQuestion()
			useGameStore.setState(s => ({
				duel: s.duel ? { ...s.duel, paused: false, currentQuestion: q } : null,
			}))
			SoundEngine.startBg('duelMusic', vol(0.22))
		}, 4300)
		countdownTimeouts.current.push(finalId)
	}, [nextQuestion])

	const handleStartFight = () => {
		startFight()
		SoundEngine.unlockAudio().catch(() => {})
		setTimeout(runCountdown, 50)
	}

	const handleCorrect = (playerNum: 1 | 2, fromVoice = false) => {
		if (!duelRef.current?.started || blockRef.current || countdownRef.current) return
		if (duelRef.current.active !== playerNum) return
		const ans = duelRef.current.currentQuestion?.answer ?? '???'
		SoundEngine.play('correct', vol(0.75))
		showFeedback(fromVoice ? `🎤 ${ans}` : `✓  ${ans}`, fromVoice ? 'voice' : 'correct')
		markCorrect(playerNum)
	}

	const handlePass = () => {
		if (!duelRef.current?.started || blockRef.current || countdownRef.current) return
		const d = duelRef.current
		const ans = d.currentQuestion?.answer ?? '???'

		// MAX_PASSES: sprawdź forfeit
		if (maxPasses > 0 && (d.passCount ?? 0) >= maxPasses) {
			SoundEngine.play('buzzer', vol(0.6))
			showFeedback('🚫 Przekroczono limit pasów!', 'forfeit')
			// Aktywny gracz przegrywa
			const loser = d.active
			const winner2 = (loser === 1 ? 2 : 1) as 1 | 2
			setTimeout(() => {
				setWinner(winner2)
				endDuelWithWinner(winner2)
				SoundEngine.play('applause', vol(0.9))
				winnerTimer.current = setTimeout(() => handleCloseRef.current(), config.WIN_CLOSE_MS)
			}, 1200)
			return
		}

		SoundEngine.play('buzzer', vol(0.4))
		showFeedback(`⏱ PAS  ·  ${ans}`, 'pass')
		pass()
	}

	const handleClose = useCallback(() => {
		cancelCountdown()
		if (intervalIdRef.current) {
			clearInterval(intervalIdRef.current)
			intervalIdRef.current = null
		}
		if (winnerTimer.current) clearTimeout(winnerTimer.current)
		if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
		if (hintTimer.current) clearTimeout(hintTimer.current)
		SoundEngine.stopBg(500)
		setTimeout(() => SoundEngine.startBg('bgMusic', vol(0.3)), 600)
		closeDuel()
	}, [cancelCountdown, closeDuel])

	handleCloseRef.current = handleClose
	handlePassRef.current = handlePass
	handleCorrectRef.current = handleCorrect

	// ─────────────────────────────────────────────────────────────────────────
	// ─────────────────────────────────────────────────────────────────────────
	// tryVoiceMatch — hybrydowe wykrywanie pasa z debounce 180ms
	//
	// Problem "tylko final": wolne (~300–500ms po zakończeniu słowa)
	// Problem "tylko interim": "pasta","pasuje" interim="pas" → fałszywy pas
	//
	// Rozwiązanie — debounce na interim:
	//   interim "pas"    → zaplanuj za 180ms
	//   interim "pasuje" → anuluj (transcript się wydłużył, nie pasuje już)
	//   final   "pas"    → odpal natychmiast, anuluj pending
	// ─────────────────────────────────────────────────────────────────────────
	const firePas = useCallback((questionId: string | null) => {
		if (passedQuestionIdRef.current === questionId) return
		passedQuestionIdRef.current = questionId
		handlePassRef.current()
	}, [])

	const tryVoiceMatch = useCallback(
		(transcript: string, isFinal: boolean) => {
			const d = duelRef.current
			if (!d?.started || blockRef.current || countdownRef.current) return
			const questionId = d.currentQuestion?.id ?? null

			// ── PAS ──────────────────────────────────────────────────────────────────
			if (voicePassRef.current && isPassCommand(transcript)) {
				if (passedQuestionIdRef.current === questionId) {
					if (pasDebounceTimer.current) {
						clearTimeout(pasDebounceTimer.current)
						pasDebounceTimer.current = null
					}
					return
				}
				if (isFinal) {
					if (pasDebounceTimer.current) {
						clearTimeout(pasDebounceTimer.current)
						pasDebounceTimer.current = null
					}
					firePas(questionId)
				} else {
					if (pasDebounceTimer.current) return
					pasDebounceTimer.current = setTimeout(() => {
						pasDebounceTimer.current = null
						const cur = duelRef.current
						if (!cur?.started || blockRef.current) return
						firePas(cur.currentQuestion?.id ?? null)
					}, 180)
				}
				return
			}

			// Transcript rozwinął się poza "pas" (np. "pasuje") → anuluj debounce
			if (pasDebounceTimer.current) {
				clearTimeout(pasDebounceTimer.current)
				pasDebounceTimer.current = null
			}

			// ── ODPOWIEDŹ: interim (strict) i final (fuzzy) ───────────────────────────
			if (matchedQuestionIdRef.current === questionId) return
			const matchData = matchDataRef.current
			if (!matchData) return

			if (isAnswerMatchFast(transcript, matchData, !isFinal)) {
				matchedQuestionIdRef.current = questionId
				handleCorrectRef.current(activePlayerRef.current, true)
			}
		},
		[firePas]
	)

	const handleInterimResult = useCallback((t: string) => tryVoiceMatch(t, false), [tryVoiceMatch])
	const handleFinalResult = useCallback((t: string) => tryVoiceMatch(t, true), [tryVoiceMatch])

	const {
		listening,
		error: speechError,
		updateGrammar,
	} = useSpeechRecognition({
		onFinal: handleFinalResult,
		onInterim: handleInterimResult,
		active: speechEnabled && !!duel?.started,
		lang: duel?.lang === 'both' ? ['pl-PL', 'en-US'] : (duel?.lang ?? 'pl-PL'),
	})
	// Przechowaj updateGrammar w ref żeby useEffect przy zmianie pytania mógł go wywołać
	updateGrammarRef.current = updateGrammar

	// ── Keyboard ──────────────────────────────────────────────────────────────
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
					handleCloseRef.current()
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
				case 'm':
				case 'M':
					if (speechSupported) setSpeechEnabled(s => !s)
					break
				case 'Escape':
					e.preventDefault()
					handleCloseRef.current()
					break
			}
		}
		window.addEventListener('keydown', handler)
		return () => window.removeEventListener('keydown', handler)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen, duel?.started, blockInput, countdown, speechSupported])

	if (!duel) return null

	const t1 = duel.timer1
	const t2 = duel.timer2
	const p1 = players[0]
	const p2 = players[1]
	const passCount = duel.passCount ?? 0
	const passLeft = maxPasses > 0 ? maxPasses - passCount : null

	const timerColor = (t: number) => (t <= 5 ? '#ef4444' : t <= 15 ? '#facc15' : '#ffffff')
	const timerGlow = (t: number) =>
		t <= 5 ? '0 0 30px rgba(239,68,68,0.7)' : t <= 15 ? '0 0 20px rgba(250,204,21,0.5)' : 'none'

	const fbBg = (type: FeedbackType) =>
		!feedback.text
			? 'rgba(255,255,255,0.04)'
			: type === 'correct' || type === 'voice'
				? 'rgba(34,197,94,0.15)'
				: type === 'pass'
					? 'rgba(251,146,60,0.15)'
					: type === 'forfeit'
						? 'rgba(239,68,68,0.15)'
						: 'rgba(248,113,113,0.12)'
	const fbBorder = (type: FeedbackType) =>
		!feedback.text
			? 'rgba(255,255,255,0.07)'
			: type === 'correct' || type === 'voice'
				? 'rgba(34,197,94,0.4)'
				: type === 'pass'
					? 'rgba(251,146,60,0.4)'
					: type === 'forfeit'
						? 'rgba(239,68,68,0.5)'
						: 'rgba(248,113,113,0.35)'
	const fbGlow = (type: FeedbackType) =>
		!feedback.text
			? 'none'
			: type === 'correct'
				? '0 0 30px rgba(34,197,94,0.8)'
				: type === 'voice'
					? '0 0 30px rgba(34,197,94,0.8), 0 0 60px rgba(99,220,255,0.4)'
					: type === 'pass'
						? '0 0 30px rgba(251,146,60,0.8)'
						: type === 'forfeit'
							? '0 0 40px rgba(239,68,68,1)'
							: '0 0 30px rgba(248,113,113,0.8)'
	const fbColor = (type: FeedbackType) =>
		type === 'pass' || type === 'forfeit'
			? '#fb923c'
			: type === 'correct' || type === 'voice'
				? '#4ade80'
				: type === 'timeout'
					? '#ef4444'
					: 'rgba(255,255,255,0.15)'

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
				padding: 10,
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
						padding: '10px 56px',
						borderBottom: '1px solid rgba(255,255,255,0.06)',
						background: 'rgba(255,255,255,0.02)',
						flexShrink: 0,
						position: 'relative',
					}}>
					<span style={{ fontSize: '1.4rem' }}>{duel.emoji}</span>
					<span
						style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 6, color: '#D4AF37' }}>
						{duel.categoryName}
					</span>

					{/* Licznik pasów */}
					{passLeft !== null && (
						<span
							style={{
								position: 'absolute',
								left: 16,
								top: '50%',
								transform: 'translateY(-50%)',
								fontSize: '0.7rem',
								letterSpacing: 1,
								color: passLeft <= 1 ? '#ef4444' : 'rgba(255,255,255,0.3)',
								padding: '2px 8px',
								borderRadius: 20,
								background: passLeft <= 1 ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
								border: `1px solid ${passLeft <= 1 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)'}`,
							}}>
							PAS: {passLeft}
						</span>
					)}

					{/* Mikrofon toggle — zawsze dostępny; VOICE_PASS kontroluje tylko słowo "pas" */}
					{duel.started && speechSupported && (
						<button
							onClick={() => setSpeechEnabled(s => !s)}
							title={speechEnabled ? 'Wyłącz mikrofon (M)' : 'Włącz mikrofon (M)'}
							style={{
								position: 'absolute',
								right: 52,
								top: '50%',
								transform: 'translateY(-50%)',
								background: 'none',
								border: 'none',
								cursor: 'pointer',
								padding: 6,
							}}>
							<span
								style={{
									display: 'inline-block',
									width: 10,
									height: 10,
									borderRadius: '50%',
									background: speechEnabled ? (listening ? '#4ade80' : '#818cf8') : 'rgba(255,255,255,0.2)',
									boxShadow: listening ? '0 0 8px #4ade80' : 'none',
									animation: listening ? 'micPulse 1.5s ease-in-out infinite' : 'none',
								}}
							/>
						</button>
					)}

					<button
						onClick={() => handleCloseRef.current()}
						style={{
							position: 'absolute',
							top: '50%',
							right: 16,
							transform: 'translateY(-50%)',
							background: 'none',
							border: 'none',
							color: 'rgba(255,255,255,0.3)',
							fontSize: '1.2rem',
							cursor: 'pointer',
							lineHeight: 1,
						}}
						onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
						onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
						✕
					</button>
				</div>

				{/* Pre-fight */}
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
							style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.5rem', letterSpacing: 8, color: '#fff' }}>
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

						{speechSupported && (
							<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 10,
										padding: '10px 20px',
										background: 'rgba(255,255,255,0.03)',
										border: '1px solid rgba(255,255,255,0.08)',
										borderRadius: 30,
									}}>
									<span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>🎤 Rozpoznawanie mowy</span>
									<button
										onClick={() => setSpeechEnabled(s => !s)}
										style={{
											width: 44,
											height: 24,
											borderRadius: 12,
											position: 'relative',
											cursor: 'pointer',
											background: speechEnabled ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)',
											border: `1px solid ${speechEnabled ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.15)'}`,
											transition: 'all 0.25s',
										}}>
										<div
											style={{
												position: 'absolute',
												top: 3,
												left: speechEnabled ? 22 : 3,
												width: 16,
												height: 16,
												borderRadius: '50%',
												transition: 'all 0.25s',
												background: speechEnabled ? '#818cf8' : 'rgba(255,255,255,0.4)',
											}}
										/>
									</button>
								</div>
								{!voicePassEnabled && speechEnabled && (
									<div style={{ color: 'rgba(255,165,0,0.5)', fontSize: '0.7rem', letterSpacing: 1 }}>
										🎤 odpowiedzi głosowe aktywne · pas tylko klawiszem P
									</div>
								)}
							</div>
						)}

						<button
							onClick={handleStartFight}
							style={{
								marginTop: 8,
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
							}}>
							▶ ROZPOCZNIJ
						</button>
					</div>
				)}

				{/* Fight */}
				{duel.started && (
					<div
						style={{
							flex: 1,
							display: 'grid',
							gridTemplateColumns: 'min(18vw, 200px) 1fr min(18vw, 200px)',
							minHeight: 0,
							overflow: 'hidden',
						}}>
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

						{/* Centrum */}
						<div
							style={{
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								padding: '12px 16px 10px',
								position: 'relative',
								overflow: 'hidden',
							}}>
							{/* Obrazek */}
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
									position: 'relative',
								}}>
								{imageUrl ? (
									<img
										src={imageUrl}
										alt="question"
										style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none' }}
										draggable={false}
									/>
								) : (
									<div style={{ fontSize: '4rem', opacity: 0.3 }}>{duel.emoji}</div>
								)}
								{/* Wskazówka pierwszej litery */}
								{hintLetter && config.SHOW_ANSWER_HINT === 1 && (
									<div
										style={{
											position: 'absolute',
											bottom: 8,
											right: 8,
											background: 'rgba(0,0,0,0.7)',
											borderRadius: 6,
											padding: '4px 10px',
											fontFamily: "'Bebas Neue', sans-serif",
											fontSize: '1.2rem',
											letterSpacing: 4,
											color: 'rgba(255,215,0,0.7)',
											border: '1px solid rgba(255,215,0,0.2)',
										}}>
										{hintLetter}…
									</div>
								)}
							</div>

							{/* Feedback bar */}
							<div
								style={{
									width: '100%',
									flexShrink: 0,
									minHeight: 56,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									padding: '8px 16px',
									textAlign: 'center',
									background: fbBg(feedback.type),
									border: `1px solid ${fbBorder(feedback.type)}`,
									borderTop: 'none',
									borderRadius: '0 0 12px 12px',
									boxShadow: fbGlow(feedback.type),
									transition: 'all 0.3s ease',
								}}>
								<span
									style={{
										fontFamily: "'Bebas Neue', sans-serif",
										fontSize: 'clamp(1rem, 3vw, 1.6rem)',
										letterSpacing: 4,
										color: fbColor(feedback.type),
									}}>
									{feedback.text || '…'}
								</span>
							</div>

							{/* Sterowanie */}
							<div
								style={{
									flexShrink: 0,
									marginTop: 8,
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									flexWrap: 'wrap',
									justifyContent: 'center',
									color: 'rgba(255,255,255,0.2)',
									fontSize: '0.68rem',
									letterSpacing: 1.5,
								}}>
								{speechSupported && voicePassEnabled && (
									<>
										<span
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 4,
												padding: '3px 8px',
												borderRadius: 20,
												background: speechEnabled ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
												border: `1px solid ${speechEnabled ? 'rgba(129,140,248,0.6)' : 'rgba(255,255,255,0.18)'}`,
											}}>
											<kbd className="kbd">M</kbd> mikrofon {speechEnabled ? 'wł.' : 'wył.'}
										</span>
										<span>·</span>
									</>
								)}
								<span>
									<kbd className="kbd">P</kbd> pas
								</span>
								<span>·</span>
								<span>
									<kbd className="kbd">ESC</kbd> zakończ
								</span>
							</div>

							{speechError && (
								<div
									style={{
										marginTop: 4,
										padding: '3px 12px',
										background: 'rgba(239,68,68,0.1)',
										border: '1px solid rgba(239,68,68,0.3)',
										borderRadius: 6,
										color: '#f87171',
										fontSize: '0.72rem',
										textAlign: 'center',
									}}>
									⚠️ {speechError}
								</div>
							)}
						</div>

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
							}}>
							{countdown}
						</div>
					</div>
				)}

				{winner && <WinnerOverlay winner={winner} players={players} />}
			</div>

			<style>{`
        @keyframes micPulse { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:.5; transform:scale(1.3) } }
        @keyframes winnerReveal { from { transform:scale(.8) translateY(20px); opacity:0 } to { transform:scale(1) translateY(0); opacity:1 } }
        @keyframes confettiDrop { 0% { transform:translateY(-20px) rotate(0deg); opacity:1 } 100% { transform:translateY(120px) rotate(720deg); opacity:0 } }
        .kbd { display:inline-block; padding:1px 6px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:4px; font-family:monospace; font-size:.85em }
      `}</style>
		</div>
	)
}

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
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 'clamp(6px,1.5vh,16px)',
				padding: 'clamp(12px,2.5vh,32px) 12px',
				borderLeft: borderSide === 'left' ? '1px solid rgba(255,255,255,0.08)' : 'none',
				borderRight: borderSide === 'right' ? '1px solid rgba(255,255,255,0.08)' : 'none',
				background: active ? `${color}14` : 'transparent',
				opacity: active ? 1 : 0.4,
				transition: 'all 0.4s ease',
				position: 'relative',
			}}>
			<div
				style={{
					width: 10,
					height: 10,
					borderRadius: '50%',
					background: active ? color : 'rgba(255,255,255,0.1)',
					boxShadow: active ? `0 0 16px ${color}, 0 0 32px ${color}40` : 'none',
					transition: 'all 0.3s',
				}}
			/>
			<div
				style={{
					fontFamily: "'Bebas Neue', sans-serif",
					fontSize: 'clamp(1.3rem, 3.5vw, 2rem)',
					letterSpacing: 4,
					color,
					textAlign: 'center',
					lineHeight: 1.1,
					textShadow: active ? `0 0 20px ${color}80` : 'none',
					transition: 'text-shadow 0.3s',
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
					transition: 'color .5s, text-shadow .5s',
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
							background: i % 2 === 0 ? color : '#fff',
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
					animation: 'winnerReveal .5s cubic-bezier(.34,1.56,.64,1) both',
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
				<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', letterSpacing: 4 }}>
					{isDraw ? 'Pole bez zmian' : 'Pole przejęte!'}
				</div>
			</div>
		</div>
	)
}
