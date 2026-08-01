import { create } from 'zustand'
import type { ColorMap, FringeData, LoopData, PatternDoc, RowShape, Technique } from '@/engine/types'
import { cellKey, parseCellKey } from '@/engine/cellKey'
import { lineCells } from '@/engine/line'
import { floodFillCells } from '@/engine/floodFill'
import { createEmptyFringe, isPaintableCell, MAX_FRINGE_LENGTH, maxFringeLength, normalizeFringe } from '@/engine/fringe'
import { normalizeLoop } from '@/engine/loop'
import { createRectangleRowShape, normalizeRowShape, recenterRowShape } from '@/engine/shape'
import { mirroredCell, reflectRegion, type MirrorMode } from '@/engine/mirror'
import { computeGradientCells, type GradientDirection } from '@/engine/gradient'
import { paletteFromCells, replaceColorInCells, selectionForColor, swapColorsInCells } from '@/lib/palette'
import { usePatternsStore } from './patternsStore'
import { useWeaveStore } from './weaveStore'

export type Tool = 'pencil' | 'line' | 'eraser' | 'rectErase' | 'eyedropper' | 'select' | 'fill'
/** Index into the `slots` array — the quick-access palette grows as colors are added, so slots are no longer a fixed A–D set. */
export type SlotId = number
export type CloneDirection = 'vertical' | 'horizontal'

/**
 * Rotating neutral grays for freshly added slots. Distinct (not all
 * `#808080`) so two slots added back to back don't register the exact same
 * hex and end up sharing a letter before the user has picked a real color
 * for either of them.
 */
const NEUTRAL_SLOT_DEFAULTS = ['#808080', '#9a9a9a', '#6e6e6e', '#b4b4b4', '#585858', '#c8c8c8']

export interface SelectionRect {
  r0: number
  c0: number
  r1: number
  c1: number
}

interface Clipboard {
  width: number
  height: number
  cells: ColorMap // keys relative to (0,0) of the copied block
}

/**
 * One undo/redo step. Almost always only `cells` actually changes (every
 * paint/fill/gradient/etc. commit carries the *same* rows/rowShape/fringe/loop
 * forward from whatever was current) — but `addRowAtTop`/`removeRowAtTop`
 * change several together, and folding them into this same snapshot type
 * (rather than a second, parallel undo stack) is what makes "agregar fila
 * arriba" (or "cambiar la argolla" — see `setLoop`) a single, ordinary undo
 * step alongside every color edit.
 */
interface EditorSnapshot {
  cells: ColorMap
  rows: number
  rowShape: RowShape[]
  fringe: FringeData
  staggerPhase: 0 | 1
  loop: LoopData | undefined
}

interface EditorState {
  patternId: string | null
  name: string
  technique: Technique
  cols: number
  rows: number
  beadTypeId: string
  /**
   * 0 or 1 — shifts brick's row-parity stagger check from a row's raw index
   * to `row + staggerPhase` (see `geometry.ts#cellPosition`). Legacy patterns
   * load with 0, reproducing their exact prior look. `addRowAtTop`/
   * `removeRowAtTop` flip it (see their own comments) so that inserting or
   * removing a row at the top — which reindexes every existing row — doesn't
   * shift their physical stagger and break the pattern's centering.
   */
  staggerPhase: 0 | 1
  cells: ColorMap

  /**
   * Always normalized to `fringe.lengths.length === cols` (see
   * `engine/fringe.ts#normalizeFringe`) — legacy patterns saved before this
   * feature existed load as an all-empty fringe. Structural, like
   * `cols`/`rows`: length/turn-bead edits are NOT part of the `history`
   * undo stack (only cell colors are) — but since fringe *cell colors* live
   * in the same `cells` map as the body (see `engine/types.ts#FringeData`),
   * painting a fringe bead is undoable for free through the exact same
   * mechanism as painting a body cell.
   */
  fringe: FringeData
  setFringeLength: (col: number, length: number) => void
  setFringeTurnBead: (col: number, isTurnBead: boolean) => void
  /**
   * Sets many fringe columns' lengths in one shot — the "quick shape"
   * buttons (V, diagonal…) funnel through this instead of calling
   * `setFringeLength` in a loop, so painted cells dropped by shrinking
   * columns collapse into a SINGLE `commit()` (one undo step for the whole
   * operation) rather than one per column. `lengths` is sparse —
   * `undefined`/missing entries leave that column untouched.
   */
  sculptFringeLengths: (lengths: (number | undefined)[]) => void

