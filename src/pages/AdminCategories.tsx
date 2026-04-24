// ─────────────────────────────────────────────────────────────────────────────
// AdminCategories — standalone zarządzanie kategoriami
//
// Fast & reliable:
//  - Optimistic add/update/delete (UI reaguje natychmiast)
//  - useAsyncAction: zero silent failures, auto-guard dla double-click
//  - Toast notifications zamiast alert()
//  - Cascade delete pytań + obrazów w paczkach
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Category } from '../types'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useToast } from '../hooks/useToast'
import {
  AdminButton, AdminInput, Card, EmptyState, Loading, SectionTitle, T, ToastContainer,
} from '../components/admin/AdminUI'

export default function AdminCategories() {
  const navigate = useNavigate()
  const toast = useToast()

  const [cats,     setCats]     = useState<Category[]>([])
  const [loading,  setLoading]  = useState(true)
  const [name,     setName]     = useState('')
  const [emoji,    setEmoji]    = useState('🎯')
  const [editing,  setEditing]  = useState<Category | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name,emoji,lang,created_at')
        .order('created_at')
      if (error) throw new Error(error.message)
      setCats(data ?? [])
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : 'Błąd ładowania kategorii'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Add ───────────────────────────────────────────────────────────────────
  const { run: addCat, loading: adding } = useAsyncAction(async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: trimmed, emoji })
      .select('id,name,emoji,lang,created_at')
      .single()
    if (error) throw new Error(error.message)
    if (data) setCats(prev => [...prev, data as Category])
    setName(''); setEmoji('🎯')
    toast.success(`Dodano: ${trimmed}`)
  }, { onError: e => toast.error(e.message) })

  // ── Save edit ─────────────────────────────────────────────────────────────
  const { run: saveEdit, loading: saving } = useAsyncAction(async () => {
    if (!editing) return
    const { error } = await supabase
      .from('categories')
      .update({ name: editing.name, emoji: editing.emoji })
      .eq('id', editing.id)
    if (error) throw new Error(error.message)
    // Optimistic replace w liście
    setCats(prev => prev.map(c => c.id === editing.id ? editing : c))
    setEditing(null)
    toast.success('Zapisano zmiany')
  }, { onError: e => toast.error(e.message) })

  // ── Remove (cascade: obrazy → pytania → kategoria) ─────────────────────────
  const [removingId, setRemovingId] = useState<string | null>(null)
  const remove = async (cat: Category) => {
    if (removingId) return
    if (!confirm(`Usunąć kategorię "${cat.name}" wraz ze wszystkimi pytaniami?`)) return
    setRemovingId(cat.id)
    try {
      // 1. Pobierz pytania
      const { data: qs, error: qErr } = await supabase
        .from('questions').select('id,image_path').eq('category_id', cat.id)
      if (qErr) throw new Error(qErr.message)

      if (qs && qs.length > 0) {
        // 2. Usuń obrazy (paczki po 20)
        const paths = qs.map(q => q.image_path).filter((p): p is string => !!p)
        for (let i = 0; i < paths.length; i += 20) {
          const { error: sErr } = await supabase.storage
            .from('question-images').remove(paths.slice(i, i + 20))
          if (sErr) console.warn('[AdminCategories] storage batch error:', sErr.message)
        }
        // 3. Usuń pytania (paczki po 50)
        const ids = qs.map(q => q.id)
        for (let i = 0; i < ids.length; i += 50) {
          const { error: dErr } = await supabase.from('questions').delete().in('id', ids.slice(i, i + 50))
          if (dErr) throw new Error('Błąd usuwania pytań: ' + dErr.message)
        }
      }
      // 4. Usuń kategorię
      const { error } = await supabase.from('categories').delete().eq('id', cat.id)
      if (error) throw new Error(error.message)

      setCats(prev => prev.filter(c => c.id !== cat.id))
      toast.success(`Usunięto: ${cat.name}`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd usuwania')
    } finally {
      setRemovingId(null)
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/admin')
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: T.bg, color: T.text,
      padding: '32px 24px', maxWidth: 720, margin: '0 auto',
      fontFamily: "'Montserrat', sans-serif",
    }}>
      <ToastContainer />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.5rem',
          letterSpacing: 8, color: T.goldBright, margin: 0,
        }}>Kategorie</h1>
        <AdminButton variant="danger" size="sm" onClick={logout}>Wyloguj</AdminButton>
      </div>

      {/* Add form */}
      <Card padding={20} style={{ marginBottom: 28, borderRadius: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <AdminInput
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            style={{ width: 56, textAlign: 'center', fontSize: '1.3rem' }}
            placeholder="🎯"
          />
          <AdminInput
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !adding && addCat()}
            placeholder="Nazwa kategorii"
            style={{ flex: 1, minWidth: 180 }}
          />
          <AdminButton
            onClick={addCat} loading={adding} disabled={!name.trim()}
            variant="primary" size="lg" icon="+"
          >DODAJ</AdminButton>
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <Loading />
      ) : cats.length === 0 ? (
        <EmptyState icon="📂" title="Brak kategorii" description="Dodaj pierwszą powyżej." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cats.map(cat => (
            <Card key={cat.id} padding="14px 16px">
              {editing?.id === cat.id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <AdminInput
                    value={editing.emoji}
                    onChange={e => setEditing({ ...editing, emoji: e.target.value })}
                    style={{ width: 50, textAlign: 'center', fontSize: '1.2rem' }}
                  />
                  <AdminInput
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && !saving && saveEdit()}
                    style={{ flex: 1, minWidth: 160 }}
                    autoFocus
                  />
                  <AdminButton onClick={saveEdit} loading={saving} variant="success" size="sm">
                    Zapisz
                  </AdminButton>
                  <AdminButton onClick={() => setEditing(null)} disabled={saving} variant="ghost" size="sm">
                    Anuluj
                  </AdminButton>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: '1rem' }}>
                    {cat.emoji} {cat.name}
                  </span>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Link
                      to={`/admin/categories/${cat.id}/questions`}
                      style={{ color: T.gold, fontSize: '0.82rem', textDecoration: 'none', letterSpacing: 1 }}
                    >Pytania →</Link>
                    <AdminButton onClick={() => setEditing(cat)} variant="ghost" size="sm">Edytuj</AdminButton>
                    <AdminButton
                      onClick={() => remove(cat)}
                      loading={removingId === cat.id}
                      disabled={!!removingId && removingId !== cat.id}
                      variant="danger" size="sm"
                    >Usuń</AdminButton>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Link
        to="/admin/config"
        style={{
          display: 'inline-block', marginTop: 36,
          color: T.textDim3, fontSize: '0.82rem',
          textDecoration: 'none', letterSpacing: 1,
        }}
      >⚙️ Edytuj konfigurację gry</Link>
    </div>
  )
}
