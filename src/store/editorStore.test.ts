import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyFringe } from '@/engine/fringe'
import { createRectangleRowShape, createShapedRowShape } from '@/engine/shape'
import type { FringeData, PatternDoc, RowShape } from '@/engine/types'
import { usePatternsStore } from '@/store/patternsStore'
import { useWeaveStore } from '@/store/weaveStore'
import { useEditorStore } from './editorStore'

function resetStore(
  overrides: {
    cells?: Record<string, string>
    fringe?: FringeData
    rowShape?: RowShape[]
    patternId?: string | null
  } = {},
) {
  useEditorStore.setState({
    patternId: overrides.patternId ?? null,
    technique: 'brick',
    cells: overrides.cells ?? { '0,0': '#111111', '1,1': '#222222', '2,3': '#111111', '0,3': '#222222' },
    colorLetters: { '#111111': 'A', '#222222': 'B' },
    cols: 10,
    rows: 10,
    fringe: overrides.fringe ?? createEmptyFringe(10),
    rowShape: overrides.rowShape ?? createRectangleRowShape(10, 10),
    note: '',
    tool: 'pencil',
    selection: null,
    colorSelectionMask: null,
    clipboard: null,
    history: [],
    future: [],
    weaveResetPending: null,
    fringeSymmetric: false,
    fringeSculptMode: false,
  })
}

describe('editorStore — seleccionar por color', () => {
  beforeEach(() => {
    resetStore()
  })

  it('selectColor calcula el rectángulo envolvente, la máscara exacta, y cambia a la herramienta de selección', () => {
    useEditorStore.getState().selectColor('#111111')
    const { selection, colorSelectionMask, tool } = useEditorStore.getState()
    expect(selection).toEqual({ r0: 0, c0: 0, r1: 2, c1: 3 })
    expect(colorSelectionMask).toEqual(new Set(['0,0', '2,3']))
    expect(tool).toBe('select')
  })

  it('no hace nada si el color no está en el patrón', () => {
    useEditorStore.getState().selectColor('#999999')
    const { selection, colorSelectionMask } = useEditorStore.getState()
    expect(selection).toBeNull()
    expect(colorSelectionMask).toBeNull()
  })

  it('eraseSelection con máscara solo borra las celdas del color, no todo el rectángulo', () => {
    useEditorStore.getState().selectColor('#111111')
    useEditorStore.getState().eraseSelection()
    const { cells } = useEditorStore.getState()
    // (0,0) and (2,3) — the actual '#111111' cells — are gone…
    expect(cells['0,0']).toBeUndefined()
    expect(cells['2,3']).toBeUndefined()
    // …but (1,1) and (0,3), inside the bounding box yet a different color, survive untouched.
    expect(cells['1,1']).toBe('#222222')
    expect(cells['0,3']).toBe('#222222')
  })

  it('copySelection con máscara solo copia las celdas del color, dejando huecos', () => {
    useEditorStore.getState().selectColor('#111111')
    useEditorStore.getState().copySelection()
    const { clipboard } = useEditorStore.getState()
    expect(clipboard?.width).toBe(4) // c0=0..c1=3
    expect(clipboard?.height).toBe(3) // r0=0..r1=2
    // Relative to the bounding box: (0,0) stays (0,0); (2,3) becomes (2,3).
    expect(clipboard?.cells).toEqual({ '0,0': '#111111', '2,3': '#111111' })
  })

  it('una selección manual (arrastre) descarta cualquier máscara de color previa', () => {
    useEditorStore.getState().selectColor('#111111')
    expect(useEditorStore.getState().colorSelectionMask).not.toBeNull()

    useEditorStore.getState().setSelection({ r0: 0, c0: 0, r1: 1, c1: 1 })
    expect(useEditorStore.getState().colorSelectionMask).toBeNull()
  })

  it('cambiar a una herramienta que no es de selección limpia selección y máscara', () => {
    useEditorStore.getState().selectColor('#111111')
    useEditorStore.getState().setTool('pencil')
    const { selection, colorSelectionMask } = useEditorStore.getState()
    expect(selection).toBeNull()
    expect(colorSelectionMask).toBeNull()
  })
})

