import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'standard' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  fullWidth?: boolean
  icon?: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent-500 text-accent-ink hover:bg-accent-400 active:bg-accent-600 shadow-sm shadow-accent-500/30',
  // Plain/standard blue — no brand or catalog color, for screens that shouldn't carry the gold accent.
  standard: 'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 shadow-sm shadow-blue-600/30',
  secondary: 'bg-surface-2 text-text hover:bg-surface-3 border border-border',
  ghost: 'bg-transparent text-text hover:bg-surface-2',
  danger: 'bg-transparent text-red-500 hover:bg-red-500/10',
}

export function Button({
  variant = 'primary',
  fullWidth,
  icon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold
        transition-colors disabled:opacity-40 disabled:pointer-events-none
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500
        ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
