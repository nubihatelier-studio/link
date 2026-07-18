import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter } from '@/storage/types'
import { beadCount } from '@/engine/geometry'
import { createFringeLengths, totalFringeBeadCount } from '@/engine/fringe'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'

function createFakeAdapter(): StorageAdapter {
  const patterns = new Map<string, PatternDoc>()
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

vi.mock('@/storage', () => ({
  getStorageAdapter: () => Promise.resolve(createFakeAdapter()),
}))

describe('ConfiguratorPage — conteo total con flecos activados', () => {
  beforeEach(() => {
    usePatternsStore.setState({ patterns: {}, order: [], hydrated: true, migrationResult: null })
  })

  it('la plantilla "Aro con flecos" muestra el total cuerpo + flecos, no solo cols × rows', async () => {
    const user = userEvent.setup()
    const { ConfiguratorPage } = await import('./ConfiguratorPage')
    render(
      <MemoryRouter>
        <ConfiguratorPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: new RegExp(t.configurator.templates.aroFlecos) }))

    // brick 12×12 cuerpo + fleco en V (largo máx. 10) — misma fórmula pura que usa el componente.
    const bodyTotal = beadCount('brick', 12, 12)
    const fringeLengths = createFringeLengths('v', 12, 10)
    const fringeTotal = totalFringeBeadCount({ lengths: fringeLengths, turnBeads: [] })
    const expectedTotal = bodyTotal + fringeTotal

    expect(fringeTotal).toBeGreaterThan(0) // guard: si esto es 0, el test no prueba nada
    expect(screen.getByText(expectedTotal.toLocaleString('es'))).toBeInTheDocument()
    expect(screen.queryByText(bodyTotal.toLocaleString('es'))).not.toBeInTheDocument()
  })
})
