/**
 * "Borrar área": an eraser inside a dashed selection box — the two halves of
 * what the tool does, drag a box and wipe what's inside it. Drawn here rather
 * than taken from lucide, which has no eraser-in-a-box; it follows the same
 * drawing rules as the rest of the toolbar (24×24 box, 2px round strokes,
 * `currentColor`) so it sits in the row as one of the family.
 */
export function EraseAreaIcon({ size = 18 }: { size?: number }) {
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
      {/* The selection: a dashed box, as on the canvas itself. */}
      <rect x="3" y="4" width="18" height="16" rx="2" strokeDasharray="3.2 2.6" />
      {/* The eraser, tilted as it is in the hand, with its rubber end marked.
          Small enough to sit clear of the box: crossing those dashes made the
          two shapes read as one scribble at toolbar size. */}
      <g transform="rotate(-45 12 12)">
        <rect x="7.4" y="9.6" width="9.2" height="5" rx="1.5" />
        <line x1="10.6" y1="9.6" x2="10.6" y2="14.6" />
      </g>
    </svg>
  )
}
