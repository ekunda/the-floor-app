import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Category } from '../types'

export default function AdminCategories() {
	const [cats, setCats] = useState<Category[]>([])
	const [name, setName] = useState('')
	const [emoji, setEmoji] = useState('🎯')

	const load = async () => {
		const { data } = await supabase.from('categories').select('*').order('created_at')
		setCats(data ?? [])
	}

	useEffect(() => {
		load()
	}, [])

	const add = async () => {
		if (!name.trim()) return
		await supabase.from('categories').insert({ name: name.trim(), emoji })
		setName('')
		setEmoji('🎯')
		load()
	}

	const remove = async (id: string) => {
		await supabase.from('categories').delete().eq('id', id)
		load()
	}

	return (
		<div className="min-h-screen bg-dark text-white p-8 max-w-3xl mx-auto">
			<h1 className="text-gold text-3xl font-bold mb-8">Kategorie</h1>

			{/* Dodaj nową */}
			<div className="flex gap-3 mb-8">
				<input
					value={emoji}
					onChange={e => setEmoji(e.target.value)}
					className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 w-16 text-center text-2xl"
				/>
				<input
					value={name}
					onChange={e => setName(e.target.value)}
					placeholder="Nazwa kategorii"
					className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2"
				/>
				<button onClick={add} className="bg-gold text-dark font-bold px-6 py-2 rounded hover:brightness-110">
					+ Dodaj
				</button>
			</div>

			{/* Lista */}
			<ul className="space-y-3">
				{cats.map(cat => (
					<li
						key={cat.id}
						className="flex items-center justify-between bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3">
						<span className="text-xl">
							{cat.emoji} {cat.name}
						</span>
						<div className="flex gap-3">
							<Link to={`/admin/categories/${cat.id}/questions`} className="text-gold hover:underline text-sm">
								Pytania
							</Link>
							<button onClick={() => remove(cat.id)} className="text-red-400 hover:text-red-300 text-sm">
								Usuń
							</button>
						</div>
					</li>
				))}
			</ul>

			<Link to="/admin/config" className="inline-block mt-8 text-silver hover:text-white underline">
				⚙️ Edytuj konfigurację gry
			</Link>
		</div>
	)
}
