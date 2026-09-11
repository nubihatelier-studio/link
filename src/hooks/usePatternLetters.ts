import { useMemo } from 'react'
import { assignLettersAcross, type LetterEntry } from '@/engine/letters'
import { leftPieceOf, rightEarring, type Piece } from '@/engine/pair'
import { useEditorStore } from '@/store/editorStore'
import { usePatternsStore } from '@/store/patternsStore'

/**
 * The editor's window onto `engine/letters.ts#assignLettersAcross` — the same
 * assignment the PDF, the PNG, the Instagram card and weave mode use, so a
 * color reads the same letter on screen as on paper.
 *
 * Derived from the pattern itself on every change rather than kept as state:
 * a stored letter map is exactly what used to drift (colors the picker merely
 * passed through kept their letters forever, pushing real ones past Z into
 * "AA"), and there's nothing to keep in sync when the letters *are* the
 * pattern read a certain way.
 *
 * For an earring pair it reads both earrings, whichever one is on screen:
 * one set of letters for the pair, and counts that add up across both.
 */
export function usePatternLetters(): LetterEntry[] {
  const technique = useEditorStore((s) => s.technique)
  const cols = useEditorStore((s) => s.cols)
  const rows = useEditorStore((s) => s.rows)
  const cells = useEditorStore((s) => s.cells)
  const fringe = useEditorStore((s) => s.fringe)
  const rowShape = useEditorStore((s) => s.rowShape)
  const staggerPhase = useEditorStore((s) => s.staggerPhase)
  const loop = useEditorStore((s) => s.loop)
  const pair = useEditorStore((s) => s.pair)
  const side = useEditorStore((s) => s.side)
  const patternId = useEditorStore((s) => s.patternId)
  // Only needed while the right earring is on screen: the left one then lives
  // in the saved pattern, not in the working fields.
  const savedLeft = usePatternsStore((s) => (side === 'right' && patternId ? s.patterns[patternId] : undefined))

  return useMemo(() => {
    const current: Piece = { technique, cols, rows, cells, fringe, rowShape, staggerPhase, loop }
    if (!pair) return assignLettersAcross([current])
    if (side === 'left') return assignLettersAcross([current, rightEarring(current, pair)])
    const left = savedLeft ? leftPieceOf(savedLeft) : current
    return assignLettersAcross([left, current])
  }, [technique, cols, rows, cells, fringe, rowShape, staggerPhase, loop, pair, side, savedLeft])
}

/** The same assignment as a hex → letter lookup, for the views that only draw labels. */
export function usePatternLetterMap(): Map<string, string> {
  const entries = usePatternLetters()
  return useMemo(() => new Map(entries.map((e) => [e.hex, e.letter])), [entries])
}