describe('editorStore — seleccionar por color incluye cuerpo y flecos (Corrección 3)', () => {
  beforeEach(() => {
    // Color A pintado en el cuerpo (0,0) y en dos mostacillas del fleco de la columna 0
    // (filas 10 y 11, ya que rows=10). Color B es ruido de body y de fleco que NO debe
    // aparecer en la selección.
    resetStore({
      cells: { '0,0': '#111111', '10,0': '#111111', '11,0': '#111111', '1,1': '#222222', '10,1': '#222222' },
      fringe: { lengths: [3, 3, 0], turnBeads: [false, false, false] },
    })
  })

  it('selectColor arma la máscara con exactamente las celdas de ese color, cuerpo y fleco incluidos', () => {
    useEditorStore.getState().selectColor('#111111')
    const { selection, colorSelectionMask, tool } = useEditorStore.getState()
    expect(colorSelectionMask).toEqual(new Set(['0,0', '10,0', '11,0']))
    expect(selection).toEqual({ r0: 0, c0: 0, r1: 11, c1: 0 })
    expect(tool).toBe('select')
    // El ruido de color B (cuerpo y fleco) queda fuera de la máscara.
    expect(colorSelectionMask?.has('1,1')).toBe(false)
    expect(colorSelectionMask?.has('10,1')).toBe(false)
  })

  it('borrar la selección de color quita cuerpo y fleco, respeta el resto, y es deshacible', () => {
    useEditorStore.getState().selectColor('#111111')
    useEditorStore.getState().eraseSelection()

    const { cells, history } = useEditorStore.getState()
    expect(cells['0,0']).toBeUndefined()
    expect(cells['10,0']).toBeUndefined()
    expect(cells['11,0']).toBeUndefined()
    expect(cells['1,1']).toBe('#222222')
    expect(cells['10,1']).toBe('#222222')
    expect(history).toHaveLength(1)

    useEditorStore.getState().undo()
    expect(useEditorStore.getState().cells['0,0']).toBe('#111111')
    expect(useEditorStore.getState().cells['10,0']).toBe('#111111')
    expect(useEditorStore.getState().cells['11,0']).toBe('#111111')
  })
})

describe('editorStore — applyGradient', () => {
  beforeEach(() => {
    resetStore({ cells: {}, fringe: { lengths: [3, 0], turnBeads: [false, false] } })
  })

  it('sin selección, pinta todo el patrón — cuerpo Y fleco — en un solo commit', () => {
    useEditorStore.getState().applyGradient('#ffffff', '#000000', 'vertical')
    const { cells, history } = useEditorStore.getState()
    expect(cells['0,0']).toBeDefined() // body
    expect(cells['12,0']).toBeDefined() // last fringe bead of column 0 (length 3, bodyRows 10)
    expect(cells['13,0']).toBeUndefined() // beyond the fringe's own length — not paintable
    expect(history).toHaveLength(1)
  })

  it('el degradado en el cuerpo continúa sin salto hacia el fleco de la misma columna (fila 9 y fleco depth 0 quedan lado a lado)', () => {
    useEditorStore.getState().applyGradient('#ffffff', '#000000', 'vertical')
    const { cells } = useEditorStore.getState()
    // The darkest end of the gradient should land at the deepest fringe row, not back at the body's top.
    expect(cells['0,0']).toBe('#ffffff')
    expect(cells['12,0']).toBe('#000000')
  })

  it('con una selección activa, solo pinta las celdas dentro del rectángulo', () => {
    useEditorStore.getState().setSelection({ r0: 0, c0: 0, r1: 2, c1: 1 })
    useEditorStore.getState().applyGradient('#ffffff', '#000000', 'vertical')
    const { cells } = useEditorStore.getState()
    expect(cells['0,0']).toBeDefined()
    expect(cells['2,1']).toBeDefined()
    expect(cells['5,0']).toBeUndefined() // outside the selection rect
  })

  it('cuantiza siempre a colores de la paleta existente + los dos extremos elegidos, nunca a un hex arbitrario interpolado', () => {
    useEditorStore.setState({ cells: { '0,0': '#c9a227' } }) // one existing palette color
    useEditorStore.getState().applyGradient('#ffffff', '#000000', 'vertical')
    const { cells } = useEditorStore.getState()
    const allowed = new Set(['#ffffff', '#000000', '#c9a227'])
    for (const hex of Object.values(cells)) {
      if (!hex) continue
      expect(allowed.has(hex)).toBe(true)
    }
  })

  it('no hace nada si la selección no tiene celdas pintables (fuera del fleco de esa columna)', () => {
    useEditorStore.getState().setSelection({ r0: 13, c0: 0, r1: 15, c1: 0 }) // beyond column 0's fringe length
    useEditorStore.getState().applyGradient('#ffffff', '#000000', 'vertical')
    expect(useEditorStore.getState().history).toHaveLength(0)
  })
})

