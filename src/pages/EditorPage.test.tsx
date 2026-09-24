import { t } from '@/i18n/es'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter } from '@/storage/types'
import { usePatternsStore } from '@/store/patternsStore'
import { useEditorStore } from '@/store/editorStore'

function createFakeAdapter(seed: PatternDoc[]): StorageAdapter {
  const patterns = new Map(seed.map((p) => [p.id, p]))
  return {
    backend: 'indexeddb',
    async init() {},
    async listPatterns() {
      return [...patterns.values()]
    },
    async getPattern(id) {
      return patterns.get(id)
    },
    async savePattern(doc) {
      patterns.set(doc.id, doc)
    },
    async deletePattern(id) {
      patterns.delete(id)
    },
    async getWeaveProgress() {
      return undefined
    },
    async listWeaveProgress() {
      return []
    },
    async setWeaveProgress() {},
    async deleteWeaveProgress() {},
  }
}

const PATTERN: PatternDoc = {
  id: 'p_1',
  name: 'Flor peyote',
  config: { technique: 'peyote', cols: 6, rows: 6, beadTypeId: 'miyuki-delica-11' },
  cells: {},
  createdAt: 1,
  updatedAt: 1,
}

const PATTERN_WITH_FRINGE: PatternDoc = {
  id: 'p_2',
  name: 'Aro con flecos',
  config: { technique: 'brick', cols: 8, rows: 6, beadTypeId: 'miyuki-delica-11' },
  cells: {},
  fringe: { lengths: [1, 2, 4, 5, 5, 4, 2, 1], turnBeads: [true, true, true, true, true, true, true, true] },
  createdAt: 1,
  updatedAt: 1,
}

let fakeAdapter: StorageAdapter

vi.mock('@/storage', () => ({
  getStorageAdapter: () => Promise.resolve(fakeAdapter),
}))

describe('EditorPage — atajos de teclado', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter([PATTERN])
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN },
      order: [PATTERN.id],
      hydrated: true,
      migrationResult: null,
    })
  })

  async function renderEditor() {
    const { EditorPage } = await import('./EditorPage')
    return render(
      <MemoryRouter initialEntries={[`/editor/${PATTERN.id}`]}>
        <Routes>
          <Route path="/editor/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('las teclas de herramienta cambian la herramienta activa', async () => {
    const user = userEvent.setup()
    await renderEditor()

    await user.keyboard('l')
    expect(useEditorStore.getState().tool).toBe('line')

    await user.keyboard('e')
    expect(useEditorStore.getState().tool).toBe('eraser')

    await user.keyboard('s')
    expect(useEditorStore.getState().tool).toBe('select')
  })

  it('las teclas de herramienta no interfieren mientras se escribe el nombre del patrón', async () => {
    const user = userEvent.setup()
    await renderEditor()

    useEditorStore.setState({ tool: 'pencil' })
    const nameInput = screen.getByDisplayValue(PATTERN.name)
    await user.click(nameInput)
    await user.keyboard('e')

    expect(useEditorStore.getState().tool).toBe('pencil')
  })

  it('+ / - acercan y alejan el zoom', async () => {
    const user = userEvent.setup()
    await renderEditor()

    const zoomBefore = useEditorStore.getState().zoom
    await user.keyboard('+')
    expect(useEditorStore.getState().zoom).toBe(zoomBefore + 25)

    await user.keyboard('-')
    expect(useEditorStore.getState().zoom).toBe(zoomBefore)
  })

  it('Ctrl+Z deshace y Ctrl+Shift+Z rehace', async () => {
    const user = userEvent.setup()
    await renderEditor()

    useEditorStore.getState().paintCell(0, 0, '#c9a227')
    expect(useEditorStore.getState().cells['0,0']).toBe('#c9a227')

    await user.keyboard('{Control>}z{/Control}')
    expect(useEditorStore.getState().cells['0,0']).toBeUndefined()

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(useEditorStore.getState().cells['0,0']).toBe('#c9a227')
  })
})

describe('EditorPage — conteo de mostacillas en el subtítulo', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter([PATTERN_WITH_FRINGE])
    usePatternsStore.setState({
      patterns: { [PATTERN_WITH_FRINGE.id]: PATTERN_WITH_FRINGE },
      order: [PATTERN_WITH_FRINGE.id],
      hydrated: true,
      migrationResult: null,
    })
  })

  it('suma cuerpo + flecos, no solo cols × rows', async () => {
    const { EditorPage } = await import('./EditorPage')
    render(
      <MemoryRouter initialEntries={[`/editor/${PATTERN_WITH_FRINGE.id}`]}>
        <Routes>
          <Route path="/editor/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    // Cuerpo: 8×6 = 48. Flecos: 1+2+4+5+5+4+2+1 = 24. Total: 72.
    expect(await screen.findByText(/72 mostacillas/)).toBeInTheDocument()
    expect(screen.queryByText(/48 mostacillas/)).not.toBeInTheDocument()
  })
})

