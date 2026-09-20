import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { useEditorPrefsStore } from '@/store/editorPrefsStore'
import { createEmptyFringe } from '@/engine/fringe'
import { createRectangleRowShape } from '@/engine/shape'
import { t } from '@/i18n/es'
import { EditorPanelTabs } from './EditorPanelTabs'

beforeEach(() => {
  useEditorStore.setState({
    patternId: null,
    technique: 'brick',
    cols: 6,
    rows: 6,
    cells: {},
    slots: [null, null, null, null, null, null],
    activeSlot: 0,
    fringe: createEmptyFringe(6),
    rowShape: createRectangleRowShape(6, 6),
    staggerPhase: 0,
    loop: undefined,
    pair: undefined,
    side: 'left',
    history: [],
    future: [],
  })
  useEditorPrefsStore.setState({ panelTab: 'colors' })
})

const everything = { shapeCapable: true, fringeCapable: true, loopCapable: true }
const tab = (name: string) => screen.getByRole('tab', { name })

describe('Paneles del editor en pestañas', () => {
  it('abre en Colores y muestra una sola pestaña a la vez', () => {
    render(<EditorPanelTabs {...everything} />)
    expect(tab(t.editor.colorsTitle)).toHaveAttribute('aria-selected', 'true')
    expect(tab(t.editor.shape.shortTitle)).toHaveAttribute('aria-selected', 'false')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
  })

  it('cambia de pestaña y se acuerda para el próximo patrón', async () => {
    const user = userEvent.setup()
    render(<EditorPanelTabs {...everything} />)
    await user.click(tab(t.editor.shape.shortTitle))
    expect(tab(t.editor.shape.shortTitle)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(t.editor.shape.hint)).toBeInTheDocument()
    expect(useEditorPrefsStore.getState().panelTab).toBe('shape')
  })

  it('no ofrece Forma ni Flecos en una pieza que no los tiene', () => {
    render(<EditorPanelTabs shapeCapable={false} fringeCapable={false} loopCapable />)
    expect(screen.queryByRole('tab', { name: t.editor.shape.shortTitle })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: t.editor.fringe.shortTitle })).not.toBeInTheDocument()
    expect(tab(t.editor.loop.shortTitle)).toBeInTheDocument()
  })

  it('si el patrón no tiene la pestaña guardada muestra Colores, sin olvidar la elección', () => {
    useEditorPrefsStore.setState({ panelTab: 'shape' })
    render(<EditorPanelTabs shapeCapable={false} fringeCapable loopCapable />)
    expect(tab(t.editor.colorsTitle)).toHaveAttribute('aria-selected', 'true')
    // La elección sigue guardada: el próximo patrón que sí se pueda formar abre en Forma.
    expect(useEditorPrefsStore.getState().panelTab).toBe('shape')
  })
})
