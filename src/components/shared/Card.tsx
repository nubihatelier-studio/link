import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean
  interactive?: boolean
}

export function Card({ selected, interactive, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border bg-surface-2 p-4 transition-colors
        ${selected ? 'border-accent-500 bg-accent-500/10' : 'border-transparent'}
        ${interactive ? 'cursor-pointer hover:border-accent-300' : ''}
        ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}