describe('editorStore — pintar sobre flecos', () => {
  beforeEach(() => {
    resetStore({ cells: {}, fringe: { lengths: [3, 0], turnBeads: [false, false] } })
  })

  it('paintCell pinta una celda de fleco dentro del largo actual de esa columna', () => {
    useEditorStore.getState().paintCell(12, 0, '#111111') // depth 2 of col 0 (length 3), the last one
    expect(useEditorStore.getState().cells['12,0']).toBe('#111111')
  })

  it('paintCell rechaza una celda más allá del largo del fleco de esa columna', () => {
    useEditorStore.getState().paintCell(13, 0, '#111111') // depth 3, col 0 only has length 3
    expect(useEditorStore.getState().cells['13,0']).toBeUndefined()
  })

  it('paintCell rechaza cualquier fleco en una columna sin fleco', () => {
    useEditorStore.getState().paintCell(10, 1, '#111111')
    expect(useEditorStore.getState().cells['10,1']).toBeUndefined()
  })

  it('strokeCell (lápiz/goma en arrastre) también respeta el largo del fleco', () => {
    useEditorStore.getState().strokeCell(10, 0, '#111111')
    useEditorStore.getState().strokeCell(13, 0, '#111111')
    const { cells } = useEditorStore.getState()
    expect(cells['10,0']).toBe('#111111')
    expect(cells['13,0']).toBeUndefined()
  })

  it('floodFill se detiene en el largo del fleco de la columna', () => {
    useEditorStore.getState().paintCell(10, 0, '#111111')
    useEditorStore.getState().paintCell(11, 0, '#111111')
    useEditorStore.getState().paintCell(12, 0, '#111111')
    useEditorStore.getState().floodFill(10, 0, '#222222')
    const { cells } = useEditorStore.getState()
    expect(cells['10,0']).toBe('#222222')
    expect(cells['12,0']).toBe('#222222')
  })
})

describe('editorStore — setFringeLength / setFringeTurnBead', () => {
  beforeEach(() => {
    resetStore({
      cells: { '10,0': '#111111', '11,0': '#111111', '12,0': '#111111' },
      fringe: { lengths: [3, 0], turnBeads: [true, false] },
    })
  })

  it('acorta el largo de una columna y borra el color de las mostacillas que ya no existen', () => {
    useEditorStore.getState().setFringeLength(0, 1)
    const { fringe, cells, history } = useEditorStore.getState()
    expect(fringe.lengths[0]).toBe(1)
    expect(cells['10,0']).toBe('#111111') // depth 0, still within the new length
    expect(cells['11,0']).toBeUndefined() // depth 1, trimmed
    expect(cells['12,0']).toBeUndefined() // depth 2, trimmed
    expect(history).toHaveLength(1) // the trim went through commit(), undoable
  })

  it('alargar una columna no toca ningún color existente', () => {
    useEditorStore.getState().setFringeLength(0, 5)
    const { fringe, cells } = useEditorStore.getState()
    expect(fringe.lengths[0]).toBe(5)
    expect(cells['10,0']).toBe('#111111')
    expect(cells['11,0']).toBe('#111111')
    expect(cells['12,0']).toBe('#111111')
  })

  it('llevar el largo a 0 también apaga la mostacilla de giro de esa columna', () => {
    useEditorStore.getState().setFringeLength(0, 0)
    expect(useEditorStore.getState().fringe.turnBeads[0]).toBe(false)
  })

  it('el cambio de largo no queda en el historial de deshacer (es estructural, como cols/rows)', () => {
    useEditorStore.getState().setFringeLength(1, 4) // column 1 had no fringe and no painted cells, so nothing to trim
    expect(useEditorStore.getState().history).toHaveLength(0)
  })

  it('setFringeTurnBead marca/desmarca la mostacilla de giro de una columna con fleco', () => {
    useEditorStore.getState().setFringeTurnBead(0, false)
    expect(useEditorStore.getState().fringe.turnBeads[0]).toBe(false)
    useEditorStore.getState().setFringeTurnBead(0, true)
    expect(useEditorStore.getState().fringe.turnBeads[0]).toBe(true)
  })

  it('setFringeTurnBead no hace nada en una columna sin fleco', () => {
    useEditorStore.getState().setFringeTurnBead(1, true)
    expect(useEditorStore.getState().fringe.turnBeads[1]).toBe(false)
  })
})

