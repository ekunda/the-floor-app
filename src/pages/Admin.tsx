import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Admin() {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const navigate = useNavigate()

	const login = async (e: React.FormEvent) => {
		e.preventDefault()
		const { error } = await supabase.auth.signInWithPassword({ email, password })
		if (error) return setError(error.message)
		navigate('/admin/categories')
	}

	return (
		<div className="min-h-screen bg-dark flex items-center justify-center">
			<form onSubmit={login} className="bg-zinc-900 border border-gold p-8 rounded-xl w-80 space-y-4">
				<h1 className="text-gold text-2xl font-bold text-center">Panel Admina</h1>
				{error && <p className="text-red-400 text-sm">{error}</p>}
				<input
					type="email"
					placeholder="Email"
					className="w-full bg-zinc-800 text-white border border-zinc-700 rounded px-3 py-2"
					value={email}
					onChange={e => setEmail(e.target.value)}
				/>
				<input
					type="password"
					placeholder="Hasło"
					className="w-full bg-zinc-800 text-white border border-zinc-700 rounded px-3 py-2"
					value={password}
					onChange={e => setPassword(e.target.value)}
				/>
				<button type="submit" className="w-full bg-gold text-dark font-bold py-2 rounded hover:brightness-110">
					Zaloguj
				</button>
			</form>
		</div>
	)
}
