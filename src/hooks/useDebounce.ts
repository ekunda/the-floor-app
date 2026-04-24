// ─────────────────────────────────────────────────────────────────────────────
// useDebounce — opóźnia aktualizację wartości o N ms
// useDebouncedCallback — opóźnia wywołanie callback-u o N ms
//
// Cel: zmniejszyć liczbę requestów do Supabase przy szybkich zmianach
//      (np. suwaki, search inputs)
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Zwraca wartość z opóźnieniem. Po każdej zmianie `value` startuje timer
 * na `delay` ms. Jeśli wartość zmieni się przed upływem timera — reset.
 *
 * Użycie: dla search inputów, filtrów, itp.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/**
 * Zwraca funkcję, która wywołuje `callback` z opóźnieniem. Każde kolejne
 * wywołanie resetuje timer. Idealne dla suwaków / frequently-changing inputs.
 *
 * Użycie:
 *   const debouncedUpdate = useDebouncedCallback((v: number) => save(v), 400)
 *   <input onChange={e => debouncedUpdate(Number(e.target.value))} />
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay = 400
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cbRef = useRef(callback)

  // Zawsze aktualny callback (unikamy stale closures)
  useEffect(() => { cbRef.current = callback }, [callback])

  // Cleanup timera przy unmount
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const debounced = useCallback((...args: A) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      cbRef.current(...args)
      timerRef.current = null
    }, delay)
  }, [delay])

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const flush = useCallback((...args: A) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    cbRef.current(...args)
  }, [])

  return { debounced, cancel, flush }
}
