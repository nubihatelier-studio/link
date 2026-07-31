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
 *  2. Web Share API with files, but ONLY on a touch device — see
 *     `prefersShareSheet` for why the check isn't just "is the API there".
 *  3. Anchor download: the normal desktop-browser path.
 */
export type FileDelivery = 'native-share' | 'web-share' | 'download'

/**
 * Whether handing the file to a share sheet is the right move, or whether it
 * should just download.
 *
 * Feature-detecting `navigator.canShare` alone is not enough: desktop Chrome
 * on macOS and Windows implements it, so an export from a computer opened the
 * OS share panel (AirDrop, Mail, Notes) instead of putting the file in
 * Downloads — the wrong answer for someone sitting at a desktop, who expects
 * a file, not a picker.
 *
 * The reason the share path exists at all is narrower than "the API is
 * available": on an installed PWA and on iOS Safari the `<a download>` click
 * does nothing at all, silently. That's still true and still needs the share
 * sheet — but those are touch devices. So the gate is the pointer, not the
 * API: `(pointer: coarse)` is true on phones and tablets and false on a
 * desktop, including a laptop with a touchscreen (where the *primary* pointer
 * is still a trackpad, and Downloads is still the right destination).
 *
 * `maxTouchPoints` is the fallback for the rare environment without
 * `matchMedia`; on its own it would be too loose, since plenty of desktops
 * report touch points.
 */
export function prefersShareSheet(): boolean {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(pointer: coarse)').matches
  }
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(blob)
  })
}

function downloadViaAnchor(blob: Blob, filename: string): FileDelivery {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked on a timer, not synchronously: Safari aborts a download whose
  // object URL is revoked before it has actually started reading it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'download'
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

  if (prefersShareSheet()) {
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
  }

  return downloadViaAnchor(blob, filename)
}
