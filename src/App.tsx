import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Admin from './pages/Admin'
import AdminCategories from './pages/AdminCategories'
import AdminConfig from './pages/AdminConfig'
import AdminQuestions from './pages/AdminQuestions'
import Game from './pages/Game'

export default function App() {
	return (
		<BrowserRouter basename="/the-floor-app">
			<Routes>
				<Route path="/" element={<Game />} />
				<Route path="/admin" element={<Admin />} />
				<Route
					path="/admin/categories"
					element={
						<ProtectedRoute>
							<AdminCategories />
						</ProtectedRoute>
					}
				/>
				<Route
					path="/admin/categories/:id/questions"
					element={
						<ProtectedRoute>
							<AdminQuestions />
						</ProtectedRoute>
					}
				/>
				<Route
					path="/admin/config"
					element={
						<ProtectedRoute>
							<AdminConfig />
						</ProtectedRoute>
					}
				/>
				<Route path="*" element={<Navigate to="/" />} />
			</Routes>
		</BrowserRouter>
	)
}
