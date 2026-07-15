interface Option<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  /** Classes for the active pill. Defaults to the gold brand accent. */
  activeClassName?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  activeClassName = 'bg-accent-500 text-accent-ink',
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-full bg-surface-3 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500
            ${value === opt.value ? activeClassName : 'text-text-muted hover:text-text'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
