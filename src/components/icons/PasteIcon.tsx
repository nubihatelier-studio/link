/**
 * "Pegar": the clipboard with the copied piece laid over its corner — what
 * the tool does, put down what you took. Drawn here because lucide's
 * clipboard-paste is a clipboard with an arrow through it, which reads as
 * "import" more than as the pair of copy/paste. It borrows its geometry from
 * lucide's own `copy` (the same rounded square) and `clipboard` (the same
 * clip), and follows the toolbar's drawing rules: 24×24, 2px round strokes,
 * `currentColor`.
 */
export function PasteIcon({ size = 18 }: { size?: number }) {
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
      {/* The clip at the top. */}
      <rect x="8" y="2" width="8" height="4" rx="1" />
      {/* The board, left open where the piece covers it — the same way lucide
          stacks two shapes, so the square reads as lying on top. */}
      <path d="M16 4h2a2 2 0 0 1 2 2v5" />
      <path d="M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
      {/* The piece being pasted. */}
      <rect x="11" y="11" width="11" height="11" rx="2" />
    </svg>
  )
}
