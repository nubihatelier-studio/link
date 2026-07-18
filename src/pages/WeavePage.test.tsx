import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter, WeaveProgressRecord } from '@/storage/types'
import { usePatternsStore } from '@/store/patternsStore'
import { useWeaveStore } from '@/store/weaveStore'

function createFakeAdapter(): StorageAdapter {
  const progress = new Map<string, WeaveProgressRecord>()
  return {
    backend: 'indexeddb',
    async init() {},
    async listPatterns() {
      return []
    },
    async getPattern() {
      return undefined
    },
    async savePattern() {},
    async deletePattern() {},
    async getWeaveProgress(patternId) {
      return progress.get(patternId)
    },
    async listWeaveProgress() {
      return [...progress.values()]
    },
    async setWeaveProgress(record) {
      progress.set(record.patternId, record)
    },
    async deleteWeaveProgress(patternId) {
      progress.delete(patternId)
    },
  }
}

const PATTERN: PatternDoc = {
  id: 'p_1',
  name: 'Flor peyote',
  config: { technique: 'peyote', cols: 6, rows: 50, beadTypeId: 'miyuki-delica-11' },
  cells: { '0,0': '#1c1c1e', '0,1': '#c9a227' },
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

describe('WeavePage — reiniciar con deshacer', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter()
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN },
      order: [PATTERN.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {} })
  })

  async function renderWeave() {
    const { WeavePage } = await import('./WeavePage')
    return render(
      <MemoryRouter initialEntries={[`/editor/${PATTERN.id}/weave`]}>
        <Routes>
          <Route path="/editor/:id/weave" element={<WeavePage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('deshacer restaura el progreso de tejido exacto', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })
    await renderWeave()

    // Advance a few beads so there's real progress to lose.
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Siguiente →'))
    const indexBeforeReset = useWeaveStore.getState().getIndex(PATTERN.id)
    expect(indexBeforeReset).toBe(2)

    await user.click(screen.getByText('Reiniciar'))
    expect(useWeaveStore.getState().getIndex(PATTERN.id)).toBe(-1)

    await user.click(screen.getByText('Deshacer'))
    expect(useWeaveStore.getState().getIndex(PATTERN.id)).toBe(indexBeforeReset)
    expect((await fakeAdapter.getWeaveProgress(PATTERN.id))?.currentIndex).toBe(indexBeforeReset)

    vi.useRealTimers()
  })

  it('sin deshacer, el progreso queda reiniciado tras la ventana de ~6s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })
    await renderWeave()

    await user.click(screen.getByText('Siguiente →'))
    await user.click(screen.getByText('Reiniciar'))

    await act(async () => {
      vi.advanceTimersByTime(6000)
    })

    expect(useWeaveStore.getState().getIndex(PATTERN.id)).toBe(-1)
    expect((await fakeAdapter.getWeaveProgress(PATTERN.id))?.currentIndex).toBe(-1)

    vi.useRealTimers()
  })
})

describe('WeavePage — selector "Ir a" con flecos', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter()
    usePatternsStore.setState({
      patterns: { [PATTERN_WITH_FRINGE.id]: PATTERN_WITH_FRINGE },
      order: [PATTERN_WITH_FRINGE.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {} })
  })

  async function renderWeaveWithFringe() {
    const { WeavePage } = await import('./WeavePage')
    return render(
      <MemoryRouter initialEntries={[`/editor/${PATTERN_WITH_FRINGE.id}/weave`]}>
        <Routes>
          <Route path="/editor/:id/weave" element={<WeavePage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('lista las columnas de fleco después de las filas del cuerpo, y saltar a una avanza el progreso al primer bead de esa columna', async () => {
    const user = userEvent.setup()
    await renderWeaveWithFringe()

    // Etiqueta genérica "Ir a" en vez de "Ir a fila", porque el patrón tiene flecos.
    expect(screen.getByText('Ir a')).toBeInTheDocument()
    expect(screen.queryByText('Ir a fila')).not.toBeInTheDocument()

    const select = screen.getByRole('combobox') as HTMLSelectElement
    // 6 filas de cuerpo + 8 columnas de fleco (ninguna con largo 0 en este patrón).
    expect(select.options).toHaveLength(6 + 8)
    expect(screen.getByRole('option', { name: 'Fleco · Columna 5' })).toBeInTheDocument()

    await user.selectOptions(select, 'Fleco · Columna 5')

    // Body 8x6 = 48 beads (índices 0-47). Fleco col0 largo1, col1 largo2, col2 largo4, col3 largo5
    // -> columna 4 (Columna 5, 1-based) empieza en 48+1+2+4+5 = 60. "Ir a" posiciona el progreso
    // un bead antes (59, igual que el resto de la navegación por "Siguiente"/"Marcar hecho"), de
    // modo que el próximo bead a tejer — el que se resalta en el lienzo — es el primero de esa columna.
    expect(useWeaveStore.getState().getIndex(PATTERN_WITH_FRINGE.id)).toBe(59)

    await user.click(screen.getByText('Siguiente →'))
    expect(useWeaveStore.getState().getIndex(PATTERN_WITH_FRINGE.id)).toBe(60)
    // "Fleco · Columna 5" also appears as a <select> option, so scope the match to the header's
    // progress line specifically (the only place "mostacillas tejidas" appears).
    expect(screen.getByText(/Fleco · Columna 5 · 61 \/ 72 mostacillas tejidas/)).toBeInTheDocument()
  })

  it('omite columnas con largo de fleco 0', async () => {
    usePatternsStore.setState({
      patterns: {
        [PATTERN_WITH_FRINGE.id]: {
          ...PATTERN_WITH_FRINGE,
          fringe: { lengths: [0, 3, 0, 3, 0, 0, 0, 0], turnBeads: [false, true, false, true, false, false, false, false] },
        },
      },
    })
    await renderWeaveWithFringe()

    expect(screen.getByRole('option', { name: 'Fleco · Columna 2' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Fleco · Columna 4' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Fleco · Columna 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Fleco · Columna 3' })).not.toBeInTheDocument()
  })
})
