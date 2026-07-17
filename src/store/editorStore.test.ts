import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from './editorStore'

function resetStore() {
  useEditorStore.setState({
    cells: { '0,0': '#111111', '1,1': '#222222', '2,3': '#111111', '0,3': '#222222' },
    colorLetters: { '#111111': 'A', '#222222': 'B' },
    cols: 10,
    rows: 10,
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
