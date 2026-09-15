import type { BrickDrop } from '@/engine/types'
import { BrickDropIcon } from '@/components/icons/BrickDropIcon'
import { SelectableCard } from './SelectableCard'
import { t } from '@/i18n/es'

const DROPS: BrickDrop[] = [1, 2, 3]

/** 1-drop, 2-drop or 3-drop — shared by "Crear patrón" and the editor's Forma panel. */
export function BrickDropPicker({ value, onChange, compact = false }: { value: BrickDrop; onChange: (drop: BrickDrop) => void; compact?: boolean }) {
  return (
    <div role="group" aria-label={t.brickDrop.title} className="grid grid-cols-3 gap-2">
      {DROPS.map((drop) => (
        <SelectableCard
          key={drop}
          selected={value === drop}
          onClick={() => onChange(drop)}
          className={`flex flex-col items-center gap-1 text-center ${compact ? '!p-2' : 'py-3'}`}
        >
          <span className="text-accent-500">
            <BrickDropIcon drop={drop} size={compact ? 32 : 44} />
          </span>
          <span className="text-xs font-semibold">{t.brickDrop.name(drop)}</span>
          {!compact && <span className="text-[11px] text-text-muted">{t.brickDrop.perStitch(drop)}</span>}
        </SelectableCard>
      ))}
    </div>
  )
}
