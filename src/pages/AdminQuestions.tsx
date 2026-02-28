// ─────────────────────────────────────────────────────────────────────────────
// AdminQuestions.tsx — Edytor pytań kategorii
//
// NOWE FUNKCJE:
//   • Wyszukiwanie — pełnotekstowe po odpowiedzi i synonimach
//   • Sortowanie   — A-Z, Z-A, Najnowsze, Najstarsze, Ze zdjęciem, Bez zdjęcia
//   • Filtrowanie  — Ze zdjęciem / Bez zdjęcia / Z synonimami / Bez synonimów
//   • Paginacja    — 12 / 24 / 48 na stronę, nawigacja stron
//   • Stat bar     — liczba wyników, aktywne filtry jako tagi z X
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Category, Question } from '../types'

// ── Typy ─────────────────────────────────────────────────────────────────────
type SortKey = 'az' | 'za' | 'newest' | 'oldest' | 'with_image' | 'no_image'
type FilterKey = 'all' | 'with_image' | 'no_image' | 'with_synonyms' | 'no_synonyms'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',     label: '🕐 Najnowsze'     },
  { value: 'oldest',     label: '🕐 Najstarsze'     },
  { value: 'az',         label: '🔤 A → Z'          },
  { value: 'za',         label: '🔤 Z → A'          },
  { value: 'with_image', label: '🖼️ Ze zdjęciem'   },
  { value: 'no_image',   label: '📄 Bez zdjęcia'    },
]

const FILTER_OPTIONS: { value: FilterKey; label: string }[] = [
  { value: 'all',           label: 'Wszystkie'       },
  { value: 'with_image',    label: '🖼️ Ze zdjęciem' },
  { value: 'no_image',      label: '📄 Bez zdjęcia'  },
  { value: 'with_synonyms', label: '💬 Z synonimami' },
  { value: 'no_synonyms',   label: '❌ Bez synonimów'},
]

const PAGE_SIZE_OPTIONS = [12, 24, 48]

