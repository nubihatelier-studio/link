import { rgbToLab, type Lab, type RGB } from './color'

/**
 * Simple k-means quantization in Lab space (perceptually closer results than
 * clustering raw RGB). Used to reduce a photo to N dominant colors before
 * mapping each cluster to the nearest catalog swatch.
 */
export function kMeansQuantize(pixels: RGB[], k: number, maxIterations = 12): { centroids: Lab[]; counts: number[] } {
  if (pixels.length === 0) return { centroids: [], counts: [] }

  const labs = pixels.map(rgbToLab)
  const clusterCount = Math.min(k, labs.length)

  // k-means++ seeding for stability
  const centroids: Lab[] = []
  centroids.push(labs[Math.floor(Math.random() * labs.length)])
  while (centroids.length < clusterCount) {
    const distances = labs.map((p) => Math.min(...centroids.map((c) => sqDist(p, c))))
    const sum = distances.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
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

  let assignments = new Array(labs.length).fill(0)

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

  const counts = new Array(centroids.length).fill(0)
  for (const a of assignments) counts[a]++

  return { centroids, counts }
}

function sqDist(a: Lab, b: Lab): number {
  const dl = a.l - b.l
  const da = a.a - b.a
  const db = a.b - b.b
  return dl * dl + da * da + db * db
}
