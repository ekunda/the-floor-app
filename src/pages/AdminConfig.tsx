import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { clearSession, formatRemaining, sessionRemainingMs, supabase } from '../lib/supabase'
import { BOARD_PRESETS, DEFAULTS, useConfigStore } from '../store/useConfigStore'
import { useGameStore } from '../store/useGameStore'
import { Category, GameConfig, SpeechLang } from '../types'

type Section = 'categories' | 'board' | 'gameplay' | 'players' | 'display' | 'advanced'

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'categories', label: 'Kategorie',      icon: '📂' },
  { id: 'board',      label: 'Plansza',        icon: '🎯' },
  { id: 'gameplay',   label: 'Rozgrywka',      icon: '⚔️' },
  { id: 'players',    label: 'Gracze',         icon: '👥' },
  { id: 'display',    label: 'Wyświetlanie',   icon: '🖥️' },
  { id: 'advanced',   label: 'Zaawansowane',   icon: '⚙️' },
]

const GAMEPLAY_FIELDS: {
  key: keyof GameConfig; label: string; desc: string; min: number; max: number; unit: string
}[] = [
  { key: 'DUEL_TIME',    label: 'Czas gracza',    desc: 'Sekundy na start pojedynku',    min: 10,   max: 120,   unit: 's'  },
  { key: 'PASS_PENALTY', label: 'Kara za pas',    desc: 'Sekundy odejmowane przy pasie', min: 0,    max: 30,    unit: 's'  },
  { key: 'FEEDBACK_MS',  label: 'Czas feedbacku', desc: 'Wyświetlanie odpowiedzi (ms)',   min: 300,  max: 5000,  unit: 'ms' },
  { key: 'WIN_CLOSE_MS', label: 'Popup wygranej', desc: 'Auto-zamknięcie wygranej (ms)',  min: 1000, max: 10000, unit: 'ms' },
  { key: 'TOAST_MS',     label: 'Czas toastu',    desc: 'Wyświetlanie powiadomień (ms)', min: 500,  max: 5000,  unit: 'ms' },
]