// ── Style ────────────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '8px 12px', color: '#fff',
  fontFamily: "'Montserrat', sans-serif", fontSize: '0.9rem',
  outline: 'none', width: '100%', boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inp, width: 'auto', cursor: 'pointer', paddingRight: 28,
  appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.3)'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
}

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminQuestions() {
  const { id: categoryId } = useParams<{ id: string }>()

  const [category,    setCategory]    = useState<Category | null>(null)
  const [questions,   setQuestions]   = useState<Question[]>([])
  const [loading,     setLoading]     = useState(true)

  // Add form
  const [answer,      setAnswer]      = useState('')
  const [synonymInput, setSynonymInput] = useState('')
  const [synonyms,    setSynonyms]    = useState<string[]>([])
  const [file,        setFile]        = useState<File | null>(null)
  const [uploading,   setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Edit
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editAnswer,  setEditAnswer]  = useState('')
  const [editSynonyms, setEditSynonyms] = useState<string[]>([])
  const [editSynInput, setEditSynInput] = useState('')
  const [editFile,    setEditFile]    = useState<File | null>(null)

  // Search / Sort / Filter / Pagination
  const [search,   setSearch]   = useState('')
  const [sort,     setSort]     = useState<SortKey>('newest')
  const [filter,   setFilter]   = useState<FilterKey>('all')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(24)

  const fileRef     = useRef<HTMLInputElement>(null)
  const editFileRef = useRef<HTMLInputElement>(null)
  const searchRef   = useRef<HTMLInputElement>(null)

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    const [{ data: cat }, { data }] = await Promise.all([
      supabase.from('categories').select('*').eq('id', categoryId).single(),
      supabase.from('questions').select('*').eq('category_id', categoryId).order('created_at', { ascending: false }),
    ])
    setCategory(cat)
    setQuestions((data ?? []).map((q: any) => ({
      ...q,
      synonyms: Array.isArray(q.synonyms) ? q.synonyms : [],
    })))
    setLoading(false)
  }

  useEffect(() => { if (categoryId) load() }, [categoryId])

  // Keyboard shortcut Ctrl+F → focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Derived: filtered + sorted + paginated ────────────────────────────────
  const processed = useMemo(() => {
    const q = search.trim().toLowerCase()

    // 1. Szukaj
    let result = questions
    if (q) {
      result = result.filter(item =>
        item.answer.toLowerCase().includes(q) ||
        item.synonyms.some(s => s.toLowerCase().includes(q))
      )
    }

    // 2. Filtruj
    if (filter === 'with_image')    result = result.filter(i => !!i.image_path)
    if (filter === 'no_image')      result = result.filter(i => !i.image_path)
    if (filter === 'with_synonyms') result = result.filter(i => i.synonyms.length > 0)
    if (filter === 'no_synonyms')   result = result.filter(i => i.synonyms.length === 0)

    // 3. Sortuj
    result = [...result]
    if (sort === 'az')         result.sort((a, b) => a.answer.localeCompare(b.answer, 'pl'))
    if (sort === 'za')         result.sort((a, b) => b.answer.localeCompare(a.answer, 'pl'))
    if (sort === 'oldest')     result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    if (sort === 'newest')     result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (sort === 'with_image') result.sort((a, b) => (b.image_path ? 1 : 0) - (a.image_path ? 1 : 0))
    if (sort === 'no_image')   result.sort((a, b) => (a.image_path ? 1 : 0) - (b.image_path ? 1 : 0))

    return result
  }, [questions, search, sort, filter])

  // Reset page on filter/search change
  useEffect(() => { setPage(1) }, [search, sort, filter, pageSize])

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = processed.slice((safePage - 1) * pageSize, safePage * pageSize)

  // ── Helpers ───────────────────────────────────────────────────────────────
  const imageUrl = (path: string | null) =>
    path ? supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl : null

  const uploadImage = async (f: File, prefix: string): Promise<string> => {
    const ext  = f.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${categoryId}/${prefix}-${crypto.randomUUID()}.${ext}`
    const ct   = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const { data, error } = await supabase.storage.from('question-images').upload(path, f, { contentType: ct, upsert: false })
    if (error) throw new Error(error.message)
    return data.path
  }

  const pluralPytan = (n: number) =>
    n === 1 ? 'pytanie' : n < 5 ? 'pytania' : 'pytań'

  // ── Synonym helpers ───────────────────────────────────────────────────────
  const addSynonym = () => {
    const v = synonymInput.trim().toLowerCase()
    if (!v || synonyms.includes(v)) return
    setSynonyms(p => [...p, v]); setSynonymInput('')
  }
  const removeSynonym    = (s: string) => setSynonyms(p => p.filter(x => x !== s))
  const addEditSynonym   = () => {
    const v = editSynInput.trim().toLowerCase()
    if (!v || editSynonyms.includes(v)) return
    setEditSynonyms(p => [...p, v]); setEditSynInput('')
  }
  const removeEditSynonym = (s: string) => setEditSynonyms(p => p.filter(x => x !== s))

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const add = async () => {
    if (!answer.trim()) return
    setUploading(true); setUploadError(null)
    try {
      let image_path: string | null = null
      if (file) image_path = await uploadImage(file, 'q')
      const { error } = await supabase.from('questions').insert({
        category_id: categoryId, answer: answer.trim(), synonyms, image_path,
      })
      if (error) throw new Error(error.message)
      setAnswer(''); setFile(null); setSynonyms([]); setSynonymInput('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (e: any) { setUploadError(e.message ?? 'Błąd')
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
      const { error } = await supabase.from('questions').update({
        answer: editAnswer, synonyms: editSynonyms, image_path,
      }).eq('id', q.id)
      if (error) throw new Error(error.message)
      setEditingId(null); setEditFile(null); setEditSynInput('')
      if (editFileRef.current) editFileRef.current.value = ''
      await load()
    } catch (e: any) { setUploadError(e.message ?? 'Błąd')
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

  const startEdit = (q: Question) => {
    setEditingId(q.id); setEditAnswer(q.answer)
    setEditSynonyms(Array.isArray(q.synonyms) ? [...q.synonyms] : [])
    setEditSynInput(''); setEditFile(null)
  }

  const clearSearch = () => { setSearch(''); setFilter('all') }

  // ── Active filter chips ───────────────────────────────────────────────────
  const activeFilters: { label: string; clear: () => void }[] = []
  if (search)        activeFilters.push({ label: `🔍 "${search}"`,         clear: () => setSearch('') })
  if (filter !== 'all') activeFilters.push({ label: FILTER_OPTIONS.find(f => f.value === filter)?.label ?? filter, clear: () => setFilter('all') })

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif" }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px clamp(16px,4vw,32px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0a0a0a', flexWrap: 'wrap',
      }}>
        <Link to="/admin/config" style={{
          color: 'rgba(255,255,255,0.35)', textDecoration: 'none', fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}>
          ← Powrót
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ fontSize: '1.5rem' }}>{category?.emoji}</span>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.2rem,4vw,1.8rem)', letterSpacing: 5, color: '#D4AF37' }}>
            {category?.name}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem' }}>
            ({questions.length} {pluralPytan(questions.length)})
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(16px,4vw,28px)' }}>

        {/* Error */}
        {uploadError && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#f87171', fontSize: '0.82rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>❌ {uploadError}</span>
            <button onClick={() => setUploadError(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* ── ADD FORM ── */}
        <div style={{
          padding: 20, marginBottom: 24,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
        }}>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 14 }}>DODAJ PYTANIE</div>

          {file && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, marginBottom: 12 }}>
              <img src={URL.createObjectURL(file)} alt="podgląd" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6 }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#e0e0e0', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>{(file.size / 1024).toFixed(0)} KB</div>
              </div>
              <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '8px 14px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              color: 'rgba(255,255,255,0.5)', fontSize: '0.82rem', flexShrink: 0,
            }}>
              📷 Zdjęcie
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
            </label>
            <input value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              placeholder="Odpowiedź (Enter aby dodać)"
              style={{ ...inp, flex: 1, minWidth: 200 }} />
          </div>

          {/* Synonyms */}
          <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 8, marginBottom: 12 }}>
            <div style={{ color: 'rgba(129,140,248,0.5)', fontSize: '0.62rem', letterSpacing: 1, marginBottom: 6 }}>SYNONIMY</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: synonyms.length ? 8 : 0 }}>
              {synonyms.map(s => <SynChip key={s} label={s} onRemove={() => removeSynonym(s)} />)}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={synonymInput} onChange={e => setSynonymInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSynonym() } }}
                placeholder="Dodaj synonim…"
                style={{ ...inp, fontSize: '0.8rem', padding: '5px 10px', flex: 1 }} />
              <button onClick={addSynonym} disabled={!synonymInput.trim()} style={synAddBtn(!!synonymInput.trim())}>+</button>
            </div>
          </div>

          <button onClick={add} disabled={!answer.trim() || uploading} style={{
            width: '100%', padding: '10px 20px', borderRadius: 8, border: 'none', cursor: !answer.trim() || uploading ? 'default' : 'pointer',
            background: !answer.trim() || uploading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #D4AF37, #FFD700)',
            color: !answer.trim() || uploading ? 'rgba(255,255,255,0.3)' : '#000',
            fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 3, transition: 'all 0.2s',
          }}>
            {uploading ? '⏳ Wysyłanie…' : '➕ DODAJ PYTANIE'}
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            TOOLBAR: Szukaj | Filtruj | Sortuj | Rozmiar strony
        ════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>

          {/* Wiersz 1: Szukaj */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</span>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Szukaj po odpowiedzi lub synonimie… (Ctrl+F)"
              style={{ ...inp, paddingLeft: 36, paddingRight: search ? 36 : 12 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
              }}>✕</button>
            )}
          </div>

          {/* Wiersz 2: Filtry + Sortowanie + Rozmiar strony */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

            {/* Przyciski filtrów */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
              {FILTER_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setFilter(opt.value)} style={{
                  padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: '0.75rem',
                  background: filter === opt.value ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${filter === opt.value ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: filter === opt.value ? '#D4AF37' : 'rgba(255,255,255,0.4)',
                  transition: 'all 0.15s', whiteSpace: 'nowrap',
                }}>{opt.label}</button>
              ))}
            </div>

            {/* Sort */}
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
              style={{ ...selectStyle, minWidth: 150 }}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            {/* Rozmiar strony */}
            <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
              style={{ ...selectStyle, minWidth: 90 }}>
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / str.</option>)}
            </select>
          </div>

          {/* Aktywne filtry jako tagi */}
          {activeFilters.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem' }}>Aktywne filtry:</span>
              {activeFilters.map((af, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem',
                  background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', color: '#D4AF37',
                }}>
                  {af.label}
                  <button onClick={af.clear} style={{ background: 'none', border: 'none', color: '#D4AF37', cursor: 'pointer', padding: 0, fontSize: '0.7rem', lineHeight: 1 }}>✕</button>
                </span>
              ))}
              <button onClick={clearSearch} style={{
                padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', cursor: 'pointer',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                color: 'rgba(239,68,68,0.7)',
              }}>Wyczyść wszystko</button>
            </div>
          )}

          {/* Stat bar */}
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
            {processed.length === questions.length
              ? `${questions.length} ${pluralPytan(questions.length)}`
              : `${processed.length} z ${questions.length} ${pluralPytan(questions.length)}`
            }
            {processed.length > 0 && ` · strona ${safePage} z ${totalPages}`}
          </div>
        </div>

        {/* ── SIATKA PYTAŃ ── */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', padding: 60 }}>Ładowanie…</div>
        ) : paginated.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', padding: 60, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12 }}>
            {questions.length === 0 ? (
              <><div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📷</div>Brak pytań. Dodaj pierwsze powyżej.</>
            ) : (
              <><div style={{ fontSize: '2rem', marginBottom: 10 }}>🔍</div>Brak wyników dla podanych filtrów.<br />
                <button onClick={clearSearch} style={{ marginTop: 12, padding: '7px 18px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                  Wyczyść filtry
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
            {paginated.map(q => {
              const url = imageUrl(q.image_path)
              const isEditing = editingId === q.id
              // Highlight search matches
              const highlight = (text: string) => {
                if (!search.trim()) return text
                const idx = text.toLowerCase().indexOf(search.toLowerCase())
                if (idx === -1) return text
                return (
                  <>
                    {text.slice(0, idx)}
                    <mark style={{ background: 'rgba(212,175,55,0.35)', color: '#fff', borderRadius: 2, padding: '0 1px' }}>
                      {text.slice(idx, idx + search.length)}
                    </mark>
                    {text.slice(idx + search.length)}
                  </>
                )
              }

              return (
                <div key={q.id} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: isEditing ? '1px solid rgba(212,175,55,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s',
                }}>
                  {/* Zdjęcie */}
                  {isEditing && editFile ? (
                    <img src={URL.createObjectURL(editFile)} alt={q.answer} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                  ) : url ? (
                    <img src={url} alt={q.answer} style={{ width: '100%', height: 140, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: 60, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.12)', fontSize: '0.7rem' }}>
                      📄 bez zdjęcia
                    </div>
                  )}

                  <div style={{ padding: 12 }}>
                    {isEditing ? (
                      /* ── Edit mode ── */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                          📷 {editFile ? editFile.name : 'Zmień zdjęcie'}
                          <input ref={editFileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={e => setEditFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                        </label>
                        <input value={editAnswer} onChange={e => setEditAnswer(e.target.value)}
                          placeholder="Odpowiedź"
                          style={{ ...inp, fontSize: '0.85rem', padding: '6px 10px' }} />
                        {/* Edit synonyms */}
                        <div style={{ padding: '8px 10px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 7 }}>
                          <div style={{ color: 'rgba(129,140,248,0.5)', fontSize: '0.62rem', letterSpacing: 1, marginBottom: 6 }}>SYNONIMY</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6, minHeight: 20 }}>
                            {editSynonyms.length === 0
                              ? <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.7rem', fontStyle: 'italic' }}>brak</span>
                              : editSynonyms.map(s => <SynChip key={s} label={s} onRemove={() => removeEditSynonym(s)} small />)
                            }
                          </div>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <input value={editSynInput} onChange={e => setEditSynInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditSynonym() } }}
                              placeholder="Nowy synonim…"
                              style={{ ...inp, fontSize: '0.72rem', padding: '4px 8px', flex: 1 }} />
                            <button onClick={addEditSynonym} disabled={!editSynInput.trim()} style={synAddBtn(!!editSynInput.trim())}>+</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => saveEdit(q)} disabled={uploading} style={{
                            flex: 1, padding: '6px 10px', borderRadius: 6,
                            background: uploading ? 'rgba(255,255,255,0.06)' : 'rgba(212,175,55,0.2)',
                            border: `1px solid ${uploading ? 'transparent' : 'rgba(212,175,55,0.4)'}`,
                            color: uploading ? 'rgba(255,255,255,0.2)' : '#D4AF37', cursor: uploading ? 'default' : 'pointer', fontSize: '0.78rem',
                          }}>{uploading ? '⏳' : '✓ Zapisz'}</button>
                          <button onClick={() => { setEditingId(null); setEditFile(null) }} style={{
                            flex: 1, padding: '6px 10px', borderRadius: 6,
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.78rem',
                          }}>Anuluj</button>
                        </div>
                      </div>
                    ) : (
                      /* ── View mode ── */
                      <div>
                        <div style={{ color: '#D4AF37', fontWeight: 600, fontSize: '0.88rem', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {highlight(q.answer)}
                        </div>
                        {q.synonyms.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                            {q.synonyms.map(s => (
                              <span key={s} style={{
                                padding: '2px 7px', background: 'rgba(99,102,241,0.09)',
                                border: '1px solid rgba(99,102,241,0.2)', borderRadius: 20,
                                fontSize: '0.64rem', color: 'rgba(129,140,248,0.65)',
                              }}>{highlight(s)}</span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => startEdit(q)} style={{
                            flex: 1, padding: '5px', borderRadius: 6,
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.45)', cursor: 'pointer', fontSize: '0.75rem',
                          }}>Edytuj</button>
                          <button onClick={() => remove(q)} style={{
                            flex: 1, padding: '5px', borderRadius: 6,
                            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)',
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

        {/* ════════════════════════════════════════════════════════════════════
            PAGINACJA
        ════════════════════════════════════════════════════════════════════ */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            gap: 6, marginTop: 28, flexWrap: 'wrap',
          }}>
            {/* Poprzednia */}
            <PaginationBtn onClick={() => setPage(1)} disabled={safePage === 1} label="«" title="Pierwsza" />
            <PaginationBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} label="‹" title="Poprzednia" />

            {/* Numery stron */}
            {buildPageNumbers(safePage, totalPages).map((item, i) =>
              item === '…' ? (
                <span key={`ellipsis-${i}`} style={{ color: 'rgba(255,255,255,0.2)', padding: '0 4px' }}>…</span>
              ) : (
                <button key={item} onClick={() => setPage(Number(item))} style={{
                  width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
                  background: item === safePage ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${item === safePage ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  color: item === safePage ? '#D4AF37' : 'rgba(255,255,255,0.5)',
                  fontSize: '0.82rem', fontWeight: item === safePage ? 700 : 400, transition: 'all 0.15s',
                }}>{item}</button>
              )
            )}

            {/* Następna */}
            <PaginationBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} label="›" title="Następna" />
            <PaginationBtn onClick={() => setPage(totalPages)} disabled={safePage === totalPages} label="»" title="Ostatnia" />

            {/* Skocz do strony */}
            <JumpToPage current={safePage} total={totalPages} onJump={setPage} />
          </div>
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

function PaginationBtn({ onClick, disabled, label, title }: {
  onClick: () => void; disabled: boolean; label: string; title: string
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      width: 36, height: 36, borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
      color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)',
      fontSize: '1rem', transition: 'all 0.15s',
    }}>{label}</button>
  )
}

function JumpToPage({ current, total, onJump }: { current: number; total: number; onJump: (n: number) => void }) {
  const [val, setVal] = useState('')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem' }}>Idź do:</span>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            const n = parseInt(val)
            if (!isNaN(n) && n >= 1 && n <= total) { onJump(n); setVal('') }
          }
        }}
        placeholder={`${current}`}
        style={{
          width: 48, padding: '5px 8px', borderRadius: 6, textAlign: 'center',
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff', fontSize: '0.8rem', outline: 'none',
        }}
      />
    </div>
  )
}

function SynChip({ label, onRemove, small = false }: { label: string; onRemove: () => void; small?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: small ? '2px 8px' : '3px 10px',
      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
      borderRadius: 20, fontSize: small ? '0.68rem' : '0.75rem', color: 'rgba(160,163,255,0.9)',
    }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(160,163,255,0.5)', fontSize: '0.7rem', padding: 0, lineHeight: 1 }}>✕</button>
    </span>
  )
}

function synAddBtn(active: boolean): React.CSSProperties {
  return {
    width: 32, height: 32, borderRadius: 6, flexShrink: 0, cursor: active ? 'pointer' : 'default',
    background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${active ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)'}`,
    color: active ? '#818cf8' : 'rgba(255,255,255,0.2)', fontSize: '1rem', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  }
}
