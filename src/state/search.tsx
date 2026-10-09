import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { hhmm, isoDate } from '@/lib/format'
import type { MatchResult, Place, SearchQuery } from '@/lib/types'
import { ApiError, searchRides } from '@/services/api'

type Status = 'idle' | 'loading' | 'done' | 'error'

type SearchCtx = {
  query: SearchQuery | null
  results: MatchResult[] | null
  status: Status
  error: ApiError | null
  run: (q: SearchQuery) => Promise<void>
  retry: () => void
  setQuery: (q: SearchQuery) => void
}

const Ctx = createContext<SearchCtx | null>(null)
const KEY = 'ridesync:search'

export function defaultQuery(pickup: Place, drop?: Place): SearchQuery {
  // Next half hour, at least 30 minutes out.
  const d = new Date(Date.now() + 30 * 60_000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return { pickup, drop: drop ?? pickup, date: isoDate(d), time: hhmm(d), seats: 1, preferences: [] }
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
    async (q: SearchQuery) => {
      const id = ++seq.current
      setQuery(q)
      setStatus('loading')
      setError(null)
      try {
        const r = await searchRides(q)
        if (id !== seq.current) return
        setResults(r)
        setStatus('done')
      } catch (e) {
        if (id !== seq.current) return
        setError(e instanceof ApiError ? e : new ApiError('network', 'Something went wrong. Try again.'))
        setStatus('error')
      }
    },
    [setQuery],
  )

  const retry = useCallback(() => {
    if (query) void run(query)
  }, [query, run])

  return <Ctx.Provider value={{ query, results, status, error, run, retry, setQuery }}>{children}</Ctx.Provider>
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
