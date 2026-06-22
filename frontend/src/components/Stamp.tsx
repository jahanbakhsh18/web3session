import { useEffect, useState, useRef } from 'react'
import { getStatusTheme } from '../styles/statusTheme'
import type { SessionStatusLabel } from '../hooks/useSessionData'

const STAMP_ROTATION: Record<SessionStatusLabel, number> = {
  Open: 0, Escrowed: -6, Active: 4, Completed: -3, Disputed: 7, Refunded: -5,
}

/**
 * The signature element of the app: 
 * a circular stamp, like a notary's seal, that "thuds" into place when the status it represents changes.
 */
export function Stamp({ status }: { status: SessionStatusLabel }) {
  const theme = getStatusTheme(status)
  const rotation = STAMP_ROTATION[status] ?? -5
  const [justChanged, setJustChanged] = useState(false)
  const prevStatus = useRef(status)

  useEffect(() => {
    if (prevStatus.current !== status) {
      setJustChanged(true)
      prevStatus.current = status
      const t = setTimeout(() => setJustChanged(false), 200)
      return () => clearTimeout(t)
    }
  }, [status])

  const stampVars = {
    '--stamp-color': theme.fg,
    '--stamp-bg': theme.bg,
    '--stamp-rotation': `${rotation}deg`,
  } as React.CSSProperties

  return (
    <div className={`stamp ${justChanged ? 'stamp-pulse' : ''}`} style={stampVars}>
      <span className="stamp-label">{theme.label}</span>
    </div>
  )
}
