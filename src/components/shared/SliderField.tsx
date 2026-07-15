import type { ReactNode } from 'react'

interface SliderFieldProps {
  label: string
  icon?: ReactNode
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (value: number) => void
  /** Native range input accent-color class. Defaults to the gold brand accent. */
  trackAccentClassName?: string
}

export function SliderField({
  label,
  icon,
  value,
  min,
  max,
  suffix,
  onChange,
  trackAccentClassName = 'accent-accent-500',
}: SliderFieldProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`h-2 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${trackAccentClassName}`}
        />
        <div className="flex items-center gap-1 rounded-xl bg-surface-3 px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-500">
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
            className="w-12 bg-transparent text-center text-[15px] font-semibold text-text outline-none"
          />
          {suffix && <span className="text-xs text-text-muted whitespace-nowrap">{suffix}</span>}
        </div>
      </div>
    </div>
  )
}
