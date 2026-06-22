// ─────────────────────────────────────────────────────────────────────────────
// AdminPlayers — zarządzanie graczami (overview + lista + edycja)
//
// Fast & reliable:
//  - Debounced search (300ms) — brak re-filter na każde naciśnięcie klawisza
//  - useAsyncAction na save/reset/delete — guard double-click
//  - Optimistic updates — UI reaguje natychmiast, reload jedynie przy potrzebie
//  - ConfirmDialog zamiast custom modal
//  - Toast notifications zamiast inline `msg` state
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useDebounce } from '../hooks/useDebounce'
import { useToast } from '../hooks/useToast'
import {
  AdminButton, AdminInput, Card, ConfirmDialog, EmptyState,
  Loading, SectionTitle, T, ToastContainer,
} from '../components/admin/AdminUI'

// ─── Types ────────────────────────────────────────────────────────────────────
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
  is_admin: boolean
  created_at: string
}

interface EditState {
  xp: number; wins: number; losses: number
  win_streak: number; best_streak: number; username: string
}

type SortKey = 'xp' | 'wins' | 'win_streak' | 'losses' | 'created_at'
type ConfirmType = 'reset_stats' | 'reset_xp' | 'ban' | 'delete' | 'grant_admin' | 'revoke_admin'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const badge = (v: number, good: number, great: number) =>
  v >= great ? T.success : v >= good ? T.warning : T.textDim2

const winRate = (p: Player) =>
  p.wins + p.losses > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0

const xpToLevel = (xp: number) => ({ level: Math.floor(xp / 100) + 1, pct: xp % 100 })

