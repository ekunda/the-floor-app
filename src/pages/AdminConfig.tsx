import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useConfigStore } from '../store/useConfigStore'
import { GameConfig } from '../types'

const LABELS: Record<keyof GameConfig, { label: string; desc: string }> = {
  GRID_COLS:   { label: 'Kolumny planszy',      desc: 'Liczba kolumn siatki' },
  GRID_ROWS:   { label: 'Wiersze planszy',       desc: 'Liczba wierszy siatki' },
  TILE_SIZE:   { label: 'Bazowy rozmiar kafelka', desc: 'Plansza dopasowuje się automatycznie' },
  DUEL_TIME:   { label: 'Czas gracza (s)',        desc: 'Sekundy na starcie pojedynku' },
  PASS_PENALTY:{ label: 'Kara za pas (s)',        desc: 'Sekundy odejmowane przy pasie' },
  FEEDBACK_MS: { label: 'Feedback (ms)',          desc: 'Czas wyświetlania odpowiedzi' },
  WIN_CLOSE_MS:{ label: 'Popup wygranej (ms)',    desc: 'Czas zamknięcia po wygranej' },
  TOAST_MS:    { label: 'Toast (ms)',             desc: 'Czas wyświetlania powiadomień' },
}

export default function AdminConfig() {
  const { config, fetch, update } = useConfigStore()

  useEffect(() => { fetch() }, [])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#080808',
        color: '#fff',
        padding: '32px 24px',
        maxWidth: 580,
        margin: '0 auto',
        fontFamily: "'Montserrat', sans-serif",
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Link
          to="/admin/categories"
          style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Powrót
        </Link>
        <h1
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '2rem',
            letterSpacing: 6,
            color: '#FFD700',
            margin: 0,
          }}>
          ⚙️ Konfiguracja gry
        </h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(Object.keys(LABELS) as (keyof GameConfig)[]).map(key => (
          <div
            key={key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12,
              padding: '14px 18px',
              gap: 16,
            }}>
            <div>
              <div style={{ color: '#C0C0C0', fontSize: '0.9rem', marginBottom: 2 }}>
                {LABELS[key].label}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.72rem', letterSpacing: 0.5 }}>
                {LABELS[key].desc}
              </div>
            </div>
            <input
              type="number"
              value={config[key]}
              onChange={e => update(key, Number(e.target.value))}
              style={{
                width: 88,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: 8,
                padding: '8px 10px',
                color: '#FFD700',
                fontFamily: 'monospace',
                fontSize: '1rem',
                textAlign: 'right',
                outline: 'none',
                flexShrink: 0,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
