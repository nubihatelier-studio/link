import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { usePatternsStore } from '@/store/patternsStore'
import { createEmptyFringe } from '@/engine/fringe'
import { createRectangleRowShape } from '@/engine/shape'
import { t } from '@/i18n/es'
import { ShoppingListDialog } from './ShoppingListDialog'

const NEGRO = '#111111'
const DORADO = '#c9a227'

beforeEach(() => {
  usePatternsStore.setState({ patterns: {}, order: [] })
  useEditorStore.setState({
    patternId: null,
    technique: 'peyote',
    cols: 2,
    rows: 2,
    beadTypeId: 'miyuki-delica-11',
    // 3 negras y 1 dorada.
    cells: { '0,0': NEGRO, '0,1': NEGRO, '1,0': NEGRO, '1,1': DORADO },
    fringe: createEmptyFringe(2),
    rowShape: createRectangleRowShape(2, 2),
    staggerPhase: 0,
    loop: undefined,
    pair: undefined,
    side: 'left',
    slots: [NEGRO, DORADO],
    activeSlot: 0,
    history: [],
    future: [],
  })
})

describe('Lista de compras', () => {
  it('lista cada color con su cantidad y sus gramos', () => {
    render(<ShoppingListDialog onClose={() => {}} />)
    const filas = screen.getAllByRole('listitem')
    expect(filas).toHaveLength(2)
    expect(within(filas[0]).getByText(t.editor.shopping.beads(3))).toBeInTheDocument()
    expect(within(filas[1]).getByText(t.editor.shopping.beads(1))).toBeInTheDocument()
    // 3 Delica pesan bastante menos de un gramo, pero nunca se dice "0 g".
    expect(within(filas[0]).getByText(t.editor.shopping.grams(0.1))).toBeInTheDocument()
  })

  it('propone códigos para buscar en la tienda', () => {
    render(<ShoppingListDialog onClose={() => {}} />)
    // Tanto el negro como el dorado tienen mostacillas parecidas en la cartilla.
    expect(screen.getAllByText(/DB-/).length).toBeGreaterThanOrEqual(2)
  })

  it('dice el hilo y la aguja, que también hay que comprar', () => {
    render(<ShoppingListDialog onClose={() => {}} />)
    expect(screen.getByText(t.editor.shopping.thread)).toBeInTheDocument()
    expect(screen.getByText(t.editor.shopping.needle)).toBeInTheDocument()
  })

  it('sin nada pintado no inventa una lista', () => {
    useEditorStore.setState({ cells: {} })
    render(<ShoppingListDialog onClose={() => {}} />)
    expect(screen.getByText(t.editor.shopping.empty)).toBeInTheDocument()
  })
})
