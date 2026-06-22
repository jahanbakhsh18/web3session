import { useEffect } from 'react'
import type { ReactNode } from 'react'

type Props = {
  onClose: () => void
  children: ReactNode
}

/**
 * Generic overlay shell used for both BookSession and SessionPage. The dashboard underneath always stays mounted 
 */
export function Modal({ onClose, children }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Back to dashboard" className="modal-close-btn">
          ×
        </button>

        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}