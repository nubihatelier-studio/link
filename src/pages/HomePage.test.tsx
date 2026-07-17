import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter, WeaveProgressRecord } from '@/storage/types'
import { usePatternsStore } from '@/store/patternsStore'
import { useWeaveStore } from '@/store/weaveStore'

/** In-memory stand-in for the real adapter, so we can assert exactly when a delete reaches storage. */
function createFakeAdapter(seed: PatternDoc[], weaveProgress: WeaveProgressRecord[] = []): StorageAdapter {
  const patterns = new Map(seed.map((p) => [p.id, p]))
  const progress = new Map(weaveProgress.map((p) => [p.patternId, p]))
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

let fakeAdapter: StorageAdapter

vi.mock('@/storage', () => ({
  getStorageAdapter: () => Promise.resolve(fakeAdapter),
}))

describe('HomePage — eliminar con deshacer', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter([PATTERN])
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN },
      order: [PATTERN.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {} })
  })

  async function renderHome() {
    const { HomePage } = await import('./HomePage')
    return render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
  }

  it('deshacer restaura el patrón íntegro y nunca llega a borrarse del storage', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })
    await renderHome()

    expect(screen.getByText(PATTERN.name)).toBeInTheDocument()

    await user.click(screen.getByText('Eliminar'))

    // Optimistically hidden right away, but not yet gone from the store or the adapter.
    expect(screen.queryByText(PATTERN.name)).not.toBeInTheDocument()
    expect(usePatternsStore.getState().patterns[PATTERN.id]).toEqual(PATTERN)

    await user.click(screen.getByText('Deshacer'))

    // Undo brings it right back — grid, palette (cells) and identity untouched.
    expect(screen.getByText(PATTERN.name)).toBeInTheDocument()
    expect(usePatternsStore.getState().patterns[PATTERN.id]).toEqual(PATTERN)
    expect(await fakeAdapter.getPattern(PATTERN.id)).toEqual(PATTERN)

    vi.useRealTimers()
  })

  it('sin deshacer, el patrón se borra del store y del storage tras la ventana de ~6s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime })
    await renderHome()

    await user.click(screen.getByText('Eliminar'))
    expect(usePatternsStore.getState().patterns[PATTERN.id]).toEqual(PATTERN)

    await act(async () => {
      vi.advanceTimersByTime(6000)
    })

    await waitFor(() => expect(usePatternsStore.getState().patterns[PATTERN.id]).toBeUndefined())
    expect(await fakeAdapter.getPattern(PATTERN.id)).toBeUndefined()

    vi.useRealTimers()
  })

  it('navegar afuera con un borrado pendiente lo finaliza en vez de dejarlo "revivir"', async () => {
    const user = userEvent.setup()
    const { unmount } = await renderHome()

    await user.click(screen.getByText('Eliminar'))
    expect(usePatternsStore.getState().patterns[PATTERN.id]).toEqual(PATTERN)

    unmount()

    expect(usePatternsStore.getState().patterns[PATTERN.id]).toBeUndefined()
    await waitFor(async () => expect(await fakeAdapter.getPattern(PATTERN.id)).toBeUndefined())
  })

  it('cerrar la pestaña con un borrado pendiente también lo finaliza', async () => {
    const user = userEvent.setup()
    await renderHome()

    await user.click(screen.getByText('Eliminar'))
    expect(usePatternsStore.getState().patterns[PATTERN.id]).toEqual(PATTERN)

    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
    })

    expect(usePatternsStore.getState().patterns[PATTERN.id]).toBeUndefined()
    await waitFor(async () => expect(await fakeAdapter.getPattern(PATTERN.id)).toBeUndefined())
  })
})

const PATTERN_2: PatternDoc = {
  id: 'p_2',
  name: 'Aro loom',
  config: { technique: 'loom', cols: 10, rows: 20, beadTypeId: 'miyuki-delica-11' },
  cells: {},
  createdAt: 2,
  updatedAt: 2,
}

describe('HomePage — hero "Continuar tejiendo"', () => {
  async function renderHomeWithWeaveRoute() {
    const { HomePage } = await import('./HomePage')
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor/:id/weave" element={<p>pantalla de tejido</p>} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('sin progreso de tejido guardado, no muestra la card destacada', async () => {
    fakeAdapter = createFakeAdapter([PATTERN, PATTERN_2])
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN, [PATTERN_2.id]: PATTERN_2 },
      order: [PATTERN.id, PATTERN_2.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {}, allLoaded: false })

    await renderHomeWithWeaveRoute()

    expect(screen.queryByText('Continuar tejiendo')).not.toBeInTheDocument()
  })

  it('destaca el patrón con el progreso más reciente y lo saca de la lista normal', async () => {
    fakeAdapter = createFakeAdapter(
      [PATTERN, PATTERN_2],
      [
        { patternId: PATTERN.id, currentIndex: 2, updatedAt: 100 },
        { patternId: PATTERN_2.id, currentIndex: 5, updatedAt: 500 },
      ],
    )
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN, [PATTERN_2.id]: PATTERN_2 },
      order: [PATTERN.id, PATTERN_2.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {}, allLoaded: false })

    await renderHomeWithWeaveRoute()

    await waitFor(() => expect(screen.getByText('Continuar tejiendo')).toBeInTheDocument())
    // PATTERN_2 has the more recent update — it's the hero, and appears only once.
    expect(screen.getAllByText(PATTERN_2.name)).toHaveLength(1)
    // PATTERN still shows up in the regular list below.
    expect(screen.getByText(PATTERN.name)).toBeInTheDocument()
  })

  it('tocar la card destacada abre el modo tejido directo', async () => {
    const user = userEvent.setup()
    fakeAdapter = createFakeAdapter([PATTERN], [{ patternId: PATTERN.id, currentIndex: 2, updatedAt: 100 }])
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN },
      order: [PATTERN.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {}, allLoaded: false })

    await renderHomeWithWeaveRoute()

    await waitFor(() => expect(screen.getByText('Continuar tejiendo')).toBeInTheDocument())
    await user.click(screen.getByText('Continuar tejiendo'))

    expect(screen.getByText('pantalla de tejido')).toBeInTheDocument()
  })
})
