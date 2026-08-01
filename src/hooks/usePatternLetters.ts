import { useMemo } from 'react'
import { assignLetters, type LetterEntry } from '@/engine/letters'
import { useEditorStore } from '@/store/editorStore'

/**
 * The editor's window onto `engine/letters.ts#assignLetters` — the same
 * assignment the PDF, the PNG, the Instagram card and weave mode use, so a
 * color reads the same letter on screen as on paper.
 *
 * Derived from the pattern itself on every change rather than kept as state:
 * a stored letter map is exactly what used to drift (colors the picker merely
 * passed through kept their letters forever, pushing real ones past Z into
 * "AA"), and there's nothing to keep in sync when the letters *are* the
 * pattern read a certain way.
 */
export function usePatternLetters(): LetterEntry[] {
  const technique = useEditorStore((s) => s.technique)
  const cols = useEditorStore((s) => s.cols)
  const rows = useEditorStore((s) => s.rows)
  const cells = useEditorStore((s) => s.cells)
  const fringe = useEditorStore((s) => s.fringe)
  const rowShape = useEditorStore((s) => s.rowShape)
  const loop = useEditorStore((s) => s.loop)

  return useMemo(
    () => assignLetters({ technique, cols, rows, cells, fringe, rowShape, loop }),
    [technique, cols, rows, cells, fringe, rowShape, loop],
  )
}

/** The same assignment as a hex → letter lookup, for the views that only draw labels. */
export function usePatternLetterMap(): Map<string, string> {
  const entries = usePatternLetters()
  return useMemo(() => new Map(entries.map((e) => [e.hex, e.letter])), [entries])
}
