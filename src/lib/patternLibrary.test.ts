import { describe, expect, it } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import { filterPatternsByName, sortPatterns } from './patternLibrary'

function pattern(overrides: Partial<PatternDoc>): PatternDoc {
  return {
    id: 'p',
    name: 'x',
    config: { technique: 'loom', cols: 4, rows: 4, beadTypeId: 'miyuki-delica-11' },
    cells: {},
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

describe('filterPatternsByName', () => {
  const patterns = [pattern({ id: '1', name: 'Aro con flecos' }), pattern({ id: '2', name: 'Pulsera azul' })]

  it('returns everything for a blank query', () => {
    expect(filterPatternsByName(patterns, '')).toEqual(patterns)
    expect(filterPatternsByName(patterns, '   ')).toEqual(patterns)
  })

  it('matches a case-insensitive substring of the name', () => {
    expect(filterPatternsByName(patterns, 'ARO')).toEqual([patterns[0]])
    expect(filterPatternsByName(patterns, 'pulsera')).toEqual([patterns[1]])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterPatternsByName(patterns, 'marcapáginas')).toEqual([])
  })
})

describe('sortPatterns', () => {
  const patterns = [
    pattern({ id: '1', name: 'Zeta', updatedAt: 100, config: { technique: 'peyote', cols: 4, rows: 4, beadTypeId: 'x' } }),
    pattern({ id: '2', name: 'África', updatedAt: 300, config: { technique: 'loom', cols: 4, rows: 4, beadTypeId: 'x' } }),
    pattern({ id: '3', name: 'medio', updatedAt: 200, config: { technique: 'brick', cols: 4, rows: 4, beadTypeId: 'x' } }),
  ]

  it('"recent": most recently updated first, matching the existing default order', () => {
    expect(sortPatterns(patterns, 'recent').map((p) => p.id)).toEqual(['2', '3', '1'])
  })

  it('"name": alphabetical (locale-aware)', () => {
    expect(sortPatterns(patterns, 'name').map((p) => p.id)).toEqual(['2', '3', '1'])
  })

  it('"technique": grouped by technique name, most recent first within a group', () => {
    // brick < loom < peyote alphabetically
    expect(sortPatterns(patterns, 'technique').map((p) => p.id)).toEqual(['3', '2', '1'])
  })

  it('does not mutate the input array', () => {
    const original = [...patterns]
    sortPatterns(patterns, 'name')
    expect(patterns).toEqual(original)
  })
})
