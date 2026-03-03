import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Player {
  id: string
  username: string
  avatar: string
  avatar_url?: string
  xp: number
  wins: number
  losses: number
  win_streak: number
  best_streak: number
  status: string
  created_at: string
}

interface EditState {
  xp: number
  wins: number
  losses: number
  win_streak: number
  best_streak: number
  username: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const badge = (v: number, good: number, great: number) =>
  v >= great ? '#4ade80' : v >= good ? '#facc15' : 'rgba(255,255,255,0.4)'

const winRate = (p: Player) =>
  p.wins + p.losses > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0

const xpToLevel = (xp: number) => ({ level: Math.floor(xp / 100) + 1, pct: xp % 100 })

function Avatar({ p }: { p: Player }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0, overflow: 'hidden' }}>
      {p.avatar_url ? <img src={p.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : (p.avatar || '🎮')}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPlayers({ inp }: { inp: React.CSSProperties }) {
  const [players,  setPlayers]  = useState<Player[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [sortKey,  setSortKey]  = useState<'xp'|'wins'|'win_streak'|'losses'|'created_at'>('xp')
  const [sortAsc,  setSortAsc]  = useState(false)
  const [editing,  setEditing]  = useState<Player | null>(null)
  const [editVals, setEditVals] = useState<EditState | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState('')
  const [confirm,  setConfirm]  = useState<{type:string; playerId:string; username:string} | null>(null)
  const [tab,      setTab]      = useState<'players'|'overview'>('overview')

  // Overview stats
  const [overview, setOverview] = useState({
    total: 0, online: 0, inGame: 0,
    totalGames: 0, totalXP: 0,
    mostWins: null as Player|null,
    bestStreak: null as Player|null,
    mostXP: null as Player|null,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('profiles').select('*').order(sortKey, { ascending: sortAsc })
    const list = (data ?? []) as Player[]
    setPlayers(list)

    // Compute overview
    const totalGames = await supabase.from('game_history').select('id', { count: 'exact', head: true })
    setOverview({
      total:      list.length,
      online:     list.filter(p => p.status === 'online').length,
      inGame:     list.filter(p => p.status === 'in_game').length,
      totalGames: totalGames.count ?? 0,
      totalXP:    list.reduce((s, p) => s + p.xp, 0),
      mostWins:   list.reduce<Player|null>((a, p) => !a || p.wins > a.wins ? p : a, null),
      bestStreak: list.reduce<Player|null>((a, p) => !a || p.best_streak > a.best_streak ? p : a, null),
      mostXP:     list.reduce<Player|null>((a, p) => !a || p.xp > a.xp ? p : a, null),
    })
    setLoading(false)
  }, [sortKey, sortAsc])

  useEffect(() => { load() }, [load])

  const filtered = players.filter(p =>
    !search || p.username?.toLowerCase().includes(search.toLowerCase())
  )

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const openEdit = (p: Player) => {
    setEditing(p)
    setEditVals({ xp: p.xp, wins: p.wins, losses: p.losses, win_streak: p.win_streak, best_streak: p.best_streak, username: p.username })
  }

  const saveEdit = async () => {
    if (!editing || !editVals) return
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      username:    editVals.username.toUpperCase().trim(),
      xp:          Math.max(0, editVals.xp),
      wins:        Math.max(0, editVals.wins),
      losses:      Math.max(0, editVals.losses),
      win_streak:  Math.max(0, editVals.win_streak),
      best_streak: Math.max(0, editVals.best_streak),
      updated_at:  new Date().toISOString(),
    }).eq('id', editing.id)
    setSaving(false)
    if (!error) {
      setMsg('Zapisano zmiany'); setTimeout(() => setMsg(''), 2500)
      setEditing(null); load()
    }
  }

  const handleAction = async (type: string, p: Player) => {
    if (['reset_stats','reset_xp','ban','delete'].includes(type)) {
      setConfirm({ type, playerId: p.id, username: p.username })
    } else if (type === 'add_xp') {
      await supabase.from('profiles').update({ xp: p.xp + 100, updated_at: new Date().toISOString() }).eq('id', p.id)
      setMsg('+100 XP dodane'); setTimeout(() => setMsg(''), 2000); load()
    } else if (type === 'set_online') {
      await supabase.from('profiles').update({ status: 'online' }).eq('id', p.id); load()
    }
  }

  const executeConfirm = async () => {
    if (!confirm) return
    const { type, playerId } = confirm
    if (type === 'reset_stats') {
      await supabase.from('profiles').update({ wins: 0, losses: 0, win_streak: 0, best_streak: 0, xp: 0, updated_at: new Date().toISOString() }).eq('id', playerId)
    } else if (type === 'reset_xp') {
      await supabase.from('profiles').update({ xp: 0, updated_at: new Date().toISOString() }).eq('id', playerId)
    } else if (type === 'ban') {
      await supabase.from('profiles').update({ status: 'offline', updated_at: new Date().toISOString() }).eq('id', playerId)
    } else if (type === 'delete') {
      await supabase.from('profiles').delete().eq('id', playerId)
    }
    setConfirm(null); setMsg('Wykonano akcję'); setTimeout(() => setMsg(''), 2000); load()
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const C: Record<string, React.CSSProperties> = {
    card:    { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '18px 20px', marginBottom: 14 },
    statBox: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 16px', flex: 1, textAlign: 'center' as const },
    val:     { fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.8rem', letterSpacing: 2, color: '#D4AF37' },
    lbl:     { fontSize: '0.62rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', marginTop: 2 },
    th:      { padding: '8px 10px', textAlign: 'left' as const, fontSize: '0.65rem', letterSpacing: 2, color: 'rgba(255,255,255,0.3)', cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const },
    td:      { padding: '10px', verticalAlign: 'middle' as const, borderBottom: '1px solid rgba(255,255,255,0.04)' },
    tabBtn:  (a: boolean): React.CSSProperties => ({ padding: '8px 18px', borderRadius: 8, background: a ? 'rgba(212,175,55,0.15)' : 'transparent', border: `1px solid ${a ? '#D4AF37' : 'rgba(255,255,255,0.1)'}`, color: a ? '#D4AF37' : 'rgba(255,255,255,0.4)', fontFamily: "'Bebas Neue',sans-serif", fontSize: '0.85rem', letterSpacing: 2, cursor: 'pointer' }),
    actionBtn: (color = '#D4AF37'): React.CSSProperties => ({ padding: '4px 10px', borderRadius: 6, background: color + '18', border: `1px solid ${color}44`, color, fontSize: '0.72rem', cursor: 'pointer', fontFamily: "'Montserrat',sans-serif", whiteSpace: 'nowrap' as const }),
    inp2: { ...inp, marginBottom: 0, padding: '7px 10px', fontSize: '0.9rem' } as React.CSSProperties,
  }

  const SortArrow = ({ k }: { k: string }) =>
    sortKey === k ? <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortAsc ? '↑' : '↓'}</span> : null

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.6rem', letterSpacing: 6, color: '#D4AF37' }}>
            ZARZĄDZANIE GRACZAMI
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', letterSpacing: 2 }}>
            {players.length} zarejestrowanych graczy
          </div>
        </div>
        <button onClick={load} style={C.actionBtn('#818cf8')}>⟳ Odśwież</button>
      </div>

      {msg && <div style={{ padding: '10px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#4ade80', fontSize: '0.8rem', marginBottom: 14 }}>✅ {msg}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={C.tabBtn(tab === 'overview')} onClick={() => setTab('overview')}>📊 PRZEGLĄD</button>
        <button style={C.tabBtn(tab === 'players')}  onClick={() => setTab('players')}>👥 GRACZE</button>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div>
          {/* Global stats */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { v: overview.total,      l: 'GRACZY',     c: '#D4AF37' },
              { v: overview.online,     l: 'ONLINE',     c: '#4ade80' },
              { v: overview.inGame,     l: 'W GRZE',     c: '#facc15' },
              { v: overview.totalGames, l: 'GIER ŁĄCZNIE', c: '#818cf8' },
              { v: overview.totalXP,   l: 'XP ŁĄCZNIE',  c: '#fb923c' },
            ].map(({ v, l, c }) => (
              <div key={l} style={C.statBox}>
                <div style={{ ...C.val, color: c }}>{v.toLocaleString('pl')}</div>
                <div style={C.lbl}>{l}</div>
              </div>
            ))}
          </div>

          {/* Leaderboards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 14 }}>
            {[
              { title: '🏆 Najwięcej wygranych',   player: overview.mostWins,   val: (p: Player) => `${p.wins} wygranych` },
              { title: '🔥 Najlepsza seria',        player: overview.bestStreak, val: (p: Player) => `${p.best_streak} z rzędu` },
              { title: '⭐ Najwięcej XP',           player: overview.mostXP,    val: (p: Player) => `${p.xp} XP` },
            ].map(({ title, player, val }) => (
              <div key={title} style={C.card}>
                <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>{title}</div>
                {player ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar p={player} />
                    <div>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', letterSpacing: 2, color: '#D4AF37' }}>{player.username}</div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{val(player)}</div>
                    </div>
                  </div>
                ) : <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>Brak danych</div>}
              </div>
            ))}
          </div>

          {/* Activity chart - simple bars */}
          <div style={C.card}>
            <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>ROZKŁAD WIN RATE GRACZY</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
              {['0-20%','20-40%','40-60%','60-80%','80-100%'].map((range, i) => {
                const [lo, hi] = [i*20, (i+1)*20]
                const count = players.filter(p => { const w = winRate(p); return w >= lo && w < hi }).length
                const maxCount = Math.max(...[0,1,2,3,4].map(j => players.filter(p => { const w = winRate(p); return w >= j*20 && w < (j+1)*20 }).length), 1)
                const h = Math.max(4, Math.round((count / maxCount) * 52))
                return (
                  <div key={range} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>{count}</div>
                    <div style={{ width: '100%', height: h, background: i < 2 ? '#f87171' : i === 2 ? '#facc15' : '#4ade80', borderRadius: '3px 3px 0 0', opacity: 0.8 }} />
                    <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>{range}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── PLAYERS TAB ── */}
      {tab === 'players' && (
        <div>
          {/* Search */}
          <input style={{ ...inp, marginBottom: 14 }} value={search} placeholder="🔍 Szukaj po nicku…"
            onChange={e => setSearch(e.target.value)} />

          {/* Table */}
          <div style={{ overflowX: 'auto' as const, borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <th style={C.th}>GRACZ</th>
                  <th style={C.th} onClick={() => handleSort('xp')}>XP <SortArrow k="xp" /></th>
                  <th style={C.th} onClick={() => handleSort('wins')}>W <SortArrow k="wins" /></th>
                  <th style={C.th} onClick={() => handleSort('losses')}>L <SortArrow k="losses" /></th>
                  <th style={C.th}>WIN%</th>
                  <th style={C.th} onClick={() => handleSort('win_streak')}>SERIA <SortArrow k="win_streak" /></th>
                  <th style={C.th}>STATUS</th>
                  <th style={C.th}>AKCJE</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ ...C.td, textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.3)' }}>Ładowanie…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ ...C.td, textAlign: 'center', padding: 32, color: 'rgba(255,255,255,0.3)' }}>Brak graczy</td></tr>
                ) : filtered.map(p => {
                  const wr = winRate(p)
                  const { level } = xpToLevel(p.xp)
                  return (
                    <tr key={p.id} style={{ transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={C.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar p={p} />
                          <div>
                            <div style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, color: '#fff' }}>{p.username}</div>
                            <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>LVL {level}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...C.td, color: '#D4AF37', fontFamily: "'Bebas Neue',sans-serif" }}>{p.xp}</td>
                      <td style={{ ...C.td, color: '#4ade80' }}>{p.wins}</td>
                      <td style={{ ...C.td, color: '#f87171' }}>{p.losses}</td>
                      <td style={{ ...C.td, color: badge(wr, 40, 60) }}>{wr}%</td>
                      <td style={{ ...C.td, color: badge(p.win_streak, 3, 5) }}>🔥{p.win_streak}</td>
                      <td style={C.td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', background: p.status === 'online' ? 'rgba(74,222,128,0.12)' : p.status === 'in_game' ? 'rgba(250,204,21,0.12)' : 'rgba(255,255,255,0.05)', color: p.status === 'online' ? '#4ade80' : p.status === 'in_game' ? '#facc15' : 'rgba(255,255,255,0.3)' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                          {p.status === 'online' ? 'online' : p.status === 'in_game' ? 'w grze' : 'offline'}
                        </span>
                      </td>
                      <td style={C.td}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
                          <button style={C.actionBtn()} onClick={() => openEdit(p)}>✏️ Edytuj</button>
                          <button style={C.actionBtn('#fb923c')} onClick={() => handleAction('add_xp', p)}>+100 XP</button>
                          <button style={C.actionBtn('#f87171')} onClick={() => handleAction('reset_stats', p)}>🔄 Reset</button>
                          <button style={C.actionBtn('#ef4444')} onClick={() => handleAction('delete', p)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editing && editVals && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#111', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <Avatar p={editing} />
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem', letterSpacing: 4, color: '#D4AF37' }}>{editing.username}</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>Edycja profilu gracza</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {([
                ['xp','XP'], ['wins','WYGRANE'], ['losses','PRZEGRANE'],
                ['win_streak','AKTUALNA SERIA'], ['best_streak','NAJLEPSZA SERIA'],
              ] as [keyof EditState, string][]).map(([k, l]) => k !== 'username' && (
                <div key={k}>
                  <label style={{ display: 'block', fontSize: '0.65rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)', marginBottom: 5 }}>{l}</label>
                  <input type="number" min={0} value={(editVals as any)[k]}
                    onChange={e => setEditVals(v => v ? { ...v, [k]: Number(e.target.value) } : v)}
                    style={C.inp2} />
                </div>
              ))}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '0.65rem', letterSpacing: 2, color: 'rgba(255,255,255,0.35)', marginBottom: 5 }}>NICK</label>
                <input value={editVals.username} maxLength={20}
                  onChange={e => setEditVals(v => v ? { ...v, username: e.target.value.toUpperCase() } : v)}
                  style={{ ...C.inp2, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3, fontSize: '1rem' }} />
              </div>
            </div>

            {/* XP bar preview */}
            <div style={{ marginBottom: 20, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                <span>Poziom {xpToLevel(editVals.xp).level}</span>
                <span>{editVals.xp} XP ({xpToLevel(editVals.xp).pct}/100)</span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${xpToLevel(editVals.xp).pct}%`, background: 'linear-gradient(90deg,#D4AF37,#FFD700)', borderRadius: 3 }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveEdit} disabled={saving}
                style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'rgba(212,175,55,0.15)', border: '1px solid #D4AF37', color: '#D4AF37', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', letterSpacing: 4, cursor: 'pointer' }}>
                {saving ? 'ZAPISYWANIE…' : 'ZAPISZ ZMIANY'}
              </button>
              <button onClick={() => setEditing(null)}
                style={{ padding: '12px 20px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem', letterSpacing: 2, cursor: 'pointer' }}>
                ANULUJ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DIALOG ── */}
      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#111', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 16, padding: 32, maxWidth: 360, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', letterSpacing: 3, color: '#f87171', marginBottom: 8 }}>
              {confirm.type === 'reset_stats' ? 'RESET STATYSTYK' :
               confirm.type === 'reset_xp'   ? 'RESET XP' :
               confirm.type === 'ban'         ? 'BLOKADA GRACZA' : 'USUŃ GRACZA'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: 24 }}>
              Czy na pewno chcesz wykonać tę akcję dla <strong style={{ color: '#fff' }}>{confirm.username}</strong>?
              {confirm.type === 'delete' && <><br/><span style={{ color: '#f87171', fontSize: '0.78rem' }}>Tej akcji nie można cofnąć!</span></>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={executeConfirm} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#ef4444', fontFamily: "'Bebas Neue',sans-serif", fontSize: '0.95rem', letterSpacing: 3, cursor: 'pointer' }}>POTWIERDŹ</button>
              <button onClick={() => setConfirm(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', fontFamily: "'Bebas Neue',sans-serif", fontSize: '0.95rem', letterSpacing: 2, cursor: 'pointer' }}>ANULUJ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
