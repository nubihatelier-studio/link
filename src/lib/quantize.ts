import { deltaE2000, rgbToLab, type Lab, type RGB } from './color'

/**
 * Un azar propio, sembrado con los píxeles: la misma foto da siempre la misma
 * paleta.
 *
 * El sembrado de k-means++ necesita azar para repartir los primeros centros,
 * pero con `Math.random()` la misma foto entregaba colores distintos cada vez
 * que se abría —y un gráfico distinto en "Foto a patrón"—, según qué píxeles
 * le tocaran de partida. Casi siempre caía en el mismo reparto, así que se
 * veía como una rareza que aparece de vez en cuando: un test que falla una de
 * cada varias corridas, y de tarde en tarde una paleta que no es la de la vez
 * anterior. Sembrando con la foto misma, el reparto sigue siendo tan variado
 * como antes, pero es el mismo cada vez.
 *
 * `mulberry32`, que es corto, rápido y de sobra para esto: no se le está
 * pidiendo azar de verdad, sino azar repetible.
 */
function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** La huella de una foto: los mismos píxeles y el mismo `k` dan la misma semilla (FNV-1a). */
function seedFrom(pixels: RGB[], k: number): number {
  let h = Math.imul(0x811c9dc5 ^ pixels.length, 0x01000193)
  h = Math.imul(h ^ k, 0x01000193)
  for (const p of pixels) {
    h = Math.imul(h ^ p.r, 0x01000193)
    h = Math.imul(h ^ p.g, 0x01000193)
    h = Math.imul(h ^ p.b, 0x01000193)
  }
  return h >>> 0
}

/**
 * Simple k-means quantization in Lab space (perceptually closer results than
 * clustering raw RGB). Used to reduce a photo to N dominant colors before
 * mapping each cluster to the nearest catalog swatch.
 *
 * Determinista: los mismos píxeles devuelven siempre lo mismo — ver
 * `seededRandom`.
 */
export function kMeansQuantize(pixels: RGB[], k: number, maxIterations = 12): { centroids: Lab[]; counts: number[] } {
  if (pixels.length === 0) return { centroids: [], counts: [] }

  const labs = pixels.map(rgbToLab)
  const clusterCount = Math.min(k, labs.length)
  const random = seededRandom(seedFrom(pixels, k))

  // k-means++ seeding for stability
  const centroids: Lab[] = []
  centroids.push(labs[Math.floor(random() * labs.length)])
  while (centroids.length < clusterCount) {
    const distances = labs.map((p) => Math.min(...centroids.map((c) => sqDist(p, c))))
    const sum = distances.reduce((a, b) => a + b, 0)
    let r = random() * sum
    let idx = 0
    for (let i = 0; i < distances.length; i++) {
      r -= distances[i]
      if (r <= 0) {
        idx = i
        break
      }
    }
    centroids.push(labs[idx])
  }

  let assignments = Array.from({ length: labs.length }, () => 0)

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false
    for (let i = 0; i < labs.length; i++) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = sqDist(labs[i], centroids[c])
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      if (assignments[i] !== best) changed = true
      assignments[i] = best
    }

    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, n: 0 }))
    for (let i = 0; i < labs.length; i++) {
      const s = sums[assignments[i]]
      s.l += labs[i].l
      s.a += labs[i].a
      s.b += labs[i].b
      s.n++
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].n > 0) {
        centroids[c] = { l: sums[c].l / sums[c].n, a: sums[c].a / sums[c].n, b: sums[c].b / sums[c].n }
      }
    }

    if (!changed) break
  }

  const counts = Array.from({ length: centroids.length }, () => 0)
  for (const a of assignments) counts[a]++

  return { centroids, counts }
}

function sqDist(a: Lab, b: Lab): number {
  const dl = a.l - b.l
  const da = a.a - b.a
  const db = a.b - b.b
  return dl * dl + da * da + db * db
}

export interface MergeResult {
  centroids: Lab[]
  counts: number[]
  /** original centroid index -> merged cluster index, for reassigning pixels without redoing the distance search. */
  mapping: number[]
}

interface ClusterNode {
  centroid: Lab
  count: number
  members: number[]
}

/**
 * Collapses k-means clusters that are perceptually indistinguishable
 * (CIEDE2000 below `threshold`) into one, count-weighted centroid —
 * greedy single-link agglomeration, repeatedly merging the closest
 * surviving pair until none are within threshold. k-means alone tends to
 * split a single flat color's anti-aliased edge pixels into their own
 * spurious clusters when `k` is set generously; this pulls those back
 * into the real color they're a blend artifact of.
 *
 * 6 (CIEDE2000) is comfortably above the ~1 "just noticeable difference"
 * threshold but still well under the gap between genuinely distinct hues —
 * picked empirically against synthetic anti-aliased test patterns rather
 * than a cited standard (there isn't one for this exact use case).
 */
export function mergeSimilarColors(centroids: Lab[], counts: number[], threshold = 6): MergeResult {
  let nodes: ClusterNode[] = centroids.map((c, i) => ({ centroid: c, count: counts[i], members: [i] }))

  while (nodes.length > 1) {
    let bestI = -1
    let bestJ = -1
    let bestDist = Infinity
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = deltaE2000(nodes[i].centroid, nodes[j].centroid)
        if (d < bestDist) {
          bestDist = d
          bestI = i
          bestJ = j
        }
      }
    }
    if (bestDist >= threshold) break

    const a = nodes[bestI]
    const b = nodes[bestJ]
    const total = a.count + b.count
    const merged: ClusterNode = {
      centroid: {
        l: (a.centroid.l * a.count + b.centroid.l * b.count) / total,
        a: (a.centroid.a * a.count + b.centroid.a * b.count) / total,
        b: (a.centroid.b * a.count + b.centroid.b * b.count) / total,
      },
      count: total,
      members: [...a.members, ...b.members],
    }
    nodes = nodes.filter((_, idx) => idx !== bestI && idx !== bestJ)
    nodes.push(merged)
  }

  const mapping = Array.from({ length: centroids.length }, () => 0)
  nodes.forEach((node, clusterIdx) => {
    for (const origIdx of node.members) mapping[origIdx] = clusterIdx
  })

  return { centroids: nodes.map((n) => n.centroid), counts: nodes.map((n) => n.count), mapping }
}
