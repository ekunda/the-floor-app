// src/components/AuthGuard.tsx
// Chroni trasy wymagające zalogowania użytkownika
// (Oddzielny od ProtectedRoute — tamten chroni panel ADMINA)

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'

interface Props {
  children: React.ReactNode
  fallback?: string // gdzie przekierować (domyślnie /login)
}

export default function AuthGuard({ children, fallback = '/login' }: Props) {
  const navigate = useNavigate()
  const { profile, initialized } = useAuthStore()

  useEffect(() => {
    if (initialized && !profile) {
      navigate(fallback, { replace: true })
    }
  }, [initialized, profile])

  // Show nothing while checking auth
  if (!initialized) {
    return (
      <div style={{
        minHeight: '100vh', background: '#080808',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', fontFamily: "'Montserrat', sans-serif",
        fontSize: '0.85rem', letterSpacing: 2,
      }}>
        ⏳ ŁADOWANIE...
      </div>
    )
  }

  if (!profile) return null

  return <>{children}</>
}
