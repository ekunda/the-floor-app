import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Admin from './pages/Admin'
import AdminConfig from './pages/AdminConfig'
import AdminQuestions from './pages/AdminQuestions'
import AuthPage from './pages/AuthPage'
import Game from './pages/Game'
import MultiplayerGame from './pages/MultiplayerGame'
import MultiplayerLobby from './pages/MultiplayerLobby'
import Ranking from './pages/Ranking'
import UserProfile from './pages/UserProfile'
import { useAuthStore } from './store/useAuthStore'

function AppInner() {
  const initialize = useAuthStore(s => s.initialize)
  useEffect(() => { initialize() }, [])

  return (
    <Routes>
      <Route path="/" element={<Game />} />

      {/* Multiplayer */}
      <Route path="/multiplayer"              element={<MultiplayerLobby />} />
      <Route path="/multiplayer/room/:code"   element={<MultiplayerGame />} />

      {/* Auth */}
      <Route path="/login"   element={<AuthPage />} />
      <Route path="/profile" element={<UserProfile />} />
      <Route path="/ranking" element={<Ranking />} />

      {/* Admin */}
      <Route path="/admin" element={<Admin />} />
      <Route path="/admin/config" element={<ProtectedRoute><AdminConfig /></ProtectedRoute>} />
      <Route path="/admin/categories" element={<Navigate to="/admin/config" replace />} />
      <Route path="/admin/categories/:id/questions" element={<ProtectedRoute><AdminQuestions /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppInner />
    </BrowserRouter>
  )
}
