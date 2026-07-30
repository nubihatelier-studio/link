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

describe('ConfiguratorPage — plantillas (Corrección 2)', () => {
  beforeEach(() => {
    usePatternsStore.setState({ patterns: {}, order: [], hydrated: true, migrationResult: null })
  })

  it('solo ofrece tres plantillas: Pulsera, Aro con flecos y Personalizado — ya no "Marcapáginas"', async () => {
    const { ConfiguratorPage } = await import('./ConfiguratorPage')
    render(
      <MemoryRouter>
        <ConfiguratorPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: new RegExp(t.configurator.templates.pulsera) })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(t.configurator.templates.aroFlecos) })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(t.configurator.templates.personalizado) })).toBeInTheDocument()
    expect(screen.queryByText('Marcapáginas')).not.toBeInTheDocument()
  })
})

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

    // brick 13x13 cuerpo en trapecio (triangle preset: crece 1 mostacilla por
    // fila hasta los 13 en la última fila; filas parte igualadas a columnas —
    // ver Corrección 3) + fleco en V (largo máx. 10) bajo la punta de la
    // última fila — misma fórmula pura que usa el componente.
    const rowShape = createShapedRowShape('triangle', 13, 13)
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
    // Picking "Rombo" no longer snaps cols to anything — but rows does get a
    // silent nudge (16 -> 17) to stay odd: an even row count forces a 2-row
    // plateau at the peak whose two rows can never share the same physical
    // center (see shape.ts's `preferredRowsFor`).
    expect(rowShapeArg!.length).toBe(17)
    // A rhombus's middle rows are the widest, its first/last rows taper to 1 bead.
    expect(rowShapeArg![0].length).toBe(1)
    expect(rowShapeArg![rowShapeArg!.length - 1].length).toBe(1)
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

  /** The second spinbutton on screen is always "Filas" (Columnas comes first in the JSX). */
  function rowsInput() {
    return screen.getAllByRole('spinbutton')[1]
  }

  it('elegir "Triángulo" también nudgea filas pares a impar (misma razón física que Rombo)', async () => {
    const user = await renderOnBrick()
    await user.click(screen.getByRole('button', { name: new RegExp(`${t.configurator.bodyShape.triangle}$`) }))
    expect(rowsInput()).toHaveValue(17)
  })

  it('elegir "Triángulo invertido" no toca las filas — su fila de ancho completo nunca cae en un índice impar', async () => {
    const user = await renderOnBrick()
    await user.click(screen.getByRole('button', { name: new RegExp(t.configurator.bodyShape.triangleInverted) }))
    expect(rowsInput()).toHaveValue(16)
  })

  it('elegir "Rectángulo" nunca toca las filas', async () => {
    const user = await renderOnBrick()
    await user.click(screen.getByRole('button', { name: new RegExp(`${t.configurator.bodyShape.rectangle}$`) }))
    expect(rowsInput()).toHaveValue(16)
  })
})

describe('ConfiguratorPage — "Aro con flecos": filas siguen a columnas (Corrección 3)', () => {
  beforeEach(() => {
    usePatternsStore.setState({ patterns: {}, order: [], hydrated: true, migrationResult: null })
  })

  /** Columns is always the first spinbutton, rows the second (see the "forma del cuerpo" describe block above). */
  function colsInput() {
    return screen.getAllByRole('spinbutton')[0]
  }
  function rowsInput() {
    return screen.getAllByRole('spinbutton')[1]
  }

  async function renderAndSelectAroFlecos() {
    const user = userEvent.setup()
    const { ConfiguratorPage } = await import('./ConfiguratorPage')
    render(
      <MemoryRouter>
        <ConfiguratorPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: new RegExp(t.configurator.templates.aroFlecos) }))
    return user
  }

  it('al elegir la plantilla, las filas parten iguales a las columnas (13)', async () => {
    await renderAndSelectAroFlecos()
    expect(colsInput()).toHaveValue(13)
    expect(rowsInput()).toHaveValue(13)
  })

  it('mover las columnas mantiene las filas iguales, incluso varias veces seguidas', async () => {
    await renderAndSelectAroFlecos()
    fireEvent.change(colsInput(), { target: { value: '20' } })
    expect(rowsInput()).toHaveValue(20)
    fireEvent.change(colsInput(), { target: { value: '7' } })
    expect(rowsInput()).toHaveValue(7)
  })

  it('editar las filas a mano respeta el valor elegido y deja de seguir a las columnas', async () => {
    await renderAndSelectAroFlecos()
    fireEvent.change(rowsInput(), { target: { value: '10' } })
    expect(rowsInput()).toHaveValue(10)

    // Columns keep moving — rows must NOT follow any more.
    fireEvent.change(colsInput(), { target: { value: '20' } })
    expect(rowsInput()).toHaveValue(10)
  })

  it('elegir otra plantilla o técnica no arrastra el seguimiento de filas', async () => {
    const user = await renderAndSelectAroFlecos()
    await user.click(screen.getByRole('button', { name: new RegExp(t.technique.loom) }))
    // Now on loom, rows must stay put even if columns change.
    fireEvent.change(colsInput(), { target: { value: '5' } })
    expect(rowsInput()).not.toHaveValue(5)
  })

  it('no afecta otras plantillas: "Personalizado" no iguala filas a columnas', async () => {
    const user = userEvent.setup()
    const { ConfiguratorPage } = await import('./ConfiguratorPage')
    render(
      <MemoryRouter>
        <ConfiguratorPage />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: new RegExp(t.configurator.templates.personalizado) }))
    fireEvent.change(colsInput(), { target: { value: '20' } })
    expect(rowsInput()).toHaveValue(16) // Personalizado's own rows value, untouched
  })
})
