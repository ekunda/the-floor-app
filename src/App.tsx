import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuthStore } from './store/useAuthStore'

// ── Eager — główna gra musi być natychmiastowa ────────────────────────────────
import Game from './pages/Game'

// ── Lazy — admin i multiplayer ładowane tylko gdy potrzebne ──────────────────
const Admin           = lazy(() => import('./pages/Admin'))
const AdminConfig     = lazy(() => import('./pages/AdminConfig'))
const AdminQuestions  = lazy(() => import('./pages/AdminQuestions'))
const AuthPage        = lazy(() => import('./pages/AuthPage'))
const MultiplayerGame = lazy(() => import('./pages/MultiplayerGame'))
const MultiplayerLobby = lazy(() => import('./pages/MultiplayerLobby'))
const Ranking         = lazy(() => import('./pages/Ranking'))
const UserProfile     = lazy(() => import('./pages/UserProfile'))

/** Minimalistyczny spinner widoczny podczas lazy-load chunk'a */
function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh', background: '#080808',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 40, height: 40,
        border: '3px solid rgba(212,175,55,.2)',
        borderTopColor: '#FFD700',
        borderRadius: '50%',
        animation: 'spin 0.9s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function AppInner() {
  const initialize = useAuthStore(s => s.initialize)
  useEffect(() => { initialize() }, [])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Główna gra — eager, bez Suspense overhead */}
        <Route path="/" element={
          <ErrorBoundary>
            <Game />
          </ErrorBoundary>
        } />

        {/* Multiplayer */}
        <Route path="/multiplayer" element={
          <ErrorBoundary>
            <MultiplayerLobby />
          </ErrorBoundary>
        } />
        <Route path="/multiplayer/room/:code" element={
          <ErrorBoundary>
            <MultiplayerGame />
          </ErrorBoundary>
        } />

        {/* Auth */}
        <Route path="/login"   element={<AuthPage />} />
        <Route path="/profile" element={<UserProfile />} />
        <Route path="/ranking" element={<Ranking />} />

        {/* Admin */}
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/config" element={
          <ProtectedRoute><AdminConfig /></ProtectedRoute>
        } />
        <Route path="/admin/categories" element={<Navigate to="/admin/config" replace />} />
        <Route path="/admin/categories/:id/questions" element={
          <ProtectedRoute><AdminQuestions /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppInner />
    </BrowserRouter>
  )
}
