import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FringeData, PatternConfig, PatternDoc, RowShape } from '@/engine/types'
import type { StorageAdapter } from '@/storage/types'
import { beadCount } from '@/engine/geometry'
import { createFringeLengthsForShape, totalFringeBeadCount } from '@/engine/fringe'
import { createShapedRowShape } from '@/engine/shape'
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

    // brick 13×13 cuerpo en rombo (idealDimensionsFor('rhombus', 12) — tapera parejo,
    // ver "Generar bordes, no anchos") + fleco en V (largo máx. 10) bajo la punta de la
    // última fila — misma fórmula pura que usa el componente.
    const rowShape = createShapedRowShape('rhombus', 13, 13)
    const bodyTotal = beadCount('brick', 13, 13, rowShape)
    const rectangleTotal = beadCount('brick', 13, 13) // what it would be WITHOUT shape — the regression guard
    const fringeLengths = createFringeLengthsForShape('v', 13, 10, rowShape[12])
    const fringeTotal = totalFringeBeadCount({ lengths: fringeLengths, turnBeads: [] })
    const expectedTotal = bodyTotal + fringeTotal

    expect(fringeTotal).toBeGreaterThan(0) // guard: si esto es 0, el test no prueba nada
    expect(bodyTotal).toBeLessThan(rectangleTotal) // guard: si esto falla, el rombo no está achicando nada
    expect(screen.getByText(expectedTotal.toLocaleString('es'))).toBeInTheDocument()
    expect(screen.queryByText(rectangleTotal.toLocaleString('es'))).not.toBeInTheDocument()
  })
})

describe('ConfiguratorPage — forma del cuerpo', () => {
  beforeEach(() => {
    usePatternsStore.setState({ patterns: {}, order: [], hydrated: true, migrationResult: null })
  })

  async function renderOnBrick() {
    const user = userEvent.setup()
    const { ConfiguratorPage } = await import('./ConfiguratorPage')
    render(
      <MemoryRouter>
        <ConfiguratorPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: new RegExp(t.technique.brick) }))
    return user
  }

  it('la sección "Forma del cuerpo" solo aparece para brick, no para loom/peyote', async () => {
    const { ConfiguratorPage } = await import('./ConfiguratorPage')
    render(
      <MemoryRouter>
        <ConfiguratorPage />
      </MemoryRouter>,
    )
    // Loom is selected by default.
    expect(screen.queryByText(t.configurator.bodyShape.title)).not.toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: new RegExp(t.technique.brick) }))
    expect(screen.getByText(t.configurator.bodyShape.title)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: new RegExp(t.technique.peyote) }))
    expect(screen.queryByText(t.configurator.bodyShape.title)).not.toBeInTheDocument()
  })

  it('elegir un preset con forma reduce el total de mostacillas frente al rectángulo', async () => {
    const user = await renderOnBrick()
    const rectangleTotalText = screen.getByText(t.configurator.totalBeads).previousElementSibling!.textContent!

    // Anchored at the end: "Triángulo" alone must not also match "Triángulo invertido".
    await user.click(screen.getByRole('button', { name: new RegExp(`${t.configurator.bodyShape.triangle}$`) }))

    const shapedTotalText = screen.getByText(t.configurator.totalBeads).previousElementSibling!.textContent!
    const toNumber = (s: string) => Number(s.replace(/\D/g, ''))
    expect(toNumber(shapedTotalText)).toBeLessThan(toNumber(rectangleTotalText))
  })

  it('crear el patrón con una forma no rectangular pasa rowShape a createPattern', async () => {
    const createPattern = vi.fn(
      (_config: PatternConfig, _name?: string, _fringe?: FringeData, _rowShape?: RowShape[]) => 'new-id',
    )
    usePatternsStore.setState({ createPattern })
    const user = await renderOnBrick()

    await user.click(screen.getByRole('button', { name: new RegExp(`${t.configurator.bodyShape.rhombus}$`) }))
    await user.click(screen.getByRole('button', { name: t.configurator.createButton }))

    expect(createPattern).toHaveBeenCalledTimes(1)
    const rowShapeArg = createPattern.mock.calls[0][3]
    expect(rowShapeArg).toBeDefined()
    // Picking "Rombo" auto-applies dimensions that taper evenly (idealDimensionsFor):
    // the default 16 cols rounds up to 17, and the closest ideal row count to the
    // previous 16 is 17 (the other option, 18, is farther away).
    expect(rowShapeArg!.length).toBe(17)
    // A rhombus's middle row is full width, its first/last rows taper to 1 bead.
    expect(rowShapeArg![0].length).toBe(1)
    expect(rowShapeArg![rowShapeArg!.length - 1].length).toBe(1)
    expect(Math.max(...rowShapeArg!.map((r) => r.length))).toBe(17) // reaches full width — no orphaned columns
  })

  it('crear el patrón con "Rectángulo" (el default) no manda rowShape', async () => {
    const createPattern = vi.fn(
      (_config: PatternConfig, _name?: string, _fringe?: FringeData, _rowShape?: RowShape[]) => 'new-id',
    )
    usePatternsStore.setState({ createPattern })
    const user = await renderOnBrick()

    await user.click(screen.getByRole('button', { name: t.configurator.createButton }))

    expect(createPattern).toHaveBeenCalledTimes(1)
    expect(createPattern.mock.calls[0][3]).toBeUndefined()
  })
})

