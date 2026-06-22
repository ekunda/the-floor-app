import { describe, expect, it } from 'vitest'
import {
  buildMatchData, isAnswerMatch, isAnswerMatchFast, isPassCommand, normalizeText,
} from './useSpeechRecognition'

describe('normalizeText', () => {
  it('lowercases and strips Polish diacritics', () => {
    expect(normalizeText('Kraków')).toBe('krakow')
    expect(normalizeText('ŁÓDŹ')).toBe('lodz')
    expect(normalizeText('Gdańsk')).toBe('gdansk')
    expect(normalizeText('żółć')).toBe('zolc')
  })

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeText('  to,  jest!  Kraków?  ')).toBe('to jest krakow')
  })
})

describe('isPassCommand', () => {
  it('recognises Polish and English pass words as whole words', () => {
    for (const w of ['pas', 'pass', 'dalej', 'następne', 'pomijam', 'skip', 'przejdź']) {
      expect(isPassCommand(w), w).toBe(true)
    }
  })

  it('matches a pass word embedded in a phrase', () => {
    expect(isPassCommand('no dobra dalej')).toBe(true)
  })

  it('does not treat answers as pass commands', () => {
    expect(isPassCommand('kraków')).toBe(false)
    expect(isPassCommand('paszport')).toBe(false) // "pas" must be a whole word
  })
})

describe('answer matching', () => {
  it('matches an exact single-word answer ignoring diacritics', () => {
    expect(isAnswerMatch('Kraków', 'kraków')).toBe(true)
    expect(isAnswerMatch('krakow', 'Kraków')).toBe(true)
  })

  it('matches a single-word answer embedded in a longer transcript', () => {
    expect(isAnswerMatch('to jest kraków', 'Kraków')).toBe(true)
  })

  it('matches via synonyms', () => {
    expect(isAnswerMatch('auto', 'samochód', ['auto', 'wóz'])).toBe(true)
  })

  it('rejects unrelated transcripts', () => {
    expect(isAnswerMatch('warszawa', 'Kraków')).toBe(false)
  })

  it('fast path agrees with the convenience wrapper', () => {
    const md = buildMatchData('Gdańsk', ['gdansk'])
    expect(isAnswerMatchFast('gdańsk', md)).toBe(true)
    expect(isAnswerMatchFast('poznań', md)).toBe(false)
  })

  it('does no fuzzy multi-word matching on interims (strict)', () => {
    const md = buildMatchData('wieża eiffla')
    // strict (interim) requires the whole phrase, not just scattered words
    expect(isAnswerMatchFast('eiffla', md, true)).toBe(false)
    // final (non-strict) accepts all words present in any order
    expect(isAnswerMatchFast('eiffla wieża', md, false)).toBe(true)
  })
})
