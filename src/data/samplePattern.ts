import type { ColorMap, FringeData, PatternConfig } from '@/engine/types'
import { createFringeLengths } from '@/engine/fringe'
import { cellKey } from '@/engine/cellKey'

const GOLD = '#c9a227'
const TEAL = '#2f5b66'

export interface SamplePattern {
  name: string
  config: PatternConfig
  cells: ColorMap
  fringe: FringeData
}

/**
 * A small, ready-made "aro con flecos" shown on first launch (see
 * `storage/onboarding.ts`) instead of a blank empty home screen —
 * deliberately shows off this sprint's headline feature (fringe) right
 * away: a striped gold/teal body with a tapered fringe hanging below it,
 * turn beads marked on every column.
 */
export function buildSamplePattern(): SamplePattern {
  const cols = 8
  const rows = 6
  const config: PatternConfig = { technique: 'brick', cols, rows, beadTypeId: 'miyuki-delica-11' }

  const cells: ColorMap = {}
  for (let row = 0; row < rows; row++) {
    const hex = row < 2 || row >= 4 ? GOLD : TEAL
    for (let col = 0; col < cols; col++) cells[cellKey(row, col)] = hex
  }

  const lengths = createFringeLengths('v', cols, 6)
  const turnBeads = lengths.map((len) => len > 0)
  for (let col = 0; col < cols; col++) {
    const hex = col % 2 === 0 ? GOLD : TEAL
    for (let depth = 0; depth < lengths[col]; depth++) cells[cellKey(rows + depth, col)] = hex
  }

  return { name: 'Aro de muestra 🪶', config, cells, fringe: { lengths, turnBeads } }
}