  /**
   * Drag-to-sculpt session (dragging along the bottom edge of the pattern
   * to set several fringe columns' lengths in one continuous gesture) —
   * same live-preview-then-single-commit shape as `strokeStart`/
   * `strokeCell`/`strokeEnd`. `fringeSculptSetColumn` updates `fringe` and
   * `cells` immediately (for live visual feedback while dragging) but does
   * NOT commit or persist — that only happens once, in `fringeSculptEnd`,
   * so a long drag across many columns doesn't spam undo history or
   * IndexedDB writes.
   */
  fringeSculptBase: ColorMap | null
  fringeSculptStart: () => void
  fringeSculptSetColumn: (col: number, length: number) => void
  fringeSculptEnd: () => void
  /** Whether the canvas interprets drags as fringe-sculpting instead of painting — toggled from FringePanel. */
  fringeSculptMode: boolean
  setFringeSculptMode: (on: boolean) => void
  /**
   * When on, any length change to column `col` (manual −/+, or a point in
   * the drag-sculpt gesture) also mirrors onto `cols - 1 - col` — a bracelet
   * you're editing symmetrically doesn't need every side touched by hand.
   * Deliberately does NOT affect the quick-shape presets (V/curve are
   * already symmetric by construction; the diagonals are symmetric-breaking
   * on purpose).
   */
  fringeSymmetric: boolean
  setFringeSymmetric: (on: boolean) => void

  /**
   * Always normalized to `rowShape.length === rows` (see
   * `engine/shape.ts#normalizeRowShape`) — legacy patterns and any technique
   * that isn't shape-capable load as a full rectangle. Structural, like
   * `fringe`: edge grow/shrink itself is NOT part of the `history` undo
   * stack, but a shrink that drops a painted cell goes through `commit`
   * (undoable), same split as `setFringeLength`.
   */
  rowShape: RowShape[]
  /** Extends row `row` by 1 bead at `edge` — no-op past the grid's own `cols` bound. */
  growRowEdge: (row: number, edge: 'left' | 'right') => void
  /** Shrinks row `row` by 1 bead at `edge` — no-op at the 1-bead-wide floor (a row never disappears). */
  shrinkRowEdge: (row: number, edge: 'left' | 'right') => void
  /**
   * Extends the body by one row at the very top, following the silhouette's
   * existing slope (1 bead narrower than the row that used to be first,
   * alternating side per `engine/shape.ts`'s parity rule) — every existing
   * row (and its painted cells, body and fringe alike) shifts down by one
   * index. A single `undo` entry, like any other commit.
   */
  addRowAtTop: () => void
  /** Removes the topmost row — a no-op if only 1 row remains (a pattern always keeps at least 1 row). Single undo entry, same as `addRowAtTop`. */
  removeRowAtTop: () => void
  /** Shared plumbing for `addRowAtTop`/`removeRowAtTop`: one undo entry, one persisted write, and an explicit (never silent, never corrupted) weave-progress reset since a row-count change renumbers the whole weave order. */
  commitShapeChange: (next: { rows: number; rowShape: RowShape[]; cells: ColorMap; staggerPhase: 0 | 1 }) => void
  /**
   * Set by `commitShapeChange` to the weave progress index that was just
   * reset (so the UI can offer "Deshacer" on that specific reset), or `null`
   * once consumed/expired. Not itself part of the undo stack — undoing the
   * row change also needs `useWeaveStore`'s own index restored, which is a
   * second store, so the UI wires both together (see `ShapePanel.tsx`).
   */
  weaveResetPending: number | null
  clearWeaveResetPending: () => void

  /** Free-text note, shown on the PDF's ficha page — see `engine/types.ts#PatternDoc.note`. */
  note: string
  setNote: (note: string) => void

  /**
   * Hanging loop at the top tip — see `engine/types.ts#LoopData`. Unlike
   * `note` (autosaved but not undoable), a loop change goes through the same
   * `history`/`future` undo stack as everything else, per its own explicit
   * "con deshacer" requirement — see the `loop` field on `EditorSnapshot`.
   */
  loop: LoopData | undefined
  setLoop: (loop: LoopData | undefined) => void

  history: EditorSnapshot[]
  future: EditorSnapshot[]

  tool: Tool
  slots: string[]
  activeSlot: SlotId
  addSlot: (hex?: string) => void
  zoom: number
  /**
   * Purely an editing aid — a thin dashed line marking where the body ends
   * and the fringe begins on the canvas. Never affects PDF/PNG/Instagram
   * exports (those render the seamless continuation with no divider at
   * all). Ephemeral view preference, not part of the pattern document.
   */
  showFringeDivider: boolean
  setShowFringeDivider: (show: boolean) => void
  selection: SelectionRect | null
  /**
   * When set, `selection` is only this mask's bounding box — `eraseSelection`
   * and `copySelection` act on just these cells, not the whole rectangle.
   * Populated by `selectColor`; cleared by any manual rectangular selection
   * (a fresh drag always means "the whole rect", not a stale color mask).
   */
  colorSelectionMask: Set<string> | null
  /** Selects every cell painted `hex` (bounding box + exact mask) and switches to the select tool. */
  selectColor: (hex: string) => void
  clipboard: Clipboard | null
  pasteArmed: boolean
  pasteFlipH: boolean
  pasteFlipV: boolean
  armPaste: () => void
  disarmPaste: () => void
  toggleFlipH: () => void
  toggleFlipV: () => void

  cloneDirection: CloneDirection
  setCloneDirection: (dir: CloneDirection) => void
  cloneSelection: (direction: CloneDirection, times: number) => void

