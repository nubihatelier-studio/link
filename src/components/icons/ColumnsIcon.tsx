/**
 * "Columnas": the piece seen as vertical strips — the axis the slider below it
 * counts. Paired with `RowsIcon`, drawn as the same box divided the other way,
 * so the two controls read as one choice about a grid rather than two numbers.
 */
export function ColumnsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <line x1="9" y1="4.5" x2="9" y2="19.5" />
      <line x1="15" y1="4.5" x2="15" y2="19.5" />
    </svg>
  )
}
