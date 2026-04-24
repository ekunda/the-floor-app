// ─────────────────────────────────────────────────────────────────────────────
// useAsyncAction — wrapper do async akcji w admin UI
//
// Rozwiązuje:
//  - podwójne kliknięcia (guard flagą loading)
//  - silent failures (try/catch + onError)
//  - stale state (inFlight ref = źródło prawdy)
//  - cleanup po unmount (ignoruje set-state po unmount)
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react'

type AsyncFn<A extends unknown[], R> = (...args: A) => Promise<R>

export interface AsyncActionOpts {
  onError?: (err: Error) => void
  onSuccess?: () => void
}

/**
 * Zwraca `{ run, loading, error }` — owija async funkcję w:
 *   - loading guard (blokuje kolejne wywołania podczas in-flight)
 *   - error handling (łapie i wystawia `error` + opcjonalny `onError`)
 *   - mount-safe set-state (ignoruje po unmount)
 *
 * Użycie:
 *   const { run: save, loading } = useAsyncAction(async () => {
 *     await supabase.from('x').update({...})
 *   }, { onError: e => toast.error(e.message) })
 *
 *   <button onClick={save} disabled={loading}>{loading ? '⏳' : 'Save'}</button>
 */
export function useAsyncAction<A extends unknown[], R>(
  fn: AsyncFn<A, R>,
  opts: AsyncActionOpts = {}
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const fnRef = useRef(fn)
  const optsRef = useRef(opts)

  useEffect(() => { fnRef.current = fn }, [fn])
  useEffect(() => { optsRef.current = opts }, [opts])
  useEffect(() => () => { mounted.current = false }, [])

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (inFlight.current) return undefined
    inFlight.current = true
    if (mounted.current) { setLoading(true); setError(null) }
    try {
      const result = await fnRef.current(...args)
      if (mounted.current) optsRef.current.onSuccess?.()
      return result
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e))
      if (mounted.current) setError(err)
      optsRef.current.onError?.(err)
      return undefined
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    if (mounted.current) setError(null)
  }, [])

  return { run, loading, error, reset }
}
