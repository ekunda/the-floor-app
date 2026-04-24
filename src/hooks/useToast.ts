// ─────────────────────────────────────────────────────────────────────────────
// useToast — globalny system powiadomień (zastępuje alert + inline errors)
//
// API:
//   const toast = useToast()
//   toast.success('Zapisano!')
//   toast.error('Błąd zapisu')
//   toast.info('Odświeżam dane...')
//
// Komponent wyświetlający: <ToastContainer /> (z AdminUI.tsx)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  duration: number
}

// ── Globalny store bez zewnętrznych bibliotek ─────────────────────────────────
let toasts: Toast[] = []
const listeners = new Set<(t: Toast[]) => void>()

function emit() { listeners.forEach(l => l(toasts)) }

function push(kind: ToastKind, message: string, duration = 3500) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const toast: Toast = { id, kind, message, duration }
  toasts = [...toasts, toast]
  emit()
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    emit()
  }, duration)
  return id
}

function dismiss(id: string) {
  toasts = toasts.filter(t => t.id !== id)
  emit()
}

/** Globalne API — użyteczne poza komponentami React (np. w stores). */
export const toast = {
  success: (msg: string, duration?: number) => push('success', msg, duration),
  error:   (msg: string, duration?: number) => push('error',   msg, duration ?? 5000),
  info:    (msg: string, duration?: number) => push('info',    msg, duration),
  warning: (msg: string, duration?: number) => push('warning', msg, duration),
  dismiss,
}

/** React hook — subskrybuje listę toastów, zwraca aktualny stan + API. */
export function useToast() {
  const [items, setItems] = useState<Toast[]>(toasts)
  useEffect(() => {
    listeners.add(setItems)
    return () => { listeners.delete(setItems) }
  }, [])
  return { items, ...toast }
}
