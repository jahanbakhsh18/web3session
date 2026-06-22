import { getStatusTheme } from '../styles/statusTheme'

/**
 * Compact status badge for list contexts (dashboard rows).
 */
export function StatusPill({ status }: { status: string }) {
  const theme = getStatusTheme(status)

  const pillVars = {
    '--pill-bg': theme.bg,
    '--pill-fg': theme.fg,
  } as React.CSSProperties

  return (
    <span className="status-pill" style={pillVars}>
      {theme.label}
    </span>
  )
}
