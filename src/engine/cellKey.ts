export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

export function parseCellKey(key: string): { row: number; col: number } {
  const [row, col] = key.split(',').map(Number)
  return { row, col }
}
