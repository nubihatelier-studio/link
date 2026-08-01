import { describe, expect, it } from 'vitest'
import { gridBoundsUnits } from '@/engine/geometry'
import { MIN_LETTER_CELL_PX, shouldShowLetters } from './letterVisibility'
import { cellPxAtZoom, initialFitZoom, isTallPattern, TALL_PATTERN_RATIO } from './fitZoom'

const MARGIN = 28

/** El área de lienzo en un escritorio típico y en un teléfono de 390px. */
const DESKTOP = { viewportWidth: 1100, viewportHeight: 700, margin: MARGIN }
const MOBILE = { viewportWidth: 390, viewportHeight: 520, margin: MARGIN }

/** Los tres patrones que el encargo pide comprobar. */
const PULSERA = gridBoundsUnits('peyote', 6, 60)
const TIRA = gridBoundsUnits('loom', 4, 41)
const ARO = gridBoundsUnits('brick', 7, 7, 9) // 7×7 con la cascada de flecos de la plantilla

function zoomFor(bounds: { width: number; height: number }, viewport: typeof DESKTOP) {
  return initialFitZoom({ boundsWidth: bounds.width, boundsHeight: bounds.height, ...viewport })
}

describe('isTallPattern', () => {
  it('una tira y una pulsera son patrones altos y angostos', () => {
    expect(isTallPattern(TIRA.width, TIRA.height)).toBe(true)
    expect(isTallPattern(PULSERA.width, PULSERA.height)).toBe(true)
  })

  it('un aro 7×7 con flecos NO lo es: mantiene el encuadre normal', () => {
    expect(isTallPattern(ARO.width, ARO.height)).toBe(false)
  })

  it('el corte está en la proporción documentada', () => {
    expect(isTallPattern(10, 10 * TALL_PATTERN_RATIO + 1)).toBe(true)
    expect(isTallPattern(10, 10 * TALL_PATTERN_RATIO)).toBe(false)
    expect(isTallPattern(10, 10)).toBe(false) // cuadrado
    expect(isTallPattern(40, 10)).toBe(false) // ancho y bajo
  })

  it('no se cae con un patrón vacío', () => {
    expect(isTallPattern(0, 0)).toBe(false)
  })
})

describe('initialFitZoom — las mostacillas quedan legibles en los casos típicos (Tarea 2.4)', () => {
  it.each([
    ['pulsera 6×60', PULSERA],
    ['tira 4×41', TIRA],
    ['aro 7×7 con flecos', ARO],
  ])('%s abre con celdas sobre el umbral de letras, en escritorio y en móvil', (_label, bounds) => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const cellPx = cellPxAtZoom(zoomFor(bounds, viewport))
      expect(cellPx).toBeGreaterThanOrEqual(MIN_LETTER_CELL_PX)
      expect(shouldShowLetters('auto', cellPx)).toBe(true)
    }
  })
})

describe('initialFitZoom — tiras: ajuste al ancho', () => {
  it('la tira 4×41 no se encoge para que entren las 41 filas', () => {
    const zoom = zoomFor(TIRA, DESKTOP)
    expect(zoom).toBeGreaterThanOrEqual(100)
    // Encuadrar el patrón entero exigiría ~55%, con celdas de 16px: justo el
    // encuadre que dejaba las letras al borde de desaparecer.
    const fitEverything = ((DESKTOP.viewportHeight - MARGIN * 2) / (TIRA.height * 30)) * 100
    expect(fitEverything).toBeLessThan(100)
    expect(zoom).toBeGreaterThan(fitEverything)
  })

  it('en móvil la tira aprovecha el ancho disponible', () => {
    const zoom = zoomFor(TIRA, MOBILE)
    const widthUsed = TIRA.width * cellPxAtZoom(zoom)
    expect(widthUsed).toBeGreaterThan((MOBILE.viewportWidth - MARGIN * 2) * 0.6)
    expect(widthUsed).toBeLessThanOrEqual(MOBILE.viewportWidth)
  })

  it('la pulsera 6×60 también se ajusta al ancho', () => {
    expect(zoomFor(PULSERA, DESKTOP)).toBeGreaterThanOrEqual(100)
    expect(zoomFor(PULSERA, MOBILE)).toBeGreaterThanOrEqual(100)
  })

  it('nunca agranda de forma absurda una tira muy angosta en una pantalla ancha', () => {
    const zoom = initialFitZoom({ boundsWidth: 2, boundsHeight: 60, viewportWidth: 2000, viewportHeight: 700, margin: MARGIN })
    expect(zoom).toBeLessThanOrEqual(200)
  })
})

describe('initialFitZoom — proporciones normales: el encuadre de siempre', () => {
  it('un patrón chico abre a su tamaño natural, sin agrandarse', () => {
    expect(zoomFor(ARO, DESKTOP)).toBe(100)
    expect(zoomFor(gridBoundsUnits('loom', 16, 16), DESKTOP)).toBe(100)
  })

  it('un patrón grande se achica para entrar entero', () => {
    const bounds = gridBoundsUnits('loom', 50, 50)
    const zoom = zoomFor(bounds, DESKTOP)
    expect(zoom).toBeLessThan(100)
    expect(bounds.height * cellPxAtZoom(zoom)).toBeLessThanOrEqual(DESKTOP.viewportHeight - MARGIN * 2 + 1)
    expect(bounds.width * cellPxAtZoom(zoom)).toBeLessThanOrEqual(DESKTOP.viewportWidth - MARGIN * 2 + 1)
  })

  it('un patrón ancho y bajo se ajusta por su ancho, que es el lado que aprieta', () => {
    const bounds = gridBoundsUnits('loom', 120, 3)
    const zoom = zoomFor(bounds, DESKTOP)
    expect(bounds.width * cellPxAtZoom(zoom)).toBeLessThanOrEqual(DESKTOP.viewportWidth - MARGIN * 2 + 1)
  })

  it('nunca baja del mínimo que los controles de zoom permiten', () => {
    const zoom = zoomFor(gridBoundsUnits('loom', 400, 400), DESKTOP)
    expect(zoom).toBeGreaterThanOrEqual(25)
  })
})

describe('initialFitZoom — casos borde', () => {
  it('un patrón sin dimensiones no rompe el encuadre', () => {
    expect(initialFitZoom({ boundsWidth: 0, boundsHeight: 0, ...DESKTOP })).toBe(100)
  })

  it('un contenedor todavía sin medir (0×0) cae en el 100% de siempre', () => {
    expect(initialFitZoom({ boundsWidth: 4, boundsHeight: 41, viewportWidth: 0, viewportHeight: 0, margin: MARGIN })).toBe(100)
  })
})
