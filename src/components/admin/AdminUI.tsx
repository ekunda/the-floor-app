// ─────────────────────────────────────────────────────────────────────────────
// AdminUI — wspólne komponenty panelu admina
//
// Cel: spójny wygląd + reliability across all admin pages.
//      Każdy komponent wspiera loading/disabled/error states out-of-the-box.
// ─────────────────────────────────────────────────────────────────────────────
import { forwardRef, ReactNode } from 'react'
import { Toast, useToast } from '../../hooks/useToast'

// ══════════════════════════════════════════════════════════════════════════════
// TOKENS (spójne kolory + style w całym panelu)
// ══════════════════════════════════════════════════════════════════════════════
export const T = {
  bg:        '#080808',
  bg2:       '#0a0a0a',
  bg3:       '#111',
  border:    'rgba(255,255,255,0.08)',
  borderHi:  'rgba(255,255,255,0.15)',
  surface:   'rgba(255,255,255,0.03)',
  surface2:  'rgba(255,255,255,0.05)',
  text:      '#fff',
  textDim:   'rgba(255,255,255,0.6)',
  textDim2:  'rgba(255,255,255,0.35)',
  textDim3:  'rgba(255,255,255,0.2)',
  gold:      '#D4AF37',
  goldBright:'#FFD700',
  silver:    '#C0C0C0',
  mp:        '#818cf8',    // multiplayer accent (indigo)
  success:   '#4ade80',
  warning:   '#facc15',
  danger:    '#f87171',
  dangerHi:  '#ef4444',
  info:      '#818cf8',
  option:    '#181818',    // dropdown option background
} as const

// ══════════════════════════════════════════════════════════════════════════════
// AdminButton — button z wbudowanym loading state
// ══════════════════════════════════════════════════════════════════════════════
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
type Size = 'sm' | 'md' | 'lg'

export interface AdminButtonProps {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: Variant
  size?: Size
  loading?: boolean
  disabled?: boolean
  icon?: string
  title?: string
  style?: React.CSSProperties
  fullWidth?: boolean
}

export const AdminButton = forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton(
  { children, onClick, type='button', variant='primary', size='md',
    loading=false, disabled=false, icon, title, style, fullWidth }, ref
) {
  const isDisabled = disabled || loading

  const sizeStyle: Record<Size, React.CSSProperties> = {
    sm: { padding: '5px 10px', fontSize: '0.75rem', borderRadius: 6 },
    md: { padding: '8px 14px', fontSize: '0.85rem', borderRadius: 8 },
    lg: { padding: '11px 20px', fontSize: '0.95rem', borderRadius: 10, letterSpacing: 2 },
  }

  const variantStyle: Record<Variant, React.CSSProperties> = {
    primary:   { background: isDisabled ? 'rgba(212,175,55,0.2)' : 'linear-gradient(135deg,#D4AF37,#FFD700)', color: isDisabled ? 'rgba(0,0,0,0.4)' : '#000', border: 'none', fontWeight: 700 },
    secondary: { background: 'rgba(255,255,255,0.04)', color: T.textDim, border: `1px solid ${T.border}` },
    danger:    { background: 'rgba(239,68,68,0.1)', color: T.danger, border: '1px solid rgba(239,68,68,0.3)' },
    success:   { background: 'rgba(34,197,94,0.15)', color: T.success, border: '1px solid rgba(34,197,94,0.4)' },
    ghost:     { background: 'transparent', color: T.textDim2, border: 'none' },
  }

  return (
    <button
      ref={ref}
      type={type}
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      title={title}
      style={{
        ...sizeStyle[size], ...variantStyle[variant],
        fontFamily: "'Montserrat', sans-serif",
        cursor: isDisabled ? 'default' : 'pointer',
        opacity: isDisabled && !loading ? 0.5 : loading ? 0.75 : 1,
        transition: 'all 0.15s',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        width: fullWidth ? '100%' : 'auto',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {loading ? <span>⏳</span> : icon && <span>{icon}</span>}
      {children}
    </button>
  )
})

// ══════════════════════════════════════════════════════════════════════════════
// AdminInput — input z consistent styling
// ══════════════════════════════════════════════════════════════════════════════
export interface AdminInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: Size
}

export const AdminInput = forwardRef<HTMLInputElement, AdminInputProps>(function AdminInput(
  { size = 'md', style, ...props }, ref
) {
  const sizeStyle: Record<Size, React.CSSProperties> = {
    sm: { padding: '6px 10px', fontSize: '0.8rem', borderRadius: 6 },
    md: { padding: '8px 12px', fontSize: '0.9rem', borderRadius: 8 },
    lg: { padding: '11px 14px', fontSize: '0.95rem', borderRadius: 10 },
  }
  return (
    <input
      ref={ref}
      {...props}
      style={{
        background: T.surface2, border: `1px solid ${T.borderHi}`,
        color: T.text, fontFamily: "'Montserrat', sans-serif",
        outline: 'none', width: '100%', boxSizing: 'border-box',
        ...sizeStyle[size], ...style,
      }}
    />
  )
})

// ══════════════════════════════════════════════════════════════════════════════
// AdminSelect — select z dark-theme option
// ══════════════════════════════════════════════════════════════════════════════
export interface AdminSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: Array<{ value: string | number; label: string }>
  size?: Size
}