function Avatar({ p, size = 36 }: { p: Player; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: `${size * 0.38}px`, flexShrink: 0, overflow: 'hidden',
    }}>
      {p.avatar_url
        ? <img src={p.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
        : (p.avatar || '🎮')}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function AdminPlayers() {
  const toast = useToast()

  const [players,  setPlayers]  = useState<Player[]>([])
  const [loading,  setLoading]  = useState(true)
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounce(searchRaw, 300)
  const [sortKey,  setSortKey]  = useState<SortKey>('xp')
  const [sortAsc,  setSortAsc]  = useState(false)
  const [editing,  setEditing]  = useState<Player | null>(null)
  const [editVals, setEditVals] = useState<EditState | null>(null)
  const [confirm,  setConfirm]  = useState<{ type: ConfirmType; playerId: string; username: string } | null>(null)
  const [tab,      setTab]      = useState<'players' | 'overview'>('overview')

  // Total games count (for overview)
  const [totalGames, setTotalGames] = useState(0)

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [playersRes, gamesRes] = await Promise.all([
        supabase.from('profiles').select('*').order(sortKey, { ascending: sortAsc }),
        supabase.from('game_history').select('id', { count: 'exact', head: true }),
      ])
      if (playersRes.error) throw new Error(playersRes.error.message)
      setPlayers((playersRes.data ?? []) as Player[])
      setTotalGames(gamesRes.count ?? 0)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd ładowania graczy')
    } finally {
      setLoading(false)
    }
  }, [sortKey, sortAsc]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // ── Cleanup: zamknij dialogi gdy komponent znika z drzewa (np. tab switch) ─
  useEffect(() => () => { setConfirm(null); setEditing(null); setEditVals(null) }, [])

  // ── Derived: filtered + overview ─────────────────────────────────────────────
  const filtered = useMemo(() =>
    players.filter(p => !search || p.username?.toLowerCase().includes(search.toLowerCase())),
  [players, search])

  const overview = useMemo(() => ({
    total:      players.length,
    online:     players.filter(p => p.status === 'online').length,
    inGame:     players.filter(p => p.status === 'in_game').length,
    totalGames,
    totalXP:    players.reduce((s, p) => s + p.xp, 0),
    mostWins:   players.reduce<Player | null>((a, p) => !a || p.wins > a.wins ? p : a, null),
    bestStreak: players.reduce<Player | null>((a, p) => !a || p.best_streak > a.best_streak ? p : a, null),
    mostXP:     players.reduce<Player | null>((a, p) => !a || p.xp > a.xp ? p : a, null),
  }), [players, totalGames])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(false) }
  }

  const openEdit = (p: Player) => {
    setEditing(p)
    setEditVals({
      xp: p.xp, wins: p.wins, losses: p.losses,
      win_streak: p.win_streak, best_streak: p.best_streak,
      username: p.username,
    })
  }

  // ── Save edit ──────────────────────────────────────────────────────────────
  const { run: saveEdit, loading: saving } = useAsyncAction(async () => {
    if (!editing || !editVals) return
    const newData = {
      username:    editVals.username.toUpperCase().trim(),
      xp:          Math.max(0, editVals.xp),
      wins:        Math.max(0, editVals.wins),
      losses:      Math.max(0, editVals.losses),
      win_streak:  Math.max(0, editVals.win_streak),
      best_streak: Math.max(0, editVals.best_streak),
      updated_at:  new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').update(newData).eq('id', editing.id)
    if (error) throw new Error(error.message)

    // Optimistic update
    setPlayers(prev => prev.map(p => p.id === editing.id ? { ...p, ...newData } : p))
    setEditing(null)
    toast.success('Zapisano zmiany')
  }, { onError: e => toast.error(e.message) })

  // ── Quick +100 XP ──────────────────────────────────────────────────────────
  const [addingXpId, setAddingXpId] = useState<string | null>(null)
  const addXp = async (p: Player) => {
    if (addingXpId) return
    setAddingXpId(p.id)
    try {
      const newXp = p.xp + 100
      const { error } = await supabase.from('profiles')
        .update({ xp: newXp, updated_at: new Date().toISOString() })
        .eq('id', p.id)
      if (error) throw new Error(error.message)
      setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, xp: newXp } : x))
      toast.success(`+100 XP → ${p.username}`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd +XP')
    } finally {
      setAddingXpId(null)
    }
  }

  // ── Confirm actions (reset/ban/delete) ─────────────────────────────────────
  const { run: executeConfirm, loading: executing } = useAsyncAction(async () => {
    if (!confirm) return
    const { type, playerId, username } = confirm
    const now = new Date().toISOString()

    if (type === 'reset_stats') {
      const update = { wins: 0, losses: 0, win_streak: 0, best_streak: 0, xp: 0, updated_at: now }
      const { error } = await supabase.from('profiles').update(update).eq('id', playerId)
      if (error) throw new Error(error.message)
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, ...update } : p))
      toast.success(`Zresetowano statystyki: ${username}`)
    } else if (type === 'reset_xp') {
      const { error } = await supabase.from('profiles').update({ xp: 0, updated_at: now }).eq('id', playerId)
      if (error) throw new Error(error.message)
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, xp: 0 } : p))
      toast.success(`Zresetowano XP: ${username}`)
    } else if (type === 'ban') {
      const { error } = await supabase.from('profiles').update({ status: 'offline', updated_at: now }).eq('id', playerId)
      if (error) throw new Error(error.message)
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, status: 'offline' } : p))
      toast.warning(`Zablokowano: ${username}`)
    } else if (type === 'delete') {
      const { error } = await supabase.from('profiles').delete().eq('id', playerId)
      if (error) throw new Error(error.message)
      setPlayers(prev => prev.filter(p => p.id !== playerId))
      toast.success(`Usunięto: ${username}`)
    } else if (type === 'grant_admin' || type === 'revoke_admin') {
      const makeAdmin = type === 'grant_admin'
      // RPC set_player_admin: SECURITY DEFINER + blokada usunięcia ostatniego admina
      const { error } = await supabase.rpc('set_player_admin', { target_id: playerId, make_admin: makeAdmin })
      if (error) throw new Error(error.message)
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, is_admin: makeAdmin } : p))
      toast.success(makeAdmin ? `Nadano admina: ${username}` : `Odebrano admina: ${username}`)
    }
    setConfirm(null)
  }, { onError: e => toast.error(e.message) })

  const openConfirm = (type: ConfirmType, p: Player) => {
    setConfirm({ type, playerId: p.id, username: p.username })
  }

  // ── Esc zamyka aktywny dialog (musi być po useAsyncAction żeby `saving`/`executing` istniały) ─
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (saving || executing) return
      if (editing) { setEditing(null); setEditVals(null) }
      else if (confirm) setConfirm(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, confirm, saving, executing])

  // ── Styles ────────────────────────────────────────────────────────────────
  const C = useMemo(() => ({
    statBox: {
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: '14px 16px', flex: 1, textAlign: 'center' as const,
    },
    val: {
      fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.8rem',
      letterSpacing: 2, color: T.gold,
    },
    lbl: {
      fontSize: '0.62rem', letterSpacing: 2, color: T.textDim2, marginTop: 2,
    },
    th: {
      padding: '8px 10px', textAlign: 'left' as const,
      fontSize: '0.65rem', letterSpacing: 2, color: T.textDim2,
      cursor: 'pointer', userSelect: 'none' as const, whiteSpace: 'nowrap' as const,
    },
    td: {
      padding: '10px', verticalAlign: 'middle' as const,
      borderBottom: `1px solid ${T.border}`,
    },
    tabBtn: (a: boolean): React.CSSProperties => ({
      padding: '8px 18px', borderRadius: 8,
      background: a ? 'rgba(212,175,55,0.15)' : 'transparent',
      border: `1px solid ${a ? T.gold : T.border}`,
      color: a ? T.gold : T.textDim2,
      fontFamily: "'Bebas Neue',sans-serif", fontSize: '0.85rem',
      letterSpacing: 2, cursor: 'pointer',
    }),
  }), [])

  const SortArrow = ({ k }: { k: string }) =>
    sortKey === k ? <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortAsc ? '↑' : '↓'}</span> : null

  const confirmMeta: Record<ConfirmType, { title: string; danger: boolean; label: string }> = {
    reset_stats:  { title: 'RESET STATYSTYK',  danger: true,  label: 'RESETUJ' },
    reset_xp:     { title: 'RESET XP',          danger: true,  label: 'RESETUJ' },
    ban:          { title: 'BLOKADA GRACZA',    danger: true,  label: 'ZABLOKUJ' },
    delete:       { title: 'USUŃ GRACZA',       danger: true,  label: 'USUŃ' },
    grant_admin:  { title: 'NADAJ ADMINA',      danger: false, label: 'NADAJ' },
    revoke_admin: { title: 'ODBIERZ ADMINA',    danger: true,  label: 'ODBIERZ' },
  }

  return (
    <div>
      <ToastContainer />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.6rem',
            letterSpacing: 6, color: T.gold,
          }}>ZARZĄDZANIE GRACZAMI</div>
          <div style={{ fontSize: '0.72rem', color: T.textDim2, letterSpacing: 2 }}>
            {players.length} zarejestrowanych graczy
          </div>
        </div>
        <AdminButton onClick={load} loading={loading} variant="secondary" size="sm" icon="⟳">
          Odśwież
        </AdminButton>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={C.tabBtn(tab === 'overview')} onClick={() => setTab('overview')}>📊 PRZEGLĄD</button>
        <button style={C.tabBtn(tab === 'players')}  onClick={() => setTab('players')}>👥 GRACZE</button>
      </div>

      {/* ═══ OVERVIEW TAB ══════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div>
          {/* Global stats */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { v: overview.total,      l: 'GRACZY',       c: T.gold    },
              { v: overview.online,     l: 'ONLINE',       c: T.success },
              { v: overview.inGame,     l: 'W GRZE',       c: T.warning },
              { v: overview.totalGames, l: 'GIER ŁĄCZNIE', c: T.mp      },
              { v: overview.totalXP,    l: 'XP ŁĄCZNIE',   c: '#fb923c' },
            ].map(({ v, l, c }) => (
              <div key={l} style={C.statBox}>
                <div style={{ ...C.val, color: c }}>{v.toLocaleString('pl')}</div>
                <div style={C.lbl}>{l}</div>
              </div>
            ))}
          </div>

          {/* Leaderboards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))',
            gap: 12, marginBottom: 14,
          }}>
            {[
              { title: '🏆 Najwięcej wygranych', player: overview.mostWins,   val: (p: Player) => `${p.wins} wygranych` },
              { title: '🔥 Najlepsza seria',     player: overview.bestStreak, val: (p: Player) => `${p.best_streak} z rzędu` },
              { title: '⭐ Najwięcej XP',        player: overview.mostXP,     val: (p: Player) => `${p.xp} XP` },
            ].map(({ title, player, val }) => (
              <Card key={title} padding="18px 20px">
                <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: T.textDim2, marginBottom: 10 }}>{title}</div>
                {player ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar p={player} />
                    <div>
                      <div style={{
                        fontFamily: "'Bebas Neue',sans-serif", fontSize: '1rem',
                        letterSpacing: 2, color: T.gold,
                      }}>{player.username}</div>
                      <div style={{ fontSize: '0.75rem', color: T.textDim }}>{val(player)}</div>
                    </div>
                  </div>
                ) : <div style={{ color: T.textDim3, fontSize: '0.8rem' }}>Brak danych</div>}
              </Card>
            ))}
          </div>

          {/* Win-rate distribution */}
          <Card padding="18px 20px">
            <div style={{ fontSize: '0.72rem', letterSpacing: 2, color: T.textDim2, marginBottom: 12 }}>ROZKŁAD WIN RATE GRACZY</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
              {(['0-20%','20-40%','40-60%','60-80%','80-100%']).map((range, i) => {
                const [lo, hi] = [i * 20, (i + 1) * 20]
                const count = players.filter(p => { const w = winRate(p); return w >= lo && w < hi }).length
                const maxCount = Math.max(
                  ...[0,1,2,3,4].map(j => players.filter(p => {
                    const w = winRate(p); return w >= j * 20 && w < (j + 1) * 20
                  }).length),
                  1,
                )
                const h = Math.max(4, Math.round((count / maxCount) * 52))
                return (
                  <div key={range} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: '0.65rem', color: T.textDim2 }}>{count}</div>
                    <div style={{
                      width: '100%', height: h,
                      background: i < 2 ? T.danger : i === 2 ? T.warning : T.success,
                      borderRadius: '3px 3px 0 0', opacity: 0.8,
                    }} />
                    <div style={{ fontSize: '0.55rem', color: T.textDim3 }}>{range}</div>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ═══ PLAYERS TAB ══════════════════════════════════════════════════ */}
      {tab === 'players' && (
        <div>
          {/* Search */}
          <AdminInput
            value={searchRaw}
            placeholder="🔍 Szukaj po nicku…"
            onChange={e => setSearchRaw(e.target.value)}
            style={{ marginBottom: 14 }}
          />

          {/* Table */}
          <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${T.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
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
                  <tr><td colSpan={8} style={{ ...C.td, textAlign: 'center', padding: 32, color: T.textDim2 }}>
                    <Loading />
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ ...C.td, padding: 32 }}>
                    <EmptyState icon="👥" title="Brak graczy" description={search ? 'Zmień zapytanie wyszukiwania.' : undefined} />
                  </td></tr>
                ) : filtered.map(p => {
                  const wr = winRate(p)
                  const { level } = xpToLevel(p.xp)
                  return (
                    <tr key={p.id}
                      style={{ transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={C.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Avatar p={p} />
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2, color: T.text }}>
                              {p.username}
                              {p.is_admin && (
                                <span title="Administrator" style={{
                                  fontSize: '0.62rem', letterSpacing: 1, padding: '1px 6px',
                                  borderRadius: 20, background: 'rgba(212,175,55,0.15)',
                                  border: `1px solid ${T.gold}66`, color: T.gold,
                                }}>👑 ADMIN</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: T.textDim2 }}>LVL {level}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...C.td, color: T.gold, fontFamily: "'Bebas Neue',sans-serif" }}>{p.xp}</td>
                      <td style={{ ...C.td, color: T.success }}>{p.wins}</td>
                      <td style={{ ...C.td, color: T.danger }}>{p.losses}</td>
                      <td style={{ ...C.td, color: badge(wr, 40, 60) }}>{wr}%</td>
                      <td style={{ ...C.td, color: badge(p.win_streak, 3, 5) }}>🔥{p.win_streak}</td>
                      <td style={C.td}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem',
                          background: p.status === 'online' ? 'rgba(74,222,128,0.12)'
                                   : p.status === 'in_game' ? 'rgba(250,204,21,0.12)'
                                   : 'rgba(255,255,255,0.05)',
                          color: p.status === 'online' ? T.success
                               : p.status === 'in_game' ? T.warning
                               : T.textDim2,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                          {p.status === 'online' ? 'online' : p.status === 'in_game' ? 'w grze' : 'offline'}
                        </span>
                      </td>
                      <td style={C.td}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <AdminButton onClick={() => openEdit(p)} variant="ghost" size="sm" icon="✏️">Edytuj</AdminButton>
                          <AdminButton
                            onClick={() => addXp(p)}
                            loading={addingXpId === p.id}
                            variant="secondary" size="sm"
                            style={{ color: '#fb923c' }}
                          >+100 XP</AdminButton>
                          {p.is_admin
                            ? <AdminButton onClick={() => openConfirm('revoke_admin', p)} variant="ghost" size="sm" style={{ color: T.gold }}>👑 Odbierz</AdminButton>
                            : <AdminButton onClick={() => openConfirm('grant_admin', p)} variant="ghost" size="sm" style={{ color: T.gold }}>👑 Admin</AdminButton>}
                          <AdminButton onClick={() => openConfirm('reset_stats', p)} variant="danger" size="sm">🔄 Reset</AdminButton>
                          <AdminButton onClick={() => openConfirm('delete', p)} variant="danger" size="sm">🗑️</AdminButton>
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

      {/* ═══ EDIT MODAL ═══════════════════════════════════════════════════ */}
      {editing && editVals && (
        <div
          onClick={() => !saving && setEditing(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: T.bg3, border: `1px solid ${T.gold}4d`,
              borderRadius: 16, padding: 28, width: '100%', maxWidth: 440,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
              <Avatar p={editing} size={44} />
              <div>
                <div style={{
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem',
                  letterSpacing: 4, color: T.gold,
                }}>{editing.username}</div>
                <div style={{ fontSize: '0.7rem', color: T.textDim2 }}>Edycja profilu gracza</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {([
                ['xp', 'XP'],
                ['wins', 'WYGRANE'],
                ['losses', 'PRZEGRANE'],
                ['win_streak', 'AKTUALNA SERIA'],
                ['best_streak', 'NAJLEPSZA SERIA'],
              ] as [keyof EditState, string][]).map(([k, l]) => k !== 'username' && (
                <div key={k}>
                  <label style={{ display: 'block', fontSize: '0.65rem', letterSpacing: 2, color: T.textDim2, marginBottom: 5 }}>{l}</label>
                  <AdminInput
                    type="number" min={0}
                    value={(editVals as unknown as Record<string, number | string>)[k] as number}
                    onChange={e => setEditVals(v => v ? { ...v, [k]: Number(e.target.value) } : v)}
                    size="sm"
                  />
                </div>
              ))}
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '0.65rem', letterSpacing: 2, color: T.textDim2, marginBottom: 5 }}>NICK</label>
                <AdminInput
                  value={editVals.username} maxLength={20}
                  onChange={e => setEditVals(v => v ? { ...v, username: e.target.value.toUpperCase() } : v)}
                  style={{ fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 3, fontSize: '1rem' }}
                />
              </div>
            </div>

            {/* XP preview */}
            <div style={{
              marginBottom: 20, padding: '10px 14px',
              background: T.surface, borderRadius: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: T.textDim, marginBottom: 6 }}>
                <span>Poziom {xpToLevel(editVals.xp).level}</span>
                <span>{editVals.xp} XP ({xpToLevel(editVals.xp).pct}/100)</span>
              </div>
              <div style={{ height: 6, background: T.surface2, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${xpToLevel(editVals.xp).pct}%`,
                  background: 'linear-gradient(90deg,#D4AF37,#FFD700)', borderRadius: 3,
                }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <AdminButton onClick={saveEdit} loading={saving} variant="primary" size="lg" fullWidth>
                ZAPISZ ZMIANY
              </AdminButton>
              <AdminButton onClick={() => setEditing(null)} disabled={saving} variant="ghost" size="lg">
                ANULUJ
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CONFIRM DIALOG ═══════════════════════════════════════════════ */}
      {confirm && (
        <ConfirmDialog
          open
          danger={confirmMeta[confirm.type].danger}
          title={confirmMeta[confirm.type].title}
          confirmLabel={confirmMeta[confirm.type].label}
          message={
            <>
              Czy na pewno chcesz wykonać tę akcję dla <strong style={{ color: T.text }}>{confirm.username}</strong>?
              {confirm.type === 'delete' && (
                <><br /><span style={{ color: T.danger, fontSize: '0.78rem' }}>Tej akcji nie można cofnąć!</span></>
              )}
            </>
          }
          loading={executing}
          onConfirm={executeConfirm}
          onCancel={() => !executing && setConfirm(null)}
        />
      )}
    </div>
  )
}
