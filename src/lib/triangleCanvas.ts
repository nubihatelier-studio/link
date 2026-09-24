import type { ColorMap } from '@/engine/types'
import {
  triangleBeadAt,
  triangleBeadPlacement,
  triangleBeads,
  triangleBoundsUnits,
  triangleKey,
  type TriangleBead,
} from '@/engine/trianglePeyote'
import { beadMetrics, beadPath, contrastTextColor, MIN_BEAD_INSET_PX, MIN_BEAD_RADIUS_PX } from '@/lib/beadStyle'

/**
 * Alto de la mostacilla, en anchos: apenas menor que el ancho, como una
 * Delica de pie. No sale de `rowPitch` como en la grilla — ahí el alto de una
 * fila y el alto de la mostacilla son lo mismo, y acá no: las vueltas se
 * traban entre sí, así que van más juntas que el porte de una mostacilla.
 */
const BEAD_HEIGHT = 0.92

/**
 * Cómo se dibuja el peyote triangular, en cualquier lienzo.
 *
 * Vive aparte de `CanvasGrid` porque no hay filas ni columnas que recorrer
 * —son tres sectores en vueltas desde el centro, ver
 * `engine/trianglePeyote.ts`— y vive en `lib/` porque lo usan los tres que
 * dibujan la pieza: el editor, el PNG y la tarjeta de Instagram. Una sola
 * rutina, así que lo que se ve en pantalla y lo que se comparte no se pueden
 * desfasar.
 */
export interface TriangleCanvasOpts {
  rounds: number
  /** Hacia dónde mira la punta — ver `engine/types.ts#PatternConfig.triangleUp`. */
  pointingUp: boolean
  cells: ColorMap
  /** Píxeles por unidad de mostacilla — el zoom del editor. */
  cellPx: number
  /** Dónde parte la pieza en el lienzo, en píxeles. */
  originX: number
  originY: number
  /**
   * Con qué se dibuja una mostacilla sin pintar, o `null` para no dibujarla:
   * el lienzo del editor muestra la retícula entera para saber dónde tocar, y
   * las imágenes que se comparten muestran sólo la pieza (ver
   * `lib/imageExport.ts`).
   */
  emptyColor: string | null
  /** El hilito del contorno, o `null` para dejar la mostacilla sin borde. */
  borderColor: string | null
  /** Letra por color, o null cuando las letras están apagadas o no caben. */
  letters: Map<string, string> | null
  letterFontPx: number
}

/** Dónde queda una mostacilla dentro del lienzo, en píxeles. */
function beadRect(bead: TriangleBead, o: TriangleCanvasOpts) {
  const { x, y } = triangleBeadPlacement(bead, o.pointingUp)
  const { minX, minY } = triangleBoundsUnits(o.rounds, o.pointingUp)
  const m = beadMetrics(o.cellPx, o.cellPx * BEAD_HEIGHT, MIN_BEAD_INSET_PX, MIN_BEAD_RADIUS_PX)
  return {
    cx: o.originX + (x - minX) * o.cellPx,
    cy: o.originY + (y - minY) * o.cellPx,
    m,
  }
}

export function drawTriangleCanvas(ctx: CanvasRenderingContext2D, o: TriangleCanvasOpts): void {
  const { minX, minY } = triangleBoundsUnits(o.rounds, o.pointingUp)
  const m = beadMetrics(o.cellPx, o.cellPx * BEAD_HEIGHT, MIN_BEAD_INSET_PX, MIN_BEAD_RADIUS_PX)
  if (o.letters) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `600 ${o.letterFontPx}px system-ui, sans-serif`
  }
  for (const bead of triangleBeads(o.rounds)) {
    const { x, y, angle } = triangleBeadPlacement(bead, o.pointingUp)
    const hex = o.cells[triangleKey(bead)]
    if (!hex && !o.emptyColor) continue
    ctx.save()
    ctx.translate(o.originX + (x - minX) * o.cellPx, o.originY + (y - minY) * o.cellPx)
    // Cada sector va girado: la mostacilla se cruza sobre su vuelta, no a lo largo.
    ctx.rotate((angle * Math.PI) / 180)
    ctx.beginPath()
    beadPath(ctx, -m.width / 2, -m.height / 2, m.width, m.height, m.radius)
    ctx.fillStyle = hex ?? o.emptyColor!
    ctx.fill()
    if (o.borderColor) {
      ctx.strokeStyle = o.borderColor
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.restore()

    // La letra se dibuja derecha aunque la mostacilla esté girada: se lee, no se decora.
    if (hex && o.letters) {
      const letter = o.letters.get(hex)
      if (letter) {
        ctx.fillStyle = contrastTextColor(hex)
        ctx.fillText(letter, o.originX + (x - minX) * o.cellPx, o.originY + (y - minY) * o.cellPx + 0.5)
      }
    }
  }
}

/**
 * La mostacilla bajo un punto del lienzo, en píxeles, o `null` si cayó en un
 * hueco. Pregunta por las mismas posiciones que se dibujan, así que no puede
 * desfasarse del dibujo.
 */
export function triangleBeadAtCanvas(
  clientX: number,
  clientY: number,
  o: Pick<TriangleCanvasOpts, 'rounds' | 'pointingUp' | 'cellPx' | 'originX' | 'originY'>,
): TriangleBead | null {
  const { minX, minY } = triangleBoundsUnits(o.rounds, o.pointingUp)
  const x = (clientX - o.originX) / o.cellPx + minX
  const y = (clientY - o.originY) / o.cellPx + minY
  return triangleBeadAt(x, y, o.rounds, o.pointingUp)
}

/** Sólo para las pruebas y el foco del teclado: el rectángulo de una mostacilla en el lienzo. */
export { beadRect as triangleBeadRect }
