import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Everything here is about which *branch* shareOrDownloadFile takes
// (native / Web Share / plain download) — canvas.toBlob and <img> loads
// never actually resolve in jsdom (see imageExport.test.ts), so this file
// exercises shareOrDownloadFile directly with a hand-built Blob instead of
// going through the full render → composite → export pipeline. Both the PDF
// and the image exports now go through this same helper.

const isNativePlatform = vi.fn(() => false)
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => isNativePlatform() } }))

const writeFile = vi.fn(async (..._args: unknown[]) => {})
const getUri = vi.fn(async (..._args: unknown[]) => ({ uri: 'file://fake' }))
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => writeFile(...args),
    getUri: (...args: unknown[]) => getUri(...args),
  },
  Directory: { Cache: 'CACHE' },
}))

const shareNative = vi.fn(async (..._args: unknown[]) => {})
vi.mock('@capacitor/share', () => ({ Share: { share: (...args: unknown[]) => shareNative(...args) } }))

/**
 * Pretends to be a touch device (`pointer: coarse`, i.e. phone/tablet) or a
 * desktop (`pointer: fine`). This is the signal that decides between the
 * share sheet and a plain download — see `prefersShareSheet`.
 */
function stubPointer(kind: 'coarse' | 'fine') {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('pointer: coarse') ? kind === 'coarse' : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

/** A `navigator` that can share files, as mobile Safari/Chrome and desktop Chrome both report. */
function stubNavigatorWithShare() {
  const canShare = vi.fn(() => true)
  const share = vi.fn(async () => {})
  vi.stubGlobal('navigator', { ...navigator, maxTouchPoints: 0, canShare, share })
  return { canShare, share }
}

/** Captures the `<a download>` click without letting jsdom try to navigate. */
function spyOnAnchorDownload() {
  const click = vi.fn()
  const realCreateElement = document.createElement.bind(document)
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreateElement(tag)
    if (tag === 'a') el.click = click
    return el
  })
  return { click, restore: () => spy.mockRestore() }
}

const blob = () => new Blob(['x'], { type: 'application/pdf' })

describe('shareOrDownloadFile — qué camino de entrega elige', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false)
    writeFile.mockClear()
    getUri.mockClear()
    shareNative.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('escritorio: descarga el archivo aunque el navegador SEPA compartir', async () => {
    // Chrome de escritorio en macOS/Windows implementa navigator.canShare, así
    // que detectar sólo la API abría el panel del sistema (AirDrop, Mail,
    // Notas) en vez de dejar el archivo en Descargas. Quien exporta desde el
    // computador espera un archivo, no un selector.
    stubPointer('fine')
    const { canShare, share } = stubNavigatorWithShare()
    const anchor = spyOnAnchorDownload()

    const { shareOrDownloadFile } = await import('./shareFile')
    const delivery = await shareOrDownloadFile(blob(), 'patron.pdf')

    expect(delivery).toBe('download')
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(share).not.toHaveBeenCalled()
    expect(canShare).not.toHaveBeenCalled() // ni siquiera se le pregunta
    anchor.restore()
  })

  it('móvil con Web Share disponible: usa la hoja de compartir', async () => {
    // Es el caso que motivó todo esto: en PWA instalada y en iOS Safari el
    // click sobre <a download> no hace nada, en silencio.
    stubPointer('coarse')
    const { canShare, share } = stubNavigatorWithShare()

    const { shareOrDownloadFile } = await import('./shareFile')
    const delivery = await shareOrDownloadFile(blob(), 'patron.pdf')

    expect(delivery).toBe('web-share')
    expect(canShare).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledTimes(1)
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('Capacitor nativo: escribe en caché y abre la hoja del sistema operativo', async () => {
    // Dentro de un WebView no hay UI de descarga del navegador que disparar.
    isNativePlatform.mockReturnValue(true)
    stubPointer('fine') // la plataforma nativa manda, sin importar el puntero

    const { shareOrDownloadFile } = await import('./shareFile')
    const delivery = await shareOrDownloadFile(blob(), 'patron.pdf')

    expect(delivery).toBe('native-share')
    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(getUri).toHaveBeenCalledTimes(1)
    expect(shareNative).toHaveBeenCalledTimes(1)
    expect(shareNative.mock.calls[0][0]).toMatchObject({ files: ['file://fake'] })
  })

  it('móvil sin Web Share: cae a la descarga en vez de quedarse sin hacer nada', async () => {
    stubPointer('coarse')
    vi.stubGlobal('navigator', { ...navigator, maxTouchPoints: 5, canShare: undefined, share: undefined })
    const anchor = spyOnAnchorDownload()

    const { shareOrDownloadFile } = await import('./shareFile')
    expect(await shareOrDownloadFile(blob(), 'patron.pdf')).toBe('download')
    expect(anchor.click).toHaveBeenCalledTimes(1)
    anchor.restore()
  })

  it('sin matchMedia, maxTouchPoints decide — 0 en escritorio significa descargar', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const { share } = stubNavigatorWithShare() // maxTouchPoints: 0
    const anchor = spyOnAnchorDownload()

    const { shareOrDownloadFile } = await import('./shareFile')
    expect(await shareOrDownloadFile(blob(), 'patron.pdf')).toBe('download')
    expect(share).not.toHaveBeenCalled()
    anchor.restore()
  })
})

describe('shareOrDownloadFile — mecánica de la descarga', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('crea el object URL, dispara el ancla y recién después lo libera', async () => {
    vi.useFakeTimers()
    stubPointer('fine')
    vi.stubGlobal('navigator', { ...navigator, maxTouchPoints: 0, canShare: undefined, share: undefined })

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    const anchor = spyOnAnchorDownload()
    const { shareOrDownloadFile } = await import('./shareFile')
    const b = blob()

    await shareOrDownloadFile(b, 'foo.png')

    expect(createObjectURL).toHaveBeenCalledWith(b)
    expect(anchor.click).toHaveBeenCalledTimes(1)
    // Deliberately NOT revoked synchronously: Safari aborts a download whose
    // object URL is revoked before it has actually started reading it, which
    // is one of the ways an export "does nothing" with no error anywhere.
    expect(revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')

    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    anchor.restore()
    vi.useRealTimers()
  })
})