describe('editorStore — sculptFringeLengths', () => {
  beforeEach(() => {
    resetStore({
      cells: { '10,0': '#111111', '11,0': '#111111', '12,0': '#111111' },
      fringe: { lengths: [3, 0, 0], turnBeads: [true, false, false] },
    })
    useEditorStore.setState({ cols: 3 })
  })

  it('aplica varios largos en una sola llamada', () => {
    useEditorStore.getState().sculptFringeLengths([1, 4, 2])
    expect(useEditorStore.getState().fringe.lengths).toEqual([1, 4, 2])
  })

  it('las entradas undefined dejan esa columna sin tocar', () => {
    useEditorStore.getState().sculptFringeLengths([undefined, 5, undefined])
    expect(useEditorStore.getState().fringe.lengths).toEqual([3, 5, 0])
  })

  it('todo el recorte de mostacillas pintadas de la pasada completa cae en UN solo commit (un solo paso de deshacer)', () => {
    // Shrinks column 0 (drops 2 painted cells) in the same call as growing others —
    // must still be exactly one history entry, not one per column.
    useEditorStore.getState().sculptFringeLengths([1, 3, 2])
    const { cells, history } = useEditorStore.getState()
    expect(cells['10,0']).toBe('#111111')
    expect(cells['11,0']).toBeUndefined()
    expect(cells['12,0']).toBeUndefined()
    expect(history).toHaveLength(1)
  })

  it('un largo de 0 apaga la mostacilla de giro de esa columna', () => {
    useEditorStore.getState().sculptFringeLengths([0])
    expect(useEditorStore.getState().fringe.turnBeads[0]).toBe(false)
  })

  it('respeta MAX_FRINGE_LENGTH aunque se pida un valor mayor', () => {
    useEditorStore.getState().sculptFringeLengths([9999])
    expect(useEditorStore.getState().fringe.lengths[0]).toBe(100)
  })

  it('no hace nada si ningún largo pedido difiere del actual', () => {
    useEditorStore.getState().sculptFringeLengths([3, 0, 0])
    expect(useEditorStore.getState().history).toHaveLength(0)
  })

  it('el cambio estructural en sí no queda en el historial de deshacer (como setFringeLength)', () => {
    useEditorStore.getState().sculptFringeLengths([3, 2, 3]) // column 0 unchanged, 1 and 2 only grow — nothing to trim
    expect(useEditorStore.getState().history).toHaveLength(0)
  })
})

