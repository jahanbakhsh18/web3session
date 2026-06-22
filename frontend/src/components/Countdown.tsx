import { useState, useEffect } from 'react'

type Props = {
  /** Unix seconds timestamp the countdown counts down to. */
  targetUnixSecs: number
  /** Shown once the countdown reaches zero. */
  expiredLabel: string
}

function formatDuration(totalSecs: number): string {
  if (totalSecs <= 0) return '0:00'
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function Countdown({ targetUnixSecs, expiredLabel }: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])

  const remaining = targetUnixSecs - now

  if (remaining <= 0) {
    return <span className="note-error">{expiredLabel}</span>
  }

  return <span className="mono">{formatDuration(remaining)}</span>
}
