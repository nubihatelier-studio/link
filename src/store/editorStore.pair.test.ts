import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoopData, PatternDoc } from '@/engine/types'
import { usePatternsStore } from '@/store/patternsStore'
import { useEditorStore } from './editorStore'

const ID = 'p_par'
const LEFT_ONLY = '#1c1c1e'
const GOLD = '#c9a227'

/** Un aro loom 3×1 con el negro corrido a la izquierda: su espejo pone el negro a la derecha. */
function seed(pair: PatternDoc['pair']) {
  const doc: PatternDoc = {
    id: ID,
    name: 'Aro',
    config: { technique: 'loom', cols: 3, rows: 1, beadTypeId: 'miyuki-delica-11' },
    cells: { '0,0': LEFT_ONLY, '0,1': GOLD, '0,2': GOLD },
    ...(pair ? { pair } : {}),
    createdAt: 0,
    updatedAt: 0,
  }
  usePatternsStore.setState({ patterns: { [ID]: doc }, order: [ID] })
  useEditorStore.getState().loadPattern(doc)
}

const saved = () => usePatternsStore.getState().getPattern(ID)!
const editor = () => useEditorStore.getState()

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('editorStore — par de aros', () => {
  it('al abrir un par se ve el aro izquierdo', () => {
    seed({ mode: 'mirror' })
    expect(editor().side).toBe('left')
    expect(editor().cells['0,0']).toBe(LEFT_ONLY)
  })

  it('el derecho, en espejo, muestra el reflejo del izquierdo', () => {
    seed({ mode: 'mirror' })
    editor().setSide('right')
    expect(editor().side).toBe('right')
    expect(editor().cells).toEqual({ '0,2': LEFT_ONLY, '0,1': GOLD, '0,0': GOLD })
  })

  it('en espejo, el derecho no se puede pintar: es el reflejo, no tiene colores propios', () => {
    seed({ mode: 'mirror' })
    editor().setSide('right')
    editor().paintCell(0, 1, '#ff0000')
    editor().strokeStart()
    editor().strokeCell(0, 0, '#ff0000')
    editor().strokeEnd()
    vi.runAllTimers()
    expect(editor().cells['0,1']).toBe(GOLD)
    expect(editor().cells['0,0']).toBe(GOLD)
    expect(saved().cells).toEqual({ '0,0': LEFT_ONLY, '0,1': GOLD, '0,2': GOLD })
  })

  it('pintar el izquierdo en espejo se ve en el derecho al cambiar de lado', () => {
    seed({ mode: 'mirror' })
    editor().paintCell(0, 1, '#ff0000')
    editor().setSide('right') // guarda lo pendiente antes de cambiar
    expect(editor().cells['0,1']).toBe('#ff0000')
  })

  it('separar los colores deja el derecho igual a como se veía, y ahora sí se puede pintar', () => {
    seed({ mode: 'mirror' })
    editor().setSide('right')
    editor().splitPairColors()
    expect(saved().pair?.mode).toBe('independent')
    expect(editor().cells).toEqual({ '0,2': LEFT_ONLY, '0,1': GOLD, '0,0': GOLD })

    editor().paintCell(0, 0, '#ff0000') // una inicial, por ejemplo
    vi.runAllTimers()
    const pair = saved().pair
    expect(pair?.mode === 'independent' && pair.rightCells['0,0']).toBe('#ff0000')
    // El izquierdo no se entera.
    expect(saved().cells).toEqual({ '0,0': LEFT_ONLY, '0,1': GOLD, '0,2': GOLD })
  })

  it('cambiar de lado antes de que se guarde no mezcla los colores de un aro con el otro', () => {
    seed({ mode: 'mirror' })
    editor().setSide('right')
    editor().splitPairColors()
    editor().paintCell(0, 0, '#ff0000')
    editor().setSide('left') // antes de los 600ms del guardado automático
    vi.runAllTimers()

    expect(saved().cells['0,0']).toBe(LEFT_ONLY)
    const pair = saved().pair
    expect(pair?.mode === 'independent' && pair.rightCells['0,0']).toBe('#ff0000')
    expect(editor().cells['0,0']).toBe(LEFT_ONLY)
  })

  it('deshacer en el derecho revierte sólo sus colores', () => {
    seed({ mode: 'mirror' })
    editor().setSide('right')
    editor().splitPairColors()
    editor().paintCell(0, 0, '#ff0000')
    editor().undo()
    const pair = saved().pair
    expect(pair?.mode === 'independent' && pair.rightCells['0,0']).toBe(GOLD)
    expect(saved().cells).toEqual({ '0,0': LEFT_ONLY, '0,1': GOLD, '0,2': GOLD })
  })

  it('la forma, los flecos y la argolla no se tocan desde el derecho: siguen al izquierdo', () => {
    seed({ mode: 'mirror' })
    editor().setSide('right')
    editor().splitPairColors()
    const loop: LoopData = { variant: 'woven', beadCount: 8, color: GOLD }
    editor().setLoop(loop)
    editor().setFringeLength(0, 3)
    expect(saved().loop).toBeUndefined()
    expect(saved().fringe).toBeUndefined()
  })

  it('volver a espejar reemplaza el derecho por el reflejo del izquierdo', () => {
    seed({ mode: 'independent', rightCells: { '0,0': '#ff0000' } })
    editor().setSide('right')
    editor().setPair({ mode: 'mirror' })
    expect(saved().pair).toEqual({ mode: 'mirror' })
    expect(editor().cells).toEqual({ '0,2': LEFT_ONLY, '0,1': GOLD, '0,0': GOLD })
  })

  it('quitar el par estando en el derecho vuelve al izquierdo', () => {
    seed({ mode: 'mirror' })
    editor().setSide('right')
    editor().setPair(undefined)
    expect(saved().pair).toBeUndefined()
    expect(editor().side).toBe('left')
    expect(editor().cells['0,0']).toBe(LEFT_ONLY)
  })

  it('un patrón sin par no tiene aro derecho que mostrar', () => {
    seed(undefined)
    editor().setSide('right')
    expect(editor().side).toBe('left')
  })
})
