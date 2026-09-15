import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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

    await user.click(screen.getByRole('button', { name: `Opciones de ${PATTERN.name}` }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

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

    await user.click(screen.getByRole('button', { name: `Opciones de ${PATTERN.name}` }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
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

    await user.click(screen.getByRole('button', { name: `Opciones de ${PATTERN.name}` }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(usePatternsStore.getState().patterns[PATTERN.id]).toEqual(PATTERN)

    unmount()

    expect(usePatternsStore.getState().patterns[PATTERN.id]).toBeUndefined()
    await waitFor(async () => expect(await fakeAdapter.getPattern(PATTERN.id)).toBeUndefined())
  })

  it('cerrar la pestaña con un borrado pendiente también lo finaliza', async () => {
    const user = userEvent.setup()
    await renderHome()

    await user.click(screen.getByRole('button', { name: `Opciones de ${PATTERN.name}` }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))
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

/** Muestra a qué dirección navegó la app, con su query. */
function LocationProbe() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
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

  it('si lo último tejido fue el aro derecho de un par, lo destaca como tal y abre ese aro', async () => {
    const user = userEvent.setup()
    const pairPattern: PatternDoc = { ...PATTERN, pair: { mode: 'mirror' } }
    fakeAdapter = createFakeAdapter(
      [pairPattern],
      [
        { patternId: pairPattern.id, currentIndex: 2, updatedAt: 100 },
        { patternId: `${pairPattern.id}#derecho`, currentIndex: 4, updatedAt: 900 },
      ],
    )
    usePatternsStore.setState({
      patterns: { [pairPattern.id]: pairPattern },
      order: [pairPattern.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {}, allLoaded: false })

    const { HomePage } = await import('./HomePage')
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor/:id/weave" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByText('Continuar tejiendo')).toBeInTheDocument())
    expect(screen.getByText(/Aro derecho/)).toBeInTheDocument()
    await user.click(screen.getByText('Continuar tejiendo'))
    expect(screen.getByTestId('location').textContent).toBe(`/editor/${pairPattern.id}/weave?aro=derecho`)
  })

  it('el progreso de un aro derecho cuyo patrón ya no es par no se destaca', async () => {
    fakeAdapter = createFakeAdapter(
      [PATTERN],
      [
        { patternId: PATTERN.id, currentIndex: 2, updatedAt: 100 },
        { patternId: `${PATTERN.id}#derecho`, currentIndex: 4, updatedAt: 900 }, // quedó de cuando era par
      ],
    )
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN },
      order: [PATTERN.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {}, allLoaded: false })

    await renderHomeWithWeaveRoute()

    await waitFor(() => expect(screen.getByText('Continuar tejiendo')).toBeInTheDocument())
    expect(screen.queryByText(/Aro derecho/)).not.toBeInTheDocument()
  })

  it('muestra el porcentaje de avance en la card de un patrón que no es el destacado', async () => {
    // PATTERN_2 is loom 10x20 = 200 cells; index 99 lands exactly on the halfway point.
    fakeAdapter = createFakeAdapter(
      [PATTERN, PATTERN_2],
      [
        { patternId: PATTERN.id, currentIndex: 10, updatedAt: 999 }, // most recent — becomes the hero
        { patternId: PATTERN_2.id, currentIndex: 99, updatedAt: 1 },
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

    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument())
  })
})

describe('HomePage — duplicar con renombrado inline', () => {
  beforeEach(() => {
    fakeAdapter = createFakeAdapter([PATTERN])
    usePatternsStore.setState({
      patterns: { [PATTERN.id]: PATTERN },
      order: [PATTERN.id],
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {}, allLoaded: false })
  })

  async function renderHome() {
    const { HomePage } = await import('./HomePage')
    return render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
  }

  it('duplicar deja el nombre en edición, con el texto seleccionado', async () => {
    const user = userEvent.setup()
    await renderHome()

    await user.click(screen.getByRole('button', { name: `Opciones de ${PATTERN.name}` }))
    await user.click(screen.getByRole('button', { name: 'Duplicar' }))

    const input = await screen.findByDisplayValue('Flor peyote (copia)')
    expect(document.activeElement).toBe(input)
  })

  it('Enter confirma el nuevo nombre y lo persiste', async () => {
    const user = userEvent.setup()
    await renderHome()

    await user.click(screen.getByRole('button', { name: `Opciones de ${PATTERN.name}` }))
    await user.click(screen.getByRole('button', { name: 'Duplicar' }))
    const input = await screen.findByDisplayValue('Flor peyote (copia)')
    await user.clear(input)
    await user.type(input, 'Aro dorado{Enter}')

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Aro dorado')).toBeInTheDocument()
    const newId = usePatternsStore.getState().order.find((id) => id !== PATTERN.id)!
    expect(usePatternsStore.getState().patterns[newId].name).toBe('Aro dorado')
  })

  it('Escape cancela la edición y conserva el nombre duplicado original', async () => {
    const user = userEvent.setup()
    await renderHome()

    await user.click(screen.getByRole('button', { name: `Opciones de ${PATTERN.name}` }))
    await user.click(screen.getByRole('button', { name: 'Duplicar' }))
    const input = await screen.findByDisplayValue('Flor peyote (copia)')
    await user.type(input, ' cambiado{Escape}')

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Flor peyote (copia)')).toBeInTheDocument()
  })
})

describe('HomePage — filtros y favoritos', () => {
  const EN_CURSO: PatternDoc = { ...PATTERN, id: 'p_curso', name: 'Big Flowers', updatedAt: 3 }
  const TERMINADO: PatternDoc = { ...PATTERN, id: 'p_listo', name: 'Pulsera Azur', updatedAt: 2 }
  const FAVORITO: PatternDoc = { ...PATTERN, id: 'p_fav', name: 'Flower Ring', favorite: true, updatedAt: 1 }

  beforeEach(() => {
    fakeAdapter = createFakeAdapter(
      [EN_CURSO, TERMINADO, FAVORITO],
      [
        { patternId: EN_CURSO.id, currentIndex: 4, updatedAt: 10 },
        { patternId: TERMINADO.id, currentIndex: 80, finishedAt: 20, updatedAt: 20 },
      ],
    )
    usePatternsStore.setState({
      patterns: { [EN_CURSO.id]: EN_CURSO, [TERMINADO.id]: TERMINADO, [FAVORITO.id]: FAVORITO },
      order: [EN_CURSO.id, TERMINADO.id, FAVORITO.id],
      templates: {},
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {}, allLoaded: false })
  })

  async function renderHome() {
    const { HomePage } = await import('./HomePage')
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    return userEvent.setup()
  }
  const chip = (name: RegExp) => screen.getByRole('button', { name })

  it('muestra los cuatro filtros con su cantidad', async () => {
    await renderHome()
    await waitFor(() => expect(chip(/^En progreso 1$/)).toBeInTheDocument())
    expect(chip(/^Todos 3$/)).toHaveAttribute('aria-pressed', 'true')
    expect(chip(/^Favoritos 1$/)).toBeInTheDocument()
    expect(chip(/^Terminados 1$/)).toBeInTheDocument()
  })

  it('cada filtro muestra sólo lo suyo, sin la card de "Continuar tejiendo"', async () => {
    const user = await renderHome()
    await waitFor(() => expect(screen.getByText('Continuar tejiendo')).toBeInTheDocument())

    await user.click(chip(/^En progreso/))
    expect(screen.queryByText('Continuar tejiendo')).not.toBeInTheDocument()
    expect(screen.getByText('Big Flowers')).toBeInTheDocument()
    expect(screen.queryByText('Pulsera Azur')).not.toBeInTheDocument()

    await user.click(chip(/^Terminados/))
    expect(screen.getByText('Pulsera Azur')).toBeInTheDocument()
    expect(screen.queryByText('Big Flowers')).not.toBeInTheDocument()

    await user.click(chip(/^Favoritos/))
    expect(screen.getByText('Flower Ring')).toBeInTheDocument()
    expect(screen.queryByText('Pulsera Azur')).not.toBeInTheDocument()
  })

  it('la estrella marca y desmarca un favorito, sin cambiar su lugar en "Reciente"', async () => {
    const user = await renderHome()
    await user.click(screen.getByRole('button', { name: 'Marcar Pulsera Azur como favorito' }))
    expect(usePatternsStore.getState().patterns[TERMINADO.id].favorite).toBe(true)
    expect(usePatternsStore.getState().patterns[TERMINADO.id].updatedAt).toBe(2)
    expect(chip(/^Favoritos 2$/)).toBeInTheDocument()

    await user.click(chip(/^Favoritos/))
    await user.click(screen.getByRole('button', { name: 'Quitar Flower Ring de favoritos' }))
    expect(usePatternsStore.getState().patterns[FAVORITO.id].favorite).toBeUndefined()
    expect(screen.queryByText('Flower Ring')).not.toBeInTheDocument()
  })

  it('un filtro vacío explica cómo llenarlo', async () => {
    usePatternsStore.getState().setFavorite(FAVORITO.id, false)
    const user = await renderHome()
    await user.click(chip(/^Favoritos/))
    expect(screen.getByText('Toca la estrella de un patrón para tenerlo aquí.')).toBeInTheDocument()
  })
})

describe('HomePage — tarjetas', () => {
  const CON_COLORES: PatternDoc = {
    ...PATTERN,
    cells: { '0,0': '#111111', '0,1': '#222222', '0,2': '#333333', '0,3': '#444444', '0,4': '#555555', '0,5': '#666666' },
  }

  beforeEach(() => {
    fakeAdapter = createFakeAdapter([CON_COLORES])
    usePatternsStore.setState({
      patterns: { [CON_COLORES.id]: CON_COLORES },
      order: [CON_COLORES.id],
      templates: {},
      hydrated: true,
      migrationResult: null,
    })
    useWeaveStore.setState({ progress: {}, loaded: {}, allLoaded: false })
  })

  async function renderHome() {
    const { HomePage } = await import('./HomePage')
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor/:id" element={<p>Editor abierto</p>} />
        </Routes>
      </MemoryRouter>,
    )
    return userEvent.setup()
  }

  it('muestra hasta cuatro colores como puntitos y el resto como +N, y ya no "Duplicar"/"Eliminar" sueltos', async () => {
    await renderHome()
    expect(screen.getByLabelText('6 colores')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Duplicar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
  })

  it('el "⋯" ofrece Duplicar, Renombrar, Descargar y Eliminar; renombrar edita el nombre ahí mismo', async () => {
    const user = await renderHome()
    await user.click(screen.getByRole('button', { name: `Opciones de ${PATTERN.name}` }))
    for (const name of ['Duplicar', 'Renombrar', 'Descargar', 'Eliminar']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    await user.click(screen.getByRole('button', { name: 'Renombrar' }))
    const input = screen.getByDisplayValue(PATTERN.name)
    await user.clear(input)
    await user.type(input, 'Flor nueva{Enter}')
    expect(usePatternsStore.getState().patterns[PATTERN.id].name).toBe('Flor nueva')
  })

  it('tocar la tarjeta abre el patrón', async () => {
    const user = await renderHome()
    await user.click(screen.getByText(PATTERN.name))
    expect(screen.getByText('Editor abierto')).toBeInTheDocument()
  })
})
