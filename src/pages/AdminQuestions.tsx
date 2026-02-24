import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Category, Question } from '../types'

type TabType = 'single' | 'bulk'

export default function AdminQuestions() {
  const { id: categoryId } = useParams<{ id: string }>()
  const [category, setCategory] = useState<Category | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [tab, setTab] = useState<TabType>('single')

  // Single add
  const [answer, setAnswer] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Bulk add
  const [bulkFiles, setBulkFiles] = useState<File[]>([])
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAnswer, setEditAnswer] = useState('')
  const [editFile, setEditFile] = useState<File | null>(null)
  const editFileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const { data: cat } = await supabase.from('categories').select('*').eq('id', categoryId).single()
    setCategory(cat)
    const { data } = await supabase
      .from('questions')
      .select('*')
      .eq('category_id', categoryId)
      .order('created_at')
    setQuestions(data ?? [])
  }

  useEffect(() => {
    if (categoryId) load()
  }, [categoryId])

  const imageUrl = (path: string | null) =>
    path ? supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl : null

  const uploadImage = async (f: File, prefix: string): Promise<string> => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const filename = `${prefix}-${crypto.randomUUID()}.${ext}`
    const path = `${categoryId}/${filename}`
    const contentType =
      ext === 'png' ? 'image/png' :
      ext === 'gif' ? 'image/gif' :
      ext === 'webp' ? 'image/webp' :
      'image/jpeg'

    const { data, error } = await supabase.storage
      .from('question-images')
      .upload(path, f, { contentType, upsert: false })

    if (error) throw new Error(error.message)
    return data.path
  }

  /* ── Filename → answer: strip extension, replace underscores/dashes ── */
  const filenameToAnswer = (filename: string): string => {
    return filename
      .replace(/\.[^.]+$/, '')       // remove extension
      .replace(/[_-]+/g, ' ')        // underscores & dashes → spaces
      .replace(/\s+/g, ' ')          // normalise spaces
      .trim()
  }

  /* ── Single add ── */
  const add = async () => {
    if (!answer.trim()) return
    setUploading(true)
    setUploadError(null)
    try {
      let image_path: string | null = null
      if (file) image_path = await uploadImage(file, 'q')
      const { error } = await supabase.from('questions').insert({
        category_id: categoryId,
        answer: answer.trim(),
        image_path,
      })
      if (error) throw new Error(error.message)
      setAnswer('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e: any) {
      setUploadError(e.message ?? 'Nieznany błąd')
    } finally {
      setUploading(false)
    }
  }

  /* ── Bulk add: each file name = answer ── */
  const addBulk = async () => {
    if (bulkFiles.length === 0) return
    setUploading(true)
    setUploadError(null)
    setBulkProgress({ done: 0, total: bulkFiles.length })

    let failed = 0
    for (let i = 0; i < bulkFiles.length; i++) {
      const f = bulkFiles[i]
      try {
        const image_path = await uploadImage(f, 'b')
        const ans = filenameToAnswer(f.name)
        await supabase.from('questions').insert({
          category_id: categoryId,
          answer: ans,
          image_path,
        })
      } catch {
        failed++
      }
      setBulkProgress({ done: i + 1, total: bulkFiles.length })
    }

    setBulkFiles([])
    if (bulkFileRef.current) bulkFileRef.current.value = ''
    setBulkProgress(null)
    setUploading(false)
    if (failed > 0) setUploadError(`${failed} plik(ów) nie udało się wgrać.`)
    await load()
  }

  /* ── Edit save ── */
  const saveEdit = async (q: Question) => {
    setUploading(true)
    setUploadError(null)
    try {
      let image_path = q.image_path
      if (editFile) {
        if (image_path) await supabase.storage.from('question-images').remove([image_path])
        image_path = await uploadImage(editFile, 'e')
      }
      const { error } = await supabase
        .from('questions')
        .update({ answer: editAnswer, image_path })
        .eq('id', q.id)
      if (error) throw new Error(error.message)
      setEditingId(null)
      setEditFile(null)
      if (editFileRef.current) editFileRef.current.value = ''
      await load()
    } catch (e: any) {
      setUploadError(e.message ?? 'Błąd zapisu')
    } finally {
      setUploading(false)
    }
  }

  /* ── Remove ── */
  const remove = async (q: Question) => {
    if (!confirm(`Usunąć pytanie "${q.answer}"?`)) return
    try {
      if (q.image_path) await supabase.storage.from('question-images').remove([q.image_path])
      await supabase.from('questions').delete().eq('id', q.id)
      await load()
    } catch (e: any) {
      setUploadError(e.message ?? 'Błąd usuwania')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#080808',
        color: '#fff',
        padding: '32px 24px',
        maxWidth: 960,
        margin: '0 auto',
        fontFamily: "'Montserrat', sans-serif",
      }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Link
          to="/admin/categories"
          style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'none', fontSize: '0.85rem', letterSpacing: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
          ← Powrót
        </Link>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '2.2rem',
            letterSpacing: 6,
            color: '#FFD700',
            margin: 0,
          }}>
          {category?.emoji} {category?.name}
        </h1>
        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem' }}>
          {questions.length} pytań
        </span>
      </div>

      {/* Error */}
      {uploadError && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 10,
            color: '#fca5a5',
            fontSize: '0.85rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
          <span>❌ {uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1rem' }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Add section ── */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
          marginBottom: 32,
          overflow: 'hidden',
        }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {(['single', 'bulk'] as TabType[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '14px',
                background: tab === t ? 'rgba(212,175,55,0.1)' : 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid #D4AF37' : '2px solid transparent',
                color: tab === t ? '#D4AF37' : 'rgba(255,255,255,0.4)',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: '1rem',
                letterSpacing: 4,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}>
              {t === 'single' ? '+ DODAJ PYTANIE' : '📦 MASOWE DODAWANIE'}
            </button>
          ))}
        </div>

        {/* Single tab */}
        {tab === 'single' && (
          <div style={{ padding: '20px' }}>
            {file && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 10,
                  marginBottom: 12,
                }}>
                <img
                  src={URL.createObjectURL(file)}
                  alt="preview"
                  style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginBottom: 2 }}>{file.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>{(file.size / 1024).toFixed(0)} KB</div>
                </div>
                <button
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            )}

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                marginBottom: 12,
              }}>
              <span
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  fontSize: '0.8rem',
                  color: 'rgba(255,255,255,0.6)',
                  transition: 'all 0.2s',
                }}>
                📷 {file ? 'Zmień zdjęcie' : 'Wybierz zdjęcie'}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !uploading && add()}
                placeholder="Odpowiedź (np. 'kot')"
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
              <button
                onClick={add}
                disabled={uploading || !answer.trim()}
                style={{
                  padding: '10px 28px',
                  background: uploading || !answer.trim() ? 'rgba(212,175,55,0.3)' : '#D4AF37',
                  color: '#000',
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: '1rem',
                  letterSpacing: 3,
                  border: 'none',
                  borderRadius: 10,
                  cursor: uploading || !answer.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  minWidth: 120,
                }}>
                {uploading ? '⏳ Wysyłam…' : '+ DODAJ'}
              </button>
            </div>
          </div>
        )}

        {/* Bulk tab */}
        {tab === 'bulk' && (
          <div style={{ padding: '20px' }}>
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(212,175,55,0.06)',
                border: '1px solid rgba(212,175,55,0.2)',
                borderRadius: 10,
                marginBottom: 16,
                fontSize: '0.82rem',
                color: 'rgba(255,255,255,0.55)',
                lineHeight: 1.6,
              }}>
              <strong style={{ color: '#D4AF37' }}>💡 Masowe dodawanie</strong> — wybierz wiele zdjęć naraz.
              Nazwa pliku stanie się odpowiedzią (bez rozszerzenia, podkreślniki i myślniki zamieniają się na spacje).
              <br />
              Przykład: <code style={{ color: '#FFD700' }}>golden_retriever.jpg</code> → odpowiedź: <strong style={{ color: '#fff' }}>golden retriever</strong>
            </div>

            {/* File list preview */}
            {bulkFiles.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                  gap: 8,
                  marginBottom: 14,
                  maxHeight: 240,
                  overflowY: 'auto',
                  padding: '4px 0',
                }}>
                {bulkFiles.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}>
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      style={{ width: '100%', height: 70, objectFit: 'cover' }}
                    />
                    <div
                      style={{
                        padding: '4px 6px',
                        fontSize: '0.65rem',
                        color: '#D4AF37',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                      {filenameToAnswer(f.name)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Progress bar */}
            {bulkProgress && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                  <span>Uploading…</span>
                  <span>{bulkProgress.done} / {bulkProgress.total}</span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #D4AF37, #FFD700)',
                      borderRadius: 4,
                      width: `${(bulkProgress.done / bulkProgress.total) * 100}%`,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1, cursor: 'pointer' }}>
                <div
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px dashed rgba(255,255,255,0.2)',
                    borderRadius: 10,
                    color: 'rgba(255,255,255,0.5)',
                    fontSize: '0.85rem',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                  }}>
                  {bulkFiles.length > 0 ? `${bulkFiles.length} plików wybranych` : '📁 Wybierz wiele zdjęć (Ctrl+klik)'}
                </div>
                <input
                  ref={bulkFileRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={e => setBulkFiles(Array.from(e.target.files ?? []))}
                  style={{ display: 'none' }}
                />
              </label>
              <button
                onClick={addBulk}
                disabled={uploading || bulkFiles.length === 0}
                style={{
                  padding: '10px 24px',
                  background: uploading || bulkFiles.length === 0 ? 'rgba(212,175,55,0.3)' : '#D4AF37',
                  color: '#000',
                  fontFamily: "'Bebas Neue', sans-serif",
                  fontSize: '1rem',
                  letterSpacing: 3,
                  border: 'none',
                  borderRadius: 10,
                  cursor: uploading || bulkFiles.length === 0 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  minWidth: 140,
                  whiteSpace: 'nowrap',
                }}>
                {uploading ? `⏳ ${bulkProgress?.done ?? 0}/${bulkProgress?.total ?? 0}` : '📦 DODAJ WSZYSTKIE'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Questions grid ── */}
      {questions.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', padding: '60px 0', fontSize: '0.9rem', letterSpacing: 2 }}>
          Brak pytań. Dodaj pierwsze powyżej.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
          }}>
          {questions.map(q => {
            const url = imageUrl(q.image_path)
            const isEditing = editingId === q.id

            return (
              <div
                key={q.id}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                }}>
                {/* Image */}
                {isEditing && editFile ? (
                  <img src={URL.createObjectURL(editFile)} alt="" style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                ) : url ? (
                  <img src={url} alt={q.answer} style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: 80,
                      background: 'rgba(255,255,255,0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'rgba(255,255,255,0.15)',
                      fontSize: '0.7rem',
                    }}>
                    Brak zdjęcia
                  </div>
                )}

                <div style={{ padding: '10px 10px 12px' }}>
                  {isEditing ? (
                    <>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, cursor: 'pointer' }}>
                        <span
                          style={{
                            padding: '5px 10px',
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 6,
                            fontSize: '0.7rem',
                            color: 'rgba(255,255,255,0.5)',
                          }}>
                          📷 Zmień
                        </span>
                        <input
                          ref={editFileRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={e => setEditFile(e.target.files?.[0] ?? null)}
                          style={{ display: 'none' }}
                        />
                      </label>
                      <input
                        value={editAnswer}
                        onChange={e => setEditAnswer(e.target.value)}
                        style={{
                          width: '100%',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 6,
                          padding: '6px 8px',
                          color: '#fff',
                          fontSize: '0.8rem',
                          marginBottom: 8,
                          boxSizing: 'border-box',
                          outline: 'none',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => saveEdit(q)}
                          disabled={uploading}
                          style={{
                            flex: 1,
                            padding: '5px',
                            background: '#22c55e',
                            border: 'none',
                            borderRadius: 6,
                            color: '#000',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}>
                          {uploading ? '…' : '✓ Zapisz'}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditFile(null) }}
                          style={{
                            flex: 1,
                            padding: '5px',
                            background: 'rgba(255,255,255,0.06)',
                            border: 'none',
                            borderRadius: 6,
                            color: 'rgba(255,255,255,0.4)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}>
                          Anuluj
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p
                        style={{
                          color: '#FFD700',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          marginBottom: 8,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                        {q.answer}
                      </p>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => { setEditingId(q.id); setEditAnswer(q.answer) }}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
                          Edytuj
                        </button>
                        <button
                          onClick={() => remove(q)}
                          style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
                          Usuń
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

}
