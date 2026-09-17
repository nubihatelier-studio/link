import { describe, expect, it } from 'vitest'
import type { PatternDoc } from './types'
import { suggestDifficulty } from './difficulty'

function doc(over: Omit<Partial<PatternDoc>, 'config'> & { config?: Partial<PatternDoc['config']> } = {}): PatternDoc {
  const { config, ...rest } = over
  return {
    id: 'p',
    name: 'x',
    config: { technique: 'loom', cols: 6, rows: 20, beadTypeId: 'miyuki-delica-11', ...config },
    cells: { '0,0': '#111111', '0,1': '#222222' },
    createdAt: 0,
    updatedAt: 0,
    ...rest,
  }
}

describe('dificultad propuesta', () => {
  it('una pulsera chica de dos colores es fácil', () => {
    expect(suggestDifficulty(doc())).toBe('facil')
  })

  it('muchas mostacillas y muchos colores la suben', () => {
    const cells: Record<string, string> = {}
    for (let i = 0; i < 40; i++) cells[`${i},0`] = `#00000${(i % 8).toString(16)}`
    expect(suggestDifficulty(doc({ config: { cols: 10, rows: 60 }, cells }))).toBe('intermedio')
    // Más del doble de mostacillas, con los mismos ocho colores: avanzado.
    expect(suggestDifficulty(doc({ config: { cols: 12, rows: 90 }, cells }))).toBe('avanzado')
  })

  it('un aro con aumentos, flecos y argolla tejida es avanzado', () => {
    expect(
      suggestDifficulty(
        doc({
          config: { technique: 'brick', cols: 8, rows: 10 },
          rowShape: Array.from({ length: 10 }, (_, r) => ({ offset: 0, length: Math.min(8, r + 1) })),
          fringe: { lengths: Array(8).fill(6), turnBeads: Array(8).fill(true) },
          loop: { variant: 'woven', beadCount: 8, color: '#111111' },
        }),
      ),
    ).toBe('avanzado')
  })

  it('solo flecos, sin más, queda intermedio', () => {
    expect(
      suggestDifficulty(doc({ fringe: { lengths: Array(6).fill(4), turnBeads: Array(6).fill(false) } })),
    ).toBe('intermedio')
  })
})
