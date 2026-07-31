/**
 * One way to hand a generated file (PDF, PNG, JPEG) to the weaver, shared by
 * every export in the app.
 *
 * The delivery step is where exports actually fail in the field, and it fails
 * *silently*: `<a download>.click()` is a no-op in an installed PWA and in
 * iOS Safari — no error, no download, nothing. The app looked broken while
 * the file had been generated perfectly. That's why the PDF export can't just
 * call jsPDF's own `doc.save()` (which is exactly that anchor trick) and why
 * this returns how the file was delivered instead of `void`: the caller can
 * tell "handed over" from "the browser refused" and say so.
 *
 * Order of preference:
 *  1. Capacitor (native shell): write to the cache dir and open the OS share
 *     sheet — there's no browser download UI to trigger inside a WebView.
 *  2. Web Share API with files: the share sheet on mobile browsers and
 *     installed PWAs, which is where the anchor trick silently dies.
 *  3. Anchor download: the normal desktop-browser path.
 */
export type FileDelivery = 'native-share' | 'web-share' | 'download'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(blob)
  })
}

export async function shareOrDownloadFile(blob: Blob, filename: string): Promise<FileDelivery> {
  const { Capacitor } = await import('@capacitor/core')
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const base64 = await blobToBase64(blob)
    await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache })
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
    await Share.share({ title: filename, files: [uri] })
    return 'native-share'
  }

  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'web-share'
    } catch (err) {
      // The weaver dismissing the share sheet is a normal outcome, not a
      // failure — but anything else means the sheet itself didn't work, so
      // fall through to a plain download rather than reporting an error.
      if (err instanceof DOMException && err.name === 'AbortError') return 'web-share'
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked on the next tick, not synchronously: Safari aborts a download
  // whose object URL is revoked before it has actually started reading it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'download'
}
