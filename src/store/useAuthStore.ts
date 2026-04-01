/**
 * useAuthStore — Supabase Auth + Profile management
 * Supports both registered (email/password) and anonymous players
 */
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface UserProfile {
  id: string
  email?: string
  username: string
  avatar: string       // emoji fallback
  avatar_url?: string  // custom image URL
  xp: number
  wins: number
  losses: number
  win_streak: number
  best_streak: number
  status: 'online' | 'offline' | 'in_game'
  last_username_change?: string
  created_at?: string
}

interface AuthStore {
  user: UserProfile | null
  session: any | null
  loading: boolean
  error: string | null

  initialize: () => Promise<void>
  register: (email: string, password: string, username: string) => Promise<boolean>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  updateUsername: (username: string) => Promise<boolean>
  updateAvatar: (emoji: string) => Promise<boolean>
  uploadAvatarImage: (file: File) => Promise<boolean>
  refreshProfile: () => Promise<void>
  clearError: () => void
  /** Ustawia status 'in_game' gdy gracz wchodzi do gry */
  setInGame: () => Promise<void>
  /** Przywraca status 'online' po wyjściu z gry */
  setOnline: () => Promise<void>
}

const AVATARS = [
  // Zwierzęta
  '🦁','🐯','🦊','🐺','🦝','🐻','🦈','🦅','🦉','🐲','🐸','🦋','🐙','🦑','🦂',
  // Gracze / sport
  '🎮','🕹️','🎯','🎲','🏆','🥊','⚽','🏀','🏈','🎳','🎿','🏄','🤿','🧗','🎭',
  // Moc / magia
  '🔥','⚡','💎','👑','⚔️','🛡️','🔮','💫','🌟','🌈','🌊','🍀','☄️','🧿','💀',
  // Kosmos / nauka
  '🚀','🛸','🤖','👾','🧬','🔭','🧪','⚙️','🧩','💡','🎵','📡','🌍','🪐','🧠',
]

export const AVATAR_OPTIONS = AVATARS

async function loadProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as UserProfile
}

