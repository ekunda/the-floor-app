import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Category, Question } from '../types'

export default function AdminQuestions() {
  const { id: categoryId } = useParams<{ id: string }>()
  const [category, setCategory] = useState<Category | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answer, setAnswer] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAnswer, setEditAnswer] = useState('')
  const [editFile, setEditFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const editFileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const { data: cat } = await supabase.from('categories').select('*').eq('id', categoryId).single()
    setCategory(cat)
    const { data } = await supabase.from('questions').select('*').eq('category_id', categoryId).order('created_at')
    setQuestions(data ?? [])
  }

  useEffect(() => { if (categoryId) load() }, [categoryId])

  const imageUrl = (path: string | null) =>
    path ? supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl : null

  const uploadImage = async (f: File, prefix: string): Promise<string> => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const filename = `${prefix}-${crypto.randomUUID()}.${ext}`
    const path = `${categoryId}/${filename}`
    const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const { data, error } = await supabase.storage.from('question-images').upload(path, f, { contentType, upsert: false })
    if (error) throw new Error(error.message)
    return data.path
  }

  const add = async () => {
    if (!answer.trim()) return
    setUploading(true); setUploadError(null)
    try {
      let image_path: string | null = null
      if (file) image_path = await uploadImage(file, 'q')
      const { error } = await supabase.from('questions').insert({ category_id: categoryId, answer: answer.trim(), image_path })
      if (error) throw new Error(error.message)
      setAnswer(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e: any) {
      setUploadError(e.message ?? 'Nieznany błąd')
    } finally { setUploading(false) }
  }

  const saveEdit = async (q: Question) => {
    setUploading(true); setUploadError(null)
    try {
      let image_path = q.image_path
      if (editFile) {
        if (image_path) await supabase.storage.from('question-images').remove([image_path])
        image_path = await uploadImage(editFile, 'e')
      }
      const { error } = await supabase.from('questions').update({ answer: editAnswer, image_path }).eq('id', q.id)
      if (error) throw new Error(error.message)
      setEditingId(null); setEditFile(null)
      if (editFileRef.current) editFileRef.current.value = ''
      await load()
    } catch (e: any) {
      setUploadError(e.message ?? 'Nieznany błąd')
    } finally { setUploading(false) }
  }

  const remove = async (q: Question) => {
    if (!confirm(`Usunąć pytanie "${q.answer}"?`)) return
    try {
      if (q.image_path) await supabase.storage.from('question-images').remove([q.image_path])
      await supabase.from('questions').delete().eq('id', q.id)
      await load()
    } catch (e: any) { setUploadError(e.message ?? 'Błąd usuwania') }
  }

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '8px 12px', color: '#fff',
    fontFamily: "'Montserrat', sans-serif", fontSize: '0.9rem',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#080808', color: '#fff',
      fontFamily: "'Montserrat', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px clamp(16px, 4vw, 32px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0a0a0a', flexWrap: 'wrap' as const,
      }}>
        <Link to="/admin/config" style={{
          color: 'rgba(255,255,255,0.35)', textDecoration: 'none',
          fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6,
          transition: 'color 0.2s',
        }}
          onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color = '#fff'}
          onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(255,255,255,0.35)'}
        >← Powrót</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ fontSize: '1.5rem' }}>{category?.emoji}</span>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.2rem, 4vw, 1.8rem)',
            letterSpacing: 5, color: '#D4AF37',
          }}>{category?.name}</span>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem' }}>
            ({questions.length} {questions.length === 1 ? 'pytanie' : questions.length < 5 ? 'pytania' : 'pytań'})
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(16px, 4vw, 32px)' }}>
        {/* Error */}
        {uploadError && (
          <div style={{
            marginBottom: 16, padding: '10px 14px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, color: '#f87171', fontSize: '0.82rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>❌ {uploadError}</span>
            <button onClick={() => setUploadError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Add question form */}
        <div style={{
          padding: 20, marginBottom: 24,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
        }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 14 }}>
            DODAJ PYTANIE
          </div>

          {file && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, marginBottom: 12,
            }}>
              <img src={URL.createObjectURL(file)} alt="podgląd" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#e0e0e0', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>{(file.size / 1024).toFixed(0)} KB</div>
              </div>
              <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }} style={{
                background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: '1rem',
              }}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '8px 14px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', flexShrink: 0,
              transition: 'all 0.2s',
            }}>
              📷 Zdjęcie
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
            </label>
            <input
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !uploading && add()}
              placeholder="Odpowiedź (np. 'kot')"
              style={{ ...inp, flex: 1, minWidth: 160 }}
            />
            <button onClick={add} disabled={uploading || !answer.trim()} style={{
              padding: '8px 20px', borderRadius: 8, flexShrink: 0,
              background: uploading || !answer.trim() ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #D4AF37, #FFD700)',
              color: uploading || !answer.trim() ? 'rgba(255,255,255,0.3)' : '#000',
              border: 'none', cursor: uploading || !answer.trim() ? 'default' : 'pointer',
              fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s',
            }}>
              {uploading ? '⏳ Wysyłam…' : '+ Dodaj'}
            </button>
          </div>
        </div>

        {/* Questions grid */}
        {questions.length === 0 ? (
          <div style={{
            textAlign: 'center', color: 'rgba(255,255,255,0.2)',
            padding: 60, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12,
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📷</div>
            Brak pytań. Dodaj pierwsze powyżej.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 14,
          }}>
            {questions.map(q => {
              const url = imageUrl(q.image_path)
              const isEditing = editingId === q.id
              return (
                <div key={q.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: isEditing ? '1px solid rgba(212,175,55,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
                }}>
                  {/* Image */}
                  {isEditing && editFile ? (
                    <img src={URL.createObjectURL(editFile)} alt={q.answer} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                  ) : url ? (
                    <img src={url} alt={q.answer} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                  ) : (
                    <div style={{
                      width: '100%', height: 100, background: 'rgba(255,255,255,0.03)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'rgba(255,255,255,0.15)', fontSize: '0.75rem',
                    }}>Brak zdjęcia</div>
                  )}

                  <div style={{ padding: 12 }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          padding: '6px 10px', background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                          color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem',
                        }}>
                          📷 Zmień
                          <input ref={editFileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={e => setEditFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                        </label>
                        <input
                          value={editAnswer}
                          onChange={e => setEditAnswer(e.target.value)}
                          style={{ ...inp, fontSize: '0.85rem', padding: '6px 10px' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(q)} disabled={uploading} style={{
                            flex: 1, padding: '6px 10px', borderRadius: 6,
                            background: 'rgba(34,197,94,0.12)',
                            border: '1px solid rgba(34,197,94,0.3)',
                            color: '#4ade80', cursor: 'pointer', fontSize: '0.78rem',
                          }}>{uploading ? '⏳' : '✓ Zapisz'}</button>
                          <button onClick={() => { setEditingId(null); setEditFile(null) }} style={{
                            flex: 1, padding: '6px 10px', borderRadius: 6,
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.78rem',
                          }}>Anuluj</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{
                          color: '#D4AF37', fontWeight: 600, fontSize: '0.88rem',
                          marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{q.answer}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setEditingId(q.id); setEditAnswer(q.answer) }} style={{
                            flex: 1, padding: '5px', borderRadius: 6,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: '0.75rem',
                          }}>Edytuj</button>
                          <button onClick={() => remove(q)} style={{
                            flex: 1, padding: '5px', borderRadius: 6,
                            background: 'rgba(239,68,68,0.06)',
                            border: '1px solid rgba(239,68,68,0.18)',
                            color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: '0.75rem',
                          }}>Usuń</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
