import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Admin from './pages/Admin'
import AdminConfig from './pages/AdminConfig'
import AdminQuestions from './pages/AdminQuestions'
import Game from './pages/Game'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Game />} />

        {/* Login */}
        <Route path="/admin" element={<Admin />} />

        {/* Main admin panel (merged config + categories) */}
        <Route
          path="/admin/config"
          element={
            <ProtectedRoute>
              <AdminConfig />
            </ProtectedRoute>
          }
        />

        {/* Legacy redirect — if anyone navigates to /admin/categories */}
        <Route path="/admin/categories" element={<Navigate to="/admin/config" replace />} />

        {/* Questions editor (per category) */}
        <Route
          path="/admin/categories/:id/questions"
          element={
            <ProtectedRoute>
              <AdminQuestions />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
