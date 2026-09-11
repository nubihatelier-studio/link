import { describe, expect, it, vi } from 'vitest'
import { getBeadType } from '@/data/beadTypes'
import { renderExportCanvas, renderPatternCanvas, type ExportImageOptions } from './imageExport'

vi.mock('./shareFile', () => ({ shareOrDownloadFile: vi.fn(async () => {}) }))

/** jsdom no dibuja: un contexto 2D que no hace nada, sólo para que la composición corra. */
function fakeContext() {
  return vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new Proxy({} as Record<string, unknown>, {
      get: (target, prop) => (prop in target ? target[prop as string] : () => ({ width: 0 })),
      set: (target, prop, value) => ((target[prop as string] = value), true),
    }) as unknown as CanvasRenderingContext2D,
  )
}

const opts: ExportImageOptions = {
  name: 'Aros',
  technique: 'brick',
  cols: 3,
  rows: 2,
  cells: { '1,0': '#1c1c1e' },
  beadType: getBeadType('miyuki-delica-11'),
}

describe('renderExportCanvas', () => {
  it('un solo aro se exporta como siempre', () => {
    const spy = fakeContext()
    const single = renderPatternCanvas(opts, '#ffffff', 600)
    const exported = renderExportCanvas(opts, '#ffffff', 600)
    spy.mockRestore()
    expect(exported.width).toBe(single.width)
  })

  it('un par pone los dos aros lado a lado, a la misma escala y con espacio entre ellos', () => {
    const spy = fakeContext()
    const single = renderPatternCanvas(opts, '#ffffff', 600)
    const pair = renderExportCanvas({ ...opts, pair: { mode: 'mirror' } }, '#ffffff', 600)
    spy.mockRestore()
    expect(pair.width).toBeGreaterThan(single.width * 2)
    expect(pair.height).toBe(single.height)
  })
})
