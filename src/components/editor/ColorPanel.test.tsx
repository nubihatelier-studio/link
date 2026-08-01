import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from '@/store/editorStore'
import { ColorPanel } from './ColorPanel'

function resetStore() {
  useEditorStore.setState({
    cells: { '0,0': '#111111', '0,1': '#111111', '0,2': '#222222' },
    slots: ['#111111', '#222222', '#8da2b0', '#ffffff'],
    activeSlot: 0,
    history: [],
    future: [],
    selection: null,
    colorSelectionMask: null,
    tool: 'pencil',
  })
}

describe('ColorPanel — reemplazar color globalmente', () => {
  beforeEach(() => {
    resetStore()
  })

  it('reemplaza todas las mostacillas del color elegido en una sola operación de deshacer', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    // Palette is sorted by letter — '#111111' (A) is the first row, so its "Reemplazar" button comes first.
    await user.click(screen.getAllByRole('button', { name: 'Reemplazar en todo el patrón' })[0])
    const panel = within(screen.getByTestId('replace-panel'))
    // First entry of QUICK_SWATCHES is always plain black — a fixed, known target.
    await user.click(panel.getByTitle('#000000'))
    await user.click(panel.getByRole('button', { name: 'Confirmar' }))

    const { cells, history } = useEditorStore.getState()
    expect(cells).toEqual({ '0,0': '#000000', '0,1': '#000000', '0,2': '#222222' })
    expect(history).toHaveLength(1)
  })

  it('doble clic en el swatch de la paleta abre el reemplazo directo', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    expect(screen.queryByText('Confirmar')).not.toBeInTheDocument()
    // The swatch span and the description text both carry title="#111111" — the swatch renders first.
    await user.dblClick(screen.getAllByTitle('#111111')[0])
    expect(screen.getByText('Confirmar')).toBeInTheDocument()
  })

  it('no deja abiertos a la vez el panel de reemplazo y el de fusión', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    await user.click(screen.getAllByRole('button', { name: 'Reemplazar en todo el patrón' })[0])
    expect(screen.getByText('Confirmar')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Fusionar colores' })[0])
    expect(screen.queryByText('Confirmar')).not.toBeInTheDocument()
  })
})

describe('ColorPanel — intercambiar dos colores', () => {
  beforeEach(() => {
    resetStore()
  })

  it('intercambia ambos colores en todo el patrón en una sola operación de deshacer', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    // '#111111' (A) is the first palette row — its "Intercambiar" button comes first.
    await user.click(screen.getAllByRole('button', { name: 'Intercambiar con…' })[0])
    const panel = within(screen.getByTestId('swap-panel'))
    await user.click(panel.getByTitle('#111111 ↔ #222222'))

    const { cells, history } = useEditorStore.getState()
    expect(cells).toEqual({ '0,0': '#222222', '0,1': '#222222', '0,2': '#111111' })
    expect(history).toHaveLength(1)
  })

  it('no deja abierto el panel de fusión al abrir el de intercambio', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    await user.click(screen.getAllByRole('button', { name: 'Fusionar colores' })[0])
    expect(screen.getByTestId('merge-panel')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Intercambiar con…' })[0])
    expect(screen.queryByTestId('merge-panel')).not.toBeInTheDocument()
  })
})

describe('ColorPanel — seleccionar por color', () => {
  beforeEach(() => {
    resetStore()
  })

  it('selecciona todas las mostacillas del color y cambia a la herramienta de selección', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    await user.click(screen.getAllByRole('button', { name: 'Seleccionar mostacillas de este color' })[0])

    const { selection, colorSelectionMask, tool } = useEditorStore.getState()
    expect(selection).toEqual({ r0: 0, c0: 0, r1: 0, c1: 1 })
    expect(colorSelectionMask).toEqual(new Set(['0,0', '0,1']))
    expect(tool).toBe('select')
  })

  it('cierra cualquier panel de reemplazo/fusión/intercambio abierto', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    await user.click(screen.getAllByRole('button', { name: 'Fusionar colores' })[0])
    expect(screen.getByTestId('merge-panel')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Seleccionar mostacillas de este color' })[0])
    expect(screen.queryByTestId('merge-panel')).not.toBeInTheDocument()
  })
})

