import { useMemo } from 'react'
import type { BrickDrop, FringeData, LoopData, PatternConfig, PatternDoc, RowShape, Technique } from '@/engine/types'
import { isPaintableCell, maxFringeLength, normalizeFringe } from '@/engine/fringe'
import { effectiveStaggerPhase, staggerOf, withStagger } from '@/engine/geometry'
import { cellKey } from '@/engine/cellKey'
import { triangleBeads, triangleKey } from '@/engine/trianglePeyote'
import { PatternThumb } from './PatternThumb'

/** Tono de la silueta: un gris cálido que se lee igual en claro y en oscuro. */
export const SILUETA = '#b0a597'

/**
 * Las mostacillas que la pieza va a tener — cuerpo y flecos — todas del mismo
 * tono. Acá no hay colores todavía: lo que se está mirando es la forma.
 */
export function siluetaCells(
  cols: number,
  rows: number,
  fringe?: FringeData,
  rowShape?: RowShape[],
): PatternDoc['cells'] {
  const normalized = normalizeFringe(fringe, cols)
  const totalRows = rows + maxFringeLength(normalized)
  const cells: PatternDoc['cells'] = {}
  for (let row = 0; row < totalRows; row++) {
    for (let col = 0; col < cols; col++) {
      if (isPaintableCell(row, col, cols, rows, normalized, rowShape)) cells[cellKey(row, col)] = SILUETA
    }
  }
  return cells
}

interface PiecePreviewProps {
  technique: Technique
  cols: number
  rows: number
  /** Brick 2-drop / 3-drop: las filas van en pilas y eso se nota en la forma. */
  drop?: BrickDrop
  fringeLengths?: number[] | null
  rowShape?: RowShape[] | null
  loop?: LoopData
  /** Peyote triangular: hacia dónde apunta. Las vueltas van en `cols`. */
  triangleUp?: boolean
  size?: number
}

/**
 * Cómo va a quedar la pieza antes de crearla: la silueta, con sus flecos, su
 * forma y su argolla, dibujada con la misma geometría que el editor y las
 * exportaciones (`PatternThumb`) para que no prometa una cosa y salga otra.
 *
 * Se pintan todas las mostacillas que la pieza va a tener, de un solo tono:
 * acá no hay colores todavía y lo que importa es la forma.
 */
export function PiecePreview({ technique, cols, rows, drop = 1, fringeLengths, rowShape, loop, triangleUp, size = 96 }: PiecePreviewProps) {
  const doc = useMemo<PatternDoc>(() => {
    if (technique === 'triangle') {
      // No es una grilla: todas sus mostacillas, vuelta por vuelta, por llave.
      const cells: PatternDoc['cells'] = {}
      for (const bead of triangleBeads(cols)) cells[triangleKey(bead)] = SILUETA
      const config: PatternConfig = { technique, cols, rows: cols, rounds: cols, triangleUp, beadTypeId: 'miyuki-delica-11' }
      return { id: 'preview', name: '', config, cells, createdAt: 0, updatedAt: 0 }
    }
    const fringe: FringeData | undefined = fringeLengths
      ? { lengths: fringeLengths, turnBeads: fringeLengths.map((len) => len > 0) }
      : undefined
    const shape = rowShape ?? undefined
    const cells = siluetaCells(cols, rows, fringe, shape)
    const config = withStagger<PatternConfig>(
      { technique, cols, rows, beadTypeId: 'miyuki-delica-11' },
      technique === 'brick' ? staggerOf(0, drop) : effectiveStaggerPhase({ technique, cols }),
    )
    return { id: 'preview', name: '', config, cells, fringe, rowShape: shape, loop, createdAt: 0, updatedAt: 0 }
  }, [technique, cols, rows, drop, fringeLengths, rowShape, loop, triangleUp])

  return <PatternThumb pattern={doc} size={size} />
}