  /** Symmetry-assisted drawing: every stroked cell also paints its mirror counterpart (see engine/mirror.ts). */
  mirrorMode: MirrorMode
  setMirrorMode: (mode: MirrorMode) => void
  /** Flips the current selection's contents in place — the one-shot counterpart to live mirror-mode drawing. */
  reflectSelection: (axis: 'horizontal' | 'vertical') => void

  loadPattern: (doc: PatternDoc) => void
  setTool: (tool: Tool) => void
  setActiveSlot: (slot: SlotId) => void
  setSlotColor: (slot: SlotId, hex: string) => void
  setZoom: (zoom: number) => void
  renamePattern: (name: string) => void

  paintCell: (row: number, col: number, hex: string | null) => void
  paintLine: (r0: number, c0: number, r1: number, c1: number, hex: string | null) => void
  pickColor: (row: number, col: number) => void
  /** Repaints every cell of `fromHex` to `toHex` in one undo step — used by both "fusionar colores" and "reemplazar en todo el patrón". */
  mergeColors: (fromHex: string, toHex: string) => void
  /** Swaps every cell of hexA with hexB (and vice versa) in one undo step — for testing contrast variants without repainting by hand. */
  swapColors: (hexA: string, hexB: string) => void
  /** Flood-fills the contiguous same-color region starting at (row, col) with `hex` (or erases it). */
  floodFill: (row: number, col: number, hex: string | null) => void
  /**
   * Fills the current selection (or every paintable cell — body and fringe
   * alike — if nothing is selected) with a gradient between `startHex` and
   * `endHex`, quantized to the pattern's existing palette plus those two
   * endpoints, with soft dithering at the color-band boundaries. One undo
   * step, like `mergeColors`/`floodFill`.
   */
  applyGradient: (startHex: string, endHex: string, direction: GradientDirection) => void

  /** Stroke = one drag gesture (pencil/eraser) collapsed into a single undo step. */
  strokeBase: ColorMap | null
  strokeStart: () => void
  strokeCell: (row: number, col: number, hex: string | null) => void
  strokeEnd: () => void

  setSelection: (rect: SelectionRect | null) => void
  eraseSelection: () => void
  copySelection: () => void
  pasteClipboardAt: (row: number, col: number, opts?: { flipH?: boolean; flipV?: boolean }) => void

  undo: () => void
  redo: () => void
  commit: (next: ColorMap) => void
}

function normalizeRect(r: SelectionRect): SelectionRect {
  return {
    r0: Math.min(r.r0, r.r1),
    c0: Math.min(r.c0, r.c1),
    r1: Math.max(r.r0, r.r1),
    c1: Math.max(r.c0, r.c1),
  }
}

/**
 * Drops any painted cell that's no longer inside `rowShape`'s span for its
 * row — used after `recenterRowShape` moves a row shape's offsets, since
 * recentering can in principle shift more than just the row that was
 * directly edited (see `recenterRowShape`'s doc comment) and a cell painted
 * under the old offsets could fall outside the new ones. Returns the same
 * `cells` reference untouched if nothing was actually orphaned, so callers
 * can cheaply check `result !== cells` to decide whether a commit is needed.
 */
function pruneOrphanedCells(
  cells: ColorMap,
  cols: number,
  rows: number,
  fringe: FringeData,
  rowShape: RowShape[],
): ColorMap {
  let next: ColorMap = cells
  for (const key of Object.keys(cells)) {
    const { row, col } = parseCellKey(key)
    if (!isPaintableCell(row, col, cols, rows, fringe, rowShape)) {
      if (next === cells) next = { ...cells }
      delete next[key]
    }
  }
  return next
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleAutosave(patternId: string, cells: ColorMap) {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    usePatternsStore.getState().setCells(patternId, cells)
  }, 600)
}

let noteAutosaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleNoteAutosave(patternId: string, note: string) {
  if (noteAutosaveTimer) clearTimeout(noteAutosaveTimer)
  noteAutosaveTimer = setTimeout(() => {
    usePatternsStore.getState().setNote(patternId, note)
  }, 600)
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  patternId: null,
  name: '',
  technique: 'peyote',
  cols: 20,
  rows: 20,
  beadTypeId: 'miyuki-delica-11',
  staggerPhase: 0,
  cells: {},

  fringe: createEmptyFringe(20),
  rowShape: createRectangleRowShape(20, 20),
  // Delegates to sculptFringeLengths (also mirroring onto the symmetric
  // counterpart column when fringeSymmetric is on) so a manual −/+ edit gets
  // the exact same single-commit trimming behavior as the quick shapes and
  // the drag gesture, instead of duplicating that logic a third time.
  setFringeLength: (col, rawLength) => {
    const { cols, fringeSymmetric } = get()
    const mirrorCol = cols - 1 - col
    const lengths: (number | undefined)[] = []
    lengths[col] = rawLength
    if (fringeSymmetric && mirrorCol !== col) lengths[mirrorCol] = rawLength
    get().sculptFringeLengths(lengths)
  },
  setFringeTurnBead: (col, isTurnBead) => {
    const { fringe } = get()
    if ((fringe.lengths[col] ?? 0) === 0) return
    const nextTurnBeads = [...fringe.turnBeads]
    nextTurnBeads[col] = isTurnBead
    const nextFringe: FringeData = { lengths: fringe.lengths, turnBeads: nextTurnBeads }
    set({ fringe: nextFringe })
    const id = get().patternId
    if (id) usePatternsStore.getState().setFringe(id, nextFringe)
  },
  sculptFringeLengths: (lengths) => {
    const { fringe, rows: bodyRows, cells, cols } = get()
    const nextLengths = [...fringe.lengths]
    const nextTurnBeads = [...fringe.turnBeads]
    const nextCells = { ...cells }
    let cellsChanged = false
    let anyChanged = false

    for (let col = 0; col < cols; col++) {
      const raw = lengths[col]
      if (raw === undefined) continue
      const oldLength = fringe.lengths[col] ?? 0
      const length = Math.max(0, Math.min(MAX_FRINGE_LENGTH, Math.round(raw)))
      if (length === oldLength) continue
      anyChanged = true
      nextLengths[col] = length
      if (length === 0) nextTurnBeads[col] = false
      if (length < oldLength) {
        for (let d = length; d < oldLength; d++) {
          const key = cellKey(bodyRows + d, col)
          if (key in nextCells) {
            delete nextCells[key]
            cellsChanged = true
          }
        }
      }
    }
    if (!anyChanged) return

    const nextFringe: FringeData = { lengths: nextLengths, turnBeads: nextTurnBeads }
    set({ fringe: nextFringe })
    // Whole gesture (any number of columns) collapses into one commit for undo purposes.
    if (cellsChanged) get().commit(nextCells)

    const id = get().patternId
    if (id) usePatternsStore.getState().setFringe(id, nextFringe)
  },
  fringeSculptBase: null,
  fringeSculptStart: () => set({ fringeSculptBase: get().cells }),
  fringeSculptSetColumn: (col, rawLength) => {
    const { fringe, rows: bodyRows, cells, cols, fringeSymmetric } = get()
    const length = Math.max(0, Math.min(MAX_FRINGE_LENGTH, Math.round(rawLength)))
    const targets = fringeSymmetric ? [col, cols - 1 - col] : [col]

    const nextLengths = [...fringe.lengths]
    const nextTurnBeads = [...fringe.turnBeads]
    let nextCells = cells
    let anyChanged = false

    for (const c of targets) {
      const oldLength = fringe.lengths[c] ?? 0
      if (length === oldLength) continue
      anyChanged = true
      nextLengths[c] = length
      if (length === 0) nextTurnBeads[c] = false
      if (length < oldLength) {
        if (nextCells === cells) nextCells = { ...cells }
        for (let d = length; d < oldLength; d++) delete nextCells[cellKey(bodyRows + d, c)]
      }
    }
    if (!anyChanged) return

    // Bare set — no commit, no persistence. Both happen once in fringeSculptEnd,
    // so a drag across many columns produces one undo step and one IndexedDB write.
    set({ fringe: { lengths: nextLengths, turnBeads: nextTurnBeads }, cells: nextCells })
  },
  fringeSculptEnd: () => {
    const { fringeSculptBase, cells, history, rows, rowShape, fringe, staggerPhase, loop, patternId } = get()
    if (fringeSculptBase && fringeSculptBase !== cells) {
      set({ history: [...history, { cells: fringeSculptBase, rows, rowShape, fringe, staggerPhase, loop }].slice(-100), future: [] })
    }
    set({ fringeSculptBase: null })
    if (patternId) usePatternsStore.getState().setFringe(patternId, fringe)
  },
  fringeSculptMode: false,
  setFringeSculptMode: (on) => set({ fringeSculptMode: on }),
  fringeSymmetric: false,
  setFringeSymmetric: (on) => set({ fringeSymmetric: on }),

  growRowEdge: (row, edge) => {
    const { rowShape, cols, cells, rows, fringe, staggerPhase } = get()
    const shape = rowShape[row]
    if (!shape) return
    const next = edge === 'left' ? { offset: shape.offset - 1, length: shape.length + 1 } : { offset: shape.offset, length: shape.length + 1 }
    if (next.offset < 0 || next.offset + next.length > cols) return // already at the grid's own edge
    const nextRowShape = [...rowShape]
    nextRowShape[row] = next
    // Recentered from scratch (Corrección 1) — a single edge edit can leave
    // this row's own offset out of step with its neighbors' (see
    // `recenterRowShape`'s doc comment), so every row's offset is re-derived
    // from its width, not just the one that was actually touched. Row count
    // doesn't change here, so the phase stays whatever it already was.
    const recentered = recenterRowShape(nextRowShape, cols, staggerPhase)
    set({ rowShape: recentered })
    // Growing never shrinks the edited row itself, but recentering the rest
    // of the shape to stay smooth can in principle nudge another row enough
    // to orphan one of its painted cells — sweep everything, not just this
    // row, and fold any drops into a single undo step.
    const pruned = pruneOrphanedCells(cells, cols, rows, fringe, recentered)
    if (pruned !== cells) get().commit(pruned)
    const id = get().patternId
    if (id) usePatternsStore.getState().setRowShape(id, recentered)
  },

  shrinkRowEdge: (row, edge) => {
    const { rowShape, cells, cols, rows, fringe, staggerPhase } = get()
    const shape = rowShape[row]
    if (!shape || shape.length <= 1) return // a row always keeps at least 1 bead
    const droppedCol = edge === 'left' ? shape.offset : shape.offset + shape.length - 1
    const next = edge === 'left' ? { offset: shape.offset + 1, length: shape.length - 1 } : { offset: shape.offset, length: shape.length - 1 }
    const nextRowShape = [...rowShape]
    nextRowShape[row] = next
    const recentered = recenterRowShape(nextRowShape, cols, staggerPhase)
    set({ rowShape: recentered })

    // The bead the user directly shrank away always drops, regardless of
    // where recentering ends up putting this row (for a lone, unanchored
    // row, recentering's own tie-break can in principle land the row back
    // in a position that would otherwise "un-shrink" that exact edge — the
    // explicit drop here is what keeps "achicar por la izquierda" always
    // removing the bead the weaver actually clicked). A second, general
    // sweep then catches anything else recentering orphaned elsewhere (this
    // row's *other* edge, or a different row nudged to stay smooth) — both
    // fold into the same single undo step.
    const directKey = cellKey(row, droppedCol)
    const withDirectDrop = directKey in cells ? { ...cells } : cells
    delete withDirectDrop[directKey]
    const pruned = pruneOrphanedCells(withDirectDrop, cols, rows, fringe, recentered)
    if (pruned !== cells) get().commit(pruned)

    const id = get().patternId
    if (id) usePatternsStore.getState().setRowShape(id, recentered)
  },

  addRowAtTop: () => {
    const { cells, rows, rowShape, cols, fringe, staggerPhase } = get()
    const oldFirst = rowShape[0]
    const length = Math.max(1, oldFirst.length - 1)
    // Inserting a row reindexes every existing row by +1, flipping which
    // absolute index (and thus brick parity) each one lands on — flipping
    // staggerPhase in lockstep exactly cancels that shift, so every
    // pre-existing row's real physical stagger (and its centered offset)
    // stays the same; only the new row's own slot is actually new. See this
    // file's `staggerPhase` field doc and `shape.ts#recenterRowShape`.
    const nextStaggerPhase: 0 | 1 = staggerPhase === 0 ? 1 : 0
    // Prepend a placeholder (its offset doesn't matter — recenterRowShape
    // re-derives every row's offset from scratch right after) rather than
    // patching just this one row and leaving the rest untouched: inserting
    // a row shifts every existing row to a new absolute index, flipping its
    // brick parity, so an offset that was correct before is generally wrong
    // now (see `recenterRowShape`'s doc comment — this is the "romboide"
    // bug: 5 additions in a row used to skew the whole silhouette).
    const nextRowShape = recenterRowShape([{ offset: 0, length }, ...rowShape], cols, nextStaggerPhase)
    // Every existing cell (body and fringe alike — they share the same
    // `cells` map) shifts down by one row to make room for the new top row.
    const shiftedCells: ColorMap = {}
    for (const [key, hex] of Object.entries(cells)) {
      const { row, col } = parseCellKey(key)
      shiftedCells[cellKey(row + 1, col)] = hex
    }
    // Recentering the rest of the rows could nudge one enough to orphan a
    // cell that was valid under the old (pre-shift) offsets.
    const nextCells = pruneOrphanedCells(shiftedCells, cols, rows + 1, fringe, nextRowShape)
    get().commitShapeChange({ rows: rows + 1, rowShape: nextRowShape, cells: nextCells, staggerPhase: nextStaggerPhase })
  },

  removeRowAtTop: () => {
    const { rows, rowShape, cells, cols, fringe, staggerPhase } = get()
    if (rows <= 1) return // a pattern always keeps at least 1 row
    // Removing the top row reindexes every remaining row by -1 — the same
    // parity-cancelling flip as addRowAtTop (±1 mod 2 is the same shift).
    const nextStaggerPhase: 0 | 1 = staggerPhase === 0 ? 1 : 0
    const nextRowShape = recenterRowShape(rowShape.slice(1), cols, nextStaggerPhase)
    // Shifts every remaining row up by one; anything painted in the row
    // being removed no longer exists.
    const shiftedCells: ColorMap = {}
    for (const [key, hex] of Object.entries(cells)) {
      const { row, col } = parseCellKey(key)
      if (row === 0) continue
      shiftedCells[cellKey(row - 1, col)] = hex
    }
    const nextCells = pruneOrphanedCells(shiftedCells, cols, rows - 1, fringe, nextRowShape)
    get().commitShapeChange({ rows: rows - 1, rowShape: nextRowShape, cells: nextCells, staggerPhase: nextStaggerPhase })
  },

  note: '',
  setNote: (note) => {
    set({ note })
    const id = get().patternId
    if (id) scheduleNoteAutosave(id, note)
  },

  loop: undefined,
  setLoop: (loop) => {
    const { cells, rows, rowShape, fringe, staggerPhase, loop: prevLoop, history } = get()
    set({ loop, history: [...history, { cells, rows, rowShape, fringe, staggerPhase, loop: prevLoop }].slice(-100), future: [] })
    const id = get().patternId
    if (id) usePatternsStore.getState().setLoop(id, loop)
  },

  history: [],
  future: [],
  weaveResetPending: null,
  clearWeaveResetPending: () => set({ weaveResetPending: null }),

  tool: 'pencil',
  slots: ['#1c1c1e', '#c9a227', '#8da2b0', '#ffffff'],
  activeSlot: 0,
  addSlot: (hex) => {
    const newHex = hex ?? NEUTRAL_SLOT_DEFAULTS[get().slots.length % NEUTRAL_SLOT_DEFAULTS.length]
    set((s) => ({ slots: [...s.slots, newHex], activeSlot: s.slots.length }))
  },

  zoom: 100,
  showFringeDivider: true,
  selection: null,
  colorSelectionMask: null,
  selectColor: (hex) => {
    const found = selectionForColor(get().cells, hex)
    if (!found) return
    set({ selection: found.rect, colorSelectionMask: found.mask, tool: 'select' })
  },
  clipboard: null,
  strokeBase: null,
  pasteArmed: false,
  pasteFlipH: false,
  pasteFlipV: false,
  armPaste: () => set({ pasteArmed: true, pasteFlipH: false, pasteFlipV: false }),
  disarmPaste: () => set({ pasteArmed: false, pasteFlipH: false, pasteFlipV: false }),
  toggleFlipH: () => set((s) => ({ pasteFlipH: !s.pasteFlipH })),
  toggleFlipV: () => set((s) => ({ pasteFlipV: !s.pasteFlipV })),

  cloneDirection: 'horizontal',
  setCloneDirection: (dir) => set({ cloneDirection: dir }),

  mirrorMode: 'off',
  setMirrorMode: (mode) => set((s) => ({ mirrorMode: s.mirrorMode === mode ? 'off' : mode })),
  reflectSelection: (axis) => {
    const { selection, cells } = get()
    if (!selection) return
    get().commit(reflectRegion(cells, selection, axis))
  },

  loadPattern: (doc) => {
    const defaultSlots = ['#1c1c1e', '#c9a227', '#8da2b0', '#ffffff']
    // Any color already painted in this pattern that isn't one of the 4
    // defaults becomes a real, visible slot too — not just a letter with no
    // slot to show for it. Otherwise a cell can read "E" on the canvas while
    // no "E" circle exists anywhere in the panel, which looks like a bug.
    const paintedExtras = paletteFromCells(doc.cells)
      .map((p) => p.hex)
      .filter((hex) => !defaultSlots.includes(hex))
    const slots = [...defaultSlots, ...paintedExtras]
    set({
      patternId: doc.id,
      name: doc.name,
      technique: doc.config.technique,
      cols: doc.config.cols,
      rows: doc.config.rows,
      beadTypeId: doc.config.beadTypeId,
      cells: { ...doc.cells },
      fringe: normalizeFringe(doc.fringe, doc.config.cols),
      rowShape: normalizeRowShape(doc.rowShape, doc.config.cols, doc.config.rows),
      staggerPhase: doc.config.staggerPhase ?? 0,
      note: doc.note ?? '',
      loop: normalizeLoop(doc.loop),
      history: [],
      future: [],
      weaveResetPending: null,
      selection: null,
      clipboard: null,
      pasteArmed: false,
      pasteFlipH: false,
      pasteFlipV: false,
      slots,
      activeSlot: 0,
    })
  },

  setTool: (tool) => {
    const keep = tool === 'select' || tool === 'rectErase'
    set({ tool, selection: keep ? get().selection : null, colorSelectionMask: keep ? get().colorSelectionMask : null })
  },
  setActiveSlot: (slot) => set({ activeSlot: slot }),
  setSlotColor: (slot, hex) => {
    set((s) => {
      const next = [...s.slots]
      next[slot] = hex
      return { slots: next }
    })
  },
  setZoom: (zoom) => set({ zoom: Math.max(25, Math.min(400, zoom)) }),
  setShowFringeDivider: (show) => set({ showFringeDivider: show }),

  renamePattern: (name) => {
    set({ name })
    const id = get().patternId
    if (id) usePatternsStore.getState().renamePattern(id, name)
  },

  commit: (next) => {
    const { cells, rows, rowShape, fringe, staggerPhase, loop, history } = get()
    set({ cells: next, history: [...history, { cells, rows, rowShape, fringe, staggerPhase, loop }].slice(-100), future: [] })
    const id = get().patternId
    if (id) scheduleAutosave(id, next)
  },

  commitShapeChange: (next) => {
    const { cells, rows, rowShape, fringe, staggerPhase, loop, history, patternId } = get()
    set({
      cells: next.cells,
      rows: next.rows,
      rowShape: next.rowShape,
      staggerPhase: next.staggerPhase,
      history: [...history, { cells, rows, rowShape, fringe, staggerPhase, loop }].slice(-100),
      future: [],
    })
    if (!patternId) return
    usePatternsStore
      .getState()
      .setShapeStructure(patternId, { rows: next.rows, rowShape: next.rowShape, cells: next.cells, fringe, staggerPhase: next.staggerPhase })
    // A row-count change renumbers the whole weave order — the old
    // `currentIndex` no longer points at a meaningful bead. Never leave it
    // silently wrong: reset it explicitly, and surface the old value so the
    // UI can offer a quick "Deshacer" (see ShapePanel.tsx).
    const weave = useWeaveStore.getState()
    const oldIndex = weave.getIndex(patternId)
    if (oldIndex > -1) {
      weave.reset(patternId)
      set({ weaveResetPending: oldIndex })
    }
  },

  paintCell: (row, col, hex) => {
    const { cells, cols, rows, fringe, rowShape } = get()
    if (!isPaintableCell(row, col, cols, rows, fringe, rowShape)) return
    const key = cellKey(row, col)
    if (cells[key] === (hex ?? undefined)) return
    const next = { ...cells }
    if (hex) next[key] = hex
    else delete next[key]
    get().commit(next)
  },

  paintLine: (r0, c0, r1, c1, hex) => {
    const { cells, cols, rows, fringe, rowShape } = get()
    const next = { ...cells }
    for (const cell of lineCells(r0, c0, r1, c1)) {
      if (!isPaintableCell(cell.row, cell.col, cols, rows, fringe, rowShape)) continue
      const key = cellKey(cell.row, cell.col)
      if (hex) next[key] = hex
      else delete next[key]
    }
    get().commit(next)
  },

  pickColor: (row, col) => {
    const hex = get().cells[cellKey(row, col)]
    if (hex) {
      const slot = get().activeSlot
      set((s) => {
        const next = [...s.slots]
        next[slot] = hex
        return { slots: next }
      })
    }
  },

  mergeColors: (fromHex, toHex) => {
    get().commit(replaceColorInCells(get().cells, fromHex, toHex))
  },

  swapColors: (hexA, hexB) => {
    get().commit(swapColorsInCells(get().cells, hexA, hexB))
  },

  floodFill: (row, col, hex) => {
    const { cells, cols, rows, fringe, rowShape } = get()
    get().commit(floodFillCells(cells, cols, rows, row, col, hex, fringe, rowShape))
  },

  applyGradient: (startHex, endHex, direction) => {
    const { cells, cols, rows, fringe, rowShape, technique, selection, colorSelectionMask, staggerPhase } = get()
    const targets: { row: number; col: number }[] = []
    if (selection) {
      for (let r = selection.r0; r <= selection.r1; r++) {
        for (let c = selection.c0; c <= selection.c1; c++) {
          const key = cellKey(r, c)
          if (colorSelectionMask && !colorSelectionMask.has(key)) continue
          if (!isPaintableCell(r, c, cols, rows, fringe, rowShape)) continue
          targets.push({ row: r, col: c })
        }
      }
    } else {
      const maxFringe = maxFringeLength(fringe)
      for (let r = 0; r < rows + maxFringe; r++) {
        for (let c = 0; c < cols; c++) {
          if (!isPaintableCell(r, c, cols, rows, fringe, rowShape)) continue
          targets.push({ row: r, col: c })
        }
      }
    }
    if (targets.length === 0) return

    const palette = paletteFromCells(cells).map((p) => p.hex)
    const gradientColors = computeGradientCells(targets, technique, rows, startHex, endHex, direction, palette, 0.2, staggerPhase)
    get().commit({ ...cells, ...gradientColors })
  },

  strokeStart: () => set({ strokeBase: get().cells }),

  strokeCell: (row, col, hex) => {
    const { cells, cols, rows, mirrorMode, fringe, rowShape } = get()
    const next = { ...cells }
    let changed = false

    const paintOne = (r: number, c: number) => {
      if (!isPaintableCell(r, c, cols, rows, fringe, rowShape)) return
      const key = cellKey(r, c)
      if (cells[key] === (hex ?? undefined)) return
      if (hex) next[key] = hex
      else delete next[key]
      changed = true
    }

    paintOne(row, col)
    if (mirrorMode !== 'off') {
      const mirrored = mirroredCell(row, col, cols, rows, mirrorMode)
      paintOne(mirrored.row, mirrored.col)
    }

    if (changed) set({ cells: next })
  },

  strokeEnd: () => {
    const { strokeBase, cells, rows, rowShape, fringe, staggerPhase, loop, history } = get()
    if (!strokeBase || strokeBase === cells) {
      set({ strokeBase: null })
      return
    }
    set({
      history: [...history, { cells: strokeBase, rows, rowShape, fringe, staggerPhase, loop }].slice(-100),
      future: [],
      strokeBase: null,
    })
    const id = get().patternId
    if (id) scheduleAutosave(id, cells)
  },

  // A fresh manual drag always means "the whole rect" — any color mask from
  // a previous `selectColor` no longer applies.
  setSelection: (rect) => set({ selection: rect ? normalizeRect(rect) : null, colorSelectionMask: null }),

  eraseSelection: () => {
    const { selection, cells, colorSelectionMask } = get()
    if (!selection) return
    const next = { ...cells }
    for (let r = selection.r0; r <= selection.r1; r++) {
      for (let c = selection.c0; c <= selection.c1; c++) {
        const key = cellKey(r, c)
        if (colorSelectionMask && !colorSelectionMask.has(key)) continue
        delete next[key]
      }
    }
    get().commit(next)
  },

  copySelection: () => {
    const { selection, cells, colorSelectionMask } = get()
    if (!selection) return
    const width = selection.c1 - selection.c0 + 1
    const height = selection.r1 - selection.r0 + 1
    const relCells: ColorMap = {}
    for (let r = selection.r0; r <= selection.r1; r++) {
      for (let c = selection.c0; c <= selection.c1; c++) {
        const key = cellKey(r, c)
        if (colorSelectionMask && !colorSelectionMask.has(key)) continue
        const hex = cells[key]
        if (hex) relCells[cellKey(r - selection.r0, c - selection.c0)] = hex
      }
    }
    set({ clipboard: { width, height, cells: relCells } })
  },

  pasteClipboardAt: (row, col, opts) => {
    const { clipboard, cells, cols, rows, fringe, rowShape } = get()
    if (!clipboard) return
    const next = { ...cells }
    for (const [key, hex] of Object.entries(clipboard.cells)) {
      if (!hex) continue
      const { row: rr, col: rc } = parseCellKey(key)
      const fr = opts?.flipV ? clipboard.height - 1 - rr : rr
      const fc = opts?.flipH ? clipboard.width - 1 - rc : rc
      const targetRow = row + fr
      const targetCol = col + fc
      if (!isPaintableCell(targetRow, targetCol, cols, rows, fringe, rowShape)) continue
      next[cellKey(targetRow, targetCol)] = hex
    }
    set({ pasteArmed: false, pasteFlipH: false, pasteFlipV: false })
    get().commit(next)
  },

  /** Repeats the selected block `times` total (the original plus `times - 1` copies) end to end in one direction. */
  cloneSelection: (direction, times) => {
    const { selection, cells, cols, rows, fringe, rowShape } = get()
    if (!selection) return
    const width = selection.c1 - selection.c0 + 1
    const height = selection.r1 - selection.r0 + 1
    const next = { ...cells }
    for (let i = 1; i < times; i++) {
      const rowOffset = direction === 'vertical' ? i * height : 0
      const colOffset = direction === 'horizontal' ? i * width : 0
      for (let r = selection.r0; r <= selection.r1; r++) {
        for (let c = selection.c0; c <= selection.c1; c++) {
          const hex = cells[cellKey(r, c)]
          if (!hex) continue
          const targetRow = r + rowOffset
          const targetCol = c + colOffset
          if (!isPaintableCell(targetRow, targetCol, cols, rows, fringe, rowShape)) continue
          next[cellKey(targetRow, targetCol)] = hex
        }
      }
    }
    get().commit(next)
  },

  undo: () => {
    const { history, cells, rows, rowShape, fringe, staggerPhase, loop, future } = get()
    if (history.length === 0) return
    const prev = history[history.length - 1]
    set({
      cells: prev.cells,
      rows: prev.rows,
      rowShape: prev.rowShape,
      fringe: prev.fringe,
      staggerPhase: prev.staggerPhase,
      loop: prev.loop,
      history: history.slice(0, -1),
      future: [{ cells, rows, rowShape, fringe, staggerPhase, loop }, ...future].slice(0, 100),
    })
    const id = get().patternId
    if (id) {
      usePatternsStore.getState().setShapeStructure(id, prev)
      // Not folded into setShapeStructure (that call predates the loop and only
      // covers rows/rowShape/cells/fringe) — undoing a `setLoop` change needs its
      // own persist, same reasoning as any other field this restores.
      usePatternsStore.getState().setLoop(id, prev.loop)
    }
  },

  redo: () => {
    const { future, cells, rows, rowShape, fringe, staggerPhase, loop, history } = get()
    if (future.length === 0) return
    const next = future[0]
    set({
      cells: next.cells,
      rows: next.rows,
      rowShape: next.rowShape,
      fringe: next.fringe,
      staggerPhase: next.staggerPhase,
      loop: next.loop,
      future: future.slice(1),
      history: [...history, { cells, rows, rowShape, fringe, staggerPhase, loop }].slice(-100),
    })
    const id = get().patternId
    if (id) {
      usePatternsStore.getState().setShapeStructure(id, next)
      usePatternsStore.getState().setLoop(id, next.loop)
    }
  },
}))
