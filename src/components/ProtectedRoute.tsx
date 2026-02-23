import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const [loading, setLoading] = useState(true)
	const [auth, setAuth] = useState(false)

	useEffect(() => {
		supabase.auth.getSession().then(({ data }) => {
			setAuth(!!data.session)
			setLoading(false)
		})
	}, [])

	if (loading) return <div className="text-white p-8">Ładowanie...</div>
	return auth ? <>{children}</> : <Navigate to="/admin" />
}
