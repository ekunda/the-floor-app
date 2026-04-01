/**
 * AdminConfig v2 — SP/MP split + Player management
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SoundEngine } from '../lib/SoundEngine'
import { clearSession, formatRemaining, sessionRemainingMs, supabase } from '../lib/supabase'
import { BOARD_PRESETS, DEFAULTS, useConfigStore } from '../store/useConfigStore'
import { Category, GameConfig, SpeechLang } from '../types'
import AdminPlayers from './AdminPlayers'

type SPSection  = 'categories' | 'board' | 'gameplay_sp' | 'players_sp' | 'display' | 'advanced'
type MPSection  = 'gameplay_mp' | 'xp_config' | 'history' | 'rooms'
type ActiveMode = 'sp' | 'mp' | 'players'

const SP_SECTIONS: { id: SPSection; label: string; icon: string }[] = [
  { id: 'categories',  label: 'Kategorie',    icon: '📂' },
  { id: 'board',       label: 'Plansza',      icon: '🎯' },
  { id: 'gameplay_sp', label: 'Rozgrywka SP', icon: '⚔️' },
  { id: 'players_sp',  label: 'Gracze SP',    icon: '👥' },
  { id: 'display',     label: 'Wyświetlanie', icon: '🖥️' },
  { id: 'advanced',    label: 'Zaawansowane', icon: '⚙️' },
]

const MP_SECTIONS: { id: MPSection; label: string; icon: string }[] = [
  { id: 'gameplay_mp', label: 'Rozgrywka MP', icon: '🌐' },
  { id: 'xp_config',   label: 'XP & Ranking', icon: '🏆' },
  { id: 'history',     label: 'Historia gier', icon: '📋' },
  { id: 'rooms',       label: 'Aktywne pokoje', icon: '🚪' },
]

const SP_GAMEPLAY: { key: keyof GameConfig; label: string; desc: string; min: number; max: number; unit: string }[] = [
  { key: 'DUEL_TIME',    label: 'Czas gracza',      desc: 'Sekundy na odpowiedz (SP)',    min: 10,   max: 120,   unit: 's'  },
  { key: 'PASS_PENALTY', label: 'Kara za pas',      desc: 'Sekundy odejmowane przy pasie',min: 0,    max: 30,    unit: 's'  },
  { key: 'MAX_PASSES',   label: 'Limit pasow',      desc: 'Maks pasy per duel (0 = brak)',min: 0,    max: 10,    unit: ''   },
  { key: 'FEEDBACK_MS',  label: 'Czas feedbacku',   desc: 'Wyswietlanie odpowiedzi (ms)', min: 300,  max: 5000,  unit: 'ms' },
  { key: 'WIN_CLOSE_MS', label: 'Popup wygranej',   desc: 'Auto-zamkniecie wygranej (ms)',min: 1000, max: 10000, unit: 'ms' },
  { key: 'TOAST_MS',     label: 'Czas powiadomien', desc: 'Czas toast-ow (ms)',           min: 500,  max: 5000,  unit: 'ms' },
]

const MP_GAMEPLAY: { key: keyof GameConfig; label: string; desc: string; min: number; max: number; unit: string }[] = [
  { key: 'MP_DUEL_TIME',    label: 'Czas gracza MP',    desc: 'Sekundy na odpowiedz (Online)',  min: 10,   max: 180,   unit: 's'  },
  { key: 'MP_PASS_PENALTY', label: 'Kara za pas MP',    desc: 'Sekundy kary za pas (Online)',   min: 0,    max: 30,    unit: 's'  },
  { key: 'MP_FEEDBACK_MS',  label: 'Feedback MP',       desc: 'Wyswietlanie odpowiedzi (ms)',   min: 300,  max: 5000,  unit: 'ms' },
  { key: 'MP_WIN_CLOSE_MS', label: 'Popup wygranej MP', desc: 'Auto-zamkniecie wygranej (ms)',  min: 1000, max: 10000, unit: 'ms' },
]

const XP_FIELDS: { key: keyof GameConfig; label: string; desc: string; min: number; max: number; color: string }[] = [
  { key: 'MP_XP_WIN',  label: 'XP za wygranie',  desc: 'Punkty za wygrana gre online', min: 0, max: 500, color: '#4ade80' },
  { key: 'MP_XP_DRAW', label: 'XP za remis',     desc: 'Punkty za remis',              min: 0, max: 250, color: '#facc15' },
  { key: 'MP_XP_LOSS', label: 'XP za przegrana', desc: 'Punkty za uczestnictwo',       min: 0, max: 100, color: '#fb923c' },
]

function filenameToAnswer(f: string) {
  return f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminConfig() {
  const navigate = useNavigate()
  const { config, fetch, update, players, updatePlayer, resetAll,
    tileCategories, setTileCategory, resetTileCategories } = useConfigStore()

  const [mode,    setMode]    = useState<ActiveMode>('sp')
  const [spSect,  setSpSect]  = useState<SPSection>('categories')
  const [mpSect,  setMpSect]  = useState<MPSection>('gameplay_mp')
  const [saved,   setSaved]   = useState(false)
  const [sessionLeft, setSessionLeft] = useState(sessionRemainingMs())

  const [cats, setCats]         = useState<Category[]>([])
  const [catName, setCatName]   = useState('')
  const [catEmoji, setCatEmoji] = useState('🎯')
  const [catLang, setCatLang]   = useState<SpeechLang>('pl-PL')
  const [editing, setEditing]   = useState<Category | null>(null)
  const [catsLoading, setCatsLoading] = useState(false)

  const [bulkCatId, setBulkCatId]       = useState('')
  const [bulkFiles, setBulkFiles]       = useState<File[]>([])
  const [bulkProgress, setBulkProgress] = useState(0)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkDone, setBulkDone]         = useState(false)
  const [bulkError, setBulkError]       = useState<string | null>(null)
  const bulkRef = useRef<HTMLInputElement>(null)

  const [history, setHistory]       = useState<any[]>([])
  const [histLoading, setHistLoading] = useState(false)

  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const [resetting, setResetting]             = useState(false)

  useEffect(() => { SoundEngine.stopBg(0); fetch(); loadCats() }, [])
  // Re-fetch config + categories when switching modes
  useEffect(() => { fetch(); if (mode === 'sp') loadCats() }, [mode])
  useEffect(() => {
    const iv = setInterval(() => {
      const r = sessionRemainingMs(); setSessionLeft(r)
      if (r <= 0) { clearSession(); navigate('/admin') }
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  const loadCats = async () => {
    setCatsLoading(true)
    const { data } = await supabase.from('categories').select('*').order('created_at')
    setCats(data ?? []); setCatsLoading(false)
  }

  const loadHistory = async () => {
    setHistLoading(true)
    const { data } = await supabase.from('game_history')
      .select('id,played_at,is_draw,winner_id,loser_id,winner_score,loser_score')
      .order('played_at', { ascending: false }).limit(100)
    setHistory(data ?? []); setHistLoading(false)
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
    if (!confirm('Usunac kategorie i wszystkie pytania?')) return
    await supabase.from('questions').delete().eq('category_id', id)
    await supabase.from('categories').delete().eq('id', id)
    loadCats()
  }
  const handleUpdate = async (key: keyof GameConfig, value: number) => {
    await update(key, value); setSaved(true); setTimeout(() => setSaved(false), 1500)
  }
  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }
  const handleLogout = () => { clearSession(); navigate('/admin') }
  const handleResetAll = async () => {
    setResetting(true); await resetAll(); setResetting(false)
    setConfirmResetAll(false); flash()
  }
  const handleBulkUpload = async () => {
    if (!bulkCatId || bulkFiles.length === 0) return
    setBulkUploading(true); setBulkProgress(0); setBulkError(null); setBulkDone(false)
    let done = 0
    for (const file of bulkFiles) {
      const answer = filenameToAnswer(file.name)
      const ext    = file.name.split('.').pop()
      const path   = `${bulkCatId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('question-images').upload(path, file, { upsert: true })
      if (upErr) { setBulkError(upErr.message); break }
      await supabase.from('questions').insert({ category_id: bulkCatId, image_path: path, answer, synonyms: [] })
      done++; setBulkProgress(Math.round((done / bulkFiles.length) * 100))
    }
    setBulkUploading(false); setBulkDone(true)
    setBulkFiles([]); if (bulkRef.current) bulkRef.current.value = ''
  }

  const preset     = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
  const totalTiles = preset.cols * preset.rows
  const sessionColor = sessionLeft < 5 * 60 * 1000 ? '#f87171' : sessionLeft < 15 * 60 * 1000 ? '#facc15' : 'rgba(255,255,255,0.3)'

  const inp: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8, padding: '8px 12px', color: '#fff',
    fontFamily: "'Montserrat', sans-serif", fontSize: '0.9rem',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const modeBtn = (m: ActiveMode, color: string): React.CSSProperties => ({
    flex: 1, padding: '11px 10px',
    background: mode === m ? `${color}18` : 'transparent',
    border: `1px solid ${mode === m ? color : 'rgba(255,255,255,0.07)'}`,
    borderRadius: 9, color: mode === m ? color : 'rgba(255,255,255,0.35)',
    fontFamily: "'Bebas Neue', sans-serif", fontSize: '0.82rem', letterSpacing: 2,
    cursor: 'pointer', transition: 'all 0.2s',
  })
  const navBtn = (id: string, active: boolean, activeColor = '#D4AF37'): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 9, padding: '10px 18px',
    background: active ? `${activeColor}12` : 'transparent', border: 'none',
    borderLeft: `3px solid ${active ? activeColor : 'transparent'}`,
    color: active ? activeColor : 'rgba(255,255,255,0.45)',
    cursor: 'pointer', fontSize: '0.84rem',
    transition: 'all 0.2s', textAlign: 'left' as const, width: '100%',
  })

  const mpAccent = '#818cf8'

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: "'Montserrat', sans-serif", display: 'flex' }}>
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Montserrat:wght@400;600&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <aside style={{ width: 224, flexShrink: 0, background: 'rgba(255,255,255,0.02)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0, overflow: 'auto' }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 14px' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: 6, color: '#D4AF37' }}>THE FLOOR</div>
          <div style={{ fontSize: '0.6rem', letterSpacing: 3, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>PANEL ADMINA</div>
        </div>

        {/* Mode switcher */}
        <div style={{ padding: '0 12px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <button onClick={() => setMode('sp')}      style={modeBtn('sp', '#D4AF37')}>🎮 SINGLEPLAYER</button>
            <button onClick={() => setMode('mp')}      style={modeBtn('mp', mpAccent)}>🌐 MULTIPLAYER</button>
            <button onClick={() => setMode('players')} style={modeBtn('players', '#4ade80')}>👥 GRACZE</button>
          </div>
        </div>

        {/* Sub-nav */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6, flex: 1 }}>
          {mode === 'sp' && SP_SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSpSect(s.id)} style={navBtn(s.id, spSect === s.id)}>
              <span style={{ fontSize: '0.95rem' }}>{s.icon}</span>{s.label}
            </button>
          ))}
          {mode === 'mp' && MP_SECTIONS.map(s => (
            <button key={s.id} onClick={() => setMpSect(s.id)} style={navBtn(s.id, mpSect === s.id, mpAccent)}>
              <span style={{ fontSize: '0.95rem' }}>{s.icon}</span>{s.label}
            </button>
          ))}
          {mode === 'players' && (
            <div style={{ padding: '10px 18px', fontSize: '0.84rem', color: '#4ade80', borderLeft: '3px solid #4ade80', background: 'rgba(74,222,128,0.06)' }}>
              👥 Zarzadzanie graczami
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {saved && <div style={{ padding: '7px 12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, color: '#4ade80', fontSize: '0.78rem' }}>✓ Zapisano</div>}
          <div style={{ fontSize: '0.62rem', color: sessionColor, letterSpacing: 1, textAlign: 'center' as const }}>Sesja: {formatRemaining(sessionLeft)}</div>
          <Link to="/" onClick={() => SoundEngine.stopBg(0)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 8, color: '#D4AF37', textDecoration: 'none', fontSize: '0.8rem' }}>
            🎮 Wyjscie do gry
          </Link>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, color: 'rgba(239,68,68,0.7)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: "'Montserrat',sans-serif" }}>
            🚪 Wyloguj
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, padding: '28px 32px', maxWidth: 820, overflow: 'auto' }}>


        {/* SP sections */}
        {mode === 'sp' && spSect === 'categories' && (
          <CategoriesSection cats={cats} catsLoading={catsLoading} catName={catName} setCatName={setCatName}
            catEmoji={catEmoji} setCatEmoji={setCatEmoji} catLang={catLang} setCatLang={setCatLang}
            editing={editing} setEditing={setEditing} addCat={addCat} saveEditCat={saveEditCat}
            removeCat={removeCat} inp={inp} bulkCatId={bulkCatId} setBulkCatId={setBulkCatId}
            bulkFiles={bulkFiles} setBulkFiles={setBulkFiles} bulkProgress={bulkProgress}
            bulkUploading={bulkUploading} bulkDone={bulkDone} setBulkDone={setBulkDone}
            bulkError={bulkError} bulkRef={bulkRef} handleBulkUpload={handleBulkUpload} />
        )}
        {mode === 'sp' && spSect === 'board' && (
          <BoardSection config={config} handleUpdate={handleUpdate} cats={cats}
            tileCategories={tileCategories}
            setTileCategory={(i: number, id: string) => setTileCategory(i, id, totalTiles)}
            resetTileCategories={resetTileCategories} onFlash={flash} />
        )}
        {mode === 'sp' && spSect === 'gameplay_sp' && (
          <div>
            <SectionTitle icon="swords" title="Singleplayer - Rozgrywka" />
            <InfoBox>Ustawienia dotycza wylacznie gry lokalnej (2 graczy, 1 ekran).</InfoBox>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {SP_GAMEPLAY.map(f => (
                <NumberField key={f.key} label={f.label} desc={f.desc}
                  value={config[f.key] as number} min={f.min} max={f.max} unit={f.unit}
                  onChange={v => handleUpdate(f.key, v)} />
              ))}
            </div>
            <div style={{marginTop:14}}>
              <ToggleField label='Pas glosem (PASS / PAS)' desc='Rozpoznawanie slowa "pass" przez mikrofon jak w programie The Floor'
                value={config.VOICE_PASS === 1} onChange={v => handleUpdate('VOICE_PASS', v ? 1 : 0)} />
            </div>
          </div>
        )}
        {mode === 'sp' && spSect === 'players_sp' && (
          <div>
            <SectionTitle icon="people" title="Singleplayer - Gracze" />
            <InfoBox>Nazwy i kolory graczy w trybie lokalnym. Zapisywane lokalnie.</InfoBox>
            {([0, 1] as const).map(idx => (
              <div key={idx} style={{padding:20,marginBottom:12,background:'rgba(255,255,255,0.03)',border:`1px solid ${players[idx].color}30`,borderRadius:12}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1rem',letterSpacing:4,color:players[idx].color,marginBottom:14}}>GRACZ {idx + 1}</div>
                <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                  <div style={{flex:1,minWidth:160}}>
                    <label style={{display:'block',color:'rgba(255,255,255,0.4)',fontSize:'0.7rem',letterSpacing:1,marginBottom:5}}>NAZWA</label>
                    <input value={players[idx].name} maxLength={16} style={inp}
                      onChange={e => updatePlayer(idx, 'name', e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <label style={{display:'block',color:'rgba(255,255,255,0.4)',fontSize:'0.7rem',letterSpacing:1,marginBottom:5}}>KOLOR</label>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <input type="color" value={players[idx].color}
                        onChange={e => updatePlayer(idx, 'color', e.target.value)}
                        style={{width:44,height:38,padding:2,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:8,cursor:'pointer'}} />
                      <span style={{color:'rgba(255,255,255,0.4)',fontSize:'0.8rem',fontFamily:'monospace'}}>{players[idx].color}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {mode === 'sp' && spSect === 'display' && (
          <div>
            <SectionTitle icon="screen" title="Wyswietlanie i dzwiek" />
            <ToggleField label="Statystyki domyslnie widoczne" desc="Pasek posiadania planszy od startu"
              value={config.SHOW_STATS === 1} onChange={v => handleUpdate('SHOW_STATS', v ? 1 : 0)} />
            <ToggleField label="Podpowiedz pierwszej litery" desc="Pokazuje 1. litere odpowiedzi po 10s ciszy"
              value={config.SHOW_ANSWER_HINT === 1} onChange={v => handleUpdate('SHOW_ANSWER_HINT', v ? 1 : 0)} />
            <ToggleField label="Animacja obracania kafelka" desc="Efekt flip przy zmianie wlasciciela pola"
              value={config.TILE_FLIP_ANIM === 1} onChange={v => handleUpdate('TILE_FLIP_ANIM', v ? 1 : 0)} />
            <div style={{marginTop:14}}>
              <div style={{color:'rgba(255,255,255,0.4)',fontSize:'0.72rem',letterSpacing:1,marginBottom:10}}>DZWIEK</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <NumberField label="Muzyka" desc="Glosnosc muzyki tla (0-100%)"
                  value={config.MUSIC_VOLUME} min={0} max={100} unit="%" onChange={v => handleUpdate('MUSIC_VOLUME', v)} />
                <NumberField label="Efekty" desc="Glosnosc efektow dzwiekowych (0-100%)"
                  value={config.SFX_VOLUME} min={0} max={100} unit="%" onChange={v => handleUpdate('SFX_VOLUME', v)} />
              </div>
              <div style={{marginTop:10,display:'flex',gap:12}}>
                {[{label:'Muzyka',v:config.MUSIC_VOLUME,c:'#818cf8'},{label:'Efekty',v:config.SFX_VOLUME,c:'#4ade80'}].map(({label,v,c})=>(
                  <div key={label} style={{flex:1,padding:'10px 14px',background:'rgba(255,255,255,0.02)',borderRadius:10,border:'1px solid rgba(255,255,255,0.07)'}}>
                    <div style={{height:5,background:'rgba(255,255,255,0.08)',borderRadius:4,overflow:'hidden',marginBottom:5}}>
                      <div style={{height:'100%',width:`${v}%`,background:c,borderRadius:4,transition:'width 0.3s'}} />
                    </div>
                    <div style={{textAlign:'center',color:c,fontSize:'0.7rem'}}>{label}: {v}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {mode === 'sp' && spSect === 'advanced' && (
          <div>
            <SectionTitle icon="gear" title="Wymiary planszy (reczne)" />
            <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:18}}>
              <NumberField label="Kolumny" desc="Nadpisuje preset" value={config.GRID_COLS} min={2} max={10} unit="" onChange={v => handleUpdate('GRID_COLS', v)} />
              <NumberField label="Wiersze" desc="Nadpisuje preset" value={config.GRID_ROWS} min={2} max={8} unit="" onChange={v => handleUpdate('GRID_ROWS', v)} />
            </div>
            <InfoBox color="#fb923c">Reczne wymiary sa nadpisywane przy zmianie presetu w sekcji Plansza.</InfoBox>
            <SectionTitle icon="reset" title="Reset ustawien" />
            <div style={{padding:18,background:'rgba(239,68,68,0.04)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:12}}>
              <div style={{color:'rgba(255,255,255,0.5)',fontSize:'0.85rem',marginBottom:12}}>Przywroci wszystkie ustawienia do wartosci domyslnych.</div>
              {!confirmResetAll ? (
                <button onClick={() => setConfirmResetAll(true)} style={{padding:'8px 18px',borderRadius:8,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',color:'#f87171',cursor:'pointer',fontSize:'0.85rem',fontFamily:"'Montserrat',sans-serif"}}>
                  Reset do domyslnych
                </button>
              ) : (
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <span style={{color:'#f87171',fontSize:'0.85rem'}}>Na pewno?</span>
                  <button onClick={handleResetAll} disabled={resetting} style={{padding:'8px 14px',borderRadius:8,background:'rgba(239,68,68,0.2)',border:'1px solid #ef4444',color:'#f87171',cursor:'pointer',fontSize:'0.85rem',fontFamily:"'Montserrat',sans-serif"}}>
                    {resetting ? 'Resetowanie...' : 'TAK'}
                  </button>
                  <button onClick={() => setConfirmResetAll(false)} style={{padding:'8px 14px',borderRadius:8,background:'transparent',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.4)',cursor:'pointer',fontSize:'0.85rem',fontFamily:"'Montserrat',sans-serif"}}>Anuluj</button>
                </div>
              )}
            </div>
          </div>
        )}

        {mode === 'mp' && mpSect === 'gameplay_mp' && (
          <div>
            <SectionTitle icon='globe' title='Multiplayer - Rozgrywka Online' />
            <div style={{padding:'10px 14px',background:'rgba(129,140,248,0.06)',border:'1px solid rgba(129,140,248,0.2)',borderRadius:10,marginBottom:16,fontSize:'0.8rem',color:'rgba(255,255,255,0.4)'}}>
              Ustawienia dotycza wylacznie trybu online. Niezalezne od SP.
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {MP_GAMEPLAY.map(f => (
                <NumberField key={f.key} label={f.label} desc={f.desc}
                  value={(config as any)[f.key] ?? (DEFAULTS as any)[f.key] ?? 60}
                  min={f.min} max={f.max} unit={f.unit}
                  onChange={v => handleUpdate(f.key, v)} accentColor='#818cf8' />
              ))}
            </div>
          </div>
        )}
        {mode === 'mp' && mpSect === 'xp_config' && (
          <div>
            <SectionTitle icon='trophy' title='System XP i Rankingow' />
            <div style={{padding:'10px 14px',background:'rgba(129,140,248,0.06)',border:'1px solid rgba(129,140,248,0.2)',borderRadius:10,marginBottom:16,fontSize:'0.8rem',color:'rgba(255,255,255,0.4)'}}>
              Punkty przyznawane po kazdej zakonczej grze online. Wplywaja na ranking i poziom.
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
              {XP_FIELDS.map(f => (
                <XPField key={f.key} label={f.label} desc={f.desc} color={f.color}
                  value={(config as any)[f.key] ?? (DEFAULTS as any)[f.key] ?? 50}
                  min={f.min} max={f.max}
                  onChange={v => handleUpdate(f.key, v)} />
              ))}
            </div>
            <div style={{padding:'16px 20px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12}}>
              <div style={{fontSize:'0.68rem',letterSpacing:2,color:'rgba(255,255,255,0.3)',marginBottom:10}}>PODGLAD XP</div>
              <div style={{display:'flex',gap:10,flexWrap:'wrap' as const}}>
                {[
                  {label:'10 wygranych',xp:10 * ((config as any).MP_XP_WIN ?? 50),color:'#4ade80'},
                  {label:'10 remisow',xp:10 * ((config as any).MP_XP_DRAW ?? 20),color:'#facc15'},
                  {label:'10 porazek',xp:10 * ((config as any).MP_XP_LOSS ?? 10),color:'#fb923c'},
                ].map(({label,xp,color}) => (
                  <div key={label} style={{flex:1,minWidth:130,padding:'12px 14px',background:color+'08',border:'1px solid '+color+'22',borderRadius:10}}>
                    <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.4)',marginBottom:4}}>{label}</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.4rem',letterSpacing:3,color}}>+{xp} XP</div>
                    <div style={{fontSize:'0.7rem',color:'rgba(255,255,255,0.3)'}}>Poziom {Math.floor(xp / 100) + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {mode === 'mp' && mpSect === 'history' && (
          <GameHistorySection history={history} loading={histLoading} onLoad={loadHistory} />
        )}
        {mode === 'mp' && mpSect === 'rooms' && (
          <ActiveRoomsSection />
        )}

        {mode === 'players' && <AdminPlayers inp={inp} />}
      </main>
    </div>
  )
}

function SectionTitle({icon, title}) {
  return (<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,paddingBottom:12,borderBottom:'1px solid rgba(255,255,255,0.06)'}}><span>{icon}</span><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.1rem',letterSpacing:4,color:'rgba(255,255,255,0.7)'}}>{title}</span></div>)
}
function InfoBox({children, color}) {
  const c = color || '#D4AF37'
  return <div style={{padding:'10px 14px',background:c+'08',border:'1px solid '+c+'25',borderRadius:10,marginBottom:16,fontSize:'0.8rem',color:'rgba(255,255,255,0.4)'}}>{children}</div>
}
function NumberField({label,desc,value,min,max,unit,onChange,accentColor}) {
  const ac = accentColor || '#D4AF37'
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,gap:12,flexWrap:'wrap'}}>
      <div style={{minWidth:140}}><div style={{color:'#C0C0C0',fontSize:'0.88rem',marginBottom:2}}>{label}</div><div style={{color:'rgba(255,255,255,0.25)',fontSize:'0.72rem'}}>{desc}</div></div>
      <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
        <button onClick={()=>onChange(Math.max(min,value-1))} style={{width:28,height:28,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,color:'#fff',cursor:'pointer'}}>-</button>
        <input type="number" value={value} min={min} max={max} onChange={e=>onChange(Number(e.target.value))} style={{width:68,background:'rgba(255,255,255,0.06)',border:'1px solid '+ac+'44',borderRadius:8,padding:'6px 8px',color:ac,fontFamily:'monospace',fontSize:'1rem',textAlign:'center',outline:'none',boxSizing:'border-box'}} />
        {unit && <span style={{color:'rgba(255,255,255,0.3)',fontSize:'0.75rem'}}>{unit}</span>}
        <button onClick={()=>onChange(Math.min(max,value+1))} style={{width:28,height:28,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,color:'#fff',cursor:'pointer'}}>+</button>
      </div>
    </div>
  )
}
function ToggleField({label,desc,value,onChange}) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,marginBottom:8,cursor:'pointer',gap:12}} onClick={()=>onChange(!value)}>
      <div><div style={{color:'#C0C0C0',fontSize:'0.88rem',marginBottom:2}}>{label}</div><div style={{color:'rgba(255,255,255,0.25)',fontSize:'0.72rem'}}>{desc}</div></div>
      <div style={{width:44,height:24,borderRadius:12,background:value?'rgba(212,175,55,0.4)':'rgba(255,255,255,0.1)',position:'relative',transition:'all 0.25s',flexShrink:0}}>
        <div style={{position:'absolute',top:3,left:value?22:3,width:16,height:16,borderRadius:'50%',background:value?'#D4AF37':'rgba(255,255,255,0.4)',transition:'all 0.25s'}} />
      </div>
    </div>
  )
}
function LangPicker({value, onChange}) {
  const opts=[{v:'pl-PL',label:'PL'},{v:'en-US',label:'EN'},{v:'both',label:'MIX'}]
  return (<div style={{display:'flex',gap:4,flexShrink:0}}>{opts.map(o=>(<button key={o.v} onClick={()=>onChange(o.v)} style={{padding:'6px 10px',cursor:'pointer',borderRadius:8,background:value===o.v?'rgba(99,102,241,0.3)':'rgba(255,255,255,0.05)',border:'1px solid '+(value===o.v?'rgba(99,102,241,0.6)':'rgba(255,255,255,0.1)'),color:value===o.v?'#818cf8':'rgba(255,255,255,0.5)',fontSize:'0.78rem'}}>{o.label}</button>))}</div>)
}
function XPField({label,desc,value,min,max,onChange,color}) {
  const pct=Math.min(100,Math.round(((value-min)/Math.max(1,max-min))*100))
  return (
    <div style={{padding:'14px 18px',background:color+'06',border:'1px solid '+color+'22',borderRadius:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
        <div><div style={{color:'#fff',fontSize:'0.88rem',marginBottom:2}}>{label}</div><div style={{color:'rgba(255,255,255,0.3)',fontSize:'0.72rem'}}>{desc}</div></div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button onClick={()=>onChange(Math.max(min,value-5))} style={{width:28,height:28,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,color:'#fff',cursor:'pointer'}}>-</button>
          <input type="number" value={value} min={min} max={max} onChange={e=>onChange(Number(e.target.value))} style={{width:60,background:'rgba(255,255,255,0.06)',border:'1px solid '+color+'44',borderRadius:8,padding:'6px 8px',color,fontFamily:'monospace',fontSize:'1rem',textAlign:'center',outline:'none'}} />
          <span style={{color:'rgba(255,255,255,0.4)',fontSize:'0.75rem'}}>XP</span>
          <button onClick={()=>onChange(Math.min(max,value+5))} style={{width:28,height:28,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:6,color:'#fff',cursor:'pointer'}}>+</button>
        </div>
      </div>
      <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:4,overflow:'hidden'}}>
        <div style={{height:'100%',width:pct+'%',background:color,borderRadius:4,transition:'width 0.3s'}} />
      </div>
    </div>
  )
}

function BoardSection({config, handleUpdate, cats, tileCategories, setTileCategory, resetTileCategories, onFlash}: any) {
  const [confirmReset, setConfirmReset] = useState(false)
  const preset = BOARD_PRESETS[config.BOARD_SHAPE] ?? BOARD_PRESETS[0]
  const totalTiles = preset.cols * preset.rows
  const handleResetMap = async () => { await resetTileCategories(); setConfirmReset(false); onFlash() }
  return (
    <div>
      <SectionTitle icon='Plansza' title='Konfiguracja Planszy' />
      <div style={{marginBottom:18}}>
        <div style={{color:'rgba(255,255,255,0.4)',fontSize:'0.72rem',letterSpacing:1,marginBottom:10}}>KSZTALT PLANSZY</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {Object.entries(BOARD_PRESETS).map(([key, p]: [string, any]) => (
            <button key={key} onClick={() => handleUpdate('BOARD_SHAPE', Number(key))} style={{padding:'10px 8px',borderRadius:10,cursor:'pointer',background:config.BOARD_SHAPE===Number(key)?'rgba(212,175,55,0.15)':'rgba(255,255,255,0.03)',border:'1px solid '+(config.BOARD_SHAPE===Number(key)?'#D4AF37':'rgba(255,255,255,0.08)'),color:config.BOARD_SHAPE===Number(key)?'#D4AF37':'rgba(255,255,255,0.45)',fontSize:'0.78rem',letterSpacing:0.5,lineHeight:1.4}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1rem',letterSpacing:3,marginBottom:2}}>{p.cols}x{p.rows}</div>
              <div>{p.label}</div>
            </button>
          ))}
        </div>
      </div>
      <ToggleField label='Losowe kategorie kafelkow' desc='Kazda gra losowo przypisuje kategorie do pol' value={config.RANDOM_TILES === 1} onChange={v => handleUpdate('RANDOM_TILES', v ? 1 : 0)} />
      {config.RANDOM_TILES === 0 && cats.length > 0 && (
        <div style={{marginTop:14}}>
          <div style={{color:'rgba(255,255,255,0.4)',fontSize:'0.72rem',letterSpacing:1,marginBottom:8}}>PRZYPISANIE KATEGORII</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat('+preset.cols+',1fr)',gap:6,marginBottom:10}}>
            {Array.from({length:totalTiles}).map((_,i) => (
              <select key={i} value={tileCategories[i]||''} onChange={e=>setTileCategory(i,e.target.value)} style={{background:tileCategories[i]?'rgba(212,175,55,0.1)':'rgba(255,255,255,0.04)',border:'1px solid '+(tileCategories[i]?'rgba(212,175,55,0.4)':'rgba(255,255,255,0.1)'),borderRadius:8,padding:'6px 4px',color:'#fff',outline:'none',fontSize:'0.68rem',width:'100%',cursor:'pointer'}}>
                <option value=''>Auto</option>
                {cats.map((c: any) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            ))}
          </div>
          <div style={{display:'flex',gap:8}}>
            {!confirmReset ? (
              <button onClick={()=>setConfirmReset(true)} style={{padding:'7px 14px',borderRadius:8,background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.2)',color:'rgba(239,68,68,0.6)',cursor:'pointer',fontSize:'0.8rem'}}>Wyczysc</button>
            ) : (
              <><span style={{color:'#f87171',fontSize:'0.8rem',alignSelf:'center'}}>Na pewno?</span>
              <button onClick={handleResetMap} style={{padding:'7px 12px',borderRadius:8,background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',color:'#f87171',cursor:'pointer',fontSize:'0.8rem'}}>Tak</button>
              <button onClick={()=>setConfirmReset(false)} style={{padding:'7px 12px',borderRadius:8,background:'transparent',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.4)',cursor:'pointer',fontSize:'0.8rem'}}>Anuluj</button></>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
function CategoriesSection({cats,catsLoading,catName,setCatName,catEmoji,setCatEmoji,catLang,setCatLang,editing,setEditing,addCat,saveEditCat,removeCat,inp,bulkCatId,setBulkCatId,bulkFiles,setBulkFiles,bulkProgress,bulkUploading,bulkDone,setBulkDone,bulkError,bulkRef,handleBulkUpload}: any) {
  return (
    <div>
      <SectionTitle icon='Kategorie' title='Kategorie' />
      <div style={{padding:16,marginBottom:20,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12}}>
        <div style={{color:'rgba(255,255,255,0.4)',fontSize:'0.72rem',letterSpacing:1,marginBottom:12}}>NOWA KATEGORIA</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap' as const}}>
          <input value={catEmoji} onChange={e=>setCatEmoji(e.target.value)} style={{...inp,width:52,textAlign:'center' as const,fontSize:'1.2rem'}} />
          <input value={catName} onChange={e=>setCatName(e.target.value)} onKeyDown={(e:any)=>e.key==='Enter'&&addCat()} placeholder='Nazwa kategorii' style={{...inp,flex:1,minWidth:160}} />
          <LangPicker value={catLang} onChange={setCatLang} />
          <button onClick={addCat} disabled={!catName.trim()} style={{padding:'8px 18px',borderRadius:8,background:catName.trim()?'linear-gradient(135deg,#D4AF37,#FFD700)':'rgba(255,255,255,0.08)',color:catName.trim()?'#000':'rgba(255,255,255,0.3)',border:'none',cursor:catName.trim()?'pointer':'default',fontWeight:700,fontSize:'0.85rem'}}>+ Dodaj</button>
        </div>
      </div>
      {catsLoading ? <div style={{textAlign:'center' as const,color:'rgba(255,255,255,0.2)',padding:40}}>Ladowanie...</div>
      : cats.length === 0 ? <div style={{textAlign:'center' as const,color:'rgba(255,255,255,0.2)',padding:48,border:'1px dashed rgba(255,255,255,0.08)',borderRadius:12}}>Brak kategorii</div>
      : (
        <div style={{display:'flex',flexDirection:'column' as const,gap:6,marginBottom:24}}>
          {cats.map((cat: any) => (
            <div key={cat.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10}}>
              {editing && editing.id === cat.id ? (
                <><input value={editing.emoji} onChange={e=>setEditing({...editing,emoji:e.target.value})} style={{...inp,width:48,textAlign:'center' as const,fontSize:'1.1rem'}} />
                <input value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} style={{...inp,flex:1}} autoFocus />
                <LangPicker value={editing.lang||'pl-PL'} onChange={(v:any)=>setEditing({...editing,lang:v})} />
                <button onClick={saveEditCat} style={{padding:'6px 12px',borderRadius:8,background:'rgba(212,175,55,0.2)',border:'1px solid #D4AF37',color:'#D4AF37',cursor:'pointer',fontSize:'0.82rem'}}>Zap</button>
                <button onClick={()=>setEditing(null)} style={{padding:'6px 12px',borderRadius:8,background:'transparent',border:'1px solid rgba(255,255,255,0.12)',color:'rgba(255,255,255,0.4)',cursor:'pointer',fontSize:'0.82rem'}}>X</button></>
              ) : (
                <><span style={{fontSize:'1.4rem',minWidth:32,textAlign:'center' as const}}>{cat.emoji}</span>
                <span style={{flex:1,color:'#fff',fontSize:'0.9rem'}}>{cat.name}</span>
                <span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)'}}>{cat.lang||'pl-PL'}</span>
                <a href={'/admin/categories/'+cat.id+'/questions'} style={{padding:'5px 10px',borderRadius:8,background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.3)',color:'#818cf8',textDecoration:'none',fontSize:'0.78rem'}}>Pytania</a>
                <button onClick={()=>setEditing(cat)} style={{padding:'5px 10px',borderRadius:8,background:'rgba(212,175,55,0.08)',border:'1px solid rgba(212,175,55,0.2)',color:'#D4AF37',cursor:'pointer',fontSize:'0.78rem'}}>Edyt</button>
                <button onClick={()=>removeCat(cat.id)} style={{padding:'5px 10px',borderRadius:8,background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',color:'#f87171',cursor:'pointer',fontSize:'0.78rem'}}>Del</button></>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{padding:18,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'0.9rem',letterSpacing:3,color:'rgba(255,255,255,0.5)',marginBottom:12}}>MASOWE WGRYWANIE</div>
        <select value={bulkCatId} onChange={e=>setBulkCatId(e.target.value)} style={{...inp,marginBottom:10,appearance:'none' as any,WebkitAppearance:'none' as any,backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' fill=\'%23999\' viewBox=\'0 0 16 16\'%3E%3Cpath d=\'M8 11L3 6h10z\'/%3E%3C/svg%3E")',backgroundRepeat:'no-repeat',backgroundPosition:'right 12px center',paddingRight:32}}>
          <option value='' style={{background:'#181818',color:'#aaa'}}>Wybierz kategorie...</option>
          {cats.map((c: any) => <option key={c.id} value={c.id} style={{background:'#181818',color:'#fff'}}>{c.emoji} {c.name}</option>)}
        </select>
        <input ref={bulkRef} type='file' accept='image/*' multiple style={{display:'none'}} onChange={e=>setBulkFiles(Array.from((e.target as any).files||[]))} />
        <div style={{display:'flex',gap:8,flexWrap:'wrap' as const,alignItems:'center'}}>
          <button onClick={()=>bulkRef.current&&(bulkRef.current as any).click()} style={{padding:'8px 16px',borderRadius:8,background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',color:'#fff',cursor:'pointer',fontSize:'0.85rem'}}>Wybierz {bulkFiles.length>0?'('+bulkFiles.length+')':''}</button>
          <button onClick={handleBulkUpload} disabled={!bulkCatId||bulkFiles.length===0||bulkUploading} style={{padding:'8px 16px',borderRadius:8,background:bulkCatId&&bulkFiles.length>0?'rgba(212,175,55,0.15)':'rgba(255,255,255,0.03)',border:'1px solid '+(bulkCatId&&bulkFiles.length>0?'#D4AF37':'rgba(255,255,255,0.08)'),color:bulkCatId&&bulkFiles.length>0?'#D4AF37':'rgba(255,255,255,0.2)',cursor:'pointer',fontSize:'0.85rem'}}>
            {bulkUploading?'Wgrywanie '+bulkProgress+'%...':'Wgraj wszystkie'}
          </button>
        </div>
        {bulkUploading&&<div style={{marginTop:10,height:4,background:'rgba(255,255,255,0.08)',borderRadius:4,overflow:'hidden'}}><div style={{height:'100%',width:bulkProgress+'%',background:'#D4AF37',transition:'width 0.3s'}} /></div>}
        {bulkDone&&<div style={{marginTop:8,color:'#4ade80',fontSize:'0.8rem'}}>Wgrano pomyslnie!</div>}
      </div>
    </div>
  )
}
function ActiveRoomsSection() {
  const [rooms,   setRooms]   = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [profiles, setProfiles] = useState<Record<string,string>>({})

  const loadRooms = async () => {
    setLoading(true)
    const { data } = await supabase.from('game_rooms')
      .select('*').order('created_at', { ascending: false }).limit(50)
    const list = data ?? []
    setRooms(list)
    // Pobierz nicknamy
    const ids = [...new Set<string>(
      list.flatMap((r: any) => [r.host_id, r.guest_id].filter(Boolean))
    )]
    if (ids.length > 0) {
      const { data: ps } = await supabase.from('profiles').select('id,username').in('id', ids)
      if (ps) setProfiles(Object.fromEntries(ps.map((p: any) => [p.id, p.username])))
    }
    setLoading(false)
  }

  // Reload every time the component mounts (tab switch re-mounts)
  useEffect(() => { loadRooms() }, [])
  // Also add a key on the parent to force re-mount — see usage

  const nick = (id: string | null) => id ? (profiles[id] ?? id.slice(0,8)) : '—'
  const statusColor = (s: string) => s === 'playing' ? '#4ade80' : s === 'waiting' ? '#facc15' : 'rgba(255,255,255,0.3)'
  const statusLabel = (s: string) => s === 'playing' ? '🎮 W grze' : s === 'waiting' ? '⏳ Oczekuje' : s

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <SectionTitle icon='Pokoje' title='Aktywne Pokoje Online' />
        <button onClick={loadRooms} style={{padding:'7px 14px',borderRadius:8,background:'rgba(129,140,248,0.1)',border:'1px solid rgba(129,140,248,0.3)',color:'#818cf8',cursor:'pointer',fontSize:'0.8rem'}}>Odswiez</button>
      </div>
      {loading ? (
        <div style={{textAlign:'center' as const,padding:40,color:'rgba(255,255,255,0.3)'}}>Ladowanie...</div>
      ) : rooms.length === 0 ? (
        <div style={{textAlign:'center' as const,padding:40,color:'rgba(255,255,255,0.2)',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:12}}>Brak aktywnych pokojow</div>
      ) : (
        <div style={{display:'flex',flexDirection:'column' as const,gap:8}}>
          {rooms.map((r: any) => (
            <div key={r.id} style={{display:'flex',alignItems:'center',gap:14,padding:'12px 16px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,flexWrap:'wrap' as const}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:'1.4rem',letterSpacing:4,color:'#D4AF37',minWidth:52}}>{r.code}</div>
              <div style={{flex:1,minWidth:120}}>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3}}>
                  <span style={{color:'#D4AF37',fontSize:'0.8rem'}}>👑 {nick(r.host_id)}</span>
                  {r.guest_id && <><span style={{color:'rgba(255,255,255,0.2)'}}>vs</span><span style={{color:'#C0C0C0',fontSize:'0.8rem'}}>{nick(r.guest_id)}</span></>}
                </div>
                <div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)'}}>
                  {new Date(r.created_at).toLocaleTimeString('pl-PL')}
                </div>
              </div>
              <span style={{padding:'3px 10px',borderRadius:20,fontSize:'0.72rem',background:statusColor(r.status)+'18',color:statusColor(r.status),border:'1px solid '+statusColor(r.status)+'44'}}>
                {statusLabel(r.status ?? 'waiting')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GameHistorySection({history, loading, onLoad}: any) {
  const [profiles, setProfiles] = useState<Record<string,string>>({})

  // Reload each time component mounts (tab switch re-mounts via key)
  useEffect(() => { onLoad() }, [])

  // Pobierz nicknamy dla wszystkich unikalnych ID z historii
  useEffect(() => {
    const ids = [...new Set<string>(
      history.flatMap((g: any) => [g.winner_id, g.loser_id].filter(Boolean))
    )]
    if (ids.length === 0) return
    supabase.from('profiles').select('id,username').in('id', ids).then(({ data }) => {
      if (!data) return
      setProfiles(Object.fromEntries(data.map((p: any) => [p.id, p.username])))
    })
  }, [history])

  const nick = (id: string | null) => id ? (profiles[id] ?? id.slice(0, 8)) : '—'

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <SectionTitle icon='Historia' title='Historia Gier Online' />
        <button onClick={onLoad} style={{padding:'7px 14px',borderRadius:8,background:'rgba(129,140,248,0.1)',border:'1px solid rgba(129,140,248,0.3)',color:'#818cf8',cursor:'pointer',fontSize:'0.8rem'}}>Odswiez</button>
      </div>
      {loading ? <div style={{textAlign:'center' as const,padding:40,color:'rgba(255,255,255,0.3)'}}>Ladowanie...</div>
      : history.length === 0 ? <div style={{textAlign:'center' as const,padding:40,color:'rgba(255,255,255,0.2)',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:12}}>Brak rozegranych gier online</div>
      : (
        <div style={{borderRadius:12,border:'1px solid rgba(255,255,255,0.07)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:'0.82rem'}}>
            <thead><tr style={{background:'rgba(0,0,0,0.3)'}}>
              {['DATA','WYNIK','ZWYCIEZCA','PRZEGRANY','PUNKTY'].map(h=><th key={h} style={{padding:'10px 12px',textAlign:'left' as const,fontSize:'0.65rem',letterSpacing:2,color:'rgba(255,255,255,0.3)'}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {history.map((g: any, i: number) => (
                <tr key={g.id} style={{background:i%2===0?'transparent':'rgba(255,255,255,0.01)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <td style={{padding:'10px 12px',color:'rgba(255,255,255,0.4)',fontSize:'0.75rem'}}>
                    {new Date(g.played_at).toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                  </td>
                  <td style={{padding:'10px 12px'}}>
                    {g.is_draw
                      ? <span style={{color:'#a78bfa',fontSize:'0.8rem'}}>🤝 Remis</span>
                      : <span style={{color:'#4ade80',fontSize:'0.8rem'}}>✓ Rozstrzygniety</span>}
                  </td>
                  <td style={{padding:'10px 12px',color:'#D4AF37',fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:'0.8rem'}}>
                    {g.is_draw ? '—' : nick(g.winner_id)}
                  </td>
                  <td style={{padding:'10px 12px',color:'rgba(255,255,255,0.45)',fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:'0.8rem'}}>
                    {g.is_draw ? nick(g.winner_id)+' / '+nick(g.loser_id) : nick(g.loser_id)}
                  </td>
                  <td style={{padding:'10px 12px',fontFamily:"'Bebas Neue',sans-serif",color:'#fff',letterSpacing:2}}>
                    {g.winner_score??0}:{g.loser_score??0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
