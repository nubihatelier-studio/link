import type { ReactNode } from 'react'
import { SelectableCard } from './SelectableCard'

interface IconSelectableCardProps {
  selected: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  description: string
}

/**
 * Icon + title + description tile — the shared shape behind the
 * configurator's two "elige una" rows (plantilla, técnica). Padding, gap and
 * text treatment are fixed here instead of per screen, so the two rows can't
 * quietly drift apart the way they did when each one carried its own
 * `className` (different padding, different gap, different icon size).
 */
export function IconSelectableCard({ selected, onClick, icon, label, description }: IconSelectableCardProps) {
  return (
    <SelectableCard
      selected={selected}
      onClick={onClick}
      className="flex h-full flex-col items-center justify-center gap-2 py-5 text-center"
    >
      <span className="flex h-10 w-10 items-center justify-center">{icon}</span>
      <p className="font-semibold">{label}</p>
      <p className="text-xs text-text-muted">{description}</p>
    </SelectableCard>
  )
}