function filenameToAnswer(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ──────────────────────────────────────────────────────────────────────────────

export default function AdminConfig() {
  const navigate = useNavigate()
  const { config, fetch, update, players, updatePlayer, resetAll,
          tileCategories, setTileCategory, resetTileCategories } = useConfigStore()
  const gameCategories = useGameStore(s => s.categories)

  const [section, setSection]           = useState<Section>('categories')
  const [saved, setSaved]               = useState(false)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting]       = useState(false)

  // Session countdown
  const [sessionLeft, setSessionLeft] = useState(sessionRemainingMs())

  // Categories
  const [cats, setCats]           = useState<Category[]>([])
  const [catName, setCatName]     = useState('')
  const [catEmoji, setCatEmoji]   = useState('🎯')
  const [editing, setEditing]     = useState<Category | null>(null)
  const [catsLoading, setCatsLoading] = useState(false)

  // Bulk upload
  const [bulkCatId, setBulkCatId]       = useState('')
  const [bulkFiles, setBulkFiles]       = useState<File[]>([])
  const [bulkProgress, setBulkProgress] = useState(0)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkDone, setBulkDone]         = useState(false)
  const [bulkError, setBulkError]       = useState<string | null>(null)
  const bulkRef = useRef<HTMLInputElement>(null)

  // ── Stop all sounds on admin entry ──
  useEffect(() => {
    SoundEngine.stopBg(0)
  }, [])

  // ── Fetch config & categories ──
  useEffect(() => { fetch() }, [])
  useEffect(() => { loadCats() }, [])

  // ── Session 1h countdown + auto-logout ──
  useEffect(() => {
    const tick = () => {
      const rem = sessionRemainingMs()
      setSessionLeft(rem)
      if (rem <= 0) handleLogout()
    }
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Helpers ──
  const loadCats = async () => {
    setCatsLoading(true)
    const { data } = await supabase.from('categories').select('*').order('created_at')
    setCats(data ?? [])
    setCatsLoading(false)
  }

  const addCat = async () => {
    if (!catName.trim()) return
    await supabase.from('categories').insert({ name: catName.trim(), emoji: catEmoji, lang: catLang })
    setCatName(''); setCatEmoji('🎯'); loadCats()
  }

  const saveEditCat = async () => {
    if (!editing) return
    await supabase.from('categories').update({ name: editing.name, emoji: editing.emoji, lang: editing.lang ?? 'pl-PL' }).eq('id', editing.id)
    setEditing(null); loadCats()
  }

  const removeCat = async (id: string) => {
    if (!confirm('Usunąć kategorię i wszystkie pytania?')) return
    await supabase.from('categories').delete().eq('id', id)
    loadCats()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    clearSession()
    navigate('/admin')
  }

  const handleUpdate = async (key: keyof GameConfig, value: number) => {
    await update(key, value)
    flash()
  }

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800) }

  const handleReset = async () => {
    setResetting(true)
    await resetAll()
    setResetting(false)
    setConfirmReset(false)
    flash()
  }

  // Bulk upload
  const handleBulkUpload = async () => {
    if (!bulkCatId || bulkFiles.length === 0) return
    setBulkUploading(true); setBulkProgress(0); setBulkDone(false); setBulkError(null)
    let uploaded = 0
    for (const file of bulkFiles) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
        const answer = filenameToAnswer(file.name)
        const path = `${bulkCatId}/bulk-${crypto.randomUUID()}.${ext}`
        const contentType = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'

        const { data: up, error: upErr } = await supabase.storage
          .from('question-images').upload(path, file, { contentType, upsert: false })
        if (upErr) throw new Error(upErr.message)

        await supabase.from('questions').insert({ category_id: bulkCatId, answer, image_path: up.path })
        uploaded++
        setBulkProgress(Math.round((uploaded / bulkFiles.length) * 100))
      } catch (e: any) {
        setBulkError(`Błąd przy "${file.name}": ${e.message}`)
        break
      }
    }
    setBulkUploading(false)
    if (!bulkError) { setBulkDone(true); setBulkFiles([]); if (bulkRef.current) bulkRef.current.value = '' }
  }

  // Derived values
  const preset   = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
  const totalTiles = preset.cols * preset.rows
  const sessionColor = sessionLeft < 5 * 60 * 1000 ? '#f87171' : sessionLeft < 15 * 60 * 1000 ? '#facc15' : 'rgba(255,255,255,0.3)'

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '8px 12px', color: '#fff',
    fontFamily: "'Montserrat', sans-serif", fontSize: '0.9rem',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  const navBtnStyle = (id: Section): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px',
    background: section === id ? 'rgba(212,175,55,0.1)' : 'transparent', border: 'none',
    borderLeft: `3px solid ${section === id ? '#D4AF37' : 'transparent'}`,
    color: section === id ? '#D4AF37' : 'rgba(255,255,255,0.45)',
    cursor: 'pointer', fontSize: '0.85rem', letterSpacing: 0.5,
    transition: 'all 0.2s', textAlign: 'left', width: '100%',
  })

  const SidebarContent = ({ onNav = () => {} }) => (
    <>
      <div style={{ padding: '8px 20px 4px', color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem', letterSpacing: 2 }}>SEKCJE</div>
      {SECTIONS.map(s => (
        <button key={s.id} onClick={() => { setSection(s.id); onNav() }} style={navBtnStyle(s.id)}>
          <span style={{ fontSize: '1rem' }}>{s.icon}</span>{s.label}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{
        padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <Link to="/" onClick={() => SoundEngine.stopBg(0)} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
          background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)',
          borderRadius: 8, color: '#D4AF37', textDecoration: 'none',
          fontSize: '0.82rem', letterSpacing: 0.5, transition: 'all 0.2s',
        }}>🎮 Wyjście do gry</Link>
        <button onClick={handleLogout} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, color: 'rgba(239,68,68,0.7)',
          cursor: 'pointer', fontSize: '0.82rem', letterSpacing: 0.5,
          transition: 'all 0.2s', width: '100%', textAlign: 'left',
        }}>🚪 Wyloguj</button>
      </div>
    </>
  )

  // ─────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif", display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @media (min-width: 768px) {
          .admin-mobile-sidebar, .admin-overlay { display: none !important; }
          .admin-desktop-sidebar { display: flex !important; }
          .admin-hamburger { display: none !important; }
        }
        @media (max-width: 767px) { .admin-desktop-sidebar { display: none !important; } }
        .admin-cat-select { appearance: none; }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0a0a0a', position: 'sticky', top: 0, zIndex: 30,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="admin-hamburger" onClick={() => setSidebarOpen(o => !o)} style={{
            background: 'none', border: 'none', color: '#D4AF37', cursor: 'pointer', fontSize: '1.2rem',
          }}>☰</button>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: 5, color: '#D4AF37' }}>
            THE FLOOR — ADMIN
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saved && (
            <span style={{ padding: '4px 12px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: 20, color: '#4ade80', fontSize: '0.75rem', letterSpacing: 1 }}>
              ✓ Zapisano
            </span>
          )}
          {/* Session timer */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${sessionColor}30`, borderRadius: 20,
          }}>
            <span style={{ fontSize: '0.7rem' }}>🕐</span>
            <span style={{ color: sessionColor, fontSize: '0.78rem', fontFamily: 'monospace', letterSpacing: 1 }}>
              {formatRemaining(sessionLeft)}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="admin-overlay" onClick={() => setSidebarOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40,
        }} />
      )}

      {/* Mobile sidebar */}
      <nav className="admin-mobile-sidebar" style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 220,
        background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.06)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease', paddingTop: 16,
      }}>
        <SidebarContent onNav={() => setSidebarOpen(false)} />
      </nav>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Desktop sidebar */}
        <nav className="admin-desktop-sidebar" style={{
          width: 220, flexShrink: 0, background: '#0a0a0a',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column',
          position: 'sticky', top: 49, height: 'calc(100vh - 49px)',
          paddingTop: 8,
        }}>
          <SidebarContent />
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, padding: 'clamp(20px, 4vw, 36px)', maxWidth: 760, overflowY: 'auto' }}>

          {/* ══ KATEGORIE ══ */}
          {section === 'categories' && (
            <CategoriesSection
              cats={cats} catsLoading={catsLoading}
              catName={catName} setCatName={setCatName}
              catEmoji={catEmoji} setCatEmoji={setCatEmoji}
              catLang={catLang} setCatLang={setCatLang}
              editing={editing} setEditing={setEditing}
              addCat={addCat} saveEditCat={saveEditCat} removeCat={removeCat}
              inp={inp}
              bulkCatId={bulkCatId} setBulkCatId={setBulkCatId}
              bulkFiles={bulkFiles} setBulkFiles={setBulkFiles}
              bulkProgress={bulkProgress} bulkUploading={bulkUploading}
              bulkDone={bulkDone} setBulkDone={setBulkDone}
              bulkError={bulkError} setBulkError={setBulkError}
              bulkRef={bulkRef} handleBulkUpload={handleBulkUpload}
            />
          )}

          {/* ══ PLANSZA ══ */}
          {section === 'board' && (
            <BoardSection
              config={config} handleUpdate={handleUpdate}
              cats={cats}
              tileCategories={tileCategories}
              setTileCategory={(idx, catId) => setTileCategory(idx, catId, totalTiles)}
              resetTileCategories={resetTileCategories}
              onFlash={flash}
            />
          )}

          {/* ══ ROZGRYWKA ══ */}
          {section === 'gameplay' && (
            <div>
              <SectionTitle icon="⚔️" title="Ustawienia pojedynku" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {GAMEPLAY_FIELDS.map(f => (
                  <NumberField key={f.key} label={f.label} desc={f.desc}
                    value={config[f.key]} min={f.min} max={f.max} unit={f.unit}
                    onChange={v => handleUpdate(f.key, v)} />
                ))}
              </div>
            </div>
          )}

          {/* ══ GRACZE ══ */}
          {section === 'players' && (
            <div>
              <SectionTitle icon="👥" title="Ustawienia graczy" />
              {([0, 1] as const).map(idx => (
                <div key={idx} style={{
                  padding: 20, marginBottom: 16,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${players[idx].color}30`, borderRadius: 12,
                }}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 4, color: players[idx].color, marginBottom: 16 }}>
                    GRACZ {idx + 1}
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 6 }}>NAZWA</label>
                      <input value={players[idx].name}
                        onChange={e => updatePlayer(idx, 'name', e.target.value.toUpperCase())}
                        style={inp} maxLength={16} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 6 }}>KOLOR</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="color" value={players[idx].color}
                          onChange={e => updatePlayer(idx, 'color', e.target.value)}
                          style={{ width: 44, height: 38, padding: 2, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, cursor: 'pointer' }} />
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{players[idx].color}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem' }}>
                💡 Nazwy i kolory zapisywane lokalnie w przeglądarce.
              </div>
            </div>
          )}

          {/* ══ WYŚWIETLANIE ══ */}
          {section === 'display' && (
            <div>
              <SectionTitle icon="🖥️" title="Wyświetlanie i dźwięk" />
              <ToggleField label="Statystyki widoczne domyślnie" desc="Pasek posiadania planszy widoczny od startu gry"
                value={config.SHOW_STATS === 1} onChange={v => handleUpdate('SHOW_STATS', v ? 1 : 0)} />
              <div style={{ marginTop: 16 }}>
                <NumberField label="Głośność dźwięków" desc="Głośność efektów i muzyki (0–100)"
                  value={config.SOUND_VOLUME} min={0} max={100} unit="%"
                  onChange={v => handleUpdate('SOUND_VOLUME', v)} />
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${config.SOUND_VOLUME}%`, background: 'linear-gradient(90deg, #D4AF37, #FFD700)', borderRadius: 4, transition: 'width 0.3s' }} />
                </div>
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem', marginTop: 4 }}>Głośność: {config.SOUND_VOLUME}%</div>
              </div>
            </div>
          )}

          {/* ══ ZAAWANSOWANE ══ */}
          {section === 'advanced' && (
            <div>
              <SectionTitle icon="⚙️" title="Wymiary planszy (ręczne)" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                <NumberField label="Kolumny" desc="Nadpisuje preset kształtu" value={config.GRID_COLS} min={2} max={10} unit="" onChange={v => handleUpdate('GRID_COLS', v)} />
                <NumberField label="Wiersze" desc="Nadpisuje preset kształtu" value={config.GRID_ROWS} min={2} max={8} unit="" onChange={v => handleUpdate('GRID_ROWS', v)} />
              </div>
              <div style={{ padding: 16, marginBottom: 28, background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 10, color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                ⚠️ Ręczne wymiary są nadpisywane przez preset z sekcji "Plansza".
              </div>

              {/* ── RESET ── */}
              <SectionTitle icon="🔄" title="Resetuj ustawienia" />
              <div style={{ padding: 20, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, marginBottom: 28 }}>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: 8 }}>
                  Przywróci wszystkie ustawienia gry do wartości domyślnych.
                </div>
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', marginBottom: 16, lineHeight: 1.6 }}>
                  Dotyczy: kształtu planszy, czasu duelów, kary za pas, głośności, przypisań kafelków i wszystkich pozostałych opcji.
                  <strong style={{ color: 'rgba(255,100,100,0.7)' }}> Nazwy i kolory graczy również zostaną zresetowane.</strong>
                </div>
                {!confirmReset ? (
                  <button onClick={() => setConfirmReset(true)} style={{
                    padding: '10px 20px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171', cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s',
                  }}>🔄 Resetuj do domyślnych</button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, color: '#f87171', fontSize: '0.85rem', fontWeight: 600 }}>
                      ⚠️ Czy na pewno? Tej operacji nie można cofnąć.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={handleReset} disabled={resetting} style={{
                        padding: '10px 20px', borderRadius: 8,
                        background: resetting ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.8)',
                        color: '#fff', border: 'none', cursor: resetting ? 'not-allowed' : 'pointer',
                        fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.95rem', letterSpacing: 2,
                      }}>{resetting ? 'RESETOWANIE…' : '✓ TAK, RESETUJ'}</button>
                      <button onClick={() => setConfirmReset(false)} style={{
                        padding: '10px 20px', borderRadius: 8, background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem',
                      }}>Anuluj</button>
                    </div>
                  </div>
                )}
              </div>

              <SectionTitle icon="🚀" title="Przyszłe funkcje" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: '🏆 Tryb turniejowy',    desc: 'Wiele rund z punktacją skumulowaną' },
                  { label: '⏱ Timer per kategoria', desc: 'Różny czas dla każdej kategorii' },
                  { label: '🎯 Pola specjalne',      desc: 'Pola z podwójnymi punktami / losowe efekty' },
                  { label: '📱 Tryb mobilny',        desc: 'Przyciski dotykowe zamiast klawiatury' },
                  { label: '🌐 Multiplayer online',  desc: 'Gra przez sieć w czasie rzeczywistym' },
                  { label: '📊 Historia gier',       desc: 'Zapisywanie wyników i statystyk' },
                  { label: '🎨 Motywy wizualne',     desc: 'Ciemny / jasny / niestandardowy motyw' },
                ].map((f, i) => (
                  <div key={i} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: 2 }}>{f.label}</div>
                      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem' }}>{f.desc}</div>
                    </div>
                    <span style={{ padding: '3px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 20, fontSize: '0.65rem', letterSpacing: 1, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>WKRÓTCE</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// LANG PICKER — reusable 3-button component for speech language
// ══════════════════════════════════════════════════════════════════════
function LangPicker({ value, onChange }: { value: SpeechLang; onChange: (l: SpeechLang) => void }) {
  const opts: { v: SpeechLang; label: string; title: string }[] = [
    { v: 'pl-PL', label: '🇵🇱', title: 'Polski' },
    { v: 'en-US', label: '🇺🇸', title: 'English' },
    { v: 'both',  label: '🌐', title: 'Oba języki równocześnie' },
  ]
  return (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
      {opts.map(o => (
        <button key={o.v} title={o.title} onClick={() => onChange(o.v)} style={{
          width: 30, height: 30, borderRadius: 6, cursor: 'pointer',
          background: value === o.v ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${value === o.v ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.1)'}`,
          fontSize: '0.9rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}>{o.label}</button>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// KATEGORIE SECTION
// ══════════════════════════════════════════════════════════════════════
function CategoriesSection({ cats, catsLoading, catName, setCatName, catEmoji, setCatEmoji,
  editing, setEditing, addCat, saveEditCat, removeCat, inp,
  bulkCatId, setBulkCatId, bulkFiles, setBulkFiles, bulkProgress, bulkUploading,
  bulkDone, setBulkDone, bulkError, setBulkError, bulkRef, handleBulkUpload,
}: any) {
  return (
    <div>
      <SectionTitle icon="📂" title="Kategorie" />

      {/* Add form */}
      <div style={{ padding: 16, marginBottom: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 12 }}>NOWA KATEGORIA</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={catEmoji} onChange={e => setCatEmoji(e.target.value)} placeholder="🎯"
            style={{ ...inp, width: 60, textAlign: 'center', fontSize: '1.3rem' }} />
          <input value={catName} onChange={e => setCatName(e.target.value)}
            onKeyDown={(e: any) => e.key === 'Enter' && addCat()}
            placeholder="Nazwa kategorii" style={{ ...inp, flex: 1, minWidth: 160 }} />
          <LangPicker value={catLang} onChange={setCatLang} />
          <button onClick={addCat} disabled={!catName.trim()} style={{
            padding: '8px 20px', borderRadius: 8, flexShrink: 0,
            background: catName.trim() ? 'linear-gradient(135deg, #D4AF37, #FFD700)' : 'rgba(255,255,255,0.08)',
            color: catName.trim() ? '#000' : 'rgba(255,255,255,0.3)',
            border: 'none', cursor: catName.trim() ? 'pointer' : 'default',
            fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.85rem',
          }}>+ Dodaj</button>
        </div>
      </div>

      {/* List */}
      {catsLoading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', padding: 40 }}>Ładowanie…</div>
      ) : cats.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', padding: 48, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12 }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
          Brak kategorii. Dodaj pierwszą powyżej.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 32 }}>
          {cats.map((cat: Category) => (
            <div key={cat.id} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10 }}>
              {editing?.id === cat.id ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={editing.emoji} onChange={(e: any) => setEditing({ ...editing, emoji: e.target.value })}
                    style={{ ...inp, width: 52, textAlign: 'center', fontSize: '1.2rem' }} />
                  <input value={editing.name} onChange={(e: any) => setEditing({ ...editing, name: e.target.value })}
                    style={{ ...inp, flex: 1, minWidth: 140 }} />
                  <LangPicker value={(editing.lang ?? 'pl-PL') as SpeechLang} onChange={l => setEditing({ ...editing, lang: l })} />
                  <button onClick={saveEditCat} style={{ padding: '7px 14px', borderRadius: 6, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', cursor: 'pointer', fontSize: '0.82rem' }}>✓ Zapisz</button>
                  <button onClick={() => setEditing(null)} style={{ padding: '7px 14px', borderRadius: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.82rem' }}>Anuluj</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{cat.emoji}</span>
                  <span style={{ flex: 1, fontSize: '0.95rem', color: '#e0e0e0' }}>{cat.name}</span>
                  <LangPicker value={(cat.lang ?? 'pl-PL') as SpeechLang} onChange={async l => {
                    await supabase.from('categories').update({ lang: l }).eq('id', cat.id)
                    setCats(prev => prev.map(x => x.id === cat.id ? { ...x, lang: l } : x))
                  }} />
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    <Link to={`/admin/categories/${cat.id}/questions`} style={{
                      padding: '5px 12px', borderRadius: 6, background: 'rgba(212,175,55,0.1)',
                      border: '1px solid rgba(212,175,55,0.25)', color: '#D4AF37',
                      textDecoration: 'none', fontSize: '0.78rem', whiteSpace: 'nowrap',
                    }}>📷 Pytania</Link>
                    <button onClick={() => setEditing(cat)} style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.78rem' }}>Edytuj</button>
                    <button onClick={() => removeCat(cat.id)} style={{ padding: '5px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: '0.78rem' }}>Usuń</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', marginTop: 4 }}>
            {cats.length} {cats.length === 1 ? 'kategoria' : cats.length < 5 ? 'kategorie' : 'kategorii'}
          </div>
        </div>
      )}

      {/* ── BULK UPLOAD ── */}
      <SectionTitle icon="📦" title="Masowe dodawanie zdjęć" />
      <div style={{ padding: '12px 16px', marginBottom: 16, background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.18)', borderRadius: 10, fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.75 }}>
        <div style={{ color: '#D4AF37', fontWeight: 600, marginBottom: 4 }}>ℹ️ Jak to działa?</div>
        Zaznacz wiele zdjęć (Ctrl+klik lub Shift+klik). Odpowiedź pobrana z <strong style={{ color: '#fff' }}>nazwy pliku</strong>:<br />
        <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4, color: '#FFD700' }}>golden_retriever.jpg</code> → <strong style={{ color: '#fff' }}>golden retriever</strong>{' '}
        <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 6px', borderRadius: 4, color: '#FFD700' }}>wieża-eiffla.png</code> → <strong style={{ color: '#fff' }}>wieża eiffla</strong>
      </div>

      <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        {/* Category picker */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 8 }}>KATEGORIA DOCELOWA</label>
          <select value={bulkCatId} onChange={(e: any) => setBulkCatId(e.target.value)} className="admin-cat-select"
            style={{ ...inp, cursor: 'pointer' }}>
            <option value="">— Wybierz kategorię —</option>
            {cats.map((c: Category) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </div>

        {/* File picker */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 8 }}>ZDJĘCIA</label>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
            padding: '12px 16px', background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 8,
            color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', transition: 'all 0.2s',
          }}>
            <span style={{ fontSize: '1.3rem' }}>📁</span>
            <span>{bulkFiles.length > 0 ? `${bulkFiles.length} plików wybranych` : 'Kliknij i wybierz wiele zdjęć naraz'}</span>
            <input ref={bulkRef} type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e: any) => { setBulkFiles(Array.from(e.target.files ?? [])); setBulkDone(false); setBulkError(null) }}
              style={{ display: 'none' }} />
          </label>
        </div>

        {/* Preview */}
        {bulkFiles.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 8 }}>
              PODGLĄD ({bulkFiles.length} plików)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {bulkFiles.map((f: File, i: number) => (
                <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: '100%', height: 80, objectFit: 'cover' }} />
                  <div style={{ padding: '4px 6px' }}>
                    <div style={{ color: '#FFD700', fontSize: '0.7rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {filenameToAnswer(f.name)}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.62rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress */}
        {bulkUploading && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)' }}>
              <span>Wysyłanie…</span><span>{bulkProgress}%</span>
            </div>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${bulkProgress}%`, background: 'linear-gradient(90deg, #D4AF37, #FFD700)', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {bulkError && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', fontSize: '0.8rem' }}>
            ❌ {bulkError}
          </div>
        )}

        {bulkDone && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#4ade80', fontSize: '0.8rem' }}>
            ✓ Wszystkie zdjęcia zostały dodane pomyślnie!
          </div>
        )}

        <button onClick={handleBulkUpload} disabled={!bulkCatId || bulkFiles.length === 0 || bulkUploading} style={{
          width: '100%', padding: '10px 20px', borderRadius: 8,
          background: (!bulkCatId || bulkFiles.length === 0 || bulkUploading) ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #D4AF37, #FFD700)',
          color: (!bulkCatId || bulkFiles.length === 0 || bulkUploading) ? 'rgba(255,255,255,0.3)' : '#000',
          border: 'none', cursor: (!bulkCatId || bulkFiles.length === 0 || bulkUploading) ? 'default' : 'pointer',
          fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 3, transition: 'all 0.2s',
        }}>
          {bulkUploading ? `WYSYŁANIE… ${bulkProgress}%` : `📤 WYŚLIJ ${bulkFiles.length > 0 ? bulkFiles.length + ' ZDJĘĆ' : ''}`}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// PLANSZA SECTION — board shape + tile category assignment
// ══════════════════════════════════════════════════════════════════════
function BoardSection({ config, handleUpdate, cats, tileCategories, setTileCategory, resetTileCategories, onFlash }: {
  config: GameConfig
  handleUpdate: (key: keyof GameConfig, value: number) => Promise<void>
  cats: Category[]
  tileCategories: string[]
  setTileCategory: (tileIdx: number, catId: string) => Promise<void>
  resetTileCategories: () => Promise<void>
  onFlash: () => void
}) {
  const preset = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
  const { cols, rows } = preset
  const total = cols * rows

  const [saving, setSaving] = useState<number | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const getCatForTile = (tileIdx: number) => tileCategories[tileIdx] ?? ''

  const handleTileCat = async (tileIdx: number, catId: string) => {
    setSaving(tileIdx)
    await setTileCategory(tileIdx, catId)
    setSaving(null)
    onFlash()
  }

  const handleResetMap = async () => {
    await resetTileCategories()
    setConfirmReset(false)
    onFlash()
  }

  // Count how many tiles have custom assignments
  const customCount = tileCategories.filter(id => id !== '' && id !== undefined).length

  return (
    <div>
      {/* Shape presets */}
      <SectionTitle icon="📐" title="Kształt planszy" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 10, marginBottom: 28 }}>
        {Object.entries(BOARD_PRESETS).map(([val, p]) => (
          <button key={val} onClick={() => handleUpdate('BOARD_SHAPE', Number(val))} style={{
            padding: '14px 16px',
            background: config.BOARD_SHAPE === Number(val) ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${config.BOARD_SHAPE === Number(val) ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
          }}>
            <div style={{ color: config.BOARD_SHAPE === Number(val) ? '#D4AF37' : '#fff', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>{p.label}</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', marginBottom: 8 }}>{p.cols} × {p.rows} = {p.cols * p.rows} pól</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, width: p.cols * 10 }}>
              {Array.from({ length: p.cols * p.rows }).map((_, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: 1, background: i % p.cols < p.cols / 2 ? 'rgba(212,175,55,0.6)' : 'rgba(192,192,192,0.4)' }} />
              ))}
            </div>
          </button>
        ))}
      </div>

      {/* Random toggle */}
      <SectionTitle icon="🔀" title="Rozmieszczenie kategorii" />
      <ToggleField label="Losowe rozmieszczenie pól" desc="Kategorie przypisywane losowo przy każdej nowej grze (nadpisuje ręczne przypisania)"
        value={config.RANDOM_TILES === 1} onChange={v => handleUpdate('RANDOM_TILES', v ? 1 : 0)} />

      {/* Tile category assignment */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.1rem' }}>🗂️</span>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: 4, color: 'rgba(255,255,255,0.7)' }}>Przypisanie kategorii do kafelków</span>
          </div>
          {customCount > 0 && (
            <span style={{ padding: '3px 10px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 20, color: '#D4AF37', fontSize: '0.72rem' }}>
              {customCount}/{total} przypisanych
            </span>
          )}
        </div>

        {cats.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 10 }}>
            Najpierw dodaj kategorie w sekcji "Kategorie"
          </div>
        ) : (
          <>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', marginBottom: 16, lineHeight: 1.6 }}>
              Kliknij pole i wybierz kategorię z listy. Zmiany są zapisywane natychmiastowo. Tryb "Losowe rozmieszczenie" nadpisuje te ustawienia.
            </div>

            {/* Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 6, marginBottom: 16,
            }}>
              {Array.from({ length: total }).map((_, tileIdx) => {
                const x = tileIdx % cols
                const isGold = x < cols / 2
                const catId = getCatForTile(tileIdx)
                const cat = cats.find(c => c.id === catId)
                const isSaving = saving === tileIdx

                return (
                  <div key={tileIdx} style={{
                    position: 'relative',
                    background: isGold ? 'rgba(212,175,55,0.08)' : 'rgba(192,192,192,0.05)',
                    border: `1px solid ${catId ? (isGold ? 'rgba(212,175,55,0.35)' : 'rgba(192,192,192,0.3)') : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 8, padding: '8px 6px',
                    transition: 'all 0.2s',
                  }}>
                    {/* Tile number */}
                    <div style={{ position: 'absolute', top: 4, right: 6, color: 'rgba(255,255,255,0.15)', fontSize: '0.6rem' }}>
                      {tileIdx + 1}
                    </div>

                    {/* Emoji */}
                    <div style={{ textAlign: 'center', fontSize: '1.1rem', marginBottom: 4, lineHeight: 1 }}>
                      {cat ? cat.emoji : (isGold ? '🥇' : '🥈')}
                    </div>

                    {/* Category name */}
                    <div style={{
                      textAlign: 'center', fontSize: '0.62rem',
                      color: cat ? (isGold ? '#D4AF37' : '#C0C0C0') : 'rgba(255,255,255,0.2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginBottom: 6, lineHeight: 1.2,
                    }}>
                      {cat ? cat.name : 'domyślna'}
                    </div>

                    {/* Select */}
                    <select
                      value={catId}
                      onChange={e => handleTileCat(tileIdx, e.target.value)}
                      disabled={isSaving}
                      className="admin-cat-select"
                      style={{
                        width: '100%', background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
                        color: catId ? '#fff' : 'rgba(255,255,255,0.3)',
                        fontSize: '0.62rem', padding: '3px 4px',
                        cursor: 'pointer', outline: 'none', appearance: 'none',
                      }}
                    >
                      <option value="">— domyślna —</option>
                      {cats.map(c => (
                        <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                      ))}
                    </select>

                    {isSaving && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', borderRadius: 8, fontSize: '0.7rem', color: '#D4AF37' }}>
                        ⏳
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Reset tile assignments */}
            {customCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {!confirmReset ? (
                  <button onClick={() => setConfirmReset(true)} style={{
                    padding: '7px 16px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
                    color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: '0.8rem',
                  }}>🗑 Wyczyść przypisania</button>
                ) : (
                  <>
                    <span style={{ color: '#f87171', fontSize: '0.8rem' }}>Na pewno wyczyścić?</span>
                    <button onClick={handleResetMap} style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' }}>Tak</button>
                    <button onClick={() => setConfirmReset(false)} style={{ padding: '7px 14px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.8rem' }}>Anuluj</button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// SHARED UI ATOMS
// ══════════════════════════════════════════════════════════════════════
function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <span style={{ fontSize: '1.1rem' }}>{icon}</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: 4, color: 'rgba(255,255,255,0.7)' }}>{title}</span>
    </div>
  )
}

function NumberField({ label, desc, value, min, max, unit, onChange }: {
  label: string; desc: string; value: number; min: number; max: number; unit: string
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, gap: 12, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 140 }}>
        <div style={{ color: '#C0C0C0', fontSize: '0.88rem', marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem' }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={() => onChange(Math.max(min, value - 1))} style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>−</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" value={value} min={min} max={max} onChange={e => onChange(Number(e.target.value))}
            style={{ width: 68, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 8, padding: '6px 8px', color: '#FFD700', fontFamily: 'monospace', fontSize: '1rem', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
          {unit && <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>{unit}</span>}
        </div>
        <button onClick={() => onChange(Math.min(max, value + 1))} style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>+</button>
      </div>
    </div>
  )
}

function ToggleField({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, marginBottom: 8, cursor: 'pointer', gap: 12 }}
      onClick={() => onChange(!value)}>
      <div>
        <div style={{ color: '#C0C0C0', fontSize: '0.88rem', marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem' }}>{desc}</div>
      </div>
      <div style={{ width: 44, height: 24, borderRadius: 12, background: value ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)', border: `1px solid ${value ? 'rgba(212,175,55,0.6)' : 'rgba(255,255,255,0.15)'}`, position: 'relative', transition: 'all 0.25s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 16, height: 16, borderRadius: '50%', background: value ? '#D4AF37' : 'rgba(255,255,255,0.4)', transition: 'all 0.25s' }} />
      </div>
    </div>
  )
}
