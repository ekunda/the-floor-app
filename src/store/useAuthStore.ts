// src/store/useAuthStore.ts

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { UserProfile } from '../types'

export type Profile = UserProfile

interface AuthStore {
  profile: UserProfile | null
  loading: boolean
  initialized: boolean

  initialize: () => Promise<void>
  register: (email: string, password: string, username: string, avatar?: string) => Promise<{ error: string | null; needsConfirmation: boolean }>
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  updateProfile: (updates: Partial<Pick<UserProfile, 'username' | 'avatar'>>) => Promise<string | null>
  refreshProfile: () => Promise<void>
}

// Tworzy lub pobiera profil gracza — fallback gdy trigger DB nie zadziałał
async function ensureProfile(userId: string, fallbackUsername?: string, fallbackAvatar?: string): Promise<UserProfile | null> {
  // Próba pobrania istniejącego profilu
  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (existing) return existing as UserProfile

  // Profil nie istnieje (trigger nie zadziałał) — utwórz ręcznie
  const username = fallbackUsername ?? `gracz_${userId.slice(0, 6)}`
  const avatar = fallbackAvatar ?? '🎮'

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({ id: userId, username, avatar, xp: 0, wins: 0, losses: 0, win_streak: 0, best_streak: 0, is_admin: false })
    .select()
    .maybeSingle()

  if (error) {
    console.error('[Auth] Nie udało się utworzyć profilu:', error.message)
    return null
  }

  return created as UserProfile
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  profile: null,
  loading: false,
  initialized: false,

  // ── Inicjalizacja przy starcie aplikacji ──────────────────
  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const profile = await ensureProfile(session.user.id)
        if (profile) set({ profile })
      }
    } catch (e) {
      console.warn('[Auth] initialize error:', e)
    } finally {
      set({ initialized: true })
    }

    // Nasłuchuj zmian sesji
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await ensureProfile(session.user.id)
        if (profile) set({ profile })
      } else if (event === 'SIGNED_OUT') {
        set({ profile: null })
      }
    })
  },

  // ── Rejestracja ───────────────────────────────────────────
  register: async (email, password, username, avatar = '🎮') => {
    set({ loading: true })

    try {
      // Sprawdź unikalność nicku
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.trim())
        .maybeSingle()

      if (existing) {
        set({ loading: false })
        return { error: 'Ta nazwa gracza jest już zajęta.', needsConfirmation: false }
      }

      // Rejestracja
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) {
        const msg = error.message.includes('already registered')
          ? 'Ten adres email jest już zarejestrowany.'
          : error.message
        set({ loading: false })
        return { error: msg, needsConfirmation: false }
      }

      if (!data.user) {
        set({ loading: false })
        return { error: 'Nie udało się utworzyć konta. Spróbuj ponownie.', needsConfirmation: false }
      }

      // Brak sesji = email confirmation wymagany
      if (!data.session) {
        set({ loading: false })
        return { error: null, needsConfirmation: true }
      }

      // Sesja dostępna = email confirmation wyłączony — utwórz / zaktualizuj profil
      await new Promise(r => setTimeout(r, 800)) // czekaj na trigger

      const profile = await ensureProfile(data.user.id, username.trim(), avatar)

      // Zaktualizuj nick i avatar (trigger mógł ustawić domyślne wartości)
      if (profile) {
        await supabase.from('profiles')
          .update({ username: username.trim(), avatar })
          .eq('id', data.user.id)

        const updated = { ...profile, username: username.trim(), avatar }
        set({ profile: updated })
      }

      set({ loading: false })
      return { error: null, needsConfirmation: false }

    } catch (e: any) {
      console.error('[Auth] register error:', e)
      set({ loading: false })
      return { error: 'Wystąpił nieoczekiwany błąd. Sprawdź połączenie.', needsConfirmation: false }
    }
  },

  // ── Logowanie ─────────────────────────────────────────────
  login: async (email, password) => {
    set({ loading: true })

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) {
        const msg = error.message.includes('Invalid login credentials')
          ? 'Nieprawidłowy email lub hasło.'
          : error.message.includes('Email not confirmed')
          ? 'Potwierdź adres email przed zalogowaniem. Sprawdź skrzynkę.'
          : error.message
        set({ loading: false })
        return msg
      }

      if (!data.user) {
        set({ loading: false })
        return 'Nie udało się zalogować. Spróbuj ponownie.'
      }

      const profile = await ensureProfile(data.user.id)
      if (profile) set({ profile })
      else {
        set({ loading: false })
        return 'Zalogowano, ale nie znaleziono profilu. Sprawdź czy uruchomiono migracje SQL w Supabase.'
      }

      set({ loading: false })
      return null

    } catch (e: any) {
      console.error('[Auth] login error:', e)
      set({ loading: false })
      return 'Wystąpił nieoczekiwany błąd. Sprawdź połączenie z internetem.'
    }
  },

  // ── Wylogowanie ───────────────────────────────────────────
  logout: async () => {
    await supabase.auth.signOut()
    set({ profile: null })
  },

  // ── Aktualizacja profilu ──────────────────────────────────
  updateProfile: async (updates) => {
    const { profile } = get()
    if (!profile) return 'Nie jesteś zalogowany.'

    if (updates.username) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', updates.username.trim())
        .neq('id', profile.id)
        .maybeSingle()

      if (existing) return 'Ta nazwa gracza jest już zajęta.'
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)

    if (error) return error.message

    await get().refreshProfile()
    return null
  },

  // ── Odświeżenie profilu ───────────────────────────────────
  refreshProfile: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const profile = await ensureProfile(user.id)
      if (profile) set({ profile })
    } catch (e) {
      console.warn('[Auth] refreshProfile error:', e)
    }
  },
}))
