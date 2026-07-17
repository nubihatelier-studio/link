import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyFringe } from '@/engine/fringe'
import type { FringeData } from '@/engine/types'
import { useEditorStore } from './editorStore'

function resetStore(overrides: { cells?: Record<string, string>; fringe?: FringeData; patternId?: string | null } = {}) {
  useEditorStore.setState({
    patternId: overrides.patternId ?? null,
    technique: 'brick',
    cells: overrides.cells ?? { '0,0': '#111111', '1,1': '#222222', '2,3': '#111111', '0,3': '#222222' },
    colorLetters: { '#111111': 'A', '#222222': 'B' },
    cols: 10,
    rows: 10,
    fringe: overrides.fringe ?? createEmptyFringe(10),
    tool: 'pencil',
    selection: null,
    colorSelectionMask: null,
    clipboard: null,
    history: [],
    future: [],
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
