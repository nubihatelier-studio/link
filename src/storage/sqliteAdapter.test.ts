import { describe, expect, it, vi } from 'vitest'
import type { PatternDoc } from '@/engine/types'

// El plugin nativo no existe en jsdom; estos tests cubren sólo la conversión
// documento ↔ fila, que es donde se perdían los datos.
vi.mock('@capacitor-community/sqlite', () => ({ CapacitorSQLite: {}, SQLiteConnection: class {} }))

const { patternToRowValues, rowToPattern } = await import('./sqliteAdapter')

const COLUMNS = ['id', 'name', 'technique', 'cols', 'rows', 'bead_type_id', 'cells_json', 'extra_json', 'created_at', 'updated_at']

/** Lo que SQLite devolvería al leer la fila recién guardada. */
function roundTrip(doc: PatternDoc): PatternDoc {
  const values = patternToRowValues(doc)
  return rowToPattern(Object.fromEntries(COLUMNS.map((c, i) => [c, values[i]])))
}

const FULL: PatternDoc = {
  id: 'p_aro',
  name: 'Aro con flecos',
  config: { technique: 'brick', cols: 7, rows: 7, beadTypeId: 'miyuki-delica-11', staggerPhase: 1 },
  cells: { '0,3': '#1c1c1e', '7,1': '#c9a227' },
  fringe: { lengths: [4, 6, 8, 9, 8, 6, 4], turnBeads: [true, true, true, true, true, true, true] },
  rowShape: [{ offset: 3, length: 1 }, { offset: 0, length: 7 }],
  note: 'Para Ana',
  loop: { variant: 'woven', beadCount: 8, color: '#1c1c1e' },
  createdAt: 1,
  updatedAt: 2,
}

describe('SqliteAdapter — el documento completo sobrevive a guardarse', () => {
  it('conserva flecos, forma, argolla, nota y fase del escalonado (antes se perdían en iOS/Android)', () => {
    expect(roundTrip(FULL)).toEqual(FULL)
  })

  it('un campo que PatternDoc gane más adelante también se guarda, sin tocar el adaptador', () => {
    const withFuture = { ...FULL, somethingNew: { a: 1 } } as PatternDoc
    expect(roundTrip(withFuture)).toEqual(withFuture)
  })

  it('una fila guardada antes de extra_json (null) carga como siempre', () => {
    const legacy = rowToPattern({
      id: 'p_viejo', name: 'Viejo', technique: 'loom', cols: 4, rows: 4, bead_type_id: 'miyuki-delica-11',
      cells_json: '{"0,0":"#111111"}', extra_json: null, created_at: 1, updated_at: 1,
    })
    expect(legacy).toEqual({
      id: 'p_viejo', name: 'Viejo', config: { technique: 'loom', cols: 4, rows: 4, beadTypeId: 'miyuki-delica-11' },
      cells: { '0,0': '#111111' }, createdAt: 1, updatedAt: 1,
    })
  })
})