describe('editorStore — sesión de esculpido por arrastre (fringeSculptStart/SetColumn/End)', () => {
  beforeEach(() => {
    resetStore({
      cells: { '10,0': '#111111', '11,0': '#111111', '12,0': '#111111' },
      fringe: { lengths: [3, 0, 0], turnBeads: [true, false, false] },
    })
    useEditorStore.setState({ cols: 3 })
  })

  it('actualiza fringe y cells en vivo sin generar commits intermedios', () => {
    useEditorStore.getState().fringeSculptStart()
    useEditorStore.getState().fringeSculptSetColumn(0, 1) // shrink 3 -> 1, drops depth 1 and 2
    useEditorStore.getState().fringeSculptSetColumn(1, 4) // grow
    const { fringe, cells, history } = useEditorStore.getState()
    expect(fringe.lengths).toEqual([1, 4, 0])
    expect(cells['11,0']).toBeUndefined()
    expect(cells['12,0']).toBeUndefined()
    expect(history).toHaveLength(0) // nothing committed mid-drag
  })

  it('toda la pasada del arrastre colapsa en un solo commit al soltar', () => {
    useEditorStore.getState().fringeSculptStart()
    useEditorStore.getState().fringeSculptSetColumn(0, 1)
    useEditorStore.getState().fringeSculptSetColumn(0, 0) // further shrink within the same drag
    useEditorStore.getState().fringeSculptEnd()
    expect(useEditorStore.getState().history).toHaveLength(1)
  })

  it('un arrastre que solo agranda columnas no genera ningún commit al soltar', () => {
    useEditorStore.getState().fringeSculptStart()
    useEditorStore.getState().fringeSculptSetColumn(1, 5)
    useEditorStore.getState().fringeSculptSetColumn(2, 2)
    useEditorStore.getState().fringeSculptEnd()
    expect(useEditorStore.getState().history).toHaveLength(0)
  })

  it('llevar una columna a largo 0 apaga su mostacilla de giro', () => {
    useEditorStore.getState().fringeSculptStart()
    useEditorStore.getState().fringeSculptSetColumn(0, 0)
    expect(useEditorStore.getState().fringe.turnBeads[0]).toBe(false)
  })

  it('respeta MAX_FRINGE_LENGTH', () => {
    useEditorStore.getState().fringeSculptStart()
    useEditorStore.getState().fringeSculptSetColumn(1, 9999)
    expect(useEditorStore.getState().fringe.lengths[1]).toBe(100)
  })

  it('fringeSculptMode se puede activar y desactivar', () => {
    expect(useEditorStore.getState().fringeSculptMode).toBe(false)
    useEditorStore.getState().setFringeSculptMode(true)
    expect(useEditorStore.getState().fringeSculptMode).toBe(true)
    useEditorStore.getState().setFringeSculptMode(false)
    expect(useEditorStore.getState().fringeSculptMode).toBe(false)
  })

  it('con fringeSymmetric activo, refleja el largo en la columna espejo (cols - 1 - col)', () => {
    useEditorStore.getState().setFringeSymmetric(true)
    useEditorStore.getState().fringeSculptStart()
    useEditorStore.getState().fringeSculptSetColumn(0, 5) // mirror is column 2 (cols=3)
    expect(useEditorStore.getState().fringe.lengths).toEqual([5, 0, 5])
  })

  it('con fringeSymmetric activo, la columna central (impar cols) no se duplica', () => {
    useEditorStore.getState().setFringeSymmetric(true)
    useEditorStore.getState().fringeSculptStart()
    useEditorStore.getState().fringeSculptSetColumn(1, 6) // column 1 is its own mirror in a 3-col grid
    expect(useEditorStore.getState().fringe.lengths).toEqual([3, 6, 0])
  })

  it('con fringeSymmetric apagado (default), solo cambia la columna tocada', () => {
    useEditorStore.getState().fringeSculptStart()
    useEditorStore.getState().fringeSculptSetColumn(0, 5)
    expect(useEditorStore.getState().fringe.lengths).toEqual([5, 0, 0])
  })
})

describe('editorStore — setFringeLength con fringeSymmetric', () => {
  beforeEach(() => {
    resetStore({ fringe: { lengths: [3, 0, 0], turnBeads: [false, false, false] } })
    useEditorStore.setState({ cols: 3 })
  })

  it('refleja un cambio manual (−/+) en la columna espejo cuando está activo', () => {
    useEditorStore.getState().setFringeSymmetric(true)
    useEditorStore.getState().setFringeLength(0, 4)
    expect(useEditorStore.getState().fringe.lengths).toEqual([4, 0, 4])
  })

  it('no toca la columna espejo cuando está apagado', () => {
    useEditorStore.getState().setFringeLength(0, 4)
    expect(useEditorStore.getState().fringe.lengths).toEqual([4, 0, 0])
  })
})

