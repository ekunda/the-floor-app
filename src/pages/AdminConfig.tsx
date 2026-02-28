// ─────────────────────────────────────────────────────────────────────────────
// AdminConfig.tsx — Panel konfiguracji
//
// NOWE OPCJE w sekcji "Wyświetlanie i dźwięk":
//   - Osobny suwak MUSIC_VOLUME (muzyka tła)
//   - Osobny suwak SFX_VOLUME (efekty dźwiękowe)
//   - Podgląd w czasie rzeczywistym (SoundEngine.setMusicVolume/setSfxVolume)
//
// NOWE OPCJE w sekcji "Rozgrywka":
//   - VOICE_PASS toggle (włącz/wyłącz głosowy "pas")
//   - MAX_PASSES (0=bez limitu, N=forfeit)
//   - SHOW_ANSWER_HINT (wskazówka pierwszej litery)
//
// NAPRAWIONE:
//   - Nazwy graczy zapisywane do Supabase (updatePlayer jest teraz async)
//   - Wskaźnik zapisu przy nazwie gracza
//
// SEKCJA "PRZYSZŁE FUNKCJE" — zaplanowane możliwości z opisami i etykietami statusu
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { clearSession, formatRemaining, sessionRemainingMs, supabase } from '../lib/supabase'
import { BOARD_PRESETS, DEFAULTS, useConfigStore } from '../store/useConfigStore'
import { useGameStore } from '../store/useGameStore'
import { Category, GameConfig, SpeechLang } from '../types'

type Section = 'categories' | 'board' | 'gameplay' | 'players' | 'display' | 'advanced' | 'future'

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'categories', label: 'Kategorie',    icon: '📂' },
  { id: 'board',      label: 'Plansza',      icon: '🎯' },
  { id: 'gameplay',   label: 'Rozgrywka',    icon: '⚔️'  },
  { id: 'players',    label: 'Gracze',       icon: '👥' },
  { id: 'display',    label: 'Dźwięk',       icon: '🔊' },
  { id: 'advanced',   label: 'Zaawansowane', icon: '⚙️'  },
  { id: 'future',     label: 'Przyszłe',     icon: '🚀' },
]

const GAMEPLAY_FIELDS: {
  key: keyof GameConfig; label: string; desc: string; min: number; max: number; unit: string
}[] = [
  { key: 'DUEL_TIME',    label: 'Czas gracza',    desc: 'Sekundy na odpowiedź per gracz',   min: 10,   max: 120,   unit: 's'  },
  { key: 'PASS_PENALTY', label: 'Kara za pas',    desc: 'Sekundy odejmowane przy pasie',     min: 0,    max: 30,    unit: 's'  },
  { key: 'MAX_PASSES',   label: 'Limit pasów',    desc: '0 = bez limitu; forfeit po N pasach', min: 0,  max: 20,    unit: ''   },
  { key: 'FEEDBACK_MS',  label: 'Czas feedbacku', desc: 'Wyświetlanie odpowiedzi (ms)',       min: 300,  max: 5000,  unit: 'ms' },
  { key: 'WIN_CLOSE_MS', label: 'Popup wygranej', desc: 'Auto-zamknięcie wyniku (ms)',        min: 1000, max: 10000, unit: 'ms' },
  { key: 'TOAST_MS',     label: 'Czas toastu',    desc: 'Wyświetlanie powiadomień (ms)',      min: 500,  max: 5000,  unit: 'ms' },
]

function filenameToAnswer(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ══════════════════════════════════════════════════════════════════════════════
// Styles
// ══════════════════════════════════════════════════════════════════════════════
const inp: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s',
}

