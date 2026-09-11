interface Option<T extends string> {
  value: T
  label: string
  /** Tooltip explaining the option, when the label alone doesn't say enough. */
  title?: string
}

interface SegmentedControlProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  /** Classes for the active pill. Defaults to the gold brand accent. */
  activeClassName?: string
  /** Names the group for screen readers — what is being chosen. */
  ariaLabel?: string
  /** 'sm' for a control living in a toolbar strip rather than a form. */
  size?: 'md' | 'sm'
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  activeClassName = 'bg-accent-500 text-accent-ink',
  ariaLabel,
  size = 'md',
}: SegmentedControlProps<T>) {
  const sizing = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded-full bg-surface-3 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          title={opt.title}
          className={`rounded-full ${sizing} font-semibold transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500
            ${value === opt.value ? activeClassName : 'text-text-muted hover:text-text'}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
