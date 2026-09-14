import { describe, expect, it, vi } from 'vitest'
import type { ColorMap, FringeData, LoopData, RowShape, Technique } from '@/engine/types'
import { assignLetters } from '@/engine/letters'
import { buildWordChart } from '@/engine/wordChart'
import { getBeadType } from '@/data/beadTypes'
import { describeColor } from './colorName'
import { exportPatternToPdf, ALL_PDF_SECTIONS } from './pdfExport'
import { t } from '@/i18n/es'

// Same native-export routing as pdfExport.test.ts — jsdom has no doc.save().
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: vi.fn(async () => {}), getUri: vi.fn(async () => ({ uri: 'file://fake' })) },
  Directory: { Cache: 'CACHE' },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => {}) } }))

let lastDoc: import('jspdf').jsPDF | undefined

vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>()
  class SpyJsPDF extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args)
      // oxlint-disable-next-line typescript/no-this-alias -- intentional: capturing the constructed instance for assertions.
      lastDoc = this
    }
  }
  return { ...actual, jsPDF: SpyJsPDF }
})

function pdfText(doc: import('jspdf').jsPDF): string {
  return [...doc.output().matchAll(/\((?:\\.|[^()\\])*\) Tj/g)]
    .map((m) => m[0].slice(1, -4).replace(/\\([()])/g, '$1'))
    .join('\n')
}

const bead = getBeadType('miyuki-delica-11')

/**
 * Una fila de la leyenda de materiales: la letra, el separador y el código DB.
 * El separador va laxo (`.{0,6}`) porque la raya larga no sobrevive tal cual
 * la extracción de texto del PDF, y lo que este test cuida es la letra.
 */
function materialsRow(letter: string, name: string): RegExp {
  return new RegExp(`(^|\\n)${letter}.{0,6}${name} ×`)
}

const RED = '#d94f4f'
const GOLD = '#c9a227'
const TEAL = '#2f5b66'
/** Cargado en la paleta de quien teje, pero jamás pintado en una celda. */
const NEVER_PAINTED = '#7b3fa0'

interface Pattern {
  technique: Technique
  cols: number
  rows: number
  cells: ColorMap
  fringe?: FringeData
  rowShape?: RowShape[]
  loop?: LoopData
}

/**
 * Un patrón brick chico con fleco: cuerpo de dos filas y una hebra colgando,
 * suficiente para que el recorrido pase por cuerpo y fleco.
 */
const pattern: Pattern = {
  technique: 'brick',
  cols: 3,
  rows: 2,
  cells: {
    '0,0': GOLD,
    '0,1': GOLD,
    '1,0': RED, // fila 2: se teje después de la de arriba
    '1,1': RED,
    '1,2': TEAL,
    '2,1': TEAL, // fleco
  },
  fringe: { lengths: [0, 1, 0], turnBeads: [false, true, false] },
}