describe('editorStore — forma del cuerpo (growRowEdge / shrinkRowEdge)', () => {
  beforeEach(() => {
    resetStore()
    // A 5-col, 1-row pattern with row 0 shaped as offset 1, length 3 (columns 1,2,3 active).
    useEditorStore.setState({
      cols: 5,
      rows: 1,
      cells: { '0,1': '#111111', '0,2': '#222222', '0,3': '#111111' },
      rowShape: [{ offset: 1, length: 3 }],
      history: [],
      future: [],
    })
  })

  it('growRowEdge("left") mueve el offset hacia afuera y agranda el largo en 1', () => {
    useEditorStore.getState().growRowEdge(0, 'left')
    expect(useEditorStore.getState().rowShape[0]).toEqual({ offset: 0, length: 4 })
  })

  it('growRowEdge("right") solo agranda el largo en 1, el offset no cambia', () => {
    useEditorStore.getState().growRowEdge(0, 'right')
    expect(useEditorStore.getState().rowShape[0]).toEqual({ offset: 1, length: 4 })
  })

  it('growRowEdge no hace nada más allá del borde propio de la grilla (cols)', () => {
    useEditorStore.getState().growRowEdge(0, 'right') // length 3 -> 4, offset 1 + 4 = 5 = cols, at the limit
    useEditorStore.getState().growRowEdge(0, 'right') // would need offset 1 + 5 = 6 > cols=5 — rejected
    expect(useEditorStore.getState().rowShape[0]).toEqual({ offset: 1, length: 4 })
  })

  it('growRowEdge no modifica el historial de deshacer (es estructural)', () => {
    useEditorStore.getState().growRowEdge(0, 'left')
    expect(useEditorStore.getState().history).toHaveLength(0)
  })

  it('shrinkRowEdge("left") borra el color de la mostacilla que cae fuera de la fila, y sí es deshacible', () => {
    useEditorStore.getState().shrinkRowEdge(0, 'left')
    const { rowShape, cells, history } = useEditorStore.getState()
    expect(rowShape[0]).toEqual({ offset: 2, length: 2 })
    expect(cells['0,1']).toBeUndefined() // dropped — was the row's old left edge
    expect(cells['0,2']).toBe('#222222') // untouched
    expect(cells['0,3']).toBe('#111111') // untouched
    expect(history).toHaveLength(1) // the color drop went through commit()
  })

  it('shrinkRowEdge("right") borra el color de la mostacilla del otro extremo', () => {
    useEditorStore.getState().shrinkRowEdge(0, 'right')
    const { rowShape, cells } = useEditorStore.getState()
    expect(rowShape[0]).toEqual({ offset: 1, length: 2 })
    expect(cells['0,3']).toBeUndefined() // dropped — was the row's old right edge
    expect(cells['0,1']).toBe('#111111')
  })

  it('shrinkRowEdge nunca deja una fila en 0 (mínimo 1 mostacilla)', () => {
    useEditorStore.setState({ rowShape: [{ offset: 2, length: 1 }] })
    useEditorStore.getState().shrinkRowEdge(0, 'left')
    expect(useEditorStore.getState().rowShape[0]).toEqual({ offset: 2, length: 1 })
  })

  it('pintar fuera de la forma de la fila no hace nada (isPaintableCell ahora conoce rowShape)', () => {
    useEditorStore.getState().paintCell(0, 0, '#c9a227') // column 0 is outside offset:1,length:3
    expect(useEditorStore.getState().cells['0,0']).toBeUndefined()
    useEditorStore.getState().paintCell(0, 2, '#c9a227') // column 2 is inside the shape
    expect(useEditorStore.getState().cells['0,2']).toBe('#c9a227')
  })
})

describe('editorStore — nota', () => {
  beforeEach(() => {
    resetStore()
  })

  it('empieza vacía y setNote actualiza el estado de inmediato', () => {
    expect(useEditorStore.getState().note).toBe('')
    useEditorStore.getState().setNote('Para el cumpleaños de mamá')
    expect(useEditorStore.getState().note).toBe('Para el cumpleaños de mamá')
  })
})

