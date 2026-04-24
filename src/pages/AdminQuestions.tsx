// ─────────────────────────────────────────────────────────────────────────────
// AdminQuestions — edytor pytań kategorii
//
// Fast & reliable:
//  - Debounced search (300ms) — żadnego re-filter na każde naciśnięcie klawisza
//  - useAsyncAction na add/edit/bulk — guard dla double-click
//  - Optimistic updates (add/edit/delete) — UI reaguje natychmiast
//  - Bulk ops w paczkach (storage 20, DB 50) z toast progress
//  - Toast notifications — zero alert()
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Category, Question } from '../types'
import { useDebounce } from '../hooks/useDebounce'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useToast } from '../hooks/useToast'
import {
  AdminButton, AdminInput, AdminSelect, Card, EmptyState, Loading, T, ToastContainer,
} from '../components/admin/AdminUI'

type SortKey = 'newest' | 'oldest' | 'az' | 'za' | 'with_image' | 'no_image'
type FilterKey = 'all' | 'with_image' | 'no_image' | 'with_synonyms' | 'no_synonyms'

const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: 'newest',     label: '🕐 Najnowsze'    },
  { value: 'oldest',     label: '🕐 Najstarsze'   },
  { value: 'az',         label: '🔤 A → Z'        },
  { value: 'za',         label: '🔤 Z → A'        },
  { value: 'with_image', label: '🖼️ Ze zdjęciem'  },
  { value: 'no_image',   label: '📄 Bez zdjęcia'  },
]

const FILTER_OPTS: { value: FilterKey; label: string }[] = [
  { value: 'all',           label: 'Wszystkie'       },
  { value: 'with_image',    label: '🖼️ Ze zdjęciem' },
  { value: 'no_image',      label: '📄 Bez zdjęcia' },
  { value: 'with_synonyms', label: '💬 Z synonimami'},
  { value: 'no_synonyms',   label: '❌ Bez synonimów'},
]

const PAGE_SIZES = [12, 24, 48, 96]