describe('ColorPanel — usados y sin usar están separados (Tarea 2)', () => {
  beforeEach(() => {
    resetStore()
  })

  /** Los swatches de arriba: los usados llevan letra y conteo en su etiqueta accesible. */
  function usedSwatches() {
    return screen.getAllByRole('button', { name: /^Color [A-Z]+ · \d+ mostacilla/ })
  }

  /** Los swatches sin usar se nombran "<hex> — Sin usar todavía…", a diferencia del botón que pliega el grupo. */
  function unusedSwatches() {
    return screen.getAllByRole('button', { name: /^#[0-9a-f]{6} — Sin usar todavía/i })
  }

  function unusedSwatch(hex: string) {
    return screen.getByRole('button', { name: new RegExp(`^${hex} — Sin usar todavía`, 'i') })
  }

  function unusedToggle() {
    return screen.getByRole('button', { name: /^Sin usar todavía \(\d+\)$/ })
  }

  it('los colores usados van primero, en orden de letra, con su letra y su conteo', () => {
    render(<ColorPanel />)

    const used = usedSwatches()
    expect(used).toHaveLength(2)
    // '#111111' se teje primero (celda 0,0) → A, con 2 mostacillas; '#222222' → B, con 1.
    expect(used[0]).toHaveAccessibleName('Color A · 2 mostacillas')
    expect(used[1]).toHaveAccessibleName('Color B · 1 mostacilla')
    expect(within(used[0]).getByText('A')).toBeInTheDocument()
    expect(within(used[0]).getByText('2')).toBeInTheDocument()
  })

  it('los colores de la paleta que no se pintaron van aparte, sin letra, bajo "Sin usar todavía"', () => {
    render(<ColorPanel />)

    expect(unusedToggle()).toHaveAccessibleName('Sin usar todavía (2)')
    const unused = unusedSwatches()
    expect(unused).toHaveLength(2) // '#8da2b0' y '#ffffff': están en los slots, no en el diseño
    for (const swatch of unused) expect(swatch).toHaveTextContent('')
  })

  it('un color sin usar sigue siendo seleccionable para pintar', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    await user.click(unusedSwatch('#8da2b0'))
    const { slots, activeSlot } = useEditorStore.getState()
    expect(slots[activeSlot]).toBe('#8da2b0')
  })

  it('al pintarse por primera vez, un color sin usar pasa al grupo de usados con la letra siguiente', () => {
    useEditorStore.setState({ cells: { '0,0': '#111111', '0,1': '#111111', '0,2': '#222222', '0,3': '#8da2b0' } })
    render(<ColorPanel />)

    const used = usedSwatches()
    expect(used).toHaveLength(3)
    expect(used[2]).toHaveAccessibleName('Color C · 1 mostacilla')
    expect(unusedToggle()).toHaveAccessibleName('Sin usar todavía (1)')
  })

  it('el grupo "sin usar" se puede plegar, para que el panel no se estire en pantallas angostas', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    const toggle = unusedToggle()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(unusedSwatches()).toHaveLength(2)

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryAllByRole('button', { name: /^#[0-9a-f]{6} — Sin usar todavía/i })).toHaveLength(0)
  })

  it('el color activo se destaca esté usado o no', async () => {
    const user = userEvent.setup()
    render(<ColorPanel />)

    expect(usedSwatches()[0]).toHaveAttribute('aria-pressed', 'true') // slot 0 = '#111111', usado

    await user.click(unusedSwatch('#ffffff'))
    expect(unusedSwatch('#ffffff')).toHaveAttribute('aria-pressed', 'true')
    expect(usedSwatches()[0]).toHaveAttribute('aria-pressed', 'false')
  })

  it('sin nada pintado no hay separación que hacer: la paleta se muestra como una sola fila', () => {
    useEditorStore.setState({ cells: {} })
    render(<ColorPanel />)

    expect(screen.queryByRole('button', { name: /^Sin usar todavía \(\d+\)$/ })).not.toBeInTheDocument()
    expect(unusedSwatches()).toHaveLength(4)
  })
})
