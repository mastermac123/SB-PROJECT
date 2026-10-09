import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { hhmm, isoDate } from '@/lib/format'
import type { MatchResult, Place, SearchQuery } from '@/lib/types'
import { ApiError, onSync, searchRides } from '@/services/api'

type Status = 'idle' | 'loading' | 'done' | 'error'

type SearchCtx = {
  query: SearchQuery | null
  results: MatchResult[] | null
  ridesInWindow: number
  status: Status
  error: ApiError | null
  run: (q: SearchQuery) => Promise<void>
  retry: () => void
  setQuery: (q: SearchQuery) => void
}

const Ctx = createContext<SearchCtx | null>(null)
const KEY = 'ridesync:search'

export function defaultQuery(pickup: Place, drop?: Place): SearchQuery {
  // Next quarter hour, at least 30 minutes out.
  const d = new Date(Date.now() + 30 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return { pickup, drop: drop ?? pickup, date: isoDate(d), time: hhmm(d), at: d.toISOString(), seats: 1, preferences: [] }
}

/** Attach the absolute instant for the rider's local date + time. */
export function withInstant(q: SearchQuery): SearchQuery {
  return { ...q, at: new Date(`${q.date}T${q.time}:00`).toISOString() }
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQueryState] = useState<SearchQuery | null>(() => {
    try {
      const raw = sessionStorage.getItem(KEY)
      return raw ? (JSON.parse(raw) as SearchQuery) : null
    } catch {
      return null
    }
  })
  const [results, setResults] = useState<MatchResult[] | null>(null)
  const [ridesInWindow, setRidesInWindow] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<ApiError | null>(null)
  const seq = useRef(0)

  const setQuery = useCallback((q: SearchQuery) => {
    setQueryState(q)
    try {
      sessionStorage.setItem(KEY, JSON.stringify(q))
    } catch {
      /* ignore */
    }
  }, [])

  const run = useCallback(
    async (raw: SearchQuery) => {
      const q = withInstant(raw)
      const id = ++seq.current
      setQuery(q)
      setStatus('loading')
      setError(null)
      try {
        const [r] = await Promise.all([searchRides(q), new Promise((ok) => setTimeout(ok, 600))])
        if (id !== seq.current) return
        setResults(r.results)
        setRidesInWindow(r.ridesInWindow)
        setStatus('done')
      } catch (e) {
        if (id !== seq.current) return
        setError(e instanceof ApiError ? e : new ApiError('network', 'Something went wrong. Try again.'))
        setStatus('error')
      }
    },
    [setQuery],
  )

  // Keep results live: re-run quietly when rides change anywhere in the community.
  const latest = useRef<{ query: SearchQuery | null; status: Status }>({ query, status })
  latest.current = { query, status }
  useEffect(
    () =>
      onSync(async () => {
        const { query: q, status: st } = latest.current
        if (!q || st !== 'done') return
        const id = seq.current
        try {
          const r = await searchRides(q)
          if (id !== seq.current) return
          setResults(r.results)
          setRidesInWindow(r.ridesInWindow)
        } catch {
          /* keep current results */
        }
      }),
    [],
  )

  const retry = useCallback(() => {
    if (query) void run(query)
  }, [query, run])

  return <Ctx.Provider value={{ query, results, ridesInWindow, status, error, run, retry, setQuery }}>{children}</Ctx.Provider>
}

export function useSearch() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSearch outside SearchProvider')
  return c
}

/** Results page: re-run the saved query after a reload. */
export function useEnsureResults() {
  const s = useSearch()
  useEffect(() => {
    if (s.query && s.status === 'idle') void s.run(s.query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return s
}