const PATTERN_WITH_SHAPE: PatternDoc = {
  id: 'p_3',
  name: 'Peyote triangular',
  config: { technique: 'brick', cols: 4, rows: 2, beadTypeId: 'miyuki-delica-11' },
  cells: {},
  // Triangle: row 0 has 2 cols (centered), row 1 (the last) is full width — 2 + 4 = 6, not 4×2=8.
  rowShape: [
    { offset: 1, length: 2 },
    { offset: 0, length: 4 },
  ],
  createdAt: 1,
  updatedAt: 1,
}

describe('EditorPage — conteo de mostacillas con cuerpo con forma', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter([PATTERN_WITH_SHAPE])
    usePatternsStore.setState({
      patterns: { [PATTERN_WITH_SHAPE.id]: PATTERN_WITH_SHAPE },
      order: [PATTERN_WITH_SHAPE.id],
      hydrated: true,
      migrationResult: null,
    })
  })

  it('usa el conteo real de celdas activas, no cols × rows', async () => {
    const { EditorPage } = await import('./EditorPage')
    render(
      <MemoryRouter initialEntries={[`/editor/${PATTERN_WITH_SHAPE.id}`]}>
        <Routes>
          <Route path="/editor/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText(/6 mostacillas/)).toBeInTheDocument()
    expect(screen.queryByText(/8 mostacillas/)).not.toBeInTheDocument()
  })
})

describe('EditorPage — guardar como plantilla', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter([PATTERN])
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN },
      order: [PATTERN.id],
      templates: {},
      hydrated: true,
      migrationResult: null,
    })
  })

  async function renderEditor() {
    const { EditorPage } = await import('./EditorPage')
    return render(
      <MemoryRouter initialEntries={[`/editor/${PATTERN.id}`]}>
        <Routes>
          <Route path="/editor/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  async function openSaveDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: t.editor.moreActions }))
    await user.click(screen.getByRole('button', { name: new RegExp(t.editor.saveTemplate.menu) }))
    return screen.getByLabelText(t.editor.saveTemplate.nameLabel) as HTMLInputElement
  }

  it('el menú "⋯" guarda el patrón como plantilla con el nombre que se elija, y se puede deshacer', async () => {
    const user = userEvent.setup()
    await renderEditor()

    const input = await openSaveDialog(user)
    expect(input.value).toBe(PATTERN.name)
    await user.clear(input)
    await user.type(input, 'Flower Ring')
    await user.click(screen.getByRole('button', { name: t.editor.saveTemplate.save }))

    const templates = Object.values(usePatternsStore.getState().templates)
    expect(templates).toHaveLength(1)
    expect(templates[0]).toMatchObject({ name: 'Flower Ring', isTemplate: true, config: PATTERN.config })
    const toast = screen.getByText(t.editor.saveTemplate.saved('Flower Ring')).parentElement!
    await user.click(within(toast).getByRole('button', { name: t.common.undo }))
    expect(Object.values(usePatternsStore.getState().templates)).toHaveLength(0)
  })

  it('con un nombre que ya existe avisa y ofrece reemplazar, sin duplicarla', async () => {
    const user = userEvent.setup()
    await renderEditor()

    const input = await openSaveDialog(user)
    await user.clear(input)
    await user.type(input, 'Flower Ring{Enter}')

    const again = await openSaveDialog(user)
    await user.clear(again)
    await user.type(again, 'flower ring')
    expect(screen.getByText(t.editor.saveTemplate.exists('Flower Ring'))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.editor.saveTemplate.replace }))
    expect(Object.values(usePatternsStore.getState().templates)).toHaveLength(1)
  })
})

describe('EditorPage — hojas del celular', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter([PATTERN_WITH_FRINGE])
    usePatternsStore.setState({
      patterns: { [PATTERN_WITH_FRINGE.id]: PATTERN_WITH_FRINGE },
      order: [PATTERN_WITH_FRINGE.id],
      templates: {},
      hydrated: true,
      migrationResult: null,
    })
  })

  it('la hoja de flecos tiene su título, se desplaza y se cierra con "Listo"', async () => {
    const user = userEvent.setup()
    const { EditorPage } = await import('./EditorPage')
    render(
      <MemoryRouter initialEntries={[`/editor/${PATTERN_WITH_FRINGE.id}`]}>
        <Routes>
          <Route path="/editor/:id" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const chip = screen.getAllByRole('button', { name: t.editor.fringe.shortTitle }).find((b) => b.closest('nav'))!
    await user.click(chip)
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: t.editor.fringe.title })).toBeInTheDocument()
    // El cuerpo de la hoja es el que se desplaza, no una caja recortada.
    expect(sheet.querySelector('.overflow-y-auto')).not.toBeNull()

    await user.click(within(sheet).getByRole('button', { name: t.editor.colorsDone }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
