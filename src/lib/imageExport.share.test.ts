import { beforeEach, describe, expect, it, vi } from 'vitest'

// Everything here is about which *branch* shareOrDownloadImage takes
// (native / Web Share / plain download) — canvas.toBlob and <img> loads
// never actually resolve in jsdom (see imageExport.test.ts), so this file
// exercises shareOrDownloadImage directly with a hand-built Blob instead of
// going through the full render → composite → export pipeline.

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

describe('shareOrDownloadImage', () => {
  beforeEach(() => {
    isNativePlatform.mockReturnValue(false)
    writeFile.mockClear()
    getUri.mockClear()
    shareNative.mockClear()
  })

  it('writes to the cache dir and hands it to the native share sheet on a native platform', async () => {
    isNativePlatform.mockReturnValue(true)
    const { shareOrDownloadImage } = await import('./imageExport')
    const blob = new Blob(['x'], { type: 'image/png' })

    await shareOrDownloadImage(blob, 'foo.png')

    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(getUri).toHaveBeenCalledTimes(1)
    expect(shareNative).toHaveBeenCalledTimes(1)
    expect(shareNative.mock.calls[0][0]).toMatchObject({ files: ['file://fake'] })
  })

  it('uses the Web Share API on the web when the browser can share files', async () => {
    const canShare = vi.fn(() => true)
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, canShare, share })

    const { shareOrDownloadImage } = await import('./imageExport')
    const blob = new Blob(['x'], { type: 'image/png' })

    await shareOrDownloadImage(blob, 'foo.png')

    expect(canShare).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledTimes(1)
    expect(writeFile).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('falls back to a plain download when neither native nor Web Share is available', async () => {
    vi.stubGlobal('navigator', { ...navigator, canShare: undefined, share: undefined })

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL

    const clickSpy = vi.fn()
    const realCreateElement = document.createElement.bind(document)
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreateElement(tag)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    const { shareOrDownloadImage } = await import('./imageExport')
    const blob = new Blob(['x'], { type: 'image/png' })

    await shareOrDownloadImage(blob, 'foo.png')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')

    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    createElementSpy.mockRestore()
    vi.unstubAllGlobals()
  })
})
