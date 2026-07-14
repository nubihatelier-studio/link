import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  label: string
  children: ReactNode
}

export function IconButton({ active, label, children, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors
        ${active ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text-muted hover:text-text hover:bg-surface-3'}
        disabled:opacity-30 disabled:pointer-events-none ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
