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
