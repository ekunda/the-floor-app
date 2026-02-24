const SOUNDS = {
	bgMusic: '/sounds/bg-music.mp3',
	duelMusic: '/sounds/duel-music.mp3',
	countdown: '/sounds/countdown.mp3',
	buzzer: '/sounds/buzzer.mp3',
	applause: '/sounds/applause.mp3',
	correct: 'sounds/correct.mp3',
}

let bgTrack: HTMLAudioElement | null = null

function make(src: string, volume = 1, loop = false): HTMLAudioElement {
	const el = new Audio(src)
	el.volume = volume
	el.loop = loop
	return el
}

export const SoundEngine = {
	play(key: keyof typeof SOUNDS, volume = 1) {
		try {
			make(SOUNDS[key], volume)
				.play()
				.catch(() => {})
		} catch {}
	},

	startBg(key: keyof typeof SOUNDS, volume = 0.3) {
		this.stopBg(0)
		try {
			bgTrack = make(SOUNDS[key], volume, true)
			bgTrack.play().catch(() => {})
		} catch {}
	},

	stopBg(fadeMs = 400) {
		if (!bgTrack) return
		const track = bgTrack
		bgTrack = null
		if (fadeMs <= 0) {
			track.pause()
			return
		}
		const step = track.volume / (fadeMs / 20)
		const iv = setInterval(() => {
			if (track.volume <= step) {
				track.pause()
				clearInterval(iv)
			} else track.volume = Math.max(0, track.volume - step)
		}, 20)
	},

	playCountdown(onDone: () => void) {
		this.play('countdown', 0.85)
		return onDone // countdown animation handled in React component
	},

	SOUNDS,
}
