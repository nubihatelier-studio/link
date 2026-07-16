import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter } from '@/storage/types'
import { usePatternsStore } from '@/store/patternsStore'

/** In-memory stand-in for the real adapter, so we can assert exactly when a delete reaches storage. */
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
    async setWeaveProgress() {},
    async deleteWeaveProgress() {},
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