// ─────────────────────────────────────────────────────────────────────────────
export default function AdminQuestions() {
  const { id: categoryId } = useParams<{ id: string }>()
  const toast = useToast()

  const [category,  setCategory]  = useState<Category | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading,   setLoading]   = useState(true)

  // Add form
  const [answer,       setAnswer]       = useState('')
  const [synInput,     setSynInput]     = useState('')
  const [synonyms,     setSynonyms]     = useState<string[]>([])
  const [file,         setFile]         = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Edit
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editAnswer,   setEditAnswer]   = useState('')
  const [editSynonyms, setEditSynonyms] = useState<string[]>([])
  const [editSynInput, setEditSynInput] = useState('')
  const [editFile,     setEditFile]     = useState<File | null>(null)
  const editFileRef = useRef<HTMLInputElement>(null)

  // Filters + pagination
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounce(searchRaw, 300)
  const [sort,     setSort]     = useState<SortKey>('newest')
  const [filter,   setFilter]   = useState<FilterKey>('all')
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(24)
  const searchRef = useRef<HTMLInputElement>(null)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!categoryId) return
    ;(async () => {
      setLoading(true)
      try {
        const [{ data: cat, error: catErr }, { data: qs, error: qErr }] = await Promise.all([
          supabase.from('categories').select('id,name,emoji,lang,created_at').eq('id', categoryId).single(),
          supabase.from('questions').select('id,category_id,answer,synonyms,image_path,created_at')
            .eq('category_id', categoryId).order('created_at', { ascending: false }),
        ])
        if (catErr) throw new Error(catErr.message)
        if (qErr)   throw new Error(qErr.message)
        setCategory(cat as Category)
        setQuestions((qs ?? []).map((q: Question) => ({
          ...q,
          synonyms: Array.isArray(q.synonyms) ? q.synonyms : [],
        })))
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Błąd ładowania pytań')
      } finally {
        setLoading(false)
      }
    })()
  }, [categoryId])

  // ── Derived: processed list (filter + sort) ───────────────────────────────
  const processed = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = questions
    if (q) {
      result = result.filter(i =>
        i.answer.toLowerCase().includes(q) ||
        i.synonyms.some(s => s.toLowerCase().includes(q))
      )
    }
    if (filter === 'with_image')    result = result.filter(i => !!i.image_path)
    if (filter === 'no_image')      result = result.filter(i => !i.image_path)
    if (filter === 'with_synonyms') result = result.filter(i => i.synonyms.length > 0)
    if (filter === 'no_synonyms')   result = result.filter(i => i.synonyms.length === 0)

    const sorted = [...result]
    if (sort === 'az')         sorted.sort((a, b) => a.answer.localeCompare(b.answer, 'pl'))
    if (sort === 'za')         sorted.sort((a, b) => b.answer.localeCompare(a.answer, 'pl'))
    if (sort === 'oldest')     sorted.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    if (sort === 'newest')     sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    if (sort === 'with_image') sorted.sort((a, b) => (b.image_path ? 1 : 0) - (a.image_path ? 1 : 0))
    if (sort === 'no_image')   sorted.sort((a, b) => (a.image_path ? 1 : 0) - (b.image_path ? 1 : 0))
    return sorted
  }, [questions, search, sort, filter])

  useEffect(() => { setPage(1) }, [search, sort, filter, pageSize])

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize))
  const safePage   = Math.min(page, totalPages)
  const paginated  = useMemo(
    () => processed.slice((safePage - 1) * pageSize, safePage * pageSize),
    [processed, safePage, pageSize]
  )

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); searchRef.current?.focus()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !['INPUT','TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault()
        const ids = paginated.map(q => q.id)
        const allSel = ids.every(id => selected.has(id))
        setSelected(allSel ? new Set() : new Set([...selected, ...ids]))
      }
      if (e.key === 'Escape' && selected.size > 0) setSelected(new Set())
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [paginated, selected])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const imageUrl = (path: string | null) =>
    path ? supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl : null

  const uploadImage = async (f: File, prefix: string): Promise<string> => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${categoryId}/${prefix}-${crypto.randomUUID()}.${ext}`
    const ct  = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const { data, error } = await supabase.storage.from('question-images').upload(path, f, { contentType: ct, upsert: false })
    if (error) throw new Error(error.message)
    return data.path
  }

  const pluralPytan = (n: number) => n === 1 ? 'pytanie' : n < 5 ? 'pytania' : 'pytań'

  // ── Synonym helpers ───────────────────────────────────────────────────────
  const addSynonym = () => {
    const v = synInput.trim().toLowerCase()
    if (!v || synonyms.includes(v)) return
    setSynonyms(p => [...p, v]); setSynInput('')
  }
  const addEditSyn = () => {
    const v = editSynInput.trim().toLowerCase()
    if (!v || editSynonyms.includes(v)) return
    setEditSynonyms(p => [...p, v]); setEditSynInput('')
  }

  // ── Add question ──────────────────────────────────────────────────────────
  const { run: addQuestion, loading: adding } = useAsyncAction(async () => {
    const trimmed = answer.trim()
    if (!trimmed) return
    let image_path: string | null = null
    if (file) image_path = await uploadImage(file, 'q')
    const { data, error } = await supabase.from('questions')
      .insert({ category_id: categoryId, answer: trimmed, synonyms, image_path })
      .select('id,category_id,answer,synonyms,image_path,created_at')
      .single()
    if (error) throw new Error(error.message)
    if (data) {
      const q = { ...data, synonyms: Array.isArray(data.synonyms) ? data.synonyms : [] } as Question
      setQuestions(prev => [q, ...prev])
    }
    setAnswer(''); setFile(null); setSynonyms([]); setSynInput('')
    if (fileRef.current) fileRef.current.value = ''
    toast.success(`Dodano: ${trimmed}`)
  }, { onError: e => toast.error(e.message) })

  // ── Save edit ─────────────────────────────────────────────────────────────
  const { run: saveEdit, loading: savingEdit } = useAsyncAction(async (q: Question) => {
    let image_path = q.image_path
    if (editFile) {
      if (image_path) {
        await supabase.storage.from('question-images').remove([image_path]).catch(() => void 0)
      }
      image_path = await uploadImage(editFile, 'e')
    }
    const trimmed = editAnswer.trim()
    if (!trimmed) throw new Error('Odpowiedź nie może być pusta')
    const { error } = await supabase.from('questions').update({
      answer: trimmed, synonyms: editSynonyms, image_path,
    }).eq('id', q.id)
    if (error) throw new Error(error.message)
    setQuestions(prev => prev.map(x => x.id === q.id
      ? { ...x, answer: trimmed, synonyms: editSynonyms, image_path }
      : x))
    setEditingId(null); setEditFile(null); setEditSynInput('')
    if (editFileRef.current) editFileRef.current.value = ''
    toast.success('Zapisano pytanie')
  }, { onError: e => toast.error(e.message) })

  // ── Delete (single) ───────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const remove = async (q: Question) => {
    if (deletingId) return
    if (!confirm(`Usunąć pytanie "${q.answer}"?`)) return
    setDeletingId(q.id)
    try {
      if (q.image_path) {
        await supabase.storage.from('question-images').remove([q.image_path]).catch(() => void 0)
      }
      const { error } = await supabase.from('questions').delete().eq('id', q.id)
      if (error) throw new Error(error.message)
      setQuestions(prev => prev.filter(x => x.id !== q.id))
      setSelected(prev => { const next = new Set(prev); next.delete(q.id); return next })
      toast.success('Usunięto pytanie')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd usuwania')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Bulk delete ───────────────────────────────────────────────────────────
  const { run: bulkRemove, loading: bulkDeleting } = useAsyncAction(async () => {
    if (selected.size === 0) return
    const count = selected.size
    if (!confirm(`Usunąć ${count} ${pluralPytan(count)}? Tej operacji nie można cofnąć.`)) return

    const toDelete = questions.filter(q => selected.has(q.id))
    const imagePaths = toDelete.map(q => q.image_path).filter((p): p is string => !!p)
    // Obrazy (paczki po 20)
    for (let i = 0; i < imagePaths.length; i += 20) {
      await supabase.storage.from('question-images').remove(imagePaths.slice(i, i + 20)).catch(() => void 0)
    }
    // Pytania (paczki po 50)
    const ids = [...selected]
    for (let i = 0; i < ids.length; i += 50) {
      const { error } = await supabase.from('questions').delete().in('id', ids.slice(i, i + 50))
      if (error) throw new Error(error.message)
    }
    setQuestions(prev => prev.filter(q => !selected.has(q.id)))
    setSelected(new Set())
    toast.success(`Usunięto ${count} ${pluralPytan(count)}`)
  }, { onError: e => toast.error(e.message) })

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleSel = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const selectAllPage = () => {
    const ids = paginated.map(q => q.id)
    const all = ids.length > 0 && ids.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (all) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }
  const selectAll = () => {
    const ids = processed.map(q => q.id)
    const all = ids.length > 0 && ids.every(id => selected.has(id))
    setSelected(all ? new Set() : new Set(ids))
  }

  const startEdit = (q: Question) => {
    setEditingId(q.id); setEditAnswer(q.answer)
    setEditSynonyms(Array.isArray(q.synonyms) ? [...q.synonyms] : [])
    setEditSynInput(''); setEditFile(null)
  }
  const clearAll = () => { setSearchRaw(''); setFilter('all') }

  // ── Active filter chips ───────────────────────────────────────────────────
  const chips: { label: string; clear: () => void }[] = []
  if (search)           chips.push({ label: `🔍 "${search}"`, clear: () => setSearchRaw('') })
  if (filter !== 'all') chips.push({ label: FILTER_OPTS.find(f => f.value === filter)?.label ?? filter, clear: () => setFilter('all') })

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'Montserrat', sans-serif" }}>
      <ToastContainer />
      <style>{`@keyframes fadeInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        padding: '14px clamp(16px,4vw,32px)', background: T.bg2,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <Link to="/admin/config" style={{
          color: T.textDim2, textDecoration: 'none', fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>← Powrót</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <span style={{ fontSize: '1.5rem' }}>{category?.emoji}</span>
          <span style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 'clamp(1.2rem,4vw,1.8rem)',
            letterSpacing: 5, color: T.gold,
          }}>{category?.name ?? '…'}</span>
          <span style={{ color: T.textDim2, fontSize: '0.82rem' }}>
            ({questions.length} {pluralPytan(questions.length)})
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: 'clamp(16px,4vw,28px)' }}>

        {/* ── ADD FORM ── */}
        <Card padding={20} style={{ marginBottom: 24 }}>
          <div style={{ color: T.textDim2, fontSize: '0.72rem', letterSpacing: 1, marginBottom: 14 }}>DODAJ PYTANIE</div>
          {file && (
            <Card padding="10px 14px" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={URL.createObjectURL(file)} alt="preview" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#e0e0e0', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                  <div style={{ color: T.textDim3, fontSize: '0.72rem' }}>{(file.size / 1024).toFixed(0)} KB</div>
                </div>
                <AdminButton
                  onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                  variant="ghost" size="sm"
                >✕</AdminButton>
              </div>
            </Card>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              padding: '8px 14px', background: T.surface2, border: `1px solid ${T.borderHi}`,
              borderRadius: 8, color: T.textDim, fontSize: '0.82rem',
            }}>
              📷 Zdjęcie
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
            </label>
            <AdminInput
              value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !adding && addQuestion()}
              placeholder="Odpowiedź (Enter aby dodać)"
              style={{ flex: 1, minWidth: 200 }}
            />
          </div>

          {/* Synonyms */}
          <div style={{ padding: '10px 12px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 8, marginBottom: 12 }}>
            <div style={{ color: 'rgba(129,140,248,0.5)', fontSize: '0.62rem', letterSpacing: 1, marginBottom: 6 }}>SYNONIMY</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: synonyms.length ? 8 : 0 }}>
              {synonyms.map(s => <SynChip key={s} label={s} onRemove={() => setSynonyms(p => p.filter(x => x !== s))} />)}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <AdminInput
                value={synInput} onChange={e => setSynInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSynonym() } }}
                placeholder="Dodaj synonim…" size="sm" style={{ flex: 1 }}
              />
              <AdminButton onClick={addSynonym} disabled={!synInput.trim()} size="sm" variant="secondary">+</AdminButton>
            </div>
          </div>

          <AdminButton
            onClick={addQuestion} loading={adding} disabled={!answer.trim()}
            variant="primary" size="lg" fullWidth icon="➕"
          >DODAJ PYTANIE</AdminButton>
        </Card>

        {/* ── TOOLBAR ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textDim2, fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</span>
            <AdminInput
              ref={searchRef}
              value={searchRaw} onChange={e => setSearchRaw(e.target.value)}
              placeholder="Szukaj po odpowiedzi lub synonimie… (Ctrl+F)"
              style={{ paddingLeft: 36, paddingRight: searchRaw ? 36 : 12 }}
            />
            {searchRaw && (
              <button onClick={() => setSearchRaw('')} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: '1rem',
              }}>✕</button>
            )}
          </div>

          {/* Filters + Sort + Size */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
              {FILTER_OPTS.map(o => (
                <button key={o.value} onClick={() => setFilter(o.value)} style={{
                  padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: '0.75rem',
                  background: filter === o.value ? 'rgba(212,175,55,0.15)' : T.surface2,
                  border: `1px solid ${filter === o.value ? 'rgba(212,175,55,0.5)' : T.borderHi}`,
                  color: filter === o.value ? T.gold : T.textDim2, whiteSpace: 'nowrap',
                }}>{o.label}</button>
              ))}
            </div>
            <AdminSelect
              value={sort} onChange={e => setSort(e.target.value as SortKey)}
              options={SORT_OPTS.map(o => ({ value: o.value, label: o.label }))}
              style={{ minWidth: 150 }}
            />
            <AdminSelect
              value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
              options={PAGE_SIZES.map(n => ({ value: n, label: `${n} / str.` }))}
              style={{ minWidth: 100 }}
            />
          </div>

          {/* Chips */}
          {chips.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: T.textDim2, fontSize: '0.72rem' }}>Aktywne filtry:</span>
              {chips.map((c, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem',
                  background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', color: T.gold,
                }}>
                  {c.label}
                  <button onClick={c.clear} style={{ background: 'none', border: 'none', color: T.gold, cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                </span>
              ))}
              <AdminButton onClick={clearAll} size="sm" variant="danger">Wyczyść</AdminButton>
            </div>
          )}

          {/* Stats + Bulk controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ color: T.textDim2, fontSize: '0.75rem' }}>
              {processed.length === questions.length
                ? `${questions.length} ${pluralPytan(questions.length)}`
                : `${processed.length} z ${questions.length} ${pluralPytan(questions.length)}`
              }
              {processed.length > 0 && ` · strona ${safePage} z ${totalPages}`}
            </div>
            {processed.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <AdminButton onClick={selectAllPage} size="sm" variant="secondary">
                  {paginated.length > 0 && paginated.every(q => selected.has(q.id)) ? '☑ Odznacz stronę' : '☐ Zaznacz stronę'}
                </AdminButton>
                {totalPages > 1 && (
                  <AdminButton onClick={selectAll} size="sm" variant="secondary">
                    {processed.every(q => selected.has(q.id)) ? '☑ Odznacz wszystko' : `☐ Zaznacz ${processed.length}`}
                  </AdminButton>
                )}
                {selected.size > 0 && (
                  <AdminButton onClick={() => setSelected(new Set())} size="sm" variant="ghost">
                    ✕ Wyczyść ({selected.size})
                  </AdminButton>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── BULK BAR ── */}
        {selected.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px', marginBottom: 14,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 10, animation: 'fadeInUp 0.2s ease',
          }}>
            <span style={{ color: T.textDim, fontSize: '0.85rem' }}>
              Zaznaczono <strong style={{ color: T.gold }}>{selected.size}</strong> {pluralPytan(selected.size)}
            </span>
            <AdminButton onClick={bulkRemove} loading={bulkDeleting} variant="danger" size="lg" icon="🗑">
              USUŃ {selected.size}
            </AdminButton>
          </div>
        )}

        {/* ── GRID ── */}
        {loading ? (
          <Loading />
        ) : paginated.length === 0 ? (
          <EmptyState
            icon={questions.length === 0 ? '📷' : '🔍'}
            title={questions.length === 0 ? 'Brak pytań' : 'Brak wyników'}
            description={questions.length === 0 ? 'Dodaj pierwsze powyżej.' : 'Spróbuj innych filtrów.'}
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
            {paginated.map(q => (
              <QuestionCard
                key={q.id} q={q}
                url={imageUrl(q.image_path)}
                isEditing={editingId === q.id}
                isSelected={selected.has(q.id)}
                isDeleting={deletingId === q.id}
                isSaving={savingEdit && editingId === q.id}
                searchTerm={search}
                editAnswer={editAnswer} setEditAnswer={setEditAnswer}
                editSynonyms={editSynonyms} setEditSynonyms={setEditSynonyms}
                editSynInput={editSynInput} setEditSynInput={setEditSynInput}
                editFile={editFile} setEditFile={setEditFile}
                editFileRef={editFileRef}
                onToggle={() => toggleSel(q.id)}
                onStartEdit={() => startEdit(q)}
                onCancelEdit={() => { setEditingId(null); setEditFile(null) }}
                onSave={() => saveEdit(q)}
                onDelete={() => remove(q)}
                onAddSyn={addEditSyn}
              />
            ))}
          </div>
        )}

        {/* ── PAGINATION ── */}
        {totalPages > 1 && (
          <Pagination
            safePage={safePage} totalPages={totalPages} setPage={setPage}
          />
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// QuestionCard — pojedyncze pytanie (view + edit mode)
// ═════════════════════════════════════════════════════════════════════════════
interface QuestionCardProps {
  q: Question
  url: string | null
  isEditing: boolean
  isSelected: boolean
  isDeleting: boolean
  isSaving: boolean
  searchTerm: string
  editAnswer: string; setEditAnswer: (v: string) => void
  editSynonyms: string[]; setEditSynonyms: (v: string[] | ((p: string[]) => string[])) => void
  editSynInput: string; setEditSynInput: (v: string) => void
  editFile: File | null; setEditFile: (f: File | null) => void
  editFileRef: React.RefObject<HTMLInputElement | null>
  onToggle: () => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onDelete: () => void
  onAddSyn: () => void
}

function QuestionCard(p: QuestionCardProps) {
  const { q, url, isEditing, isSelected, isDeleting, isSaving, searchTerm } = p
  const highlight = (text: string) => {
    if (!searchTerm.trim()) return text
    const idx = text.toLowerCase().indexOf(searchTerm.toLowerCase())
    if (idx === -1) return text
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(212,175,55,0.35)', color: '#fff', borderRadius: 2, padding: '0 1px' }}>
          {text.slice(idx, idx + searchTerm.length)}
        </mark>
        {text.slice(idx + searchTerm.length)}
      </>
    )
  }

  return (
    <div style={{
      position: 'relative',
      background: isSelected ? 'rgba(239,68,68,0.04)' : T.surface,
      border: `1px solid ${
        isEditing ? 'rgba(212,175,55,0.3)' :
        isSelected ? 'rgba(239,68,68,0.3)' : T.border
      }`,
      borderRadius: 10, overflow: 'hidden', transition: 'all 0.15s',
      opacity: isDeleting ? 0.5 : 1,
    }}>
      {!isEditing && (
        <button
          onClick={p.onToggle}
          title={isSelected ? 'Odznacz' : 'Zaznacz'}
          style={{
            position: 'absolute', top: 6, left: 6, zIndex: 5,
            width: 24, height: 24, borderRadius: 5, cursor: 'pointer',
            background: isSelected ? 'rgba(239,68,68,0.85)' : 'rgba(0,0,0,0.55)',
            border: `1.5px solid ${isSelected ? 'rgba(239,68,68,0.9)' : 'rgba(255,255,255,0.3)'}`,
            color: isSelected ? '#fff' : 'rgba(255,255,255,0.4)',
            fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >{isSelected ? '✓' : ''}</button>
      )}
      {isEditing && p.editFile ? (
        <img src={URL.createObjectURL(p.editFile)} alt="" style={{ width: '100%', height: 140, objectFit: 'cover' }} />
      ) : url ? (
        <img src={url} alt={q.answer} loading="lazy" style={{ width: '100%', height: 140, objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: 60, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.12)', fontSize: '0.7rem' }}>
          📄 bez zdjęcia
        </div>
      )}

      <div style={{ padding: 12 }}>
        {isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 10px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.textDim2, fontSize: '0.75rem' }}>
              📷 {p.editFile ? p.editFile.name : 'Zmień zdjęcie'}
              <input ref={p.editFileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={e => p.setEditFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
            </label>
            <AdminInput value={p.editAnswer} onChange={e => p.setEditAnswer(e.target.value)} placeholder="Odpowiedź" size="sm" />
            <div style={{ padding: '8px 10px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 7 }}>
              <div style={{ color: 'rgba(129,140,248,0.5)', fontSize: '0.62rem', letterSpacing: 1, marginBottom: 6 }}>SYNONIMY</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6, minHeight: 20 }}>
                {p.editSynonyms.length === 0
                  ? <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: '0.7rem', fontStyle: 'italic' }}>brak</span>
                  : p.editSynonyms.map(s => (
                      <SynChip key={s} label={s}
                        onRemove={() => p.setEditSynonyms(prev => prev.filter(x => x !== s))} small />
                    ))
                }
              </div>
              <div style={{ display: 'flex', gap: 5 }}>
                <AdminInput value={p.editSynInput} onChange={e => p.setEditSynInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); p.onAddSyn() } }}
                  placeholder="Nowy synonim…" size="sm" style={{ flex: 1, fontSize: '0.72rem' }}
                />
                <AdminButton onClick={p.onAddSyn} disabled={!p.editSynInput.trim()} size="sm" variant="secondary">+</AdminButton>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <AdminButton onClick={p.onSave} loading={isSaving} size="sm" variant="success" style={{ flex: 1 }}>Zapisz</AdminButton>
              <AdminButton onClick={p.onCancelEdit} disabled={isSaving} size="sm" variant="ghost" style={{ flex: 1 }}>Anuluj</AdminButton>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ color: T.gold, fontWeight: 600, fontSize: '0.88rem', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            <div style={{ display: 'flex', gap: 6 }}>
              <AdminButton onClick={p.onStartEdit} size="sm" variant="secondary" style={{ flex: 1 }}>Edytuj</AdminButton>
              <AdminButton onClick={p.onDelete} loading={isDeleting} size="sm" variant="danger" style={{ flex: 1 }}>Usuń</AdminButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Pagination
// ═════════════════════════════════════════════════════════════════════════════
function Pagination({ safePage, totalPages, setPage }: { safePage: number; totalPages: number; setPage: (n: number | ((p: number) => number)) => void }) {
  const btn = (label: string, disabled: boolean, onClick: () => void, title?: string) => (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      width: 36, height: 36, borderRadius: 8, cursor: disabled ? 'default' : 'pointer',
      background: T.surface2, border: `1px solid ${T.borderHi}`,
      color: disabled ? 'rgba(255,255,255,0.15)' : T.textDim,
      fontSize: '1rem',
    }}>{label}</button>
  )
  const pages = buildPageNumbers(safePage, totalPages)
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 28, flexWrap: 'wrap' }}>
      {btn('«', safePage === 1, () => setPage(1), 'Pierwsza')}
      {btn('‹', safePage === 1, () => setPage(p => Math.max(1, (p as number) - 1)), 'Poprzednia')}
      {pages.map((item, i) =>
        item === '…' ? (
          <span key={`e-${i}`} style={{ color: T.textDim3, padding: '0 4px' }}>…</span>
        ) : (
          <button key={item} onClick={() => setPage(Number(item))} style={{
            width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
            background: item === safePage ? 'rgba(212,175,55,0.2)' : T.surface2,
            border: `1px solid ${item === safePage ? 'rgba(212,175,55,0.5)' : T.borderHi}`,
            color: item === safePage ? T.gold : T.textDim,
            fontSize: '0.82rem', fontWeight: item === safePage ? 700 : 400,
          }}>{item}</button>
        )
      )}
      {btn('›', safePage === totalPages, () => setPage(p => Math.min(totalPages, (p as number) + 1)), 'Następna')}
      {btn('»', safePage === totalPages, () => setPage(totalPages), 'Ostatnia')}
    </div>
  )
}

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '…')[] = [1]
  if (current > 3) pages.push('…')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
  if (current < total - 2) pages.push('…')
  pages.push(total)
  return pages
}

// ═════════════════════════════════════════════════════════════════════════════
// SynChip
// ═════════════════════════════════════════════════════════════════════════════
function SynChip({ label, onRemove, small = false }: { label: string; onRemove: () => void; small?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: small ? '2px 8px' : '3px 10px',
      background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
      borderRadius: 20, fontSize: small ? '0.68rem' : '0.75rem', color: 'rgba(160,163,255,0.9)',
    }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(160,163,255,0.5)', fontSize: '0.7rem', padding: 0 }}>✕</button>
    </span>
  )
}