// ══════════════════════════════════════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminConfig() {
  const navigate = useNavigate()
  const {
    config, fetch, update, players, updatePlayer, resetAll,
    tileCategories, setTileCategory, resetTileCategories,
  } = useConfigStore()
  const gameCategories = useGameStore(s => s.categories)

  const [section, setSection]           = useState<Section>('categories')
  const [saved, setSaved]               = useState(false)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting]       = useState(false)
  const [sessionLeft, setSessionLeft]   = useState(sessionRemainingMs())

  const [cats, setCats]               = useState<Category[]>([])
  const [catName, setCatName]         = useState('')
  const [catEmoji, setCatEmoji]       = useState('🎯')
  const [catLang, setCatLang]         = useState<SpeechLang>('pl-PL')
  const [editing, setEditing]         = useState<Category | null>(null)
  const [catsLoading, setCatsLoading] = useState(false)

  const [bulkCatId, setBulkCatId]           = useState('')
  const [bulkFiles, setBulkFiles]           = useState<File[]>([])
  const [bulkProgress, setBulkProgress]     = useState(0)
  const [bulkUploading, setBulkUploading]   = useState(false)
  const [bulkDone, setBulkDone]             = useState(false)
  const [bulkError, setBulkError]           = useState<string | null>(null)
  const bulkRef = useRef<HTMLInputElement>(null)

  // Player save indicator
  const [playerSaving, setPlayerSaving] = useState<Record<number, boolean>>({})

  const totalTiles = (() => {
    const preset = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
    return preset.cols * preset.rows
  })()

  useEffect(() => { SoundEngine.stopBg(0) }, [])
  useEffect(() => { fetch() }, [])
  useEffect(() => { loadCats() }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      const rem = sessionRemainingMs()
      setSessionLeft(rem)
      if (rem <= 0) handleLogout()
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  const handleLogout = () => { clearSession(); navigate('/admin') }
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1200) }

  const handleUpdate = async (key: keyof GameConfig, value: number) => {
    await update(key, value)
    flash()
  }

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
    await supabase.from('categories').update({
      name: editing.name, emoji: editing.emoji, lang: editing.lang ?? 'pl-PL',
    }).eq('id', editing.id)
    setEditing(null); loadCats()
  }

  const removeCat = async (id: string) => {
    if (!confirm('Usunąć kategorię i wszystkie pytania?')) return
    await supabase.from('questions').delete().eq('category_id', id)
    await supabase.from('categories').delete().eq('id', id)
    loadCats()
  }

  // ── Bulk upload ────────────────────────────────────────────────────────────
  const handleBulkUpload = async () => {
    if (!bulkCatId || bulkFiles.length === 0) return
    setBulkUploading(true); setBulkDone(false); setBulkError(null); setBulkProgress(0)
    let errors = 0
    for (let i = 0; i < bulkFiles.length; i++) {
      const f   = bulkFiles[i]
      const ext = f.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${bulkCatId}/bulk-${crypto.randomUUID()}.${ext}`
      const ct  = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      const { error: upErr } = await supabase.storage.from('question-images').upload(path, f, { contentType: ct })
      if (upErr) { errors++; continue }
      const answer = filenameToAnswer(f.name)
      await supabase.from('questions').insert({ category_id: bulkCatId, image_path: path, answer, synonyms: [] })
      setBulkProgress(Math.round(((i + 1) / bulkFiles.length) * 100))
    }
    setBulkUploading(false)
    if (errors > 0) setBulkError(`${errors} plików nie udało się wysłać.`)
    else setBulkDone(true)
    setBulkFiles([])
    if (bulkRef.current) bulkRef.current.value = ''
  }

  // ── Player name update (async) ─────────────────────────────────────────────
  const handlePlayerUpdate = async (idx: 0 | 1, field: 'name' | 'color', value: string) => {
    setPlayerSaving(s => ({ ...s, [idx]: true }))
    await updatePlayer(idx, field, value)
    setPlayerSaving(s => ({ ...s, [idx]: false }))
    flash()
  }

  const handleReset = async () => {
    setResetting(true)
    await resetAll()
    setResetting(false); setConfirmReset(false); flash()
  }

  // ── Sidebar item ───────────────────────────────────────────────────────────
  const SidebarItem = ({ id, label, icon }: { id: Section; label: string; icon: string }) => (
    <button
      onClick={() => { setSection(id); setSidebarOpen(false) }}
      style={{
        width: '100%', padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        background: section === id ? 'rgba(212,175,55,0.15)' : 'transparent',
        border: `1px solid ${section === id ? 'rgba(212,175,55,0.4)' : 'transparent'}`,
        color: section === id ? '#D4AF37' : 'rgba(255,255,255,0.5)',
        fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.95rem', letterSpacing: 2,
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => { if (section !== id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
      onMouseLeave={e => { if (section !== id) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ fontSize: '1rem', width: 20, textAlign: 'center' }}>{icon}</span>
      {label}
    </button>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* ── Topbar ── */}
      <div style={{
        height: 52, borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', background: '#0d0d0d', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSidebarOpen(s => !s)} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer', fontSize: '1.2rem', padding: 4,
          }}>☰</button>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: 4, color: '#D4AF37' }}>
            THE FLOOR · ADMIN
          </span>
          {saved && (
            <span style={{ color: '#4ade80', fontSize: '0.75rem', letterSpacing: 1, animation: 'fadeIn 0.2s' }}>
              ✓ Zapisano
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem' }}>
            {formatRemaining(sessionLeft)}
          </span>
          <Link to="/" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}>
            ← Gra
          </Link>
          <button onClick={handleLogout} style={{
            background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
            color: 'rgba(239,68,68,0.7)', fontSize: '0.8rem', cursor: 'pointer', padding: '6px 12px',
          }}>Wyloguj</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <div style={{
          width: sidebarOpen ? 220 : 0, overflow: 'hidden', transition: 'width 0.25s ease',
          borderRight: '1px solid rgba(255,255,255,0.06)', background: '#0d0d0d',
          display: 'flex', flexDirection: 'column', gap: 4, padding: sidebarOpen ? '16px 12px' : 0,
          flexShrink: 0,
        }}>
          {SECTIONS.map(s => <SidebarItem key={s.id} {...s} />)}
        </div>

        {/* ── Tabs (always visible) ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            display: 'flex', gap: 2, padding: '8px 12px', flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto',
            scrollbarWidth: 'none',
          }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)} style={{
                padding: '7px 14px', borderRadius: 7, cursor: 'pointer', flexShrink: 0,
                background: section === s.id ? 'rgba(212,175,55,0.12)' : 'transparent',
                border: `1px solid ${section === s.id ? 'rgba(212,175,55,0.4)' : 'transparent'}`,
                color: section === s.id ? '#D4AF37' : 'rgba(255,255,255,0.4)',
                fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.85rem', letterSpacing: 2,
                transition: 'all 0.15s',
              }}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>

          {/* ── Content ── */}
          <main style={{ flex: 1, overflow: 'auto', padding: '20px 16px' }}>
            <div style={{ maxWidth: section === 'categories' ? '100%' : 680, margin: '0 auto' }}>

              {/* ══ KATEGORIE ══ */}
              {section === 'categories' && (
                <CategoriesSection
                  cats={cats} catName={catName} setCatName={setCatName}
                  catEmoji={catEmoji} setCatEmoji={setCatEmoji}
                  catLang={catLang} setCatLang={setCatLang}
                  editing={editing} setEditing={setEditing}
                  catsLoading={catsLoading}
                  addCat={addCat} saveEditCat={saveEditCat} removeCat={removeCat}
                  bulkCatId={bulkCatId} setBulkCatId={setBulkCatId}
                  bulkFiles={bulkFiles} setBulkFiles={setBulkFiles}
                  bulkProgress={bulkProgress} bulkUploading={bulkUploading}
                  bulkDone={bulkDone} bulkError={bulkError}
                  bulkRef={bulkRef} handleBulkUpload={handleBulkUpload}
                />
              )}

              {/* ══ PLANSZA ══ */}
              {section === 'board' && (
                <BoardSection
                  config={config} handleUpdate={handleUpdate}
                  cats={cats} tileCategories={tileCategories}
                  setTileCategory={(idx, catId) => setTileCategory(idx, catId, totalTiles)}
                  resetTileCategories={resetTileCategories}
                  onFlash={flash}
                />
              )}

              {/* ══ ROZGRYWKA ══ */}
              {section === 'gameplay' && (
                <div>
                  <SectionTitle icon="⚔️" title="Ustawienia pojedynku" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
                    {GAMEPLAY_FIELDS.map(f => (
                      <NumberField key={f.key} label={f.label} desc={f.desc}
                        value={config[f.key] as number} min={f.min} max={f.max} unit={f.unit}
                        onChange={v => handleUpdate(f.key, v)} />
                    ))}
                  </div>

                  <SectionTitle icon="🎤" title="Rozpoznawanie mowy" />

                  {/* VOICE_PASS toggle */}
                  <ToggleField
                    label='Wykrywanie słowa "PAS" głosem'
                    desc='Gdy włączone: powiedzenie "pas" przez mikrofon powoduje pasowanie. Wyłącz jeśli rozpoznawanie przypadkowo rejestruje "pas" podczas normalnej mowy. Mikrofon do odpowiedzi działa niezależnie od tej opcji.'
                    value={config.VOICE_PASS !== 0}
                    onChange={v => handleUpdate('VOICE_PASS', v ? 1 : 0)}
                  />

                  <div style={{ marginTop: 12, padding: '12px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', lineHeight: 1.7 }}>
                      💡 <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Mikrofon i pas to dwie osobne funkcje:</strong><br />
                      • <strong>Mikrofon</strong> — wykrywa odpowiedzi głosowe. Działa zawsze, niezależnie od tej opcji.<br />
                      • <strong>Głosowy PAS</strong> — ta opcja. Wykrywa tylko słowo "pas/pass/dalej" z <strong>finalnych</strong> wyników (nie cząstkowych), co eliminuje podwójne pasowanie.<br />
                      Wyłącz gdy zawodnicy przypadkowo mówią "pas" lub podobne słowa podczas odpowiedzi. Klawisz <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>P</kbd> zawsze działa.
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <ToggleField
                      label="Wskazówka pierwszej litery"
                      desc="Po 10 sekundach braku odpowiedzi pokaż pierwszą literę odpowiedzi"
                      value={config.SHOW_ANSWER_HINT === 1}
                      onChange={v => handleUpdate('SHOW_ANSWER_HINT', v ? 1 : 0)}
                    />
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <ToggleField
                      label="Losowe rozmieszczenie kategorii"
                      desc="Tasuj kategorie losowo przy każdej nowej grze"
                      value={config.RANDOM_TILES === 1}
                      onChange={v => handleUpdate('RANDOM_TILES', v ? 1 : 0)}
                    />
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 4, color: players[idx].color }}>
                          GRACZ {idx + 1}
                        </span>
                        {playerSaving[idx] && (
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.72rem', letterSpacing: 1 }}>
                            zapisywanie…
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 6 }}>NAZWA</label>
                          <input
                            value={players[idx].name}
                            onChange={e => updatePlayer(idx, 'name', e.target.value.toUpperCase())}
                            onBlur={e => handlePlayerUpdate(idx, 'name', e.target.value.toUpperCase())}
                            style={inp} maxLength={16}
                            placeholder={`GRACZ ${idx + 1}`}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: 1, marginBottom: 6 }}>KOLOR</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <input type="color" value={players[idx].color}
                              onChange={e => updatePlayer(idx, 'color', e.target.value)}
                              onBlur={e => handlePlayerUpdate(idx, 'color', e.target.value)}
                              style={{ width: 44, height: 38, padding: 2, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, cursor: 'pointer' }} />
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{players[idx].color}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.75rem', lineHeight: 1.6 }}>
                    💡 Nazwy i kolory zapisywane w Supabase (synchronizacja między urządzeniami) oraz lokalnie jako cache.<br />
                    Zmiany są zapisywane po kliknięciu poza pole lub naciśnięciu Tab.
                  </div>
                </div>
              )}

              {/* ══ DŹWIĘK ══ */}
              {section === 'display' && (
                <div>
                  <SectionTitle icon="🔊" title="Dźwięk" />

                  {/* Muzyka tła */}
                  <div style={{ marginBottom: 20 }}>
                    <VolumeSlider
                      label="Muzyka tła"
                      desc="Głośność muzyki w tle podczas gry i w menu"
                      icon="🎵"
                      value={config.MUSIC_VOLUME ?? DEFAULTS.MUSIC_VOLUME}
                      onChange={v => {
                        update('MUSIC_VOLUME', v)
                        SoundEngine.setMusicVolume(v)
                      }}
                      color="#D4AF37"
                    />
                  </div>

                  {/* Efekty SFX */}
                  <div style={{ marginBottom: 28 }}>
                    <VolumeSlider
                      label="Efekty dźwiękowe"
                      desc="Głośność: beepy timera, poprawna odpowiedź, buzzer pasa, oklaski"
                      icon="🔔"
                      value={config.SFX_VOLUME ?? DEFAULTS.SFX_VOLUME}
                      onChange={v => {
                        update('SFX_VOLUME', v)
                        SoundEngine.setSfxVolume(v)
                      }}
                      color="#818cf8"
                    />
                  </div>

                  {/* Test dźwięku */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
                    {[
                      { label: '🔔 Beep 3', fn: () => SoundEngine.timerBeep(3) },
                      { label: '🔔 Beep 2', fn: () => SoundEngine.timerBeep(2) },
                      { label: '🔔 Beep 1', fn: () => SoundEngine.timerBeep(1) },
                      { label: '✅ Correct', fn: () => SoundEngine.play('correct') },
                      { label: '⏱ Buzzer',  fn: () => SoundEngine.play('buzzer')  },
                      { label: '👏 Oklaski', fn: () => SoundEngine.play('applause') },
                    ].map(({ label, fn }) => (
                      <button key={label} onClick={fn} style={{
                        padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: 'rgba(255,255,255,0.6)', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      >{label}</button>
                    ))}
                  </div>

                  <SectionTitle icon="🖥️" title="Wyświetlanie" />
                  <ToggleField label="Statystyki widoczne domyślnie"
                    desc="Pasek posiadania planszy widoczny od startu gry"
                    value={config.SHOW_STATS === 1}
                    onChange={v => handleUpdate('SHOW_STATS', v ? 1 : 0)} />
                </div>
              )}

              {/* ══ ZAAWANSOWANE ══ */}
              {section === 'advanced' && (
                <div>
                  <SectionTitle icon="⚙️" title="Wymiary planszy (ręczne)" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    <NumberField label="Kolumny" desc="Nadpisuje preset kształtu" value={config.GRID_COLS} min={2} max={10} unit="" onChange={v => handleUpdate('GRID_COLS', v)} />
                    <NumberField label="Wiersze" desc="Nadpisuje preset kształtu" value={config.GRID_ROWS} min={2} max={8}  unit="" onChange={v => handleUpdate('GRID_ROWS', v)} />
                  </div>
                  <div style={{ padding: '10px 16px', marginBottom: 28, background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 10, color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                    ⚠️ Ręczne wymiary są nadpisywane przez preset z sekcji "Plansza".
                  </div>

                  <SectionTitle icon="🔄" title="Resetuj ustawienia" />
                  <div style={{ padding: 20, background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, marginBottom: 28 }}>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', marginBottom: 8 }}>
                      Przywróci wszystkie ustawienia gry do wartości domyślnych.
                    </div>
                    {!confirmReset ? (
                      <button onClick={() => setConfirmReset(true)} style={{
                        padding: '10px 24px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)',
                        background: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem',
                      }}>Reset do domyślnych</button>
                    ) : (
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>Na pewno?</span>
                        <button onClick={handleReset} disabled={resetting} style={{
                          padding: '8px 20px', borderRadius: 8, border: 'none',
                          background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: '0.85rem',
                        }}>{resetting ? 'Resetuję…' : '✓ Tak, resetuj'}</button>
                        <button onClick={() => setConfirmReset(false)} style={{
                          padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                          background: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem',
                        }}>Anuluj</button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══ PRZYSZŁE FUNKCJE ══ */}
              {section === 'future' && <FutureSection />}

            </div>
          </main>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      `}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// VOLUME SLIDER — dedykowany komponent z podglądem wizualnym
// ══════════════════════════════════════════════════════════════════════════════
function VolumeSlider({ label, desc, icon, value, onChange, color }: {
  label: string; desc: string; icon: string
  value: number; onChange: (v: number) => void; color: string
}) {
  return (
    <div style={{ padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9rem', fontWeight: 600, marginBottom: 2 }}>
            {icon} {label}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>{desc}</div>
        </div>
        <div style={{
          minWidth: 48, textAlign: 'center', fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '1.4rem', letterSpacing: 2, color,
        }}>{value}%</div>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', cursor: 'pointer', accentColor: color }}
      />
      <div style={{ marginTop: 6, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: 4, transition: 'width 0.1s' }} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FUTURE SECTION — zaplanowane funkcje z roadmapą
// ══════════════════════════════════════════════════════════════════════════════
const FUTURE_FEATURES: {
  icon: string; label: string; desc: string
  status: 'planned' | 'in-progress' | 'ready'
  category: string
}[] = [
  { icon: '🌐', label: 'Multiplayer online',   desc: 'Gra przez sieć w czasie rzeczywistym — Supabase Realtime lub WebSocket',      status: 'planned',     category: 'Sieć'         },
  { icon: '📊', label: 'Historia gier',         desc: 'Zapisywanie wyników rund, statystyki wygranych, tabela liderów',               status: 'planned',     category: 'Statystyki'   },
  { icon: '🏆', label: 'Tabela liderów',         desc: 'Ranking graczy z sumarycznymi wynikami sesji',                               status: 'planned',     category: 'Statystyki'   },
  { icon: '🎨', label: 'Motywy wizualne',        desc: 'Ciemny / jasny / niestandardowy motyw planszy',                              status: 'planned',     category: 'UI'           },
  { icon: '⏱️', label: 'Tryb rund',             desc: 'Gra na określoną liczbę rund (ROUND_TIMER + MAX_ROUNDS już w konfiguracji)',   status: 'in-progress', category: 'Rozgrywka'    },
  { icon: '⚡', label: 'Power-upy',              desc: 'Specjalne umiejętności: dodatkowy czas, podgląd odpowiedzi, blokada pola',    status: 'planned',     category: 'Rozgrywka'    },
  { icon: '🤖', label: 'Tryb solo (AI)',         desc: 'Gracz vs komputer z regulowanym poziomem trudności',                         status: 'planned',     category: 'Rozgrywka'    },
  { icon: '📱', label: 'Aplikacja mobilna',      desc: 'PWA z pełną funkcjonalnością offline',                                       status: 'planned',     category: 'Platforma'    },
  { icon: '🖨️', label: 'Eksport pytań',         desc: 'Eksport kategorii i pytań do CSV/PDF',                                       status: 'planned',     category: 'Narzędzia'    },
  { icon: '🔑', label: 'Kody dostępu',           desc: 'Jednorazowe kody dla graczy zamiast hasła admina',                           status: 'planned',     category: 'Bezpieczeństwo'},
  { icon: '🎤', label: 'Lepsze rozpoznawanie',   desc: 'Whisper API / modele lokalne dla większej dokładności',                      status: 'planned',     category: 'AI'           },
  { icon: '🖼️', label: 'Generator obrazków AI', desc: 'Automatyczne pytania z obrazkami generowanymi przez AI',                     status: 'planned',     category: 'AI'           },
]

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  'planned':     { label: 'PLANOWANE',    color: 'rgba(255,255,255,0.3)',  bg: 'rgba(255,255,255,0.05)'  },
  'in-progress': { label: 'W TRAKCIE',    color: 'rgba(251,191,36,0.8)',   bg: 'rgba(251,191,36,0.08)'   },
  'ready':       { label: 'GOTOWE',       color: 'rgba(74,222,128,0.8)',   bg: 'rgba(74,222,128,0.08)'   },
}

function FutureSection() {
  const categories = [...new Set(FUTURE_FEATURES.map(f => f.category))]

  return (
    <div>
      <SectionTitle icon="🚀" title="Przyszłe funkcje" />
      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', lineHeight: 1.7, marginBottom: 24, padding: '12px 16px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10 }}>
        📋 Roadmapa projektu. Funkcje oznaczone "W TRAKCIE" mają już przygotowaną infrastrukturę w kodzie
        (typy, flagi, szkielety — patrz <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4 }}>types.ts: FeatureFlags</code>).
      </div>

      {categories.map(cat => (
        <div key={cat} style={{ marginBottom: 24 }}>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4 }}>
            {cat}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FUTURE_FEATURES.filter(f => f.category === cat).map((f, i) => {
              const st = STATUS_LABELS[f.status]
              return (
                <div key={i} style={{
                  padding: '12px 16px', background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ fontSize: '1.2rem', flexShrink: 0, lineHeight: 1.3 }}>{f.icon}</span>
                    <div>
                      <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.85rem', fontWeight: 600, marginBottom: 2 }}>{f.label}</div>
                      <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', lineHeight: 1.5 }}>{f.desc}</div>
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, flexShrink: 0,
                    background: st.bg, border: `1px solid ${st.color}30`,
                    fontSize: '0.62rem', letterSpacing: 1, color: st.color,
                  }}>{st.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// REUSABLE UI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
      paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      <span style={{ fontSize: '1rem' }}>{icon}</span>
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: 4, color: 'rgba(255,255,255,0.6)' }}>
        {title}
      </span>
    </div>
  )
}

function ToggleField({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      padding: '12px 16px', background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, marginBottom: 8,
    }}>
      <div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', lineHeight: 1.5 }}>{desc}</div>
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative', cursor: 'pointer',
        background: value ? 'rgba(212,175,55,0.4)' : 'rgba(255,255,255,0.1)',
        border: `1px solid ${value ? 'rgba(212,175,55,0.6)' : 'rgba(255,255,255,0.15)'}`,
        transition: 'all 0.25s',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 22 : 3, width: 16, height: 16,
          borderRadius: '50%', transition: 'all 0.25s',
          background: value ? '#D4AF37' : 'rgba(255,255,255,0.4)',
        }} />
      </button>
    </div>
  )
}

