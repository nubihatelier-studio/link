import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'
import { usePatternsStore } from '@/store/patternsStore'
import { t } from '@/i18n/es'
import { TemplatesPage } from './TemplatesPage'

vi.mock('@/storage', () => ({
  getStorageAdapter: () =>
    Promise.resolve({ savePattern: async () => {}, deletePattern: async () => {} }),
}))

const MIA: PatternDoc = {
  id: 't_mia',
  name: 'Anillo flor',
  config: { technique: 'brick', cols: 7, rows: 7, beadTypeId: 'miyuki-delica-11' },
  cells: { '0,0': '#e58fb0' },
  isTemplate: true,
  createdAt: 1,
  updatedAt: 1,
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/plantillas']}>
      <Routes>
        <Route path="/plantillas" element={<TemplatesPage />} />
        <Route path="/" element={<p>Biblioteca</p>} />
        <Route path="/new" element={<p>Crear patrón</p>} />
        <Route path="/editor/:id" element={<p>Editor abierto</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('Pestaña Plantillas', () => {
  beforeEach(() => {
    usePatternsStore.setState({ patterns: {}, order: [], templates: {}, hydrated: true, migrationResult: null })
  })

  it('muestra las Plantillas Nubih y, sin plantillas propias, cómo guardar una', () => {
    renderPage()
    expect(screen.getByText(t.configurator.nubihTemplatesTitle)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Flower Ring 39 x 10/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pulsera Azur/ })).toBeInTheDocument()
    expect(screen.getByText(t.templates.emptySaved)).toBeInTheDocument()
  })

  it('tocar una plantilla abre su ficha y "Crear patrón" crea la copia y abre el editor', async () => {
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: /Pulsera Azur/ }))
    const dialog = within(screen.getByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: t.configurator.userTemplates.shape }))
    await user.click(dialog.getByRole('button', { name: t.nav.createFromTemplate }))

    expect(screen.getByText('Editor abierto')).toBeInTheDocument()
    const created = Object.values(usePatternsStore.getState().patterns)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ name: 'Pulsera Azur', cells: {} })
  })

  it('las plantillas propias se pueden eliminar con deshacer', async () => {
    usePatternsStore.setState({ templates: { [MIA.id]: MIA } })
    const user = renderPage()
    await user.click(screen.getByRole('button', { name: t.configurator.userTemplates.options('Anillo flor') }))
    await user.click(screen.getByRole('button', { name: t.configurator.userTemplates.delete }))
    expect(usePatternsStore.getState().templates[MIA.id]).toBeUndefined()
    await user.click(screen.getByRole('button', { name: t.common.undo }))
    expect(usePatternsStore.getState().templates[MIA.id]).toBeDefined()
  })

  it('la barra de abajo marca Plantillas, vuelve a Inicio y "+" abre Crear patrón', async () => {
    const user = renderPage()
    const nav = within(screen.getByRole('navigation', { name: t.nav.label }))
    expect(nav.getByRole('button', { name: t.nav.templates })).toHaveAttribute('aria-current', 'page')
    await user.click(nav.getByRole('button', { name: t.nav.create }))
    expect(screen.getByText('Crear patrón')).toBeInTheDocument()
  })
})

describe('Plantillas — filtrar por tipo', () => {
  beforeEach(() => {
    usePatternsStore.setState({ templates: { [MIA.id]: { ...MIA, kind: 'anillo' } } })
  })

  const filters = () => within(screen.getByRole('group', { name: t.templates.filterLabel }))

  it('ofrece "Todas" y solo los tipos que existen, con cuántas hay', () => {
    renderPage()
    const nombres = filters()
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(nombres[0]).toMatch(new RegExp(`^${t.templates.all}`))
    expect(nombres.some((n) => n?.startsWith(t.pieceKindPlural.pulsera))).toBe(true)
    // Nadie es tobillera todavía: no hay chip que mostraría nada.
    expect(nombres.some((n) => n?.startsWith(t.pieceKindPlural.tobillera))).toBe(false)
  })

  it('al elegir un tipo quedan solo esas, de Nubih y propias', async () => {
    const user = renderPage()
    await user.click(filters().getByRole('button', { name: new RegExp(`^${t.pieceKindPlural.anillo}`) }))
    expect(screen.getByText('Flower Ring 39 x 10')).toBeInTheDocument() // de Nubih
    expect(screen.getByText('Anillo flor')).toBeInTheDocument() // la propia
    expect(screen.queryByText('Pulsera Azur')).toBeNull()
  })

  it('si ninguna propia es de ese tipo lo dice, y las de Nubih siguen', async () => {
    const user = renderPage()
    await user.click(filters().getByRole('button', { name: new RegExp(`^${t.pieceKindPlural.pulsera}`) }))
    expect(screen.getByText('Pulsera Azur')).toBeInTheDocument()
    expect(screen.getByText(t.templates.noneOfKind)).toBeInTheDocument()
  })

  it('"Todas" vuelve a mostrar todo', async () => {
    const user = renderPage()
    await user.click(filters().getByRole('button', { name: new RegExp(`^${t.pieceKindPlural.aro}`) }))
    await user.click(filters().getByRole('button', { name: new RegExp(`^${t.templates.all}`) }))
    expect(screen.getByText('Pulsera Azur')).toBeInTheDocument()
    expect(screen.getByText('Anillo flor')).toBeInTheDocument()
  })
})