export function AdminSelect({ options, size = 'md', style, ...props }: AdminSelectProps) {
  const sizeStyle: Record<Size, React.CSSProperties> = {
    sm: { padding: '5px 28px 5px 10px', fontSize: '0.8rem', borderRadius: 6 },
    md: { padding: '7px 28px 7px 12px', fontSize: '0.88rem', borderRadius: 8 },
    lg: { padding: '10px 32px 10px 14px', fontSize: '0.95rem', borderRadius: 10 },
  }
  return (
    <select
      {...props}
      style={{
        background: T.surface2, border: `1px solid ${T.borderHi}`,
        color: T.text, fontFamily: "'Montserrat', sans-serif",
        outline: 'none', cursor: 'pointer', colorScheme: 'dark',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.4)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
        ...sizeStyle[size], ...style,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: T.option, color: T.text }}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Card — sekcja / karta
// ══════════════════════════════════════════════════════════════════════════════
export function Card({ children, style, padding = 16 }: { children: ReactNode; style?: React.CSSProperties; padding?: number | string }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding, ...style,
    }}>{children}</div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SectionTitle — nagłówek sekcji
// ══════════════════════════════════════════════════════════════════════════════
export function SectionTitle({ icon, title, action }: { icon?: string; title: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
      {icon && <span style={{ fontSize: '1.1rem' }}>{icon}</span>}
      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: 4, color: T.textDim, flex: 1 }}>
        {title}
      </span>
      {action}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// InfoBox — hint box z kolorem
// ══════════════════════════════════════════════════════════════════════════════
export function InfoBox({ children, color = T.gold }: { children: ReactNode; color?: string }) {
  return (
    <div style={{
      padding: '10px 14px', background: color + '10', border: `1px solid ${color}30`,
      borderRadius: 10, marginBottom: 16, fontSize: '0.82rem', color: T.textDim,
    }}>{children}</div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ConfirmDialog — modalna confirmacja
// ══════════════════════════════════════════════════════════════════════════════
export interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message, confirmLabel = 'Potwierdź', cancelLabel = 'Anuluj',
  danger = false, loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.bg3, border: `1px solid ${danger ? 'rgba(239,68,68,0.4)' : 'rgba(212,175,55,0.3)'}`,
          borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', textAlign: 'center',
        }}>
        <div style={{ fontSize: '2rem', marginBottom: 10 }}>{danger ? '⚠️' : '❓'}</div>
        <div style={{
          fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.2rem', letterSpacing: 3,
          color: danger ? T.danger : T.gold, marginBottom: 10,
        }}>{title}</div>
        {message && (
          <div style={{ color: T.textDim, fontSize: '0.88rem', marginBottom: 22, lineHeight: 1.5 }}>{message}</div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <AdminButton
            onClick={onConfirm} loading={loading} fullWidth
            variant={danger ? 'danger' : 'primary'} size="lg"
          >{confirmLabel}</AdminButton>
          <AdminButton onClick={onCancel} disabled={loading} variant="ghost" size="lg">
            {cancelLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ToastContainer — renderuje aktywne toasty (globalne)
// ══════════════════════════════════════════════════════════════════════════════
export function ToastContainer() {
  const { items, dismiss } = useToast()
  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 8,
      pointerEvents: 'none', maxWidth: 'calc(100vw - 32px)',
    }}>
      {items.map(t => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const color = toast.kind === 'success' ? T.success
              : toast.kind === 'error'   ? T.danger
              : toast.kind === 'warning' ? T.warning
              : T.info
  const icon  = toast.kind === 'success' ? '✓'
              : toast.kind === 'error'   ? '⚠'
              : toast.kind === 'warning' ? '!'
              : 'ℹ'
  return (
    <div style={{
      pointerEvents: 'auto',
      padding: '11px 14px',
      background: color + '18', border: `1px solid ${color}55`,
      borderRadius: 10, color,
      display: 'flex', alignItems: 'center', gap: 10,
      minWidth: 260, maxWidth: 440,
      fontSize: '0.85rem', fontFamily: "'Montserrat', sans-serif",
      animation: 'slideInToast 0.2s ease-out',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    }}>
      <style>{`@keyframes slideInToast{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, lineHeight: 1.4, wordBreak: 'break-word' }}>{toast.message}</span>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color, cursor: 'pointer', fontSize: '1rem', padding: 0, flexShrink: 0, opacity: 0.6 }}
        title="Zamknij"
      >✕</button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EmptyState — placeholder gdy brak danych
// ══════════════════════════════════════════════════════════════════════════════
export function EmptyState({ icon = '📭', title, description }: { icon?: string; title: string; description?: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: 48, border: `1px dashed ${T.border}`,
      borderRadius: 12, color: T.textDim3,
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: '0.95rem', marginBottom: description ? 6 : 0 }}>{title}</div>
      {description && <div style={{ fontSize: '0.78rem', color: T.textDim3 }}>{description}</div>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// LoadingOverlay
// ══════════════════════════════════════════════════════════════════════════════
export function Loading({ text = 'Ładowanie…' }: { text?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 40, color: T.textDim3, fontSize: '0.85rem' }}>
      {text}
    </div>
  )
}
