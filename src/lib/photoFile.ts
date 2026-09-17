/** The longest side a saved photo keeps — a card cover and a side-by-side view never need more, and every kilobyte here lives inside the pattern. */
const MAX_SIDE = 720
/** JPEG quality: enough for a bead photo, small enough to carry in a backup. */
const QUALITY = 0.72

/**
 * A photo file as a small JPEG data URL, ready to keep inside a pattern (see
 * `PatternDoc.photo`). Shrunk and re-encoded here rather than stored as
 * picked: a phone photo is three or four megabytes, and a template carrying
 * that would bloat every backup and every copy made from it. The photo never
 * leaves the device — this only reads it in the browser.
 */
export function readPhotoAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D no disponible'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', QUALITY))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

/** Roughly how much a data URL weighs, in KB — for showing the weight of a photo about to be saved. */
export function dataUrlSizeKb(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.round((base64.length * 3) / 4 / 1024)
}
