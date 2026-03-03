// src/lib/auth.ts — NOWY
// Helpery autentykacji użytkowników (oddzielne od logiki admina)

import { supabase } from './supabase'
import { UserProfile } from '../types'

// ─────────────────────────────────────────────────────────────
// REJESTRACJA
// ─────────────────────────────────────────────────────────────

export interface RegisterResult {
  success: boolean
  error?: string
  requiresEmailConfirmation?: boolean
}

/**
 * Rejestruje nowego użytkownika.
 * Trigger w Supabase automatycznie tworzy rekord w `profiles`.
 * Następnie aktualizujemy go wybraną nazwą i avatarem.
 */
export async function registerUser(
  email: string,
  password: string,
  username: string,
  avatar: string = '🎮',
): Promise<RegisterResult> {
  // 1. Sprawdź unikalność nicku
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username.trim())
    .maybeSingle()

  if (existing) {
    return { success: false, error: 'Ta nazwa gracza jest już zajęta.' }
  }

  // 2. Zarejestruj w Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) {
    // Przyjazne komunikaty błędów
    const msg = error.message.includes('already registered')
      ? 'Ten adres email jest już zarejestrowany.'
      : error.message.includes('Password should be')
      ? 'Hasło musi mieć co najmniej 6 znaków.'
      : error.message
    return { success: false, error: msg }
  }

  if (!data.user) {
    return { success: false, error: 'Nie udało się utworzyć konta.' }
  }

  // 3. Trigger tworzy profil — poczekaj chwilę
  await new Promise(r => setTimeout(r, 600))

  // 4. Zaktualizuj profil wybraną nazwą i avatarem
  await supabase
    .from('profiles')
    .update({ username: username.trim(), avatar })
    .eq('id', data.user.id)

  // Sprawdź czy email wymaga potwierdzenia
  const requiresEmailConfirmation =
    data.session === null && data.user.identities?.length === 0

  return { success: true, requiresEmailConfirmation }
}

// ─────────────────────────────────────────────────────────────
// LOGOWANIE
// ─────────────────────────────────────────────────────────────

export interface LoginResult {
  success: boolean
  error?: string
}

export async function loginUser(
  email: string,
  password: string,
): Promise<LoginResult> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })

  if (error) {
    const msg = error.message.includes('Invalid login credentials')
      ? 'Nieprawidłowy email lub hasło.'
      : error.message.includes('Email not confirmed')
      ? 'Potwierdź swój adres email przed zalogowaniem.'
      : error.message
    return { success: false, error: msg }
  }

  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// WYLOGOWANIE
// ─────────────────────────────────────────────────────────────

export async function logoutUser(): Promise<void> {
  await supabase.auth.signOut()
}

// ─────────────────────────────────────────────────────────────
// PROFIL
// ─────────────────────────────────────────────────────────────

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data as UserProfile
}

export interface UpdateProfileResult {
  success: boolean
  error?: string
}

export async function updateUserProfile(
  userId: string,
  updates: Partial<Pick<UserProfile, 'username' | 'avatar'>>,
): Promise<UpdateProfileResult> {
  // Sprawdź unikalność nicku jeśli zmieniony
  if (updates.username) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', updates.username.trim())
      .neq('id', userId)
      .maybeSingle()

    if (existing) {
      return { success: false, error: 'Ta nazwa gracza jest już zajęta.' }
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─────────────────────────────────────────────────────────────
// WALIDACJA
// ─────────────────────────────────────────────────────────────

export function validateUsername(username: string): string | null {
  if (username.length < 3) return 'Nazwa musi mieć co najmniej 3 znaki.'
  if (username.length > 20) return 'Nazwa może mieć maksymalnie 20 znaków.'
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return 'Dozwolone: litery, cyfry, podkreślnik (_)'
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'Hasło musi mieć co najmniej 6 znaków.'
  return null
}
