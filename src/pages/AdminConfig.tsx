// ─────────────────────────────────────────────────────────────────────────────
// AdminConfig — Panel administracyjny (SP / MP / Gracze)
//
// Fast & reliable:
//  - useDebouncedCallback — aktualizacja liczbowych pól (slidery) debounce'owana
//  - useAsyncAction — wszystkie akcje (bulk upload, cat CRUD, reset) z guardem
//  - Toast notifications zamiast scroll-flash 'Zapisano'
//  - AdminUI — spójne komponenty (AdminButton, AdminSelect, Card, etc.)
//  - Optimistic updates (config, tileCategories, players) via useConfigStore
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { clearSession, formatRemaining, sessionRemainingMs, supabase } from '../lib/supabase'
import { BOARD_PRESETS, DEFAULTS, useConfigStore } from '../store/useConfigStore'
import { Category, GameConfig, PlayerSettings, SpeechLang } from '../types'
import { useAsyncAction } from '../hooks/useAsyncAction'
import { useDebouncedCallback } from '../hooks/useDebounce'
import { useToast } from '../hooks/useToast'
import {
  AdminButton, AdminInput, AdminSelect, Card, ConfirmDialog, EmptyState,
  InfoBox, Loading, SectionTitle, T, ToastContainer,
} from '../components/admin/AdminUI'
import AdminPlayers from './AdminPlayers'

// ─── Types ────────────────────────────────────────────────────────────────────
type SPSection  = 'categories' | 'board' | 'gameplay_sp' | 'players_sp' | 'display' | 'advanced'
type MPSection  = 'gameplay_mp' | 'xp_config' | 'history' | 'rooms'
type ActiveMode = 'sp' | 'mp' | 'players'

// ─── Navigation data ──────────────────────────────────────────────────────────
const SP_SECTIONS: { id: SPSection; label: string; icon: string }[] = [
  { id: 'categories',  label: 'Kategorie',    icon: '📂' },
  { id: 'board',       label: 'Plansza',      icon: '🎯' },
  { id: 'gameplay_sp', label: 'Rozgrywka SP', icon: '⚔️' },
  { id: 'players_sp',  label: 'Gracze SP',    icon: '👥' },
  { id: 'display',     label: 'Wyświetlanie', icon: '🖥️' },
  { id: 'advanced',    label: 'Zaawansowane', icon: '⚙️' },
]

const MP_SECTIONS: { id: MPSection; label: string; icon: string }[] = [
  { id: 'gameplay_mp', label: 'Rozgrywka MP',  icon: '🌐' },
  { id: 'xp_config',   label: 'XP & Ranking',  icon: '🏆' },
  { id: 'history',     label: 'Historia gier', icon: '📋' },
  { id: 'rooms',       label: 'Aktywne pokoje',icon: '🚪' },
]

// ─── Field configs ────────────────────────────────────────────────────────────
interface NumField { key: keyof GameConfig; label: string; desc: string; min: number; max: number; unit: string }

const SP_GAMEPLAY: NumField[] = [
  { key: 'DUEL_TIME',    label: 'Czas gracza',      desc: 'Sekundy na odpowiedź (SP)',      min: 10,   max: 120,   unit: 's'  },
  { key: 'PASS_PENALTY', label: 'Kara za pas',      desc: 'Sekundy odejmowane przy pasie',  min: 0,    max: 30,    unit: 's'  },
  { key: 'MAX_PASSES',   label: 'Limit pasów',      desc: 'Maks pasy per duel (0 = brak)',  min: 0,    max: 10,    unit: ''   },
  { key: 'FEEDBACK_MS',  label: 'Czas feedbacku',   desc: 'Wyświetlanie odpowiedzi (ms)',   min: 300,  max: 5000,  unit: 'ms' },
  { key: 'WIN_CLOSE_MS', label: 'Popup wygranej',   desc: 'Auto-zamknięcie wygranej (ms)',  min: 1000, max: 10000, unit: 'ms' },
  { key: 'TOAST_MS',     label: 'Czas powiadomień', desc: 'Czas toastów (ms)',              min: 500,  max: 5000,  unit: 'ms' },
]

const MP_GAMEPLAY: NumField[] = [
  { key: 'MP_DUEL_TIME',    label: 'Czas gracza MP',    desc: 'Sekundy na odpowiedź (Online)', min: 10,   max: 180,   unit: 's'  },
  { key: 'MP_PASS_PENALTY', label: 'Kara za pas MP',    desc: 'Sekundy kary za pas (Online)',  min: 0,    max: 30,    unit: 's'  },
  { key: 'MP_FEEDBACK_MS',  label: 'Feedback MP',       desc: 'Wyświetlanie odpowiedzi (ms)',  min: 300,  max: 5000,  unit: 'ms' },
  { key: 'MP_WIN_CLOSE_MS', label: 'Popup wygranej MP', desc: 'Auto-zamknięcie wygranej (ms)', min: 1000, max: 10000, unit: 'ms' },
]

interface XPFieldCfg { key: keyof GameConfig; label: string; desc: string; min: number; max: number; color: string }
const XP_FIELDS: XPFieldCfg[] = [
  { key: 'MP_XP_WIN',  label: 'XP za wygraną',  desc: 'Punkty za wygraną grę online', min: 0, max: 500, color: T.success },
  { key: 'MP_XP_DRAW', label: 'XP za remis',    desc: 'Punkty za remis',              min: 0, max: 250, color: T.warning },
  { key: 'MP_XP_LOSS', label: 'XP za przegraną',desc: 'Punkty za uczestnictwo',       min: 0, max: 100, color: '#fb923c' },
]

