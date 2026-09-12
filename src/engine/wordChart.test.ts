import { describe, expect, it } from 'vitest'
import type { ColorMap, FringeData, LoopData } from './types'
import { buildWordChart, wordChartRuns } from './wordChart'

const A = 'A'
const B = 'B'
function letterForHex(hex: string): string {
  return hex === '#111111' ? A : B
}

describe('buildWordChart — loom (unchanged)', () => {
  it('one line per row, run-length encoded left to right', () => {
    const cells: ColorMap = {
      '0,0': '#111111',
      '0,1': '#111111',
      '0,2': '#111111',
      '0,3': '#222222',
      '1,0': '#222222',
      '1,1': '#111111',
    }
    const lines = buildWordChart('loom', 4, 2, cells, letterForHex)
    expect(lines).toEqual([
      { unitIndex: 0, text: '3A, 1B' },
      { unitIndex: 1, text: `1B, 1A, 2${'–'}` },
    ])
  })

  it('collapses uncolored cells into the empty-slot token instead of dropping them', () => {
    const lines = buildWordChart('loom', 3, 1, {}, letterForHex)
    expect(lines).toEqual([{ unitIndex: 0, text: '3–' }])
  })

  it('returns one line per unit even for a 1xN or Nx1 grid', () => {
    const lines = buildWordChart('loom', 1, 4, { '0,0': '#111111', '2,0': '#222222' }, letterForHex)
    expect(lines).toHaveLength(4)
    expect(lines.map((l) => l.unitIndex)).toEqual([0, 1, 2, 3])
  })
})

describe('buildWordChart — brick (de arriba hacia abajo, serpentina, fila base)', () => {
  it('la primera línea es la fila de arriba (isBaseRow), leída de izquierda a derecha; la siguiente se lee al revés', () => {
    const cells: ColorMap = {
      '0,0': '#111111',
      '0,1': '#111111',
      '0,2': '#111111',
      '0,3': '#222222',
      '1,0': '#222222',
      '1,1': '#111111',
    }
    const lines = buildWordChart('brick', 4, 2, cells, letterForHex)
    expect(lines).toEqual([
      // fila 0 (la primera, fila base) — se lee de la columna 0 a la 3
      { unitIndex: 0, text: '3A, 1B', isBaseRow: true },
      // fila 1 — se lee de la columna 3 a la 0: vacía, vacía, A, B
      { unitIndex: 1, text: '2–, 1A, 1B' },
    ])
  })
})

describe('buildWordChart — peyote (primera pasada = la fila 1, después pasadas de a una)', () => {
  it('la primera línea es la base (la fila 1, de izquierda a derecha); después, una línea por pasada', () => {
    const cells: ColorMap = {
      '0,0': '#111111',
      '0,1': '#222222',
      '1,0': '#111111',
      '1,1': '#222222',
    }
    const lines = buildWordChart('peyote', 2, 2, cells, letterForHex)
    // 2 de ancho: la columna de la derecha (1) es la alta, así que la pasada 1
    // es la suya y la pasada 2 la de la izquierda.
    expect(lines).toEqual([
      { unitIndex: 0, text: '1A, 1B', isPass: true },
      { unitIndex: 1, text: '1B', isPass: true },
      { unitIndex: 2, text: '1A', isPass: true },
    ])
  })

  it('una pasada cuenta las mostacillas que van a la aguja: "Pasada N: 3A, 2B" son cinco', () => {
    // 10 de ancho: cada pasada toma 5 posiciones alternadas.
    const cells: ColorMap = {}
    for (let col = 0; col < 10; col++) {
      cells[`0,${col}`] = '#111111'
      // Fila 2: las columnas impares (altas en 10 de ancho — la pasada 1) van A, A, A, B, B.
      cells[`1,${col}`] = col % 2 === 1 && col >= 7 ? '#222222' : '#111111'
      cells[`2,${col}`] = '#111111'
    }
    const lines = buildWordChart('peyote', 10, 3, cells, letterForHex)
    const firstPass = lines.find((l) => l.isPass && l.unitIndex === 1)!
    // La pasada va rtl (columnas 9, 7, 5, 3, 1), así que las dos B van primero.
    expect(firstPass.text).toBe('2B, 3A')
    const beadsInLine = firstPass.text.split(', ').reduce((sum, token) => sum + parseInt(token, 10), 0)
    expect(beadsInLine).toBe(5)
  })
})

describe('buildWordChart with a fringe', () => {
  it('leaves body lines untouched when no fringe is given', () => {
    const cells: ColorMap = { '0,0': '#111111', '0,1': '#111111' }
    expect(buildWordChart('brick', 2, 1, cells, letterForHex)).toEqual([{ unitIndex: 0, text: '2A', isBaseRow: true }])
  })

  it('appends one fringe line per column with a fringe, after every body line', () => {
    const cells: ColorMap = {
      '0,0': '#111111',
      '0,1': '#111111',
      // column 0 fringe: depth 0 and 1, hanging below row 1 (rows=1)
      '1,0': '#111111',
      '2,0': '#222222',
    }
    const fringe: FringeData = { lengths: [2, 0], turnBeads: [true, false] }
    const lines = buildWordChart('brick', 2, 1, cells, letterForHex, fringe)
    expect(lines).toEqual([
      { unitIndex: 0, text: '2A', isBaseRow: true },
      { unitIndex: 0, text: '1A, 1B, giro', isFringe: true },
    ])
  })

  it('skips columns with no fringe (length 0) entirely', () => {
    const fringe: FringeData = { lengths: [0, 3], turnBeads: [false, false] }
    const cells: ColorMap = { '1,1': '#111111', '2,1': '#111111', '3,1': '#222222' }
    const lines = buildWordChart('loom', 2, 1, cells, letterForHex, fringe)
    expect(lines.filter((l) => l.isFringe)).toEqual([{ unitIndex: 1, text: '2A, 1B', isFringe: true }])
  })

  it('collapses uncolored fringe beads into the empty-slot token', () => {
    const fringe: FringeData = { lengths: [1], turnBeads: [false] }
    const lines = buildWordChart('loom', 1, 1, {}, letterForHex, fringe)
    expect(lines).toEqual([
      { unitIndex: 0, text: `1${'–'}` },
      { unitIndex: 0, text: `1${'–'}`, isFringe: true },
    ])
  })

  it('omits the ", giro" suffix when the column has no turn bead', () => {
    const fringe: FringeData = { lengths: [2], turnBeads: [false] }
    const cells: ColorMap = { '1,0': '#111111', '2,0': '#111111' }
    const lines = buildWordChart('loom', 1, 1, cells, letterForHex, fringe)
    expect(lines.find((l) => l.isFringe)?.text).toBe('2A')
  })
})

