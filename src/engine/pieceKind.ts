import type { PatternDoc, PieceKind } from './types'

/** Every kind of piece, in the order they're offered and filtered by. */
export const PIECE_KINDS: PieceKind[] = ['pulsera', 'aro', 'anillo', 'collar', 'tobillera', 'llavero', 'otro']

/** What the Plantillas screen can be narrowed to: everything, or one kind of piece. */
export type KindFilter = 'all' | PieceKind

/**
 * The filters worth offering for `templates`: "all", then only the kinds some
 * template actually is — a chip that would show nothing is just noise.
 */
export function kindFiltersFor(templates: PatternDoc[]): KindFilter[] {
  const present = new Set(templates.map((tpl) => tpl.kind).filter(Boolean))
  return ['all', ...PIECE_KINDS.filter((kind) => present.has(kind))]
}

/** Whether `tpl` shows under `filter`. A template nobody labelled only shows under "all". */
export function matchesKind(tpl: PatternDoc, filter: KindFilter): boolean {
  return filter === 'all' || tpl.kind === filter
}
