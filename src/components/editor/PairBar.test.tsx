import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import { useEditorStore } from '@/store/editorStore'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'
import { PairBar } from './PairBar'

const ID = 'p_bar'

function seed(technique: 'brick' | 'peyote', pair?: PatternDoc['pair']) {
  const doc: PatternDoc = {
    id: ID,
    name: 'Aro',
    config: { technique, cols: 3, rows: 2, beadTypeId: 'miyuki-delica-11' },
    cells: { '1,0': '#1c1c1e' },
    ...(pair ? { pair } : {}),
    createdAt: 0,
    updatedAt: 0,
  }
  usePatternsStore.setState({ patterns: { [ID]: doc }, order: [ID] })
  useEditorStore.getState().loadPattern(doc)
}

const saved = () => usePatternsStore.getState().getPattern(ID)!

describe('PairBar', () => {
  beforeEach(() => seed('brick'))

  it('sin par, ofrece crearlo; al tocarlo el patrón pasa a ser un par en espejo', async () => {
    const user = userEvent.setup()
    render(<PairBar />)
    await user.click(screen.getByRole('button', { name: t.editor.pair.create }))
    expect(saved().pair).toEqual({ mode: 'mirror' })
    expect(screen.getByRole('group', { name: t.editor.pair.sideLabel })).toBeInTheDocument()
  })

  it('cambia entre el aro izquierdo y el derecho', async () => {
    seed('brick', { mode: 'mirror' })
    const user = userEvent.setup()
    render(<PairBar />)
    await user.click(screen.getByRole('button', { name: t.editor.pair.right }))
    expect(useEditorStore.getState().side).toBe('right')
    // En el derecho se avisa que la forma se edita en el izquierdo.
    expect(screen.getByText(t.editor.pair.shapeFollowsLeft)).toBeInTheDocument()
  })

  it('"Por separado" le da colores propios al derecho, sin perder lo que se veía', async () => {
    seed('brick', { mode: 'mirror' })
    const user = userEvent.setup()
    render(<PairBar />)
    await user.click(screen.getByRole('button', { name: t.editor.pair.independent }))
    expect(saved().pair).toEqual({ mode: 'independent', rightCells: { '1,2': '#1c1c1e' } })
  })

  it('volver a "Espejo" descarta los colores propios, pero se puede deshacer', async () => {
    seed('brick', { mode: 'independent', rightCells: { '1,0': '#ff0000' } })
    const user = userEvent.setup()
    render(<PairBar />)
    await user.click(screen.getByRole('button', { name: t.editor.pair.mirror }))
    expect(saved().pair).toEqual({ mode: 'mirror' })

    await user.click(screen.getByRole('button', { name: t.common.undo }))
    expect(saved().pair).toEqual({ mode: 'independent', rightCells: { '1,0': '#ff0000' } })
  })

  it('quitar un par separado también se puede deshacer', async () => {
    seed('brick', { mode: 'independent', rightCells: { '1,0': '#ff0000' } })
    const user = userEvent.setup()
    render(<PairBar />)
    await user.click(screen.getByRole('button', { name: t.editor.pair.remove }))
    expect(saved().pair).toBeUndefined()
    await user.click(screen.getByRole('button', { name: t.common.undo }))
    expect(saved().pair?.mode).toBe('independent')
  })

  it('en peyote no aparece', () => {
    seed('peyote')
    const { container } = render(<PairBar />)
    expect(container).toBeEmptyDOMElement()
  })
})