function NumberField({ label, desc, value, min, max, unit, onChange }: {
  label: string; desc: string; value: number; min: number; max: number; unit: string
  onChange: (v: number) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      padding: '10px 16px', background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10,
    }}>
      <div>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button onClick={() => onChange(Math.max(min, value - (unit === 'ms' ? 100 : 1)))} style={spinBtn}>−</button>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: 2, color: '#D4AF37', minWidth: 48, textAlign: 'center' }}>
          {value}{unit}
        </span>
        <button onClick={() => onChange(Math.min(max, value + (unit === 'ms' ? 100 : 1)))} style={spinBtn}>+</button>
      </div>
    </div>
  )
}

const spinBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 6, cursor: 'pointer', fontSize: '1rem',
  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}

function LangPicker({ value, onChange }: { value: SpeechLang; onChange: (l: SpeechLang) => void }) {
  const opts: { v: SpeechLang; label: string; title: string }[] = [
    { v: 'pl-PL', label: '🇵🇱', title: 'Polski' },
    { v: 'en-US', label: '🇺🇸', title: 'English' },
    { v: 'both',  label: '🌐', title: 'Oba języki' },
  ]
  return (
    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
      {opts.map(o => (
        <button key={o.v} title={o.title} onClick={() => onChange(o.v)} style={{
          width: 30, height: 30, borderRadius: 6, cursor: 'pointer',
          background: value === o.v ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${value === o.v ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.12)'}`,
          fontSize: '0.85rem',
        }}>{o.label}</button>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CATEGORIES SECTION
// ══════════════════════════════════════════════════════════════════════════════
function CategoriesSection({
  cats, catName, setCatName, catEmoji, setCatEmoji, catLang, setCatLang,
  editing, setEditing, catsLoading, addCat, saveEditCat, removeCat,
  bulkCatId, setBulkCatId, bulkFiles, setBulkFiles, bulkProgress, bulkUploading,
  bulkDone, bulkError, bulkRef, handleBulkUpload,
}: {
  cats: Category[]; catName: string; setCatName: (v: string) => void
  catEmoji: string; setCatEmoji: (v: string) => void
  catLang: SpeechLang; setCatLang: (v: SpeechLang) => void
  editing: Category | null; setEditing: (c: Category | null) => void
  catsLoading: boolean; addCat: () => void; saveEditCat: () => void; removeCat: (id: string) => void
  bulkCatId: string; setBulkCatId: (v: string) => void
  bulkFiles: File[]; setBulkFiles: (f: File[]) => void
  bulkProgress: number; bulkUploading: boolean; bulkDone: boolean; bulkError: string | null
  bulkRef: React.RefObject<HTMLInputElement>; handleBulkUpload: () => void
}) {
  const [search,  setSearch]  = useState('')
  const [langFlt, setLangFlt] = useState<'all' | 'pl-PL' | 'en-US' | 'both'>('all')
  const [sortCat, setSortCat] = useState<'az' | 'za' | 'newest'>('newest')
  const [page,    setPage]    = useState(1)
  const PAGE_SIZE = 10

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [search, langFlt, sortCat])

  const filtered = useMemo(() => {
    let r = [...cats]
    if (search.trim()) r = r.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    if (langFlt !== 'all') r = r.filter(c => (c.lang ?? 'pl-PL') === langFlt)
    if (sortCat === 'az') r.sort((a, b) => a.name.localeCompare(b.name, 'pl'))
    else if (sortCat === 'za') r.sort((a, b) => b.name.localeCompare(a.name, 'pl'))
    // newest = default order from Supabase (created_at desc)
    return r
  }, [cats, search, langFlt, sortCat])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const highlight = (text: string) => {
    if (!search.trim()) return <>{text}</>
    const idx = text.toLowerCase().indexOf(search.toLowerCase())
    if (idx === -1) return <>{text}</>
    return <>{text.slice(0, idx)}<mark style={{ background: 'rgba(212,175,55,0.3)', color: '#fff', borderRadius: 2, padding: '0 1px' }}>{text.slice(idx, idx + search.length)}</mark>{text.slice(idx + search.length)}</>
  }

  return (
    <div>
      <SectionTitle icon="📂" title="Kategorie" />

      {/* ── Dwukolumnowy layout: lewa = kategorie, prawa = bulk upload ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(260px, 320px)', gap: 24, alignItems: 'start' }}>
      <div>{/* LEWA KOLUMNA */}

      {/* Dodaj kategorię */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={catName} onChange={e => setCatName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCat()}
          placeholder="Nazwa kategorii" style={{ ...inp, flex: 1, minWidth: 140 }} />
        <input value={catEmoji} onChange={e => setCatEmoji(e.target.value)}
          placeholder="🎯" style={{ ...inp, width: 58, textAlign: 'center', fontSize: '1.3rem', padding: '8px 4px' }} maxLength={2} />
        <LangPicker value={catLang} onChange={setCatLang} />
        <button onClick={addCat} style={{
          padding: '0 20px', borderRadius: 8, cursor: 'pointer', height: 42,
          background: 'linear-gradient(135deg, #D4AF37, #FFD700)', color: '#000',
          border: 'none', fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.9rem', letterSpacing: 2,
        }}>DODAJ</button>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {/* Szukaj */}
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', fontSize: '0.85rem' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj kategorii…"
            style={{ ...inp, paddingLeft: 32, paddingRight: search ? 32 : 12, fontSize: '0.85rem', padding: '8px 32px' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.9rem' }}>✕</button>
          )}
        </div>
        {/* Filtr języka */}
        {(['all','pl-PL','en-US','both'] as const).map(l => (
          <button key={l} onClick={() => setLangFlt(l)} style={{
            padding: '6px 11px', borderRadius: 20, cursor: 'pointer', fontSize: '0.72rem', whiteSpace: 'nowrap',
            background: langFlt === l ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${langFlt === l ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
            color: langFlt === l ? '#818cf8' : 'rgba(255,255,255,0.4)',
          }}>{l === 'all' ? 'Wszystkie' : l === 'both' ? '🌐 Oba' : l === 'pl-PL' ? '🇵🇱 PL' : '🇺🇸 EN'}</button>
        ))}
        {/* Sortowanie */}
        <select value={sortCat} onChange={e => setSortCat(e.target.value as any)} style={{
          ...inp, width: 'auto', fontSize: '0.8rem', padding: '7px 28px 7px 10px', cursor: 'pointer',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.3)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
        }}>
          <option value="newest">🕐 Najnowsze</option>
          <option value="az">🔤 A → Z</option>
          <option value="za">🔤 Z → A</option>
        </select>
      </div>

      {/* Stat */}
      <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem', marginBottom: 10 }}>
        {filtered.length === cats.length
          ? `${cats.length} kategorii`
          : `${filtered.length} z ${cats.length} kategorii`}
        {totalPages > 1 && ` · strona ${safePage}/${totalPages}`}
      </div>

      {/* Lista */}
      {catsLoading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', padding: '40px 0' }}>Ładowanie…</div>
      ) : paged.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.18)', padding: '32px 0', fontSize: '0.85rem', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 10 }}>
          {cats.length === 0 ? 'Brak kategorii.' : '🔍 Brak wyników — zmień filtry.'}
        </div>
      ) : paged.map(cat => (
        <div key={cat.id} style={{
          padding: '12px 16px', marginBottom: 6,
          background: editing?.id === cat.id ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${editing?.id === cat.id ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 10,
        }}>
          {editing?.id === cat.id ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={editing.emoji} onChange={e => setEditing({ ...editing, emoji: e.target.value })}
                style={{ ...inp, width: 52, textAlign: 'center', fontSize: '1.2rem', padding: '6px 2px' }} maxLength={2} />
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}
                style={{ ...inp, flex: 1, minWidth: 120 }} autoFocus />
              <LangPicker value={editing.lang ?? 'pl-PL'} onChange={l => setEditing({ ...editing, lang: l })} />
              <button onClick={saveEditCat} style={{ padding: '7px 14px', borderRadius: 7, background: '#D4AF37', color: '#000', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>Zapisz</button>
              <button onClick={() => setEditing(null)} style={{ padding: '7px 14px', borderRadius: 7, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', fontSize: '0.8rem' }}>Anuluj</button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{cat.emoji}</span>
                <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{highlight(cat.name)}</span>
                <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', color: 'rgba(129,140,248,0.8)', border: '1px solid rgba(99,102,241,0.2)', flexShrink: 0 }}>
                  {cat.lang ?? 'pl-PL'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Link to={`/admin/categories/${cat.id}/questions`} style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', textDecoration: 'none', letterSpacing: 0.5 }}>
                  Pytania
                </Link>
                <button onClick={() => setEditing(cat)} style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '0.75rem' }}>Edytuj</button>
                <button onClick={() => removeCat(cat.id)} style={{ padding: '5px 10px', borderRadius: 6, background: 'rgba(239,68,68,0.06)', border: 'none', color: 'rgba(239,68,68,0.5)', cursor: 'pointer', fontSize: '0.75rem' }}>Usuń</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Paginacja */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <CatPageBtn label="‹" disabled={safePage === 1} onClick={() => setPage(p => p - 1)} />
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setPage(n)} style={{
              width: 32, height: 32, borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem',
              background: n === safePage ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${n === safePage ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)'}`,
              color: n === safePage ? '#D4AF37' : 'rgba(255,255,255,0.5)',
            }}>{n}</button>
          ))}
          <CatPageBtn label="›" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)} />
        </div>
      )}

      </div>{/* koniec lewej kolumny */}

        {/* ── PRAWA KOLUMNA: Masowy upload ── */}
        <div style={{ position: 'sticky', top: 16 }}>
          <div style={{ padding: 20, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12 }}>
            <SectionTitle icon="📤" title="Masowy upload zdjęć" />
            <select value={bulkCatId} onChange={e => setBulkCatId(e.target.value)} style={{ ...inp, marginBottom: 10 }}>
              <option value="">— Wybierz kategorię —</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
            <input ref={bulkRef} type="file" accept="image/*" multiple onChange={e => setBulkFiles(Array.from(e.target.files ?? []))} style={{ ...inp, padding: '8px 10px', marginBottom: 10, cursor: 'pointer' }} />
            {bulkFiles.length > 0 && (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginBottom: 10 }}>
                {bulkFiles.length} plików — odpowiedź = nazwa pliku (bez rozszerzenia)
              </div>
            )}
            {bulkUploading && (
              <div style={{ marginBottom: 10, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${bulkProgress}%`, background: 'linear-gradient(90deg, #D4AF37, #FFD700)', borderRadius: 4, transition: 'width .3s' }} />
              </div>
            )}
            {bulkDone  && <div style={{ color: '#4ade80', fontSize: '0.8rem', marginBottom: 8 }}>✓ Wysłano pomyślnie</div>}
            {bulkError && <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: 8 }}>⚠️ {bulkError}</div>}
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
      </div>{/* koniec gridu */}
    </div>
  )
}

function CatPageBtn({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 32, height: 32, borderRadius: 7, cursor: disabled ? 'default' : 'pointer',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
      color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)', fontSize: '1rem',
    }}>{label}</button>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// BOARD SECTION
// ══════════════════════════════════════════════════════════════════════════════
function BoardSection({ config, handleUpdate, cats, tileCategories, setTileCategory, resetTileCategories, onFlash }: {
  config: GameConfig; handleUpdate: (k: keyof GameConfig, v: number) => Promise<void>
  cats: Category[]; tileCategories: string[]
  setTileCategory: (idx: number, catId: string) => Promise<void>
  resetTileCategories: () => Promise<void>; onFlash: () => void
}) {
  const preset = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
  const { cols, rows } = preset
  const total  = cols * rows

  const [saving, setSaving]             = useState<number | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const handleTileCat = async (tileIdx: number, catId: string) => {
    setSaving(tileIdx)
    await setTileCategory(tileIdx, catId)
    setSaving(null); onFlash()
  }

  const customCount = tileCategories.filter(id => id !== '' && id !== undefined).length

  return (
    <div>
      <SectionTitle icon="📐" title="Kształt planszy" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 10, marginBottom: 28 }}>
        {Object.entries(BOARD_PRESETS).map(([val, p]) => (
          <button key={val} onClick={() => handleUpdate('BOARD_SHAPE', Number(val))} style={{
            padding: '14px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
            background: config.BOARD_SHAPE === Number(val) ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${config.BOARD_SHAPE === Number(val) ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.08)'}`,
            color: config.BOARD_SHAPE === Number(val) ? '#D4AF37' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
          }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.95rem', letterSpacing: 2, marginBottom: 2 }}>{p.label}</div>
            <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{p.cols}×{p.rows} = {p.cols * p.rows} pól</div>
          </button>
        ))}
      </div>

      <SectionTitle icon="🗺️" title="Przypisanie kategorii do pól" />
      {customCount > 0 && (
        <div style={{ marginBottom: 12, color: 'rgba(212,175,55,0.7)', fontSize: '0.78rem', letterSpacing: 1 }}>
          {customCount}/{total} pól ma własną kategorię
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6, marginBottom: 16 }}>
        {Array.from({ length: total }, (_, i) => {
          const catId = tileCategories[i] ?? ''
          const cat   = cats.find(c => c.id === catId)
          const x     = i % cols
          const isGold = x < cols / 2
          return (
            <div key={i} style={{ position: 'relative' }}>
              <select value={catId} onChange={e => handleTileCat(i, e.target.value)} style={{
                width: '100%', padding: '7px 8px', borderRadius: 7,
                background: catId ? (isGold ? 'rgba(255,215,0,0.08)' : 'rgba(192,192,192,0.08)') : 'rgba(255,255,255,0.03)',
                border: `1px solid ${catId ? (isGold ? 'rgba(255,215,0,0.3)' : 'rgba(192,192,192,0.25)') : 'rgba(255,255,255,0.08)'}`,
                color: catId ? '#fff' : 'rgba(255,255,255,0.3)',
                fontSize: '0.72rem', cursor: 'pointer', appearance: 'none',
              }}>
                <option value="">Pole {i + 1}</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
              {cat && <div style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', fontSize: '0.9rem', pointerEvents: 'none' }}>{cat.emoji}</div>}
              {saving === i && <div style={{ position: 'absolute', inset: 0, borderRadius: 7, background: 'rgba(212,175,55,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#D4AF37' }}>●</div>}
            </div>
          )
        })}
      </div>

      {customCount > 0 && !confirmReset && (
        <button onClick={() => setConfirmReset(true)} style={{
          padding: '8px 18px', borderRadius: 8, background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.2)', color: 'rgba(239,68,68,0.7)',
          cursor: 'pointer', fontSize: '0.8rem',
        }}>Wyczyść przypisania</button>
      )}
      {confirmReset && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>Na pewno?</span>
          <button onClick={async () => { await resetTileCategories(); setConfirmReset(false); onFlash() }} style={{
            padding: '7px 16px', borderRadius: 8, background: '#ef4444', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.8rem',
          }}>Tak, wyczyść</button>
          <button onClick={() => setConfirmReset(false)} style={{
            padding: '7px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.8rem',
          }}>Anuluj</button>
        </div>
      )}
    </div>
  )
}
