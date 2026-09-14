/** The editor's zoom range, in percent — `editorStore.setZoom` clamps to it. */
export const MIN_ZOOM = 25
export const MAX_ZOOM = 400

/** Positions on the zoom slider. Enough that one step is well under a percent of zoom. */
export const ZOOM_SLIDER_STEPS = 1000

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
}

/**
 * Where a zoom sits on the slider. The scale is proportional, not linear:
 * 25% to 400% is a factor of 16, and on a straight line the first quarter of
 * the track would cover everything a whole pattern needs (25–120%) while the
 * last quarter crawled through close-ups — a millimetre of finger jumped 5
 * points at 30% and barely moved at 300%. Proportionally, the same movement
 * multiplies the zoom by the same amount wherever it happens.
 */
export function zoomToSlider(zoom: number): number {
  const t = Math.log(clampZoom(zoom) / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)
  return Math.round(t * ZOOM_SLIDER_STEPS)
}

/** The zoom at a slider position — the inverse of `zoomToSlider`, rounded to a whole percent. */
export function sliderToZoom(position: number): number {
  const t = Math.max(0, Math.min(ZOOM_SLIDER_STEPS, position)) / ZOOM_SLIDER_STEPS
  return Math.round(MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, t))
}
