import { useEditorPrefsStore, type EditorPanelTab } from '@/store/editorPrefsStore'
import { ColorPanel } from './ColorPanel'
import { ShapePanel } from './ShapePanel'
import { FringePanel } from './FringePanel'
import { LoopPanel } from './LoopPanel'
import { t } from '@/i18n/es'

interface EditorPanelTabsProps {
  /** Brick and its relatives can be shaped; loom can't. */
  shapeCapable: boolean
  fringeCapable: boolean
  /** The right earring of a pair takes its loop from the left one. */
  loopCapable: boolean
}

/**
 * Written out, with no icons: the four names have to fit across a 320px
 * column at once. An icon each pushed "Argolla" off the edge of a row that
 * scrolls without a visible scrollbar — a tab nobody can see isn't a tab.
 */
const TABS: { id: EditorPanelTab; label: string }[] = [
  { id: 'colors', label: t.editor.colorsTitle },
  { id: 'shape', label: t.editor.shape.shortTitle },
  { id: 'fringe', label: t.editor.fringe.shortTitle },
  { id: 'loop', label: t.editor.loop.shortTitle },
]

/**
 * The desktop sidebar, one panel at a time.
 *
 * The four used to be stacked in the same 320px column, each capped at 256px
 * tall: Forma listed every row of the piece through a four-row window, and
 * the colours — the panel open all day — got whatever was left. Now each one
 * gets the whole height and the tabs say what else is there.
 *
 * The phone doesn't go through here: its panels are already one at a time,
 * in bottom sheets opened from the toolbar.
 */
export function EditorPanelTabs({ shapeCapable, fringeCapable, loopCapable }: EditorPanelTabsProps) {
  const panelTab = useEditorPrefsStore((s) => s.panelTab)
  const setPanelTab = useEditorPrefsStore((s) => s.setPanelTab)

  const available = TABS.filter(
    (tab) =>
      tab.id === 'colors' ||
      (tab.id === 'shape' && shapeCapable) ||
      (tab.id === 'fringe' && fringeCapable) ||
      (tab.id === 'loop' && loopCapable),
  )
  // A pattern without that tab shows the colours instead — without overwriting
  // the remembered choice, which still holds for the next pattern that has it.
  const active = available.some((tab) => tab.id === panelTab) ? panelTab : 'colors'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label={t.editor.panelsLabel}
        className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-b border-border p-2"
      >
        {available.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            id={`editor-tab-${id}`}
            aria-selected={active === id}
            aria-controls={`editor-panel-${id}`}
            onClick={() => setPanelTab(id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500
              ${active === id ? 'bg-accent-500 text-accent-ink' : 'bg-surface-2 text-text hover:bg-surface-3'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`editor-panel-${active}`}
        aria-labelledby={`editor-tab-${active}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {active === 'colors' && <ColorPanel />}
        {active === 'shape' && <ShapePanel embedded />}
        {active === 'fringe' && <FringePanel embedded />}
        {active === 'loop' && <LoopPanel embedded />}
      </div>
    </div>
  )
}