function filenameToAnswer(f: string) {
  return f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function AdminConfig() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    config, fetch, update, players, updatePlayer, resetAll,
    tileCategories, setTileCategory, resetTileCategories,
  } = useConfigStore()

  const [mode,    setMode]    = useState<ActiveMode>('sp')
  const [spSect,  setSpSect]  = useState<SPSection>('categories')
  const [mpSect,  setMpSect]  = useState<MPSection>('gameplay_mp')
  const [sessionLeft, setSessionLeft] = useState(sessionRemainingMs())

  const [cats, setCats]         = useState<Category[]>([])
  const [catsLoading, setCatsLoading] = useState(false)

  const [confirmResetAll, setConfirmResetAll] = useState(false)

  // ── Load categories (raz na mount + przy powrocie do SP) ──────────────────
  const loadCats = useCallback(async () => {
    setCatsLoading(true)
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id,name,emoji,lang,created_at')
        .order('created_at')
      if (error) throw new Error(error.message)
      setCats(data ?? [])
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd ładowania kategorii')
    } finally {
      setCatsLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initial mount: fetch config + load categories + stop bg music ─────────
  useEffect(() => {
    SoundEngine.stopBg(0)
    fetch()
    loadCats()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const r = sessionRemainingMs()
      setSessionLeft(r)
      if (r <= 0) { clearSession(); navigate('/admin') }
    }, 1000)
    return () => clearInterval(iv)
  }, [navigate])

  // ── Config update (optimistic + toast on error) ────────────────────────────
  const handleUpdate = useCallback(async (key: keyof GameConfig, value: number) => {
    try {
      await update(key, value)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd zapisu')
    }
  }, [update, toast])

  const handleLogout = () => { clearSession(); navigate('/admin') }

  // ── Reset all ──────────────────────────────────────────────────────────────
  const { run: runResetAll, loading: resetting } = useAsyncAction(async () => {
    await resetAll()
    setConfirmResetAll(false)
    toast.success('Przywrócono ustawienia domyślne')
  }, { onError: e => toast.error(e.message) })

  // ── Derived values ─────────────────────────────────────────────────────────
  const preset     = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
  const totalTiles = preset.cols * preset.rows

  const sessionColor =
    sessionLeft < 5 * 60 * 1000  ? T.danger :
    sessionLeft < 15 * 60 * 1000 ? T.warning : T.textDim3

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: '100vh', background: T.bg, color: T.text,
      fontFamily: "'Montserrat', sans-serif", display: 'flex',
    }}>
      <ToastContainer />
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600&display=swap" rel="stylesheet" />

      {/* ═══ SIDEBAR ═══════════════════════════════════════════════════════ */}
      <aside style={{
        width: 224, flexShrink: 0, background: 'rgba(255,255,255,0.02)',
        borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column',
        height: '100vh', position: 'sticky', top: 0, overflow: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 14px' }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem',
            letterSpacing: 6, color: T.gold,
          }}>THE FLOOR</div>
          <div style={{
            fontSize: '0.6rem', letterSpacing: 3, color: T.textDim3, marginTop: 2,
          }}>PANEL ADMINA</div>
        </div>

        {/* Mode switcher */}
        <div style={{ padding: '0 12px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <ModeBtn label="🎮 SINGLEPLAYER" active={mode === 'sp'}      color={T.gold}    onClick={() => setMode('sp')} />
            <ModeBtn label="🌐 MULTIPLAYER"  active={mode === 'mp'}      color={T.mp}      onClick={() => setMode('mp')} />
            <ModeBtn label="👥 GRACZE"       active={mode === 'players'} color={T.success} onClick={() => setMode('players')} />
          </div>
        </div>

        {/* Sub-nav */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 6, flex: 1 }}>
          {mode === 'sp' && SP_SECTIONS.map(s => (
            <NavBtn key={s.id} icon={s.icon} label={s.label}
              active={spSect === s.id} color={T.gold}
              onClick={() => setSpSect(s.id)} />
          ))}
          {mode === 'mp' && MP_SECTIONS.map(s => (
            <NavBtn key={s.id} icon={s.icon} label={s.label}
              active={mpSect === s.id} color={T.mp}
              onClick={() => setMpSect(s.id)} />
          ))}
          {mode === 'players' && (
            <div style={{
              padding: '10px 18px', fontSize: '0.84rem', color: T.success,
              borderLeft: `3px solid ${T.success}`, background: `${T.success}10`,
            }}>👥 Zarządzanie graczami</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px', borderTop: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{
            fontSize: '0.62rem', color: sessionColor, letterSpacing: 1, textAlign: 'center',
          }}>Sesja: {formatRemaining(sessionLeft)}</div>
          <Link
            to="/" onClick={() => SoundEngine.stopBg(0)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
              background: 'rgba(212,175,55,0.08)', border: `1px solid ${T.gold}40`,
              borderRadius: 8, color: T.gold, textDecoration: 'none', fontSize: '0.8rem',
            }}
          >🎮 Wyjście do gry</Link>
          <AdminButton onClick={handleLogout} variant="danger" size="sm" fullWidth icon="🚪">
            Wyloguj
          </AdminButton>
        </div>
      </aside>

      {/* ═══ CONTENT ═══════════════════════════════════════════════════════ */}
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 860, overflow: 'auto' }}>
        {/* SP sections */}
        {mode === 'sp' && spSect === 'categories' && (
          <CategoriesSection cats={cats} catsLoading={catsLoading} reload={loadCats} />
        )}
        {mode === 'sp' && spSect === 'board' && (
          <BoardSection
            config={config} handleUpdate={handleUpdate} cats={cats}
            tileCategories={tileCategories}
            setTileCategory={(i: number, id: string) => setTileCategory(i, id, totalTiles)}
            resetTileCategories={resetTileCategories}
          />
        )}
        {mode === 'sp' && spSect === 'gameplay_sp' && (
          <GameplaySPSection config={config} handleUpdate={handleUpdate} />
        )}
        {mode === 'sp' && spSect === 'players_sp' && (
          <PlayersSPSection players={players} updatePlayer={updatePlayer} />
        )}
        {mode === 'sp' && spSect === 'display' && (
          <DisplaySection config={config} handleUpdate={handleUpdate} />
        )}
        {mode === 'sp' && spSect === 'advanced' && (
          <AdvancedSection
            config={config} handleUpdate={handleUpdate}
            confirmResetAll={confirmResetAll} setConfirmResetAll={setConfirmResetAll}
            handleResetAll={() => runResetAll()} resetting={resetting}
          />
        )}

        {/* MP sections */}
        {mode === 'mp' && mpSect === 'gameplay_mp' && (
          <GameplayMPSection config={config} handleUpdate={handleUpdate} />
        )}
        {mode === 'mp' && mpSect === 'xp_config' && (
          <XPSection config={config} handleUpdate={handleUpdate} />
        )}
        {mode === 'mp' && mpSect === 'history' && (
          <GameHistorySection />
        )}
        {mode === 'mp' && mpSect === 'rooms' && (
          <ActiveRoomsSection />
        )}

        {/* Players section */}
        {mode === 'players' && <AdminPlayers />}
      </main>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SIDEBAR BUTTONS