async function upsertProfile(profile: Partial<UserProfile> & { id: string }): Promise<void> {
  await supabase.from('profiles').upsert(profile, { ignoreDuplicates: false })
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

  initialize: async () => {
    set({ loading: true })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const profile = await loadProfile(session.user.id)
        set({ session, user: profile })
        if (profile) {
          await supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', profile.id)
        }
      }
    } catch (e) {
      console.warn('[Auth] init error', e)
    }
    set({ loading: false })

    // ── Heartbeat: aktualizuje last_seen co 60s ────────────────────────────
    setInterval(() => {
      const { user } = get()
      if (!user) return
      supabase.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id)
    }, 60_000)

    // ── beforeunload: ustaw offline gdy użytkownik zamknie kartę ──────────
    // keepalive: true gwarantuje wysłanie żądania mimo zamknięcia strony
    const markOfflineFetch = () => {
      const { user } = get()
      if (!user) return
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON as string,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON as string}`,
          },
          body: JSON.stringify({ status: 'offline', last_seen: new Date().toISOString() }),
          keepalive: true,
        }
      ).catch(() => {/* ignore — best effort */})
    }
    window.addEventListener('beforeunload', markOfflineFetch)

    // ── visibilitychange: online/offline gdy karta jest ukryta/widoczna ───
    document.addEventListener('visibilitychange', () => {
      const { user } = get()
      if (!user) return
      const status = document.hidden ? 'offline' : 'online'
      supabase.from('profiles').update({ status, last_seen: new Date().toISOString() }).eq('id', user.id)
    })

    // Listen for auth changes
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await loadProfile(session.user.id)
        set({ session, user: profile })
        if (profile) {
          await supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', profile.id)
        }
      } else if (event === 'SIGNED_OUT') {
        set({ session: null, user: null })
      }
    })
  },

  register: async (email, password, username) => {
    set({ error: null })
    const trimmed = username.trim().toUpperCase().slice(0, 20)
    if (trimmed.length < 3) {
      set({ error: 'Nick musi mieć co najmniej 3 znaki' })
      return false
    }

    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) { set({ error: error.message }); return false }
      if (!data.user) { set({ error: 'Błąd rejestracji' }); return false }

      // Create profile
      const profile: UserProfile = {
        id: data.user.id,
        email,
        username: trimmed,
        avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
        xp: 0, wins: 0, losses: 0, win_streak: 0, best_streak: 0,
        status: 'online',
        last_username_change: new Date().toISOString(),
      }
      await upsertProfile(profile)
      set({ user: profile })
      return true
    } catch (e: any) {
      set({ error: e.message ?? 'Nieznany błąd' })
      return false
    }
  },

  login: async (email, password) => {
    set({ error: null })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        set({ error: error.message === 'Invalid login credentials' ? 'Nieprawidłowy email lub hasło' : error.message })
        return false
      }
      if (!data.user) { set({ error: 'Błąd logowania' }); return false }

      const profile = await loadProfile(data.user.id)
      if (!profile) { set({ error: 'Nie znaleziono profilu' }); return false }

      await supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', profile.id)
      set({ user: { ...profile, status: 'online' } })
      return true
    } catch (e: any) {
      set({ error: e.message ?? 'Nieznany błąd' })
      return false
    }
  },

  logout: async () => {
    const { user } = get()
    if (user) {
      await supabase.from('profiles').update({ status: 'offline' }).eq('id', user.id)
    }
    await supabase.auth.signOut()
    set({ user: null, session: null })
  },

  updateUsername: async (username) => {
    const { user } = get()
    if (!user) return false
    const trimmed = username.trim().toUpperCase().slice(0, 20)
    if (trimmed.length < 3) { set({ error: 'Nick musi mieć co najmniej 3 znaki' }); return false }

    // Weekly change check
    if (user.last_username_change) {
      const lastChange = new Date(user.last_username_change)
      const daysSince = (Date.now() - lastChange.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSince < 7) {
        const daysLeft = Math.ceil(7 - daysSince)
        set({ error: `Zmianę nicku możesz wykonać za ${daysLeft} ${daysLeft === 1 ? 'dzień' : 'dni'}` })
        return false
      }
    }

    const now = new Date().toISOString()
    const { error } = await supabase.from('profiles')
      .update({ username: trimmed, last_username_change: now, updated_at: now })
      .eq('id', user.id)
    if (error) { set({ error: error.message }); return false }
    set({ user: { ...user, username: trimmed, last_username_change: now } })
    return true
  },

  updateAvatar: async (emoji) => {
    const { user } = get()
    if (!user) return false
    const { error } = await supabase.from('profiles').update({ avatar: emoji, updated_at: new Date().toISOString() }).eq('id', user.id)
    if (error) { set({ error: error.message }); return false }
    set({ user: { ...user, avatar: emoji } })
    return true
  },

  uploadAvatarImage: async (file) => {
    const { user } = get()
    if (!user) return false
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) { set({ error: upErr.message }); return false }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', user.id)
      set({ user: { ...user, avatar_url: publicUrl } })
      return true
    } catch (e: any) {
      set({ error: e.message }); return false
    }
  },

  refreshProfile: async () => {
    const { user } = get()
    if (!user) return
    const profile = await loadProfile(user.id)
    if (profile) set({ user: profile })
  },

  clearError: () => set({ error: null }),

  setInGame: async () => {
    const { user } = get()
    if (!user) return
    await supabase.from('profiles').update({ status: 'in_game', last_seen: new Date().toISOString() }).eq('id', user.id)
    set({ user: { ...user, status: 'in_game' } })
  },

  setOnline: async () => {
    const { user } = get()
    if (!user) return
    await supabase.from('profiles').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', user.id)
    set({ user: { ...user, status: 'online' } })
  },
}))
