import { describe, expect, it } from 'vitest'
import { activeAfterEmptying, fillSlot, loadColor, TRAY_SIZE, trayFor, withoutUnpainted } from './tray'

const AZUL = '#3547b0'
const DORADO = '#e7d49a'
const ROJO = '#d94f4f'

describe('trayFor — la bandeja con que abre un patrón', () => {
  it('un patrón nuevo abre con seis casillas vacías, sin colores inventados', () => {
    expect(trayFor(undefined, {})).toEqual(Array(TRAY_SIZE).fill(null))
  })

  it('un patrón de antes abre con sus colores pintados y el resto vacío', () => {
    expect(trayFor(undefined, { '0,0': AZUL, '0,1': DORADO, '1,0': AZUL })).toEqual([AZUL, DORADO, null, null, null, null])
  })

  it('la bandeja guardada se respeta tal cual, con sus casillas vacías y sus colores sin pintar', () => {
    expect(trayFor([null, AZUL, ROJO, null, null, null], { '0,0': AZUL })).toEqual([null, AZUL, ROJO, null, null, null])
  })

  it('un color pintado que no está en la bandeja guardada recibe la primera casilla vacía', () => {
    expect(trayFor([AZUL, null, null, null, null, null], { '0,0': DORADO })).toEqual([AZUL, DORADO, null, null, null, null])
  })

  it('una séptima casilla guardada no se pierde, y los duplicados se juntan', () => {
    const saved = [AZUL, DORADO, ROJO, '#111111', '#222222', '#333333', '#444444']
    expect(trayFor(saved, {})).toHaveLength(7)
    expect(trayFor([AZUL, AZUL.toUpperCase(), null, null, null, null], {})).toEqual([AZUL, null, null, null, null, null])
  })
})

describe('llenar y vaciar casillas', () => {
  it('llenar una casilla deja ese color listo para pintar', () => {
    expect(fillSlot(Array(6).fill(null), 2, ROJO)).toEqual({ tray: [null, null, ROJO, null, null, null], active: 2 })
  })

  it('un color que ya está en otra casilla no se carga dos veces: se usa esa', () => {
    const tray = [AZUL, null, null, null, null, null]
    expect(fillSlot(tray, 3, AZUL)).toEqual({ tray, active: 0 })
  })

  it('cargar un color va a la primera casilla vacía, o agrega una si están todas llenas', () => {
    expect(loadColor([AZUL, null, DORADO, null, null, null], ROJO).tray).toEqual([AZUL, ROJO, DORADO, null, null, null])
    const llena = [AZUL, DORADO, ROJO, '#111111', '#222222', '#333333']
    expect(loadColor(llena, '#444444')).toEqual({ tray: [...llena, '#444444'], active: 6 })
  })

  it('quitar los colores sin pintar deja los pintados primero y el resto vacío', () => {
    expect(withoutUnpainted([ROJO, AZUL, null, DORADO, null, null], { '0,0': AZUL, '0,1': DORADO })).toEqual([
      AZUL, DORADO, null, null, null, null,
    ])
  })

  it('al vaciar la casilla activa se pasa al primer color cargado, o a ninguno', () => {
    expect(activeAfterEmptying([null, AZUL, null], 0)).toBe(1)
    expect(activeAfterEmptying([null, null, null], 0)).toBe(-1)
    expect(activeAfterEmptying([AZUL, DORADO, null], 1)).toBe(1)
  })
})
