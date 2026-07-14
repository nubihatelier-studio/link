import type { BeadTypeDef } from '@/engine/types'

/**
 * Bead type catalog, independent from the UI so it's trivial to extend with
 * more sizes/brands later (8/0, 15/0, Delica 10/0, Toho, Preciosa, Matubo...).
 * `id` is stable and used everywhere a pattern references a bead type.
 */
export const BEAD_TYPES: BeadTypeDef[] = [
  {
    id: 'miyuki-delica-11',
    brand: 'Miyuki',
    line: 'Delica',
    size: '11/0',
    label: 'Miyuki Delica 11/0',
    widthMm: 1.6,
    heightMm: 1.3,
    shape: 'cylinder',
  },
  {
    id: 'rocalla-11',
    brand: 'Genérico',
    line: 'Rocalla',
    size: '11/0',
    label: 'Rocalla 11/0',
    widthMm: 2.1,
    heightMm: 1.5,
    shape: 'round',
  },
  // Próximos hitos (fuera de alcance de esta iteración, dejar estructura lista):
  // { id: 'miyuki-delica-10', brand: 'Miyuki', line: 'Delica', size: '10/0', label: 'Miyuki Delica 10/0', widthMm: 1.8, heightMm: 1.4, shape: 'cylinder' },
  // { id: 'miyuki-delica-8',  brand: 'Miyuki', line: 'Delica', size: '8/0',  label: 'Miyuki Delica 8/0',  widthMm: 3.0, heightMm: 2.7, shape: 'cylinder' },
  // { id: 'rocalla-15',       brand: 'Genérico', line: 'Rocalla', size: '15/0', label: 'Rocalla 15/0', widthMm: 1.5, heightMm: 1.1, shape: 'round' },
  // { id: 'toho-11',          brand: 'Toho', line: 'Redonda', size: '11/0', label: 'Toho 11/0', widthMm: 2.2, heightMm: 1.9, shape: 'round' },
]

export function getBeadType(id: string): BeadTypeDef {
  const found = BEAD_TYPES.find((b) => b.id === id)
  return found ?? BEAD_TYPES[0]
}