// ═════════════════════════════════════════════════════════════════════════════
function ModeBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '11px 10px',
        background: active ? `${color}18` : 'transparent',
        border: `1px solid ${active ? color : T.border}`,
        borderRadius: 9,
        color: active ? color : T.textDim2,
        fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.82rem', letterSpacing: 2,
        cursor: 'pointer', transition: 'all 0.2s',
      }}
    >{label}</button>
  )
}

function NavBtn({ icon, label, active, color, onClick }: { icon: string; label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '10px 18px',
        background: active ? `${color}12` : 'transparent', border: 'none',
        borderLeft: `3px solid ${active ? color : 'transparent'}`,
        color: active ? color : T.textDim2,
        cursor: 'pointer', fontSize: '0.84rem',
        transition: 'all 0.2s', textAlign: 'left', width: '100%',
      }}
    >
      <span style={{ fontSize: '0.95rem' }}>{icon}</span>{label}
    </button>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// NumberField — label + desc + numeric input z +/- (debounced onChange)
// ═════════════════════════════════════════════════════════════════════════════
interface NumberFieldProps {
  label: string; desc: string
  value: number; min: number; max: number; unit: string
  onChange: (v: number) => void
  accentColor?: string
}

function NumberField({ label, desc, value, min, max, unit, onChange, accentColor = T.gold }: NumberFieldProps) {
  // Local controlled state → smoother UX, network call is debounced
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])

  const { debounced } = useDebouncedCallback(onChange, 400)

  const apply = (v: number) => {
    const clamped = Math.max(min, Math.min(max, v))
    setLocal(clamped)
    debounced(clamped)
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '14px 16px', background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 140 }}>
        <div style={{ color: T.silver, fontSize: '0.88rem', marginBottom: 2 }}>{label}</div>
        <div style={{ color: T.textDim3, fontSize: '0.72rem' }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={() => apply(local - 1)} style={stepBtn}>−</button>
        <input
          type="number" value={local} min={min} max={max}
          onChange={e => apply(Number(e.target.value))}
          style={{
            width: 68, background: T.surface2, border: `1px solid ${accentColor}44`,
            borderRadius: 8, padding: '6px 8px', color: accentColor,
            fontFamily: 'monospace', fontSize: '1rem', textAlign: 'center',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {unit && <span style={{ color: T.textDim2, fontSize: '0.75rem' }}>{unit}</span>}
        <button onClick={() => apply(local + 1)} style={stepBtn}>+</button>
      </div>
    </div>
  )
}

const stepBtn: React.CSSProperties = {
  width: 28, height: 28, background: T.surface2,
  border: `1px solid ${T.borderHi}`, borderRadius: 6,
  color: T.text, cursor: 'pointer', fontSize: '1rem',
}

// ═════════════════════════════════════════════════════════════════════════════
// ToggleField — checkbox as iOS-style switch
// ═════════════════════════════════════════════════════════════════════════════
function ToggleField({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, marginBottom: 8, cursor: 'pointer', gap: 12,
      }}
    >
      <div>
        <div style={{ color: T.silver, fontSize: '0.88rem', marginBottom: 2 }}>{label}</div>
        <div style={{ color: T.textDim3, fontSize: '0.72rem' }}>{desc}</div>
      </div>
      <div style={{
        width: 44, height: 24, borderRadius: 12,
        background: value ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)',
        position: 'relative', transition: 'all 0.25s', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 22 : 3,
          width: 16, height: 16, borderRadius: '50%',
          background: value ? T.gold : T.textDim2,
          transition: 'all 0.25s',
        }} />
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// LangPicker — PL / EN / MIX
// ═════════════════════════════════════════════════════════════════════════════
function LangPicker({ value, onChange }: { value: SpeechLang; onChange: (v: SpeechLang) => void }) {
  const opts: { v: SpeechLang; label: string }[] = [
    { v: 'pl-PL', label: 'PL' }, { v: 'en-US', label: 'EN' }, { v: 'both', label: 'MIX' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      {opts.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            padding: '6px 10px', cursor: 'pointer', borderRadius: 8,
            background: value === o.v ? 'rgba(99,102,241,0.3)' : T.surface2,
            border: `1px solid ${value === o.v ? 'rgba(99,102,241,0.6)' : T.border}`,
            color: value === o.v ? T.mp : T.textDim2,
            fontSize: '0.78rem',
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// XPField — card w kolorowej obwódce + pasek
// ═════════════════════════════════════════════════════════════════════════════
function XPField({ label, desc, value, min, max, onChange, color }: {
  label: string; desc: string; value: number; min: number; max: number;
  onChange: (v: number) => void; color: string;
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  const { debounced } = useDebouncedCallback(onChange, 400)
  const apply = (v: number) => {
    const c = Math.max(min, Math.min(max, v))
    setLocal(c); debounced(c)
  }
  const pct = Math.min(100, Math.round(((local - min) / Math.max(1, max - min)) * 100))

  return (
    <div style={{
      padding: '14px 18px', background: color + '0a',
      border: `1px solid ${color}33`, borderRadius: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ color: T.text, fontSize: '0.88rem', marginBottom: 2 }}>{label}</div>
          <div style={{ color: T.textDim2, fontSize: '0.72rem' }}>{desc}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => apply(local - 5)} style={stepBtn}>−</button>
          <input
            type="number" value={local} min={min} max={max}
            onChange={e => apply(Number(e.target.value))}
            style={{
              width: 60, background: T.surface2, border: `1px solid ${color}44`,
              borderRadius: 8, padding: '6px 8px', color, fontFamily: 'monospace',
              fontSize: '1rem', textAlign: 'center', outline: 'none',
            }}
          />
          <span style={{ color: T.textDim2, fontSize: '0.75rem' }}>XP</span>
          <button onClick={() => apply(local + 5)} style={stepBtn}>+</button>
        </div>
      </div>
      <div style={{ height: 4, background: T.surface2, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SP: CATEGORIES SECTION
// ═════════════════════════════════════════════════════════════════════════════
function CategoriesSection({ cats, catsLoading, reload }: {
  cats: Category[]; catsLoading: boolean; reload: () => void;
}) {
  const toast = useToast()
  const [catName,  setCatName]  = useState('')
  const [catEmoji, setCatEmoji] = useState('🎯')
  const [catLang,  setCatLang]  = useState<SpeechLang>('pl-PL')
  const [editing,  setEditing]  = useState<Category | null>(null)

  const [bulkCatId,   setBulkCatId]   = useState('')
  const [bulkFiles,   setBulkFiles]   = useState<File[]>([])
  const [bulkProgress,setBulkProgress]= useState(0)
  const bulkRef = useRef<HTMLInputElement>(null)

  // ── Add category ─────────────────────────────────────────────────────────
  const { run: addCat, loading: adding } = useAsyncAction(async () => {
    const trimmed = catName.trim()
    if (!trimmed) return
    const { error } = await supabase.from('categories').insert({
      name: trimmed, emoji: catEmoji, lang: catLang,
    })
    if (error) throw new Error(error.message)
    setCatName(''); setCatEmoji('🎯')
    toast.success(`Dodano: ${trimmed}`)
    reload()
  }, { onError: e => toast.error(e.message) })

  // ── Save edit ────────────────────────────────────────────────────────────
  const { run: saveEdit, loading: saving } = useAsyncAction(async () => {
    if (!editing) return
    const { error } = await supabase.from('categories')
      .update({ name: editing.name, emoji: editing.emoji, lang: editing.lang ?? 'pl-PL' })
      .eq('id', editing.id)
    if (error) throw new Error(error.message)
    setEditing(null)
    toast.success('Zapisano zmiany')
    reload()
  }, { onError: e => toast.error(e.message) })

  // ── Remove (cascade) ─────────────────────────────────────────────────────
  const [removingId, setRemovingId] = useState<string | null>(null)
  const removeCat = async (cat: Category) => {
    if (removingId) return
    if (!confirm(`Usunąć kategorię "${cat.name}" wraz ze wszystkimi pytaniami?`)) return
    setRemovingId(cat.id)
    try {
      const { data: qs } = await supabase.from('questions').select('id,image_path').eq('category_id', cat.id)
      if (qs && qs.length > 0) {
        const paths = qs.map(q => q.image_path).filter((p): p is string => !!p)
        for (let i = 0; i < paths.length; i += 20) {
          await supabase.storage.from('question-images').remove(paths.slice(i, i + 20))
        }
        const ids = qs.map(q => q.id)
        for (let i = 0; i < ids.length; i += 50) {
          await supabase.from('questions').delete().in('id', ids.slice(i, i + 50))
        }
      }
      const { error } = await supabase.from('categories').delete().eq('id', cat.id)
      if (error) throw new Error(error.message)
      toast.success(`Usunięto: ${cat.name}`)
      reload()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Błąd usuwania')
    } finally {
      setRemovingId(null)
    }
  }

  // ── Bulk upload ──────────────────────────────────────────────────────────
  const { run: bulkUpload, loading: bulkUploading } = useAsyncAction(async () => {
    if (!bulkCatId || bulkFiles.length === 0) return
    setBulkProgress(0)
    let done = 0
    for (const file of bulkFiles) {
      const answer = filenameToAnswer(file.name)
      const ext    = file.name.split('.').pop()
      const path   = `${bulkCatId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('question-images').upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)
      const { error: insErr } = await supabase.from('questions').insert({
        category_id: bulkCatId, image_path: path, answer, synonyms: [],
      })
      if (insErr) throw new Error(insErr.message)
      done++; setBulkProgress(Math.round((done / bulkFiles.length) * 100))
    }
    toast.success(`Wgrano ${done} pytań`)
    setBulkFiles([])
    if (bulkRef.current) bulkRef.current.value = ''
  }, { onError: e => toast.error(`Upload: ${e.message}`) })

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      <SectionTitle icon="📂" title="Kategorie" />

      {/* Add form */}
      <Card padding={16} style={{ marginBottom: 20 }}>
        <div style={{ color: T.textDim2, fontSize: '0.72rem', letterSpacing: 1, marginBottom: 12 }}>NOWA KATEGORIA</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <AdminInput
            value={catEmoji} onChange={e => setCatEmoji(e.target.value)}
            style={{ width: 52, textAlign: 'center', fontSize: '1.2rem' }}
          />
          <AdminInput
            value={catName} onChange={e => setCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !adding && addCat()}
            placeholder="Nazwa kategorii"
            style={{ flex: 1, minWidth: 160 }}
          />
          <LangPicker value={catLang} onChange={setCatLang} />
          <AdminButton
            onClick={addCat} loading={adding} disabled={!catName.trim()}
            variant="primary" size="md" icon="+"
          >Dodaj</AdminButton>
        </div>
      </Card>

      {/* List */}
      {catsLoading ? <Loading />
      : cats.length === 0 ? <EmptyState icon="📂" title="Brak kategorii" description="Dodaj pierwszą powyżej." />
      : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
          {cats.map(cat => (
            <Card key={cat.id} padding="12px 16px">
              {editing?.id === cat.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <AdminInput
                    value={editing.emoji}
                    onChange={e => setEditing({ ...editing, emoji: e.target.value })}
                    style={{ width: 48, textAlign: 'center', fontSize: '1.1rem' }}
                  />
                  <AdminInput
                    value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    style={{ flex: 1, minWidth: 140 }}
                    autoFocus
                  />
                  <LangPicker
                    value={editing.lang ?? 'pl-PL'}
                    onChange={v => setEditing({ ...editing, lang: v })}
                  />
                  <AdminButton onClick={saveEdit} loading={saving} variant="success" size="sm">Zap</AdminButton>
                  <AdminButton onClick={() => setEditing(null)} disabled={saving} variant="ghost" size="sm">X</AdminButton>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '1.4rem', minWidth: 32, textAlign: 'center' }}>{cat.emoji}</span>
                  <span style={{ flex: 1, color: T.text, fontSize: '0.9rem' }}>{cat.name}</span>
                  <span style={{ fontSize: '0.65rem', color: T.textDim3 }}>{cat.lang ?? 'pl-PL'}</span>
                  <Link
                    to={`/admin/categories/${cat.id}/questions`}
                    style={{
                      padding: '5px 10px', borderRadius: 8,
                      background: 'rgba(99,102,241,0.1)', border: `1px solid ${T.mp}40`,
                      color: T.mp, textDecoration: 'none', fontSize: '0.78rem',
                    }}
                  >Pytania</Link>
                  <AdminButton onClick={() => setEditing(cat)} variant="ghost" size="sm">Edyt</AdminButton>
                  <AdminButton
                    onClick={() => removeCat(cat)}
                    loading={removingId === cat.id}
                    disabled={!!removingId && removingId !== cat.id}
                    variant="danger" size="sm"
                  >Del</AdminButton>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Bulk upload */}
      <Card padding={18}>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.9rem',
          letterSpacing: 3, color: T.textDim, marginBottom: 12,
        }}>MASOWE WGRYWANIE</div>
        <AdminSelect
          value={bulkCatId} onChange={e => setBulkCatId(e.target.value)}
          style={{ marginBottom: 10, width: '100%' }}
          options={[
            { value: '', label: 'Wybierz kategorię…' },
            ...cats.map(c => ({ value: c.id, label: `${c.emoji} ${c.name}` })),
          ]}
        />
        <input
          ref={bulkRef} type="file" accept="image/*" multiple
          style={{ display: 'none' }}
          onChange={e => setBulkFiles(Array.from(e.target.files || []))}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <AdminButton
            onClick={() => bulkRef.current?.click()}
            variant="secondary" size="md"
          >Wybierz {bulkFiles.length > 0 ? `(${bulkFiles.length})` : ''}</AdminButton>
          <AdminButton
            onClick={bulkUpload}
            disabled={!bulkCatId || bulkFiles.length === 0}
            loading={bulkUploading}
            variant="primary" size="md"
          >{bulkUploading ? `Wgrywanie ${bulkProgress}%…` : 'Wgraj wszystkie'}</AdminButton>
        </div>
        {bulkUploading && (
          <div style={{ marginTop: 10, height: 4, background: T.surface2, borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${bulkProgress}%`, background: T.gold, transition: 'width 0.3s' }} />
          </div>
        )}
      </Card>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SP: BOARD SECTION
// ═════════════════════════════════════════════════════════════════════════════
function BoardSection({ config, handleUpdate, cats, tileCategories, setTileCategory, resetTileCategories }: {
  config: GameConfig; handleUpdate: (k: keyof GameConfig, v: number) => void;
  cats: Category[]; tileCategories: string[];
  setTileCategory: (i: number, id: string) => void;
  resetTileCategories: () => Promise<void>;
}) {
  const toast = useToast()
  const [confirmReset, setConfirmReset] = useState(false)
  const preset = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
  const totalTiles = preset.cols * preset.rows

  const { run: handleResetMap, loading: resettingMap } = useAsyncAction(async () => {
    await resetTileCategories()
    setConfirmReset(false)
    toast.success('Wyczyszczono mapę kategorii')
  }, { onError: e => toast.error(e.message) })

  return (
    <div>
      <SectionTitle icon="🎯" title="Konfiguracja Planszy" />

      <div style={{ marginBottom: 18 }}>
        <div style={{ color: T.textDim2, fontSize: '0.72rem', letterSpacing: 1, marginBottom: 10 }}>KSZTAŁT PLANSZY</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {Object.entries(BOARD_PRESETS).map(([key, p]) => {
            const active = config.BOARD_SHAPE === Number(key)
            return (
              <button
                key={key}
                onClick={() => handleUpdate('BOARD_SHAPE', Number(key))}
                style={{
                  padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  background: active ? 'rgba(212,175,55,0.15)' : T.surface,
                  border: `1px solid ${active ? T.gold : T.border}`,
                  color: active ? T.gold : T.textDim2,
                  fontSize: '0.78rem', letterSpacing: 0.5, lineHeight: 1.4,
                }}
              >
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem',
                  letterSpacing: 3, marginBottom: 2,
                }}>{p.cols}×{p.rows}</div>
                <div>{p.label}</div>
              </button>
            )
          })}
        </div>
      </div>

      <ToggleField
        label="Losowe kategorie kafelków"
        desc="Każda gra losowo przypisuje kategorię do pól"
        value={config.RANDOM_TILES === 1}
        onChange={v => handleUpdate('RANDOM_TILES', v ? 1 : 0)}
      />

      {config.RANDOM_TILES === 0 && cats.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: T.textDim2, fontSize: '0.72rem', letterSpacing: 1, marginBottom: 8 }}>PRZYPISANIE KATEGORII</div>
          <div style={{
            display: 'grid', gap: 6, marginBottom: 10,
            gridTemplateColumns: `repeat(${preset.cols},1fr)`,
          }}>
            {Array.from({ length: totalTiles }).map((_, i) => (
              <AdminSelect
                key={i} size="sm"
                value={tileCategories[i] || ''}
                onChange={e => setTileCategory(i, e.target.value)}
                style={{
                  background: tileCategories[i] ? 'rgba(212,175,55,0.1)' : T.surface,
                  border: `1px solid ${tileCategories[i] ? `${T.gold}66` : T.border}`,
                  fontSize: '0.68rem', width: '100%',
                }}
                options={[
                  { value: '', label: 'Auto' },
                  ...cats.map(c => ({ value: c.id, label: `${c.emoji} ${c.name}` })),
                ]}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!confirmReset ? (
              <AdminButton onClick={() => setConfirmReset(true)} variant="danger" size="sm">Wyczyść</AdminButton>
            ) : (
              <>
                <span style={{ color: T.danger, fontSize: '0.8rem', alignSelf: 'center' }}>Na pewno?</span>
                <AdminButton onClick={handleResetMap} loading={resettingMap} variant="danger" size="sm">Tak</AdminButton>
                <AdminButton onClick={() => setConfirmReset(false)} variant="ghost" size="sm">Anuluj</AdminButton>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SP: GAMEPLAY SECTION
// ═════════════════════════════════════════════════════════════════════════════
function GameplaySPSection({ config, handleUpdate }: { config: GameConfig; handleUpdate: (k: keyof GameConfig, v: number) => void }) {
  return (
    <div>
      <SectionTitle icon="⚔️" title="Singleplayer — Rozgrywka" />
      <InfoBox>Ustawienia dotyczą wyłącznie gry lokalnej (2 graczy, 1 ekran).</InfoBox>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SP_GAMEPLAY.map(f => (
          <NumberField
            key={f.key} label={f.label} desc={f.desc}
            value={config[f.key] as number} min={f.min} max={f.max} unit={f.unit}
            onChange={v => handleUpdate(f.key, v)}
          />
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <ToggleField
          label="Pas głosem (PASS / PAS)"
          desc='Rozpoznawanie słowa "pass" przez mikrofon jak w programie The Floor'
          value={config.VOICE_PASS === 1}
          onChange={v => handleUpdate('VOICE_PASS', v ? 1 : 0)}
        />
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SP: PLAYERS SECTION
// ═════════════════════════════════════════════════════════════════════════════
function PlayersSPSection({ players, updatePlayer }: {
  players: [PlayerSettings, PlayerSettings];
  updatePlayer: (idx: 0 | 1, field: keyof PlayerSettings, value: string) => Promise<void>;
}) {
  return (
    <div>
      <SectionTitle icon="👥" title="Singleplayer — Gracze" />
      <InfoBox>Nazwy i kolory graczy w trybie lokalnym. Zapisywane lokalnie i w Supabase.</InfoBox>
      {([0, 1] as const).map(idx => (
        <Card key={idx} padding={20} style={{
          marginBottom: 12,
          border: `1px solid ${players[idx].color}30`,
        }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem',
            letterSpacing: 4, color: players[idx].color, marginBottom: 14,
          }}>GRACZ {idx + 1}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ display: 'block', color: T.textDim2, fontSize: '0.7rem', letterSpacing: 1, marginBottom: 5 }}>NAZWA</label>
              <AdminInput
                value={players[idx].name} maxLength={16}
                onChange={e => updatePlayer(idx, 'name', e.target.value.toUpperCase())}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: T.textDim2, fontSize: '0.7rem', letterSpacing: 1, marginBottom: 5 }}>KOLOR</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="color" value={players[idx].color}
                  onChange={e => updatePlayer(idx, 'color', e.target.value)}
                  style={{
                    width: 44, height: 38, padding: 2, background: T.surface2,
                    border: `1px solid ${T.borderHi}`, borderRadius: 8, cursor: 'pointer',
                  }}
                />
                <span style={{ color: T.textDim2, fontSize: '0.8rem', fontFamily: 'monospace' }}>{players[idx].color}</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SP: DISPLAY SECTION
// ═════════════════════════════════════════════════════════════════════════════
function DisplaySection({ config, handleUpdate }: { config: GameConfig; handleUpdate: (k: keyof GameConfig, v: number) => void }) {
  return (
    <div>
      <SectionTitle icon="🖥️" title="Wyświetlanie i dźwięk" />

      <ToggleField
        label="Statystyki domyślnie widoczne"
        desc="Pasek posiadania planszy od startu"
        value={config.SHOW_STATS === 1}
        onChange={v => handleUpdate('SHOW_STATS', v ? 1 : 0)}
      />
      <ToggleField
        label="Podpowiedź pierwszej litery"
        desc="Pokazuje 1. literę odpowiedzi po 10s ciszy"
        value={config.SHOW_ANSWER_HINT === 1}
        onChange={v => handleUpdate('SHOW_ANSWER_HINT', v ? 1 : 0)}
      />
      <ToggleField
        label="Animacja obracania kafelka"
        desc="Efekt flip przy zmianie właściciela pola"
        value={config.TILE_FLIP_ANIM === 1}
        onChange={v => handleUpdate('TILE_FLIP_ANIM', v ? 1 : 0)}
      />

      <div style={{ marginTop: 14 }}>
        <div style={{ color: T.textDim2, fontSize: '0.72rem', letterSpacing: 1, marginBottom: 10 }}>DŹWIĘK</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NumberField
            label="Muzyka" desc="Głośność muzyki tła (0-100%)"
            value={config.MUSIC_VOLUME} min={0} max={100} unit="%"
            onChange={v => handleUpdate('MUSIC_VOLUME', v)}
          />
          <NumberField
            label="Efekty" desc="Głośność efektów dźwiękowych (0-100%)"
            value={config.SFX_VOLUME} min={0} max={100} unit="%"
            onChange={v => handleUpdate('SFX_VOLUME', v)}
          />
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 12 }}>
          {[
            { label: 'Muzyka', v: config.MUSIC_VOLUME, c: T.mp },
            { label: 'Efekty', v: config.SFX_VOLUME,   c: T.success },
          ].map(({ label, v, c }) => (
            <div key={label} style={{
              flex: 1, padding: '10px 14px', background: T.surface,
              borderRadius: 10, border: `1px solid ${T.border}`,
            }}>
              <div style={{ height: 5, background: T.surface2, borderRadius: 4, overflow: 'hidden', marginBottom: 5 }}>
                <div style={{ height: '100%', width: `${v}%`, background: c, borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
              <div style={{ textAlign: 'center', color: c, fontSize: '0.7rem' }}>{label}: {v}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// SP: ADVANCED SECTION
// ═════════════════════════════════════════════════════════════════════════════
function AdvancedSection({ config, handleUpdate, confirmResetAll, setConfirmResetAll, handleResetAll, resetting }: {
  config: GameConfig; handleUpdate: (k: keyof GameConfig, v: number) => void;
  confirmResetAll: boolean; setConfirmResetAll: (v: boolean) => void;
  handleResetAll: () => void; resetting: boolean;
}) {
  return (
    <div>
      <SectionTitle icon="⚙️" title="Wymiary planszy (ręczne)" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        <NumberField
          label="Kolumny" desc="Nadpisuje preset"
          value={config.GRID_COLS} min={2} max={10} unit=""
          onChange={v => handleUpdate('GRID_COLS', v)}
        />
        <NumberField
          label="Wiersze" desc="Nadpisuje preset"
          value={config.GRID_ROWS} min={2} max={8} unit=""
          onChange={v => handleUpdate('GRID_ROWS', v)}
        />
      </div>
      <InfoBox color="#fb923c">Ręczne wymiary są nadpisywane przy zmianie presetu w sekcji Plansza.</InfoBox>

      <SectionTitle icon="🔁" title="Reset ustawień" />
      <div style={{
        padding: 18, background: 'rgba(239,68,68,0.04)',
        border: `1px solid ${T.danger}30`, borderRadius: 12,
      }}>
        <div style={{ color: T.textDim, fontSize: '0.85rem', marginBottom: 12 }}>
          Przywróci wszystkie ustawienia do wartości domyślnych.
        </div>
        <AdminButton onClick={() => setConfirmResetAll(true)} variant="danger" size="md">
          Reset do domyślnych
        </AdminButton>
      </div>

      <ConfirmDialog
        open={confirmResetAll}
        danger
        title="RESET USTAWIEŃ"
        message="Czy na pewno chcesz przywrócić wszystkie ustawienia (gry, planszę, XP) do wartości domyślnych?"
        confirmLabel="RESETUJ"
        loading={resetting}
        onConfirm={handleResetAll}
        onCancel={() => setConfirmResetAll(false)}
      />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MP: GAMEPLAY SECTION
// ═════════════════════════════════════════════════════════════════════════════
function GameplayMPSection({ config, handleUpdate }: { config: GameConfig; handleUpdate: (k: keyof GameConfig, v: number) => void }) {
  return (
    <div>
      <SectionTitle icon="🌐" title="Multiplayer — Rozgrywka Online" />
      <InfoBox color={T.mp}>Ustawienia dotyczą wyłącznie trybu online. Niezależne od SP.</InfoBox>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MP_GAMEPLAY.map(f => (
          <NumberField
            key={f.key} label={f.label} desc={f.desc}
            value={(config[f.key] as number) ?? (DEFAULTS[f.key] as number)}
            min={f.min} max={f.max} unit={f.unit}
            onChange={v => handleUpdate(f.key, v)}
            accentColor={T.mp}
          />
        ))}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MP: XP SECTION
// ═════════════════════════════════════════════════════════════════════════════
function XPSection({ config, handleUpdate }: { config: GameConfig; handleUpdate: (k: keyof GameConfig, v: number) => void }) {
  return (
    <div>
      <SectionTitle icon="🏆" title="System XP i Rankingów" />
      <InfoBox color={T.mp}>Punkty przyznawane po każdej zakończonej grze online. Wpływają na ranking i poziom.</InfoBox>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {XP_FIELDS.map(f => (
          <XPField
            key={f.key} label={f.label} desc={f.desc} color={f.color}
            value={(config[f.key] as number) ?? (DEFAULTS[f.key] as number)}
            min={f.min} max={f.max}
            onChange={v => handleUpdate(f.key, v)}
          />
        ))}
      </div>

      {/* Preview */}
      <Card padding="16px 20px">
        <div style={{ fontSize: '0.68rem', letterSpacing: 2, color: T.textDim2, marginBottom: 10 }}>PODGLĄD XP (10 gier)</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: '10 wygranych', xp: 10 * (config.MP_XP_WIN  ?? 50), color: T.success },
            { label: '10 remisów',   xp: 10 * (config.MP_XP_DRAW ?? 20), color: T.warning },
            { label: '10 porażek',   xp: 10 * (config.MP_XP_LOSS ?? 10), color: '#fb923c' },
          ].map(({ label, xp, color }) => (
            <div key={label} style={{
              flex: 1, minWidth: 130, padding: '12px 14px',
              background: color + '10', border: `1px solid ${color}33`, borderRadius: 10,
            }}>
              <div style={{ fontSize: '0.68rem', color: T.textDim2, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 3, color }}>+{xp} XP</div>
              <div style={{ fontSize: '0.7rem', color: T.textDim3 }}>Poziom {Math.floor(xp / 100) + 1}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MP: GAME HISTORY SECTION
// ═════════════════════════════════════════════════════════════════════════════
interface HistRow {
  id: string; played_at: string; is_draw: boolean;
  winner_id: string | null; loser_id: string | null;
  winner_score: number | null; loser_score: number | null;
}

function GameHistorySection() {
  const toast = useToast()
  const [history, setHistory] = useState<HistRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})

  const { run: loadHistory, loading } = useAsyncAction(async () => {
    const { data, error } = await supabase.from('game_history')
      .select('id,played_at,is_draw,winner_id,loser_id,winner_score,loser_score')
      .order('played_at', { ascending: false }).limit(100)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as HistRow[]
    setHistory(rows)

    // Fetch nicknames
    const ids = [...new Set(rows.flatMap(g => [g.winner_id, g.loser_id].filter(Boolean) as string[]))]
    if (ids.length > 0) {
      const { data: ps } = await supabase.from('profiles').select('id,username').in('id', ids)
      if (ps) setProfiles(Object.fromEntries(ps.map((p: { id: string; username: string }) => [p.id, p.username])))
    }
  }, { onError: e => toast.error(e.message) })

  useEffect(() => { loadHistory() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nick = (id: string | null) => id ? (profiles[id] ?? id.slice(0, 8)) : '—'

  return (
    <div>
      <SectionTitle
        icon="📋" title="Historia Gier Online"
        action={<AdminButton onClick={loadHistory} loading={loading} variant="secondary" size="sm">⟳ Odśwież</AdminButton>}
      />
      {loading ? <Loading />
      : history.length === 0 ? <EmptyState icon="📋" title="Brak rozegranych gier online" />
      : (
        <div style={{ borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                {['DATA','WYNIK','ZWYCIĘZCA','PRZEGRANY','PUNKTY'].map(h => (
                  <th key={h} style={{
                    padding: '10px 12px', textAlign: 'left',
                    fontSize: '0.65rem', letterSpacing: 2, color: T.textDim2,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((g, i) => (
                <tr key={g.id} style={{
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  borderBottom: `1px solid ${T.border}`,
                }}>
                  <td style={{ padding: '10px 12px', color: T.textDim, fontSize: '0.75rem' }}>
                    {new Date(g.played_at).toLocaleDateString('pl-PL', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {g.is_draw
                      ? <span style={{ color: '#a78bfa', fontSize: '0.8rem' }}>🤝 Remis</span>
                      : <span style={{ color: T.success, fontSize: '0.8rem' }}>✓ Rozstrzygnięty</span>}
                  </td>
                  <td style={{
                    padding: '10px 12px', color: T.gold,
                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, fontSize: '0.8rem',
                  }}>{g.is_draw ? '—' : nick(g.winner_id)}</td>
                  <td style={{
                    padding: '10px 12px', color: T.textDim2,
                    fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, fontSize: '0.8rem',
                  }}>{g.is_draw ? `${nick(g.winner_id)} / ${nick(g.loser_id)}` : nick(g.loser_id)}</td>
                  <td style={{
                    padding: '10px 12px', fontFamily: "'Bebas Neue', sans-serif",
                    color: T.text, letterSpacing: 2,
                  }}>{g.winner_score ?? 0}:{g.loser_score ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// MP: ACTIVE ROOMS SECTION
// ═════════════════════════════════════════════════════════════════════════════
interface Room {
  id: string; code: string;
  host_id: string; guest_id: string | null;
  status: string; created_at: string;
}

function ActiveRoomsSection() {
  const toast = useToast()
  const [rooms,   setRooms]   = useState<Room[]>([])
  const [profiles,setProfiles]= useState<Record<string, string>>({})

  const { run: loadRooms, loading } = useAsyncAction(async () => {
    const { data, error } = await supabase.from('game_rooms')
      .select('id,code,host_id,guest_id,status,created_at')
      .order('created_at', { ascending: false }).limit(50)
    if (error) throw new Error(error.message)
    const list = (data ?? []) as Room[]
    setRooms(list)

    const ids = [...new Set(list.flatMap(r => [r.host_id, r.guest_id].filter(Boolean) as string[]))]
    if (ids.length > 0) {
      const { data: ps } = await supabase.from('profiles').select('id,username').in('id', ids)
      if (ps) setProfiles(Object.fromEntries(ps.map((p: { id: string; username: string }) => [p.id, p.username])))
    }
  }, { onError: e => toast.error(e.message) })

  useEffect(() => { loadRooms() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nick = (id: string | null) => id ? (profiles[id] ?? id.slice(0, 8)) : '—'
  const statusColor = (s: string) => s === 'playing' ? T.success : s === 'waiting' ? T.warning : T.textDim2
  const statusLabel = (s: string) => s === 'playing' ? '🎮 W grze' : s === 'waiting' ? '⏳ Oczekuje' : s

  return (
    <div>
      <SectionTitle
        icon="🚪" title="Aktywne Pokoje Online"
        action={<AdminButton onClick={loadRooms} loading={loading} variant="secondary" size="sm">⟳ Odśwież</AdminButton>}
      />
      {loading ? <Loading />
      : rooms.length === 0 ? <EmptyState icon="🚪" title="Brak aktywnych pokojów" />
      : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rooms.map(r => (
            <Card key={r.id} padding="12px 16px">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{
                  fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem',
                  letterSpacing: 4, color: T.gold, minWidth: 52,
                }}>{r.code}</div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ color: T.gold, fontSize: '0.8rem' }}>👑 {nick(r.host_id)}</span>
                    {r.guest_id && (
                      <>
                        <span style={{ color: T.textDim3 }}>vs</span>
                        <span style={{ color: T.silver, fontSize: '0.8rem' }}>{nick(r.guest_id)}</span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: T.textDim3 }}>
                    {new Date(r.created_at).toLocaleTimeString('pl-PL')}
                  </div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem',
                  background: `${statusColor(r.status)}18`, color: statusColor(r.status),
                  border: `1px solid ${statusColor(r.status)}44`,
                }}>
                  {statusLabel(r.status ?? 'waiting')}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
