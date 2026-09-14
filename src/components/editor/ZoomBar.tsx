import { useEditorStore } from '@/store/editorStore'
import { sliderToZoom, ZOOM_SLIDER_STEPS, zoomToSlider } from '@/lib/zoomScale'
import { t } from '@/i18n/es'

/** What the − / + buttons move — the same step as the keyboard shortcuts. */
const ZOOM_BUTTON_STEP = 25

/**
 * Zoom controls above the canvas: − and + for a quick jump, and a slider in
 * between for landing on exactly the size wanted. Pinching is quick but loose
 * — the fingers overshoot and the zoom follows every tremble — which is what
 * the slider is for on a phone.
 */
export function ZoomBar() {
  const zoom = useEditorStore((s) => s.zoom)
  const setZoom = useEditorStore((s) => s.setZoom)
  const buttonClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-lg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 md:h-8 md:w-8'
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setZoom(zoom - ZOOM_BUTTON_STEP)} aria-label={t.editor.zoomOut} className={buttonClass}>
        −
      </button>
      <input
        type="range"
        min={0}
        max={ZOOM_SLIDER_STEPS}
        value={zoomToSlider(zoom)}
        onChange={(e) => setZoom(sliderToZoom(Number(e.target.value)))}
        aria-label={t.editor.zoom}
        aria-valuetext={`${zoom}%`}
        className="h-2 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 accent-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 md:max-w-48 md:flex-none md:w-48"
      />
      <button onClick={() => setZoom(zoom + ZOOM_BUTTON_STEP)} aria-label={t.editor.zoomIn} className={buttonClass}>
        +
      </button>
      <span className="w-12 shrink-0 text-center text-sm font-semibold tabular-nums">{zoom}%</span>
    </div>
  )
}
