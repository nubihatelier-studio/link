/**
 * Las medidas de la "Guía de tallas" — ver components/shared/SizeGuideDialog.
 *
 * Son tablas de referencia comunes del rubro, en centímetros, que la
 * tejedora reunió en una página aparte y pidió tener dentro de la app. Los
 * rangos van como [desde, hasta]; una medida sola, con los dos iguales.
 */

export type Rango = readonly [number, number]

export interface FilaTalla {
  talla: string
  cm: Rango
}

export const PULSERA_MUJER: FilaTalla[] = [
  { talla: 'XS', cm: [16, 16] },
  { talla: 'S', cm: [16.5, 17] },
  { talla: 'M', cm: [18, 18] },
  { talla: 'L', cm: [19.5, 19.5] },
  { talla: 'XL', cm: [20.5, 21] },
]

export const PULSERA_HOMBRE: FilaTalla[] = [
  { talla: 'S', cm: [21, 21] },
  { talla: 'M', cm: [22, 22] },
  { talla: 'L', cm: [23, 23] },
]

export const PULSERA_NINOS: FilaTalla[] = [
  { talla: 'Bebé', cm: [6, 7] },
  { talla: '5 meses', cm: [10, 10] },
  { talla: '8 meses', cm: [12, 12] },
  { talla: '1 año', cm: [12.5, 12.5] },
  { talla: '3 años', cm: [13, 13] },
  { talla: '5 años', cm: [14, 14] },
  { talla: '7 años', cm: [15, 15] },
  { talla: '9 años', cm: [15.5, 15.5] },
  { talla: '12 años', cm: [16, 16] },
]

/** Tallas en pulgadas de tiendas extranjeras: el largo de la pulsera y la muñeca para la que es. */
export const PULSERA_PULGADAS: { talla: string; pulsera: string; muneca: Rango }[] = [
  { talla: 'Niños', pulsera: '7,5 in · 19 cm', muneca: [16.5, 17.8] },
  { talla: 'Small', pulsera: '8 in · 20,3 cm', muneca: [17.8, 19] },
  { talla: 'Medium', pulsera: '8,5 in · 21,6 cm', muneca: [19, 20.3] },
  { talla: 'Large', pulsera: '9 in · 22,9 cm', muneca: [20.3, 21.6] },
  { talla: 'Ajustable', pulsera: '20,3 – 24,1 cm', muneca: [19, 22.9] },
]

export const TOBILLERA: FilaTalla[] = [
  { talla: 'S', cm: [22, 24] },
  { talla: 'M', cm: [24, 26] },
  { talla: 'L', cm: [26, 28] },
  { talla: 'XL', cm: [28, 30] },
]

export const COLLARES: { cm: number; nombre: string; cae: string }[] = [
  { cm: 35, nombre: 'Gargantilla', cae: 'Pegado al cuello' },
  { cm: 42, nombre: 'Princesa', cae: 'Sobre la clavícula' },
  { cm: 50, nombre: 'Matiné', cae: 'Bajo la clavícula' },
  { cm: 70, nombre: 'Ópera', cae: 'A la altura del busto' },
  { cm: 80, nombre: 'Largo', cae: 'Bajo el busto, se puede dar dos vueltas' },
]

/** Numeración americana (US): talla y contorno del dedo en cm. El diámetro interior es contorno ÷ π. */
export const ANILLOS: { talla: number; contorno: number }[] = [
  { talla: 6, contorno: 5.2 },
  { talla: 7, contorno: 5.4 },
  { talla: 8, contorno: 5.7 },
  { talla: 9, contorno: 6.0 },
  { talla: 10, contorno: 6.2 },
  { talla: 11, contorno: 6.4 },
  { talla: 12, contorno: 6.7 },
  { talla: 13, contorno: 7.0 },
]

/** Cuánto más larga que la muñeca va la pulsera, según cómo le guste usarla. */
export const HOLGURAS = [0.5, 1.5, 2.5] as const
export type Holgura = (typeof HOLGURAS)[number]

const medio = ([a, b]: Rango) => (a + b) / 2

function masCercana(filas: FilaTalla[], cm: number): FilaTalla {
  return filas.reduce((a, b) => (Math.abs(medio(b.cm) - cm) < Math.abs(medio(a.cm) - cm) ? b : a))
}

export interface ResultadoMuneca {
  /** Para quién es, según la tabla que calza: niños bajo 16 cm, hombre desde 20,9 cm. */
  grupo: 'ninos' | 'mujer' | 'hombre'
  talla: string
  /** Muñeca más holgura, redondeado a un decimal. */
  largoPulsera: number
}

export function calcularPulsera(munecaCm: number, holgura: number): ResultadoMuneca | null {
  if (!(munecaCm > 0)) return null
  const largoPulsera = Math.round((munecaCm + holgura) * 10) / 10
  if (munecaCm < 16) return { grupo: 'ninos', talla: masCercana(PULSERA_NINOS, munecaCm).talla, largoPulsera }
  if (munecaCm >= 20.9) return { grupo: 'hombre', talla: masCercana(PULSERA_HOMBRE, munecaCm).talla, largoPulsera }
  return { grupo: 'mujer', talla: masCercana(PULSERA_MUJER, munecaCm).talla, largoPulsera }
}

export function diametroAnillo(contornoCm: number): number {
  return Math.round((contornoCm / Math.PI) * 100) / 100
}

export interface ResultadoDedo {
  /** `null` si el dedo es más grande que la talla 13. */
  talla: number | null
  diametro: number
  /** Quedó entre dos tallas y se sugiere la mayor. */
  entreTallas: boolean
}

export function calcularAnillo(contornoCm: number): ResultadoDedo | null {
  if (!(contornoCm > 0)) return null
  const diametro = diametroAnillo(contornoCm)
  // Medio milímetro de tolerancia: una medida con hilo no da más que eso.
  const fila = ANILLOS.find((r) => r.contorno >= contornoCm - 0.05)
  if (!fila) return { talla: null, diametro, entreTallas: false }
  return { talla: fila.talla, diametro, entreTallas: Math.abs(fila.contorno - contornoCm) > 0.05 }
}
