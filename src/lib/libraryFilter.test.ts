import { describe, expect, it } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import { matchesLibraryFilter, weaveStatusOf } from './libraryFilter'

const doc = (over: Partial<PatternDoc> = {}): PatternDoc => ({
  id: 'p_1',
  name: 'Flor',
  config: { technique: 'brick', cols: 4, rows: 4, beadTypeId: 'miyuki-delica-11' },
  cells: {},
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('estado de tejido de un patrón', () => {
  it('sin progreso no está empezado; con una mostacilla marcada está en progreso; con "Terminar", terminado', () => {
    expect(weaveStatusOf(doc(), {})).toBe('notStarted')
    expect(weaveStatusOf(doc(), { p_1: { currentIndex: -1 } })).toBe('notStarted')
    expect(weaveStatusOf(doc(), { p_1: { currentIndex: 3 } })).toBe('inProgress')
    expect(weaveStatusOf(doc(), { p_1: { currentIndex: 3, finishedAt: 9 } })).toBe('finished')
  })

  it('un par de aros está terminado sólo con los dos aros terminados', () => {
    const par = doc({ pair: { mode: 'mirror' } })
    expect(weaveStatusOf(par, { p_1: { currentIndex: 20, finishedAt: 9 } })).toBe('inProgress')
    expect(weaveStatusOf(par, { p_1: { currentIndex: 20, finishedAt: 9 }, 'p_1#derecho': { currentIndex: 20, finishedAt: 10 } })).toBe('finished')
  })

  it('cada filtro deja pasar lo suyo', () => {
    const fav = doc({ favorite: true })
    expect(matchesLibraryFilter(fav, 'notStarted', 'all')).toBe(true)
    expect(matchesLibraryFilter(fav, 'notStarted', 'favorites')).toBe(true)
    expect(matchesLibraryFilter(doc(), 'notStarted', 'favorites')).toBe(false)
    expect(matchesLibraryFilter(doc(), 'inProgress', 'inProgress')).toBe(true)
    expect(matchesLibraryFilter(doc(), 'finished', 'inProgress')).toBe(false)
    expect(matchesLibraryFilter(doc(), 'finished', 'finished')).toBe(true)
  })
})
