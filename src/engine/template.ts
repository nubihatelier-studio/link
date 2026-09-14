import type { PatternDoc } from './types'

/**
 * How a pattern is made from a template: the whole design as it was saved
 * (`'full'`), or only its shape — size, technique, body shape, fringe and
 * loop — with an empty tray and nothing painted (`'shape'`). Chosen each
 * time the template is used, so one saved template serves both.
 */
export type TemplateMode = 'full' | 'shape'

/** A template of `source`, as it is right now: a copy, so editing the pattern later never changes it. */
export function templateFromPattern(source: PatternDoc, name: string, id: string, now: number): PatternDoc {
  return { ...source, id, name, isTemplate: true, createdAt: now, updatedAt: now }
}

/** A new, ordinary pattern from `template` — a copy, so editing it never changes the template. */
export function patternFromTemplate(template: PatternDoc, mode: TemplateMode, id: string, name: string, now: number): PatternDoc {
  const { isTemplate: _isTemplate, ...rest } = template
  const doc: PatternDoc = { ...rest, id, name, createdAt: now, updatedAt: now }
  if (mode === 'full') return doc

  // Only the shape: what's painted and what the colors are called go; what
  // decides the silhouette stays. A woven loop keeps its color — a ring
  // can't be woven without one, and it's changed in the loop panel.
  const { palette: _palette, letters: _letters, note: _note, ...shape } = doc
  return {
    ...shape,
    cells: {},
    ...(doc.pair ? { pair: doc.pair.mode === 'independent' ? { mode: 'independent', rightCells: {} } : doc.pair } : {}),
  }
}

/** `name`, or "name 2", "name 3"… — the first one no pattern in `taken` already has. */
export function uniqueName(name: string, taken: string[]): string {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()))
  if (!used.has(name.trim().toLowerCase())) return name
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}

/** The template already saved under `name` (ignoring case and spaces at the ends), if any. */
export function templateNamed(templates: PatternDoc[], name: string): PatternDoc | undefined {
  const wanted = name.trim().toLowerCase()
  return templates.find((tpl) => tpl.name.trim().toLowerCase() === wanted)
}
