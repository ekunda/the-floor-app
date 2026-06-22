import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const [loading, setLoading] = useState(true)
	const [auth, setAuth] = useState(false)

	useEffect(() => {
		let cancelled = false
		;(async () => {
			const { data } = await supabase.auth.getSession()
			const uid = data.session?.user?.id
			if (!uid) {
				if (!cancelled) { setAuth(false); setLoading(false) }
				return
			}
			// Sesja to za mało — panel wymaga realnych praw administratora (profiles.is_admin)
			const { data: prof } = await supabase
				.from('profiles').select('is_admin').eq('id', uid).maybeSingle()
			if (!cancelled) {
				setAuth(!!prof?.is_admin)
				setLoading(false)
			}
		})()
		return () => { cancelled = true }
	}, [])

	if (loading)
		return (
			<div className="min-h-screen bg-black flex items-center justify-center text-yellow-400 text-xl font-bebas tracking-widest">
				Ładowanie...
			</div>
		)
	return auth ? <>{children}</> : <Navigate to="/admin" />
}
