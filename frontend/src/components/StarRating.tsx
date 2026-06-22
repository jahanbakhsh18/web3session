type Props = {
  value: number
  onChange: (score: number) => void
  disabled?: boolean
}

export function StarRating({ value, onChange, disabled }: Props) {
  return (
    <div className="row row-gap-xs">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          disabled={disabled}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          className={`star-button ${n <= value ? 'filled' : 'empty'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}