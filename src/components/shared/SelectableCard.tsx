import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface SelectableCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  selected: boolean
  className?: string
  children: ReactNode
}

/**
 * Selectable option tile — a single accessible <button aria-pressed> shared
 * by every "pick one of these" grid in the app (technique, bead type, both
 * in the configurator and in photo→pattern). Previously each screen had its
 * own version — a non-interactive `<div>` in one, a bare `<button>` in the
 * other — so keyboard/screen-reader support depended on which screen you
 * were on.
 */
export function SelectableCard({ selected, className = '', children, ...rest }: SelectableCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500
        ${selected ? 'border-accent-500 bg-accent-500/10' : 'border-border bg-surface-2 hover:border-accent-300'}
        ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
