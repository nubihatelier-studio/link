import { useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

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

/**
 * A number with three ways in, because each one fails somewhere: the slider
 * is quick but imprecise, typing is exact but fiddly with a pencil on a
 * tablet (the field would keep the old digit and end up at 1), and the −/+
 * buttons are the only ones that always land on the number meant, one step
 * at a time. Typing also holds what's half-written: "2" on the way to "20"
 * is kept as text instead of being snapped to the minimum under the finger.
 */
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
  /** What's typed while it's being typed; null when the field just shows `value`. */
  const [typing, setTyping] = useState<string | null>(null)
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const step = (delta: number) => {
    setTyping(null)
    onChange(clamp(value + delta))
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            setTyping(null)
            onChange(Number(e.target.value))
          }}
          className={`h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 ${trackAccentClassName}`}
        />
        <StepButton label={`${label} −`} disabled={value <= min} onClick={() => step(-1)}>
          <Minus size={16} />
        </StepButton>
        <div className="flex items-center gap-1 rounded-xl bg-surface-3 px-2 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-500">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={typing ?? value}
            // Selected on focus: on a tablet a tap used to land the cursor next
            // to the old digit, so typing "20" left "120" or "1".
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const text = e.target.value
              setTyping(text)
              const parsed = Number(text)
              if (text !== '' && Number.isFinite(parsed)) onChange(clamp(parsed))
            }}
            onBlur={() => setTyping(null)}
            className="w-10 bg-transparent text-center text-[15px] font-semibold text-text outline-none"
          />
          {suffix && <span className="whitespace-nowrap text-xs text-text-muted">{suffix}</span>}
        </div>
        <StepButton label={`${label} +`} disabled={value >= max} onClick={() => step(1)}>
          <Plus size={16} />
        </StepButton>
      </div>
    </div>
  )
}

/** Big enough to hit with a finger or a pencil — that's the whole point of it. */
function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
    >
      {children}
    </button>
  )
}
