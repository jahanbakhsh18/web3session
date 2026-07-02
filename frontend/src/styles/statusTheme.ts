import type { SessionStatusLabel } from '../hooks/useSessionData'

export type StatusTheme = {
  label: string
  fg: string
  bg: string
}

export const STATUS_THEME: Record<SessionStatusLabel, StatusTheme> = {
  Open:      { label: 'Open',     fg: 'var(--stone)',    bg: 'var(--paper-dim)' },
  Escrowed:  { label: 'Escrowed', fg: 'var(--pending)',  bg: 'var(--pending-bg)' },
  Active:    { label: 'Active',   fg: 'var(--verified)', bg: 'var(--verified-bg)' },
  Completed: { label: 'Completed',fg: 'var(--verified)', bg: 'var(--verified-bg)' },
  Disputed:  { label: 'Disputed', fg: 'var(--seal)',     bg: 'var(--seal-bg)' },
  Refunded:  { label: 'Refunded', fg: 'var(--stone)',    bg: 'var(--paper-dim)' },
}

export function getStatusTheme(status: string): StatusTheme {
  return STATUS_THEME[status as SessionStatusLabel] ?? STATUS_THEME.Refunded
}