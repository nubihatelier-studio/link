/** A slow or stuck fetch (offline, blocked) shouldn't hang an export — every load is bounded. */
const LOAD_TIMEOUT_MS = 3000

/** Loads an image for an export (the logo on the Instagram card and the PDF), with a timeout. */
export function loadImage(src: string, timeoutMs = LOAD_TIMEOUT_MS): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(() => reject(new Error(`Tiempo agotado cargando ${src}`)), timeoutMs)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error(`No se pudo cargar ${src}`))
    }
    img.src = src
  })
}

/**
 * The brand wordmark as an image: `light` is the teal script for a light
 * ground (the PDF page), `dark` the light script for a dark one (the
 * Instagram card's teal gradient). Same two files the app itself shows.
 */
export const WORDMARK_SRC = {
  light: '/logo-wordmark.png',
  dark: '/logo-wordmark-dark.png',
} as const

/** A PNG read straight from its bytes: the data URL to draw, and its own pixel size. */
export interface PngFile {
  dataUrl: string
  width: number
  height: number
}

/**
 * Fetches a PNG and reads its size out of the file itself (the IHDR chunk,
 * bytes 16–24 of every PNG). The PDF needs both the data and the aspect
 * ratio, and this way neither depends on the browser decoding an <img> —
 * jsPDF takes the data URL as is.
 */
export async function loadPng(src: string): Promise<PngFile> {
  const response = await fetch(src)
  if (!response.ok) throw new Error(`No se pudo cargar ${src}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length < 24) throw new Error(`${src} no es un PNG válido`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (!width || !height) throw new Error(`${src} no es un PNG válido`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return { dataUrl: `data:image/png;base64,${btoa(binary)}`, width, height }
}
