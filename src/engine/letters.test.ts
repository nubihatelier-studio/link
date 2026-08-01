import { describe, expect, it } from 'vitest'
import type { ColorMap } from './types'
import { assignLetters, letterForIndex, letterMap, type LetterPattern } from './letters'
import { cellKey } from './cellKey'

/** Letters in order, e.g. ['A','B','C'] — the shape most assertions here care about. */
function letters(entries: { letter: string }[]): string[] {
  return entries.map((e) => e.letter)
}

/** hex → letter, for asserting a specific color's label. */
function labels(entries: { hex: string; letter: string }[]): Record<string, string> {
  return Object.fromEntries(entries.map((e) => [e.hex, e.letter]))
}

const RED = '#ff0000'
const GREEN = '#00ff00'
const BLUE = '#0000ff'
const PINK = '#ff00ff'

describe('letterForIndex — desbordamiento explícito (Tarea 1.4)', () => {
  it('las primeras 26 son siempre una sola letra', () => {
    const first26 = Array.from({ length: 26 }, (_, i) => letterForIndex(i))
    expect(first26[0]).toBe('A')
    expect(first26[25]).toBe('Z')
    for (const letter of first26) expect(letter).toHaveLength(1)
  })

  it('la letra doble recién aparece en el color 27, y sigue sin repetirse', () => {
    expect(letterForIndex(26)).toBe('AA')
    expect(letterForIndex(27)).toBe('AB')
    expect(letterForIndex(51)).toBe('AZ')
    expect(letterForIndex(52)).toBe('BA')
  })

  it('nunca entrega dos veces la misma etiqueta', () => {
    const all = Array.from({ length: 200 }, (_, i) => letterForIndex(i))
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('assignLetters — orden de primer uso en el recorrido de tejido (Tarea 1.1)', () => {
  it('(a) tres colores pintados reciben A, B y C según el orden en que se tejen', () => {
    // Loom se teje fila por fila, siempre de izquierda a derecha: la primera
    // mostacilla es (0,0), así que el color de esa celda es A.
    const cells: ColorMap = {
      [cellKey(0, 0)]: GREEN,
      [cellKey(0, 1)]: RED,
      [cellKey(1, 0)]: BLUE,
      [cellKey(1, 1)]: RED,
    }
    const entries = assignLetters({ technique: 'loom', cols: 2, rows: 2, cells })
    expect(labels(entries)).toEqual({ [GREEN]: 'A', [RED]: 'B', [BLUE]: 'C' })
  })

  it('el orden es el del tejido, no el de conteo: un color muy usado que aparece tarde no se adelanta', () => {
    const cells: ColorMap = {
      [cellKey(0, 0)]: GREEN, // una sola mostacilla, pero es la primera que se teje
      [cellKey(0, 1)]: RED,
      [cellKey(1, 0)]: RED,
      [cellKey(1, 1)]: RED,
    }
    const entries = assignLetters({ technique: 'loom', cols: 2, rows: 2, cells })
    expect(labels(entries)).toEqual({ [GREEN]: 'A', [RED]: 'B' })
    expect(entries.find((e) => e.hex === RED)!.count).toBe(3)
  })

  it('brick arranca por la fila más ancha (la de abajo), y las letras lo siguen', () => {
    // brick teje de la fila más ancha hacia la punta: la primera mostacilla
    // tejida está en la última fila de los datos, no en la primera.
    const cells: ColorMap = {
      [cellKey(0, 0)]: RED, // punta: se teje al final
      [cellKey(1, 0)]: BLUE, // fila base: se teje primero
    }
    const entries = assignLetters({ technique: 'brick', cols: 1, rows: 2, cells })
    expect(labels(entries)).toEqual({ [BLUE]: 'A', [RED]: 'B' })
  })
})

describe('assignLetters — la paleta no otorga letras (Tarea 1.1, test b)', () => {
  it('(b) un color agregado pero nunca pintado no recibe letra ni entrada', () => {
    const cells: ColorMap = { [cellKey(0, 0)]: RED, [cellKey(0, 1)]: GREEN }
    const entries = assignLetters({ technique: 'loom', cols: 2, rows: 1, cells })

    expect(letters(entries)).toEqual(['A', 'B'])
    // PINK está en la paleta de quien teje, pero no en ninguna celda.
    expect(entries.some((e) => e.hex === PINK)).toBe(false)
    expect(letterMap({ technique: 'loom', cols: 2, rows: 1, cells }).get(PINK)).toBeUndefined()
  })

  it('(b, cont.) al pintarlo por primera vez recibe la letra siguiente', () => {
    const cells: ColorMap = {
      [cellKey(0, 0)]: RED,
      [cellKey(0, 1)]: GREEN,
      [cellKey(0, 2)]: BLUE,
      [cellKey(0, 3)]: PINK, // el cuarto, recién pintado
    }
    const entries = assignLetters({ technique: 'loom', cols: 4, rows: 1, cells })
    expect(labels(entries)).toEqual({ [RED]: 'A', [GREEN]: 'B', [BLUE]: 'C', [PINK]: 'D' })
  })
})

describe('assignLetters — estabilidad y liberación (Tarea 1.2 y 1.3)', () => {
  const base: ColorMap = {
    [cellKey(0, 0)]: RED,
    [cellKey(0, 1)]: GREEN,
    [cellKey(0, 2)]: BLUE,
  }

  it('(d) agregar, quitar o reordenar colores de la paleta no mueve las letras de los usados', () => {
    // La paleta no es un parámetro de assignLetters: por construcción, lo
    // único que puede mover una letra es un cambio en las celdas. Este test
    // fija esa garantía — mismas celdas, misma asignación, siempre.
    const before = assignLetters({ technique: 'loom', cols: 3, rows: 1, cells: base })
    const after = assignLetters({ technique: 'loom', cols: 3, rows: 1, cells: { ...base } })
    expect(labels(after)).toEqual(labels(before))
    expect(labels(before)).toEqual({ [RED]: 'A', [GREEN]: 'B', [BLUE]: 'C' })
  })

  it('pintar más mostacillas de un color ya usado no cambia ninguna letra', () => {
    const grown: ColorMap = { ...base, [cellKey(1, 0)]: BLUE, [cellKey(1, 1)]: BLUE }
    const entries = assignLetters({ technique: 'loom', cols: 3, rows: 2, cells: grown })
    expect(labels(entries)).toMatchObject({ [RED]: 'A', [GREEN]: 'B', [BLUE]: 'C' })
    expect(entries.find((e) => e.hex === BLUE)!.count).toBe(3)
  })

  it('(c) borrar del diseño todas las mostacillas de B: los demás conservan identidad y no quedan huecos', () => {
    const withoutGreen: ColorMap = { [cellKey(0, 0)]: RED, [cellKey(0, 2)]: BLUE }
    const entries = assignLetters({ technique: 'loom', cols: 3, rows: 1, cells: withoutGreen })

    expect(letters(entries)).toEqual(['A', 'B']) // sin huecos: no queda una "C" suelta
    expect(labels(entries)).toEqual({ [RED]: 'A', [BLUE]: 'B' })
    expect(entries.some((e) => e.hex === GREEN)).toBe(false)
    // RED, que iba primero, sigue siendo A — sólo se corrió lo que venía después.
    expect(labels(entries)[RED]).toBe('A')
  })

  it('(f) reemplazar un color por otro mantiene letras y conteos coherentes', () => {
    // GREEN (B) se reemplaza por PINK en todo el patrón: PINK hereda la
    // posición de primer uso, y con ella la letra B y el conteo.
    const replaced: ColorMap = {
      [cellKey(0, 0)]: RED,
      [cellKey(0, 1)]: PINK,
      [cellKey(0, 2)]: BLUE,
    }
    const entries = assignLetters({ technique: 'loom', cols: 3, rows: 1, cells: replaced })
    expect(labels(entries)).toEqual({ [RED]: 'A', [PINK]: 'B', [BLUE]: 'C' })
    expect(entries.find((e) => e.hex === PINK)!.count).toBe(1)
  })

  it('(f, fusión) reemplazar un color por otro ya usado fusiona conteos y libera la letra', () => {
    const merged: ColorMap = {
      [cellKey(0, 0)]: RED,
      [cellKey(0, 1)]: RED, // GREEN fusionado en RED
      [cellKey(0, 2)]: BLUE,
    }
    const entries = assignLetters({ technique: 'loom', cols: 3, rows: 1, cells: merged })
    expect(labels(entries)).toEqual({ [RED]: 'A', [BLUE]: 'B' })
    expect(entries.find((e) => e.hex === RED)!.count).toBe(2)
  })
})

describe('assignLetters — cantidad de colores usados (Tarea 1.4, test e)', () => {
  /** Una fila de `n` colores distintos, todos pintados. */
  function rowOfDistinctColors(n: number): LetterPattern {
    const cells: ColorMap = {}
    for (let i = 0; i < n; i++) cells[cellKey(0, i)] = `#${i.toString(16).padStart(6, '0')}`
    return { technique: 'loom', cols: n, rows: 1, cells }
  }

  it('1 color usado: una sola entrada, "A"', () => {
    expect(letters(assignLetters(rowOfDistinctColors(1)))).toEqual(['A'])
  })

  it('(e) 26 colores usados: llega hasta la Z y ninguna etiqueta es doble', () => {
    const entries = assignLetters(rowOfDistinctColors(26))
    expect(entries).toHaveLength(26)
    expect(entries[25].letter).toBe('Z')
    for (const e of entries) expect(e.letter).toHaveLength(1)
  })

  it('(e) 27 colores usados: la 27 es "AA", según la regla documentada', () => {
    const entries = assignLetters(rowOfDistinctColors(27))
    expect(entries).toHaveLength(27)
    expect(entries[26].letter).toBe('AA')
    for (const e of entries.slice(0, 26)) expect(e.letter).toHaveLength(1)
  })

  it('30 colores usados: sigue AA, AB, AC, AD sin repetir', () => {
    const entries = assignLetters(rowOfDistinctColors(30))
    expect(entries.slice(26).map((e) => e.letter)).toEqual(['AA', 'AB', 'AC', 'AD'])
    expect(new Set(entries.map((e) => e.letter)).size).toBe(30)
  })

  it('con pocos colores nunca aparece una etiqueta doble', () => {
    for (const n of [1, 2, 3, 5, 10, 26]) {
      for (const e of assignLetters(rowOfDistinctColors(n))) expect(e.letter).toHaveLength(1)
    }
  })
})

describe('assignLetters — flecos y argolla', () => {
  it('un color que sólo aparece en el fleco recibe su letra al llegar el fleco', () => {
    const cells: ColorMap = {
      [cellKey(0, 0)]: RED,
      [cellKey(0, 1)]: RED,
      [cellKey(1, 0)]: BLUE, // primera mostacilla del fleco de la columna 0
      [cellKey(1, 1)]: GREEN,
    }
    const entries = assignLetters({
      technique: 'loom',
      cols: 2,
      rows: 1,
      cells,
      fringe: { lengths: [1, 1], turnBeads: [false, false] },
    })
    expect(labels(entries)).toEqual({ [RED]: 'A', [BLUE]: 'B', [GREEN]: 'C' })
  })

  it('la argolla tejida se teje al final: su color va último y suma sus mostacillas al conteo', () => {
    const cells: ColorMap = { [cellKey(0, 0)]: RED }
    const entries = assignLetters({
      technique: 'loom',
      cols: 1,
      rows: 1,
      cells,
      loop: { variant: 'woven', beadCount: 8, color: BLUE },
    })
    expect(labels(entries)).toEqual({ [RED]: 'A', [BLUE]: 'B' })
    expect(entries.find((e) => e.hex === BLUE)!.count).toBe(8)
  })

  it('una argolla que reusa un color del patrón no gana letra propia, sólo suma su conteo', () => {
    const cells: ColorMap = { [cellKey(0, 0)]: RED }
    const entries = assignLetters({
      technique: 'loom',
      cols: 1,
      rows: 1,
      cells,
      loop: { variant: 'woven', beadCount: 8, color: RED },
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ hex: RED, letter: 'A', count: 9 })
  })

  it('una argolla metálica no aporta mostacillas ni letra', () => {
    const cells: ColorMap = { [cellKey(0, 0)]: RED }
    const entries = assignLetters({
      technique: 'loom',
      cols: 1,
      rows: 1,
      cells,
      loop: { variant: 'metal', beadCount: 0, color: BLUE },
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ hex: RED, count: 1 })
  })
})

describe('assignLetters — casos borde', () => {
  it('un patrón sin pintar no tiene letras', () => {
    expect(assignLetters({ technique: 'loom', cols: 4, rows: 4, cells: {} })).toEqual([])
  })

  it('las celdas vacías o borradas no cuentan como color', () => {
    const cells: ColorMap = { [cellKey(0, 0)]: RED, [cellKey(0, 1)]: '', [cellKey(0, 2)]: GREEN }
    expect(letters(assignLetters({ technique: 'loom', cols: 3, rows: 1, cells }))).toEqual(['A', 'B'])
  })

  it('una celda pintada fuera del recorrido igual recibe letra, para no dejarla sin rótulo en materiales', () => {
    // Red de seguridad: si la forma del cuerpo y las celdas se desincronizan,
    // el color pintado sigue contándose, así que también necesita etiqueta.
    const cells: ColorMap = { [cellKey(0, 0)]: RED, [cellKey(9, 9)]: GREEN }
    const entries = assignLetters({ technique: 'loom', cols: 1, rows: 1, cells })
    expect(labels(entries)).toEqual({ [RED]: 'A', [GREEN]: 'B' })
  })
})
