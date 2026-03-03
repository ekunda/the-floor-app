// src/App.tsx — FINALNA WERSJA z matchmakingiem

import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AuthGuard from './components/AuthGuard'
import Game from './pages/Game'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Lobby from './pages/Lobby'
import Room from './pages/Room'
import Matchmaking from './pages/Matchmaking'
import MultiplayerGame from './pages/MultiplayerGame'
import Leaderboard from './pages/Leaderboard'
import Admin from './pages/Admin'
import AdminConfig from './pages/AdminConfig'
import AdminQuestions from './pages/AdminQuestions'
import { useAuthStore } from './store/useAuthStore'

export default function App() {
  const initialize = useAuthStore(s => s.initialize)
  useEffect(() => { initialize() }, [])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Game />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/register" element={<Auth />} />
        <Route path="/leaderboard" element={<Leaderboard />} />

        <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/lobby" element={<AuthGuard><Lobby /></AuthGuard>} />
        <Route path="/room/:code" element={<AuthGuard><Room /></AuthGuard>} />
        <Route path="/matchmaking" element={<AuthGuard><Matchmaking /></AuthGuard>} />
        <Route path="/mp-game/:id" element={<AuthGuard><MultiplayerGame /></AuthGuard>} />

        {/* Admin — UKRYTY URL, brak linku w UI */}
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/config" element={<ProtectedRoute><AdminConfig /></ProtectedRoute>} />
        <Route path="/admin/categories" element={<Navigate to="/admin/config" replace />} />
        <Route path="/admin/categories/:id/questions" element={<ProtectedRoute><AdminQuestions /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
