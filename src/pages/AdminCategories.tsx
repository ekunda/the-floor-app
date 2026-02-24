import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Category } from '../types'

export default function AdminCategories() {
  const navigate = useNavigate()
  const [cats, setCats] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [editing, setEditing] = useState<Category | null>(null)

  const load = async () => {
    const { data } = await supabase.from('categories').select('*').order('created_at')
    setCats(data ?? [])
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    if (!name.trim()) return
    await supabase.from('categories').insert({ name: name.trim(), emoji })
    setName('')
    setEmoji('🎯')
    load()
  }

  const saveEdit = async () => {
    if (!editing) return
    await supabase.from('categories').update({ name: editing.name, emoji: editing.emoji }).eq('id', editing.id)
    setEditing(null)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Usunąć kategorię i wszystkie pytania?')) return
    await supabase.from('categories').delete().eq('id', id)
    load()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    navigate('/admin')
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: '10px 14px',
    color: '#fff',
    fontSize: '0.9rem',
    outline: 'none',
    fontFamily: "'Montserrat', sans-serif",
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#080808',
        color: '#fff',
        padding: '32px 24px',
        maxWidth: 720,
        margin: '0 auto',
        fontFamily: "'Montserrat', sans-serif",
      }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '2.5rem',
            letterSpacing: 8,
            color: '#FFD700',
            margin: 0,
          }}>
          Kategorie
        </h1>
        <button
          onClick={logout}
          style={{
            background: 'none',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            color: 'rgba(239,68,68,0.6)',
            padding: '6px 14px',
            fontSize: '0.8rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            letterSpacing: 1,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.7)'
            e.currentTarget.style.color = '#f87171'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
            e.currentTarget.style.color = 'rgba(239,68,68,0.6)'
          }}>
          Wyloguj
        </button>
      </div>

      {/* Add form */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 28,
          padding: '20px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16,
        }}>
        <input
          value={emoji}
          onChange={e => setEmoji(e.target.value)}
          style={{ ...inputStyle, width: 56, textAlign: 'center', fontSize: '1.3rem', padding: '8px' }}
          placeholder="🎯"
        />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Nazwa kategorii"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={add}
          style={{
            padding: '10px 24px',
            background: '#D4AF37',
            color: '#000',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '1rem',
            letterSpacing: 3,
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FFD700')}
          onMouseLeave={e => (e.currentTarget.style.background = '#D4AF37')}>
          + DODAJ
        </button>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cats.map(cat => (
          <div
            key={cat.id}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12,
              padding: '14px 16px',
              transition: 'border-color 0.2s',
            }}>
            {editing?.id === cat.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={editing.emoji}
                  onChange={e => setEditing({ ...editing, emoji: e.target.value })}
                  style={{ ...inputStyle, width: 50, textAlign: 'center', padding: '6px', fontSize: '1.2rem' }}
                />
                <input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={saveEdit}
                  style={{
                    background: '#22c55e',
                    border: 'none',
                    borderRadius: 8,
                    color: '#000',
                    padding: '7px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}>
                  Zapisz
                </button>
                <button
                  onClick={() => setEditing(null)}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: 'none',
                    borderRadius: 8,
                    color: 'rgba(255,255,255,0.4)',
                    padding: '7px 14px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}>
                  Anuluj
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1rem', letterSpacing: 0.5 }}>
                  {cat.emoji} {cat.name}
                </span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Link
                    to={`/admin/categories/${cat.id}/questions`}
                    style={{ color: '#D4AF37', fontSize: '0.8rem', textDecoration: 'none', letterSpacing: 1 }}>
                    Pytania →
                  </Link>
                  <button
                    onClick={() => setEditing(cat)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(255,255,255,0.3)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      padding: 0,
                      letterSpacing: 0.5,
                    }}>
                    Edytuj
                  </button>
                  <button
                    onClick={() => remove(cat.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(239,68,68,0.5)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      padding: 0,
                    }}>
                    Usuń
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {cats.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            color: 'rgba(255,255,255,0.18)',
            padding: '60px 0',
            fontSize: '0.9rem',
            letterSpacing: 2,
          }}>
          Brak kategorii. Dodaj pierwszą powyżej.
        </div>
      )}

      <Link
        to="/admin/config"
        style={{
          display: 'inline-block',
          marginTop: 36,
          color: 'rgba(255,255,255,0.25)',
          fontSize: '0.8rem',
          textDecoration: 'none',
          letterSpacing: 1,
          transition: 'color 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
        ⚙️ Edytuj konfigurację gry
      </Link>
    </div>
  )
}