describe('buildWordChart with a shaped (rowShape) body', () => {
  it('a narrower row produces a shorter line, not a padded/dropped one', () => {
    // Triángulo de 3 columnas y 2 filas: la fila 0 tiene 1 columna (centrada) y la fila 1 ocupa todo el ancho.
    const rowShape = [
      { offset: 1, length: 1 },
      { offset: 0, length: 3 },
    ]
    const cells: ColorMap = { '0,1': '#111111', '1,0': '#111111', '1,1': '#222222', '1,2': '#111111' }
    const lines = buildWordChart('brick', 3, 2, cells, letterForHex, undefined, rowShape)
    expect(lines).toEqual([
      { unitIndex: 0, text: '1A', isBaseRow: true },
      { unitIndex: 1, text: '1A, 1B, 1A' },
    ])
  })

  it('fringe still only appends under the columns the last (shaped) row reaches', () => {
    const rowShape = [
      { offset: 0, length: 3 },
      { offset: 1, length: 1 }, // last row tapers to the single center column
    ]
    const fringe: FringeData = { lengths: [2, 2, 2], turnBeads: [false, false, false] }
    const cells: ColorMap = { '2,1': '#111111', '3,1': '#222222' }
    const lines = buildWordChart('brick', 3, 2, cells, letterForHex, fringe, rowShape)
    const fringeLines = lines.filter((l) => l.isFringe)
    expect(fringeLines).toEqual([{ unitIndex: 1, text: '1A, 1B', isFringe: true }])
  })

  it('an omitted rowShape leaves output byte-identical to before', () => {
    const cells: ColorMap = { '0,0': '#111111', '0,1': '#222222' }
    expect(buildWordChart('loom', 2, 1, cells, letterForHex)).toEqual(
      buildWordChart('loom', 2, 1, cells, letterForHex, undefined, undefined),
    )
  })
})

describe('buildWordChart with a woven loop (Tarea 3)', () => {
  const cells: ColorMap = { '0,0': '#111111', '0,1': '#222222', '1,0': '#111111', '1,1': '#222222' }

  it('appends its own line at the very end, all beads the loop\'s uniform color (not looked up from `cells`)', () => {
    const loop: LoopData = { variant: 'woven', beadCount: 8, color: '#222222' }
    const lines = buildWordChart('loom', 2, 2, cells, letterForHex, undefined, undefined, loop)
    expect(lines[lines.length - 1]).toEqual({ unitIndex: 0, text: '8B', isLoop: true })
  })

  it('no loop line at all for a metal loop, or when there\'s no loop', () => {
    const metalLoop: LoopData = { variant: 'metal', beadCount: 0, color: '#111111' }
    const withMetal = buildWordChart('loom', 2, 2, cells, letterForHex, undefined, undefined, metalLoop)
    const withNone = buildWordChart('loom', 2, 2, cells, letterForHex)
    expect(withMetal.some((l) => l.isLoop)).toBe(false)
    expect(withMetal).toEqual(withNone)
  })

  it('comes after the fringe lines, still its own separate line', () => {
    const fringe: FringeData = { lengths: [1, 1], turnBeads: [false, false] }
    const loop: LoopData = { variant: 'woven', beadCount: 5, color: '#111111' }
    const lines = buildWordChart('loom', 2, 2, cells, letterForHex, fringe, undefined, loop)
    const loopLineIndex = lines.findIndex((l) => l.isLoop)
    expect(loopLineIndex).toBe(lines.length - 1)
    expect(lines[loopLineIndex - 1].isFringe).toBe(true)
  })
})

describe('wordChartRuns', () => {
  it('parte una línea en sus tramos, en orden', () => {
    expect(wordChartRuns('3A, 2B, 1A')).toEqual({ runs: [{ count: 3, letter: 'A' }, { count: 2, letter: 'B' }, { count: 1, letter: 'A' }], turn: false })
  })

  it('reconoce el giro del fleco, letras dobles y mostacillas sin pintar', () => {
    expect(wordChartRuns('12AB, 3–, giro')).toEqual({ runs: [{ count: 12, letter: 'AB' }, { count: 3, letter: '–' }], turn: true })
  })

  it('una línea vacía no tiene tramos', () => {
    expect(wordChartRuns('')).toEqual({ runs: [], turn: false })
  })

  it('los tramos suman exactamente las mostacillas del recorrido de esa línea', () => {
    const cells: ColorMap = { '0,0': '#111111', '0,1': '#222222', '0,2': '#222222', '1,0': '#111111' }
    const lines = buildWordChart('loom', 3, 2, cells, letterForHex)
    const total = lines.flatMap((l) => wordChartRuns(l.text).runs).reduce((sum, r) => sum + r.count, 0)
    expect(total).toBe(6)
  })
})