describe('ConfiguratorPage — aviso de dimensiones que no calzan (Tarea 3)', () => {
  beforeEach(() => {
    usePatternsStore.setState({ patterns: {}, order: [], hydrated: true, migrationResult: null })
  })

  async function renderOnBrick() {
    const user = userEvent.setup()
    const { ConfiguratorPage } = await import('./ConfiguratorPage')
    render(
      <MemoryRouter>
        <ConfiguratorPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: new RegExp(t.technique.brick) }))
    return user
  }

  /** The second spinbutton on screen is always "Filas" (Columnas comes first in the JSX). */
  function rowsInput() {
    return screen.getAllByRole('spinbutton')[1]
  }

  it('no aparece justo después de elegir un preset con forma — applyIdealDimensions ya deja todo calzado', async () => {
    const user = await renderOnBrick()
    await user.click(screen.getByRole('button', { name: new RegExp(`${t.configurator.bodyShape.rhombus}$`) }))
    expect(screen.queryByText(t.configurator.bodyShape.fitHintAdjust)).not.toBeInTheDocument()
  })

  it('aparece al editar las filas a un valor que ya no calza, y "Ajustar" lo repara', async () => {
    const user = await renderOnBrick()
    await user.click(screen.getByRole('button', { name: new RegExp(`${t.configurator.bodyShape.rhombus}$`) }))
    // Rombo a 16 columnas redondea a 17; idealDimensionsFor('rhombus', 17) = { cols: 17, rows: [17, 18] }.
    fireEvent.change(rowsInput(), { target: { value: '10' } })

    expect(screen.getByText(/17 o 18 filas/)).toBeInTheDocument()
    const adjustButton = screen.getByRole('button', { name: t.configurator.bodyShape.fitHintAdjust })

    await user.click(adjustButton)

    expect(screen.queryByText(t.configurator.bodyShape.fitHintAdjust)).not.toBeInTheDocument()
    expect(rowsInput()).toHaveValue(17) // closest of [17, 18] to the 10 the user had typed
  })

  it('el rectángulo nunca muestra el aviso, sin importar las dimensiones', async () => {
    await renderOnBrick()
    // Rectángulo es el default — solo hace falta desparejar las dimensiones.
    fireEvent.change(rowsInput(), { target: { value: '9' } })
    expect(screen.queryByText(t.configurator.bodyShape.fitHintAdjust)).not.toBeInTheDocument()
  })
})