describe('coherencia de letras en toda la app (Tarea 3)', () => {
  it('el word chart rotula con la misma asignación que el motor', () => {
    const entries = assignLetters(pattern)
    const byHex = new Map(entries.map((e) => [e.hex, e.letter]))

    const lines = buildWordChart(
      pattern.technique,
      pattern.cols,
      pattern.rows,
      pattern.cells,
      (hex) => byHex.get(hex) ?? '?',
      pattern.fringe,
      pattern.rowShape,
      pattern.loop,
    )
    const text = lines.map((l) => l.text).join(' ')

    // Ninguna mostacilla queda sin rótulo, y sólo aparecen las letras asignadas.
    expect(text).not.toContain('?')
    for (const letter of text.match(/[A-Z]+/g) ?? []) {
      expect(entries.map((e) => e.letter)).toContain(letter)
    }
  })

  it('la lista de materiales del PDF usa las mismas letras, en el mismo orden', async () => {
    await exportPatternToPdf({ name: 'Coherencia', ...pattern, beadType: bead, sections: ALL_PDF_SECTIONS })
    const text = pdfText(lastDoc!)
    const entries = assignLetters(pattern)

    // Cada fila de materiales se imprime como "<letra> — <nombre del color> ×<conteo>", sin códigos de marca.
    for (const entry of entries) {
      expect(text).toMatch(materialsRow(entry.letter, describeColor(entry.hex)))
      expect(text).not.toMatch(/DB-\d/)
      expect(text).toContain(`×${entry.count}`)
    }

    // Y en orden de letra, que es el orden de tejido.
    const positions = entries.map((e) => text.search(materialsRow(e.letter, describeColor(e.hex))))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('un color de la paleta que no está pintado no llega al PDF ni a materiales', async () => {
    const entries = assignLetters(pattern)
    expect(entries.some((e) => e.hex === NEVER_PAINTED)).toBe(false)

    await exportPatternToPdf({ name: 'Sin fantasmas', ...pattern, beadType: bead, sections: ALL_PDF_SECTIONS })
    const text = pdfText(lastDoc!)

    // El color sin usar es un morado que no comparte nombre con ninguno de
    // los pintados — si apareciera, su fila estaría en el PDF.
    const ghost = describeColor(NEVER_PAINTED)
    const painted = entries.map((e) => describeColor(e.hex))
    expect(painted).not.toContain(ghost)
    expect(text).not.toContain(ghost)
  })

  it('el total de mostacillas de los materiales cuadra con las celdas pintadas', () => {
    const entries = assignLetters(pattern)
    const total = entries.reduce((sum, e) => sum + e.count, 0)
    expect(total).toBe(Object.values(pattern.cells).filter(Boolean).length)
  })

  it('con argolla tejida, su color entra en materiales con las mostacillas del aro', () => {
    const loop: LoopData = { variant: 'woven', beadCount: 8, color: NEVER_PAINTED }
    const entries = assignLetters({ ...pattern, loop })

    // Deja de ser un color "sin usar": la argolla lo usa de verdad, y se teje
    // al final, así que se lleva la última letra.
    const ring = entries.find((e) => e.hex === NEVER_PAINTED)
    expect(ring).toBeDefined()
    expect(ring!.letter).toBe(entries[entries.length - 1].letter)
    expect(ring!.count).toBe(8)
  })

  it('reemplazar un color mantiene letras y conteos coherentes entre editor y PDF', async () => {
    // RED (la última letra del patrón base: brick teje de arriba hacia abajo,
    // así que GOLD es A) se reemplaza por GOLD en todo el patrón: GOLD conserva
    // su letra y absorbe el conteo, RED desaparece.
    const replaced: Pattern = {
      ...pattern,
      cells: Object.fromEntries(
        Object.entries(pattern.cells).map(([k, hex]) => [k, hex === RED ? GOLD : hex]),
      ),
    }
    const before = assignLetters(pattern)
    const after = assignLetters(replaced)

    expect(after.map((e) => e.letter)).toEqual(['A', 'B'])
    expect(after.find((e) => e.hex === GOLD)!.letter).toBe(before.find((e) => e.hex === GOLD)!.letter)
    expect(after.find((e) => e.hex === GOLD)!.count).toBe(4)
    expect(after.some((e) => e.hex === RED)).toBe(false)

    await exportPatternToPdf({ name: 'Reemplazo', ...replaced, beadType: bead, sections: ALL_PDF_SECTIONS })
    const text = pdfText(lastDoc!)
    expect(text).toContain(t.pdf.materials) // guard: el texto se extrajo de verdad
    const gold = after.find((e) => e.hex === GOLD)!
    expect(text).toMatch(materialsRow(gold.letter, describeColor(GOLD)))
    expect(text).toContain('×4')
  })
})

describe('PDF de un par de aros', () => {
  const aro: Pattern = {
    technique: 'brick',
    cols: 3,
    rows: 2,
    cells: { '1,0': RED, '1,1': GOLD, '1,2': GOLD, '0,0': GOLD, '0,1': GOLD, '0,2': GOLD },
  }

  it('imprime los dos aros rotulados, y el total del par en el encabezado', async () => {
    await exportPatternToPdf({ name: 'Aros', ...aro, pair: { mode: 'mirror' }, beadType: bead, sections: ALL_PDF_SECTIONS })
    const text = pdfText(lastDoc!)
    expect(text).toContain(t.pdf.leftEarring)
    expect(text).toContain(t.pdf.rightEarring)
    expect(text).toContain(t.pdf.pairTotal(12))
    expect(lastDoc!.getNumberOfPages()).toBe(1) // sigue siendo una hoja
  })

  it('los materiales cuentan las mostacillas de los dos aros', async () => {
    await exportPatternToPdf({ name: 'Aros', ...aro, pair: { mode: 'mirror' }, beadType: bead, sections: ALL_PDF_SECTIONS })
    const text = pdfText(lastDoc!)
    // Brick arranca por la fila de arriba, que es toda dorada: la dorada es A.
    expect(text).toMatch(materialsRow('A', describeColor(GOLD)))
    expect(text).toMatch(materialsRow('B', describeColor(RED)))
    expect(text).toContain('×2') // 1 roja por aro
    expect(text).toContain('×10') // 5 doradas por aro
  })

  it('separado, un color que sólo lleva el derecho aparece en materiales con su letra', async () => {
    await exportPatternToPdf({
      name: 'Aros',
      ...aro,
      pair: { mode: 'independent', rightCells: { '1,0': TEAL, '1,1': GOLD, '1,2': RED, '0,0': GOLD, '0,1': GOLD, '0,2': GOLD } },
      beadType: bead,
      sections: ALL_PDF_SECTIONS,
    })
    expect(pdfText(lastDoc!)).toMatch(materialsRow('C', describeColor(TEAL)))
  })

  it('un solo aro no lleva rótulos de izquierdo y derecho', async () => {
    await exportPatternToPdf({ name: 'Aro', ...aro, beadType: bead, sections: ALL_PDF_SECTIONS })
    expect(pdfText(lastDoc!)).not.toContain(t.pdf.rightEarring)
  })
})
