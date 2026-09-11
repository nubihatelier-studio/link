import { useState } from 'react'
import { X } from 'lucide-react'
import { isPairCapable } from '@/engine/pair'
import type { PairData } from '@/engine/types'
import { useEditorStore } from '@/store/editorStore'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { UndoToast } from '@/components/shared/UndoToast'
import { t } from '@/i18n/es'

/**
 * Everything about an earring pair, in one strip above the canvas — on
 * phone and desktop alike, since which earring you're looking at is part of
 * reading the canvas itself, not a setting tucked into a side panel.
 *
 * With no pair: a single "+ Par de aros" chip. With one: which earring is on
 * screen, and how the right one is kept (live mirror, or its own colours).
 * The two changes that throw something away — going back to the mirror, or
 * removing a pair whose right earring had its own colours — act at once and
 * offer undo, like every other destructive action in the app.
 */
export function PairBar() {
  const technique = useEditorStore((s) => s.technique)
  const pair = useEditorStore((s) => s.pair)
  const side = useEditorStore((s) => s.side)
  const setSide = useEditorStore((s) => s.setSide)
  const setPair = useEditorStore((s) => s.setPair)
  const splitPairColors = useEditorStore((s) => s.splitPairColors)
  const [undo, setUndo] = useState<{ message: string; previous: PairData | undefined } | null>(null)

  if (!isPairCapable(technique)) return null

  function changeMode(mode: PairData['mode']) {
    if (!pair || mode === pair.mode) return
    if (mode === 'independent') {
      splitPairColors()
      return
    }
    // Back to the mirror: the right earring's own colours go.
    setUndo({ message: t.editor.pair.remirrored, previous: pair })
    setPair({ mode: 'mirror' })
  }

  function removePair() {
    if (!pair) return
    // A mirror loses nothing by going away — it's re-derived if the pair comes back.
    if (pair.mode === 'independent') setUndo({ message: t.editor.pair.removed, previous: pair })
    setPair(undefined)
  }

  return (
    <div className="mb-3 flex flex-col gap-2">
      {!pair ? (
        <button
          onClick={() => setPair({ mode: 'mirror' })}
          title={t.editor.pair.createHint}
          className="self-start rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-3"
        >
          {t.editor.pair.create}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            ariaLabel={t.editor.pair.sideLabel}
            size="sm"
            value={side}
            onChange={setSide}
            options={[
              { value: 'left', label: t.editor.pair.left },
              { value: 'right', label: t.editor.pair.right },
            ]}
          />
          <SegmentedControl
            ariaLabel={t.editor.pair.mirror}
            size="sm"
            value={pair.mode}
            onChange={changeMode}
            options={[
              { value: 'mirror', label: t.editor.pair.mirror, title: t.editor.pair.mirrorHint },
              { value: 'independent', label: t.editor.pair.independent, title: t.editor.pair.independentHint },
            ]}
          />
          <button
            onClick={removePair}
            aria-label={t.editor.pair.remove}
            title={t.editor.pair.remove}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {pair && side === 'right' && <p className="text-xs text-text-muted">{t.editor.pair.shapeFollowsLeft}</p>}

      {undo && (
        <UndoToast
          message={undo.message}
          onUndo={() => {
            setPair(undo.previous)
            setUndo(null)
          }}
          onExpire={() => setUndo(null)}
        />
      )}
    </div>
  )
}
