import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import spinner from '../assets/plm-spinner.png'

// Delay before the overlay appears (skips flash on near-instant loads) and the
// minimum time it stays visible once shown (avoids a 1-frame flicker).
const SHOW_DELAY_MS = 150
const MIN_VISIBLE_MS = 400
// Fixed cosmetic duration for route-change pulses (no real async route boundary exists).
const ROUTE_TRANSITION_MS = 350

interface LoadingOverlayContextValue {
  begin: () => void
  end: () => void
}

const LoadingOverlayContext = createContext<LoadingOverlayContextValue | null>(null)

function RouteTransitionWatcher(): null {
  const location = useLocation()
  const ctx = useContext(LoadingOverlayContext)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    ctx?.begin()
    const timer = setTimeout(() => ctx?.end(), ROUTE_TRANSITION_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  return null
}

export function LoadingOverlayProvider({
  children
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const countRef = useRef(0)
  const shownAtRef = useRef(0)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [visible, setVisible] = useState(false)

  const begin = useCallback(() => {
    countRef.current += 1
    if (countRef.current !== 1) return
    clearTimeout(hideTimerRef.current)
    showTimerRef.current = setTimeout(() => {
      shownAtRef.current = Date.now()
      setVisible(true)
    }, SHOW_DELAY_MS)
  }, [])

  const end = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1)
    if (countRef.current !== 0) return
    clearTimeout(showTimerRef.current)
    setVisible((current) => {
      if (!current) return current
      const elapsed = Date.now() - shownAtRef.current
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed)
      hideTimerRef.current = setTimeout(() => setVisible(false), remaining)
      return current
    })
  }, [])

  const value = useMemo(() => ({ begin, end }), [begin, end])

  return (
    <LoadingOverlayContext.Provider value={value}>
      <RouteTransitionWatcher />
      {children}
      {visible && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <img className="loading-overlay__spinner" src={spinner} alt="" />
          <div className="loading-overlay__text">Yükleniyor...</div>
        </div>
      )}
    </LoadingOverlayContext.Provider>
  )
}

/** Links a page's own `loading` boolean to the shared full-screen overlay. */
// eslint-disable-next-line react-refresh/only-export-components -- context + hook colocated by design
export function useGlobalLoading(active: boolean): void {
  const ctx = useContext(LoadingOverlayContext)

  useEffect(() => {
    if (!active) return
    ctx?.begin()
    return () => ctx?.end()
  }, [active, ctx])
}
