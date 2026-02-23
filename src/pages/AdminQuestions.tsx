import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Question } from '../types'

export default function AdminQuestions() {
	const { id: categoryId } = useParams<{ id: string }>()
	const [questions, setQuestions] = useState<Question[]>([])
	const [answer, setAnswer] = useState('')
	const [file, setFile] = useState<File | null>(null)
	const [uploading, setUploading] = useState(false)
	const fileRef = useRef<HTMLInputElement>(null)

	const load = async () => {
		const { data } = await supabase.from('questions').select('*').eq('category_id', categoryId).order('created_at')
		setQuestions(data ?? [])
	}

	useEffect(() => {
		load()
	}, [categoryId])

	const imageUrl = (path: string | null) =>
		path ? supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl : null

	const add = async () => {
		if (!answer.trim()) return
		setUploading(true)
		let image_path: string | null = null

		if (file) {
			const ext = file.name.split('.').pop()
			const path = `${categoryId}/${crypto.randomUUID()}.${ext}`
			await supabase.storage.from('question-images').upload(path, file)
			image_path = path
		}

		await supabase.from('questions').insert({ category_id: categoryId, answer, image_path })
		setAnswer('')
		setFile(null)
		if (fileRef.current) fileRef.current.value = ''
		setUploading(false)
		load()
	}

	const remove = async (q: Question) => {
		if (q.image_path) await supabase.storage.from('question-images').remove([q.image_path])
		await supabase.from('questions').delete().eq('id', q.id)
		load()
	}

	return (
		<div className="min-h-screen bg-dark text-white p-8 max-w-3xl mx-auto">
			<h1 className="text-gold text-3xl font-bold mb-8">Pytania</h1>

			<div className="space-y-3 mb-8 bg-zinc-900 border border-zinc-700 rounded-xl p-4">
				<input
					ref={fileRef}
					type="file"
					accept="image/*"
					onChange={e => setFile(e.target.files?.[0] ?? null)}
					className="text-sm text-silver"
				/>
				<input
					value={answer}
					onChange={e => setAnswer(e.target.value)}
					placeholder="Odpowiedź"
					className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2"
				/>
				<button
					onClick={add}
					disabled={uploading}
					className="bg-gold text-dark font-bold px-6 py-2 rounded hover:brightness-110 disabled:opacity-50">
					{uploading ? 'Zapisuję...' : '+ Dodaj pytanie'}
				</button>
			</div>

			<div className="grid grid-cols-2 gap-4">
				{questions.map(q => {
					const url = imageUrl(q.image_path)
					return (
						<div key={q.id} className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 space-y-2">
							{url && <img src={url} alt={q.answer} className="w-full h-40 object-cover rounded" />}
							<p className="font-semibold text-gold">{q.answer}</p>
							<button onClick={() => remove(q)} className="text-red-400 text-sm hover:text-red-300">
								Usuń
							</button>
						</div>
					)
				})}
			</div>
		</div>
	)
}