describe('editorStore — agregar/quitar fila arriba (Corrección 3)', () => {
  beforeEach(() => {
    // A 4-col triangle: row0 {offset:2,length:1} .. row3 {offset:0,length:4}.
    const rowShape = createShapedRowShape('triangle', 4, 4)
    resetStore({
      rowShape,
      cells: { '0,2': '#111111', '3,0': '#222222' }, // one bead in the old top row, one in the bottom row
    })
    useEditorStore.setState({ cols: 4, rows: 4 })
  })

  it('addRowAtTop agrega una fila más angosta arriba, siguiendo la pendiente, y corre las celdas existentes una fila hacia abajo', () => {
    useEditorStore.getState().addRowAtTop()
    const { rows, rowShape, cells } = useEditorStore.getState()
    expect(rows).toBe(5)
    // New row 0 is 1 bead narrower than the old row 0 ({offset:2,length:1}), floored at 1 bead.
    expect(rowShape[0]).toEqual({ offset: 2, length: 1 })
    expect(rowShape[1]).toEqual({ offset: 2, length: 1 }) // the old row 0, untouched
    expect(rowShape[4]).toEqual({ offset: 0, length: 4 }) // the old row 3, untouched
    // Cells shift down by exactly one row.
    expect(cells['1,2']).toBe('#111111')
    expect(cells['4,0']).toBe('#222222')
    expect(cells['0,2']).toBeUndefined()
  })

  it('removeRowAtTop quita la fila superior y corre el resto una fila hacia arriba, perdiendo lo pintado ahí', () => {
    useEditorStore.getState().removeRowAtTop()
    const { rows, rowShape, cells } = useEditorStore.getState()
    expect(rows).toBe(3)
    expect(rowShape[0]).toEqual({ offset: 1, length: 2 }) // the old row 1
    expect(cells['0,2']).toBeUndefined() // painted bead in the removed row is gone
    expect(cells['2,0']).toBe('#222222') // the old row 3's bead, shifted up
  })

  it('removeRowAtTop nunca deja el patrón sin filas', () => {
    useEditorStore.setState({ rows: 1, rowShape: [{ offset: 0, length: 4 }] })
    useEditorStore.getState().removeRowAtTop()
    expect(useEditorStore.getState().rows).toBe(1)
  })

  it('agregar y luego quitar una fila es una operación redonda (vuelve exactamente al estado anterior)', () => {
    const before = useEditorStore.getState()
    const beforeRowShape = before.rowShape
    const beforeCells = before.cells
    useEditorStore.getState().addRowAtTop()
    useEditorStore.getState().removeRowAtTop()
    const after = useEditorStore.getState()
    expect(after.rows).toBe(4)
    expect(after.rowShape).toEqual(beforeRowShape)
    expect(after.cells).toEqual(beforeCells)
  })

  it('cada llamada agrega exactamente una entrada al historial de deshacer (un solo paso, no varios)', () => {
    expect(useEditorStore.getState().history).toHaveLength(0)
    useEditorStore.getState().addRowAtTop()
    expect(useEditorStore.getState().history).toHaveLength(1)
    useEditorStore.getState().removeRowAtTop()
    expect(useEditorStore.getState().history).toHaveLength(2)
  })

  it('undo() deshace agregar una fila en un solo paso — rows, rowShape y cells vuelven juntos', () => {
    useEditorStore.getState().addRowAtTop()
    expect(useEditorStore.getState().rows).toBe(5)
    useEditorStore.getState().undo()
    const { rows, rowShape, cells } = useEditorStore.getState()
    expect(rows).toBe(4)
    expect(rowShape[0]).toEqual({ offset: 2, length: 1 })
    expect(cells['0,2']).toBe('#111111')
  })

  it('redo() vuelve a aplicar el cambio de fila deshecho', () => {
    useEditorStore.getState().addRowAtTop()
    useEditorStore.getState().undo()
    useEditorStore.getState().redo()
    expect(useEditorStore.getState().rows).toBe(5)
  })
})

describe('editorStore — reinicio explícito del progreso de tejido al cambiar filas (Corrección 3)', () => {
  const patternId = 'p_test_shape_row'

  beforeEach(() => {
    const rowShape = createShapedRowShape('triangle', 4, 4)
    resetStore({ rowShape, patternId })
    useEditorStore.setState({ cols: 4, rows: 4 })
    const doc: PatternDoc = {
      id: patternId,
      name: 'Test',
      config: { technique: 'brick', cols: 4, rows: 4, beadTypeId: 'miyuki-delica-11' },
      cells: {},
      rowShape,
      createdAt: 0,
      updatedAt: 0,
    }
    usePatternsStore.setState({ patterns: { [patternId]: doc }, order: [patternId] })
    useWeaveStore.setState({ progress: {}, loaded: {} })
  })

  it('no toca el progreso de tejido si no había ninguno guardado', () => {
    useEditorStore.getState().addRowAtTop()
    expect(useEditorStore.getState().weaveResetPending).toBeNull()
  })

  it('reinicia explícitamente el progreso guardado y expone el índice anterior para poder deshacerlo', () => {
    useWeaveStore.getState().setIndex(patternId, 7)
    useEditorStore.getState().addRowAtTop()
    expect(useWeaveStore.getState().getIndex(patternId)).toBe(-1) // reset, never left silently wrong
    expect(useEditorStore.getState().weaveResetPending).toBe(7) // the old value, for the undo toast
  })

  it('clearWeaveResetPending limpia el aviso sin tocar el progreso de tejido', () => {
    useWeaveStore.getState().setIndex(patternId, 7)
    useEditorStore.getState().addRowAtTop()
    useEditorStore.getState().clearWeaveResetPending()
    expect(useEditorStore.getState().weaveResetPending).toBeNull()
    expect(useWeaveStore.getState().getIndex(patternId)).toBe(-1)
  })
})
