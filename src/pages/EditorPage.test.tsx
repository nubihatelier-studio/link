import { render, screen } from '@testing-library/react'
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
