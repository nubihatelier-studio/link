import { create } from 'zustand'
import type { TemplateMeta } from '@/engine/template'
import { resizePiece, type ResizePlan } from '@/engine/resize'
import type { BrickDrop, ColorMap, EarringSide, FringeData, LoopData, PairData, PatternDoc, RowShape, Technique } from '@/engine/types'
import { cellKey, parseCellKey } from '@/engine/cellKey'
import { lineCells } from '@/engine/line'
import { floodFillCells } from '@/engine/floodFill'
import { createEmptyFringe, isPaintableCell, MAX_FRINGE_LENGTH, maxFringeLength, normalizeFringe } from '@/engine/fringe'
import { normalizeLoop } from '@/engine/loop'
import { dropOf, effectiveStaggerPhase, flipStagger, isShiftedRow, staggerOf, stitchRowOf, type StaggerPhase } from '@/engine/geometry'
import { leftPieceOf, rightEarring, splitPair, type Piece } from '@/engine/pair'
import { createRectangleRowShape, createShapedRowShape, detectPreset, minTaperWidth, normalizeRowShape, recenterRowShape } from '@/engine/shape'
import { computeGradientCells, type GradientDirection } from '@/engine/gradient'
import { replaceColorInCells, selectionForColor, swapColorsInCells } from '@/lib/palette'
import { clampZoom } from '@/lib/zoomScale'
import { activeAfterEmptying, fillSlot, loadColor, slotOf, TRAY_SIZE, trayFor, withoutUnpainted, type Tray } from '@/engine/tray'
import { usePatternsStore } from './patternsStore'
import { useWeaveStore } from './weaveStore'

export type Tool = 'pencil' | 'line' | 'eraser' | 'rectErase' | 'eyedropper' | 'select' | 'fill'
/** Index into the `slots` array — the quick-access palette grows as colors are added, so slots are no longer a fixed A–D set. */
export type SlotId = number
export type CloneDirection = 'vertical' | 'horizontal'

/** Which slot the color chooser is filling, and whether it loads a color or recolors one already painted. */
export interface ColorChooserRequest {
  slot: SlotId
  mode: 'fill' | 'recolor'
}

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
  staggerPhase: StaggerPhase
  loop: LoopData | undefined
  /**
   * Set on the step a color card's recolor or merge made: the slot it
   * changed, and what the slot held before and after. The tray isn't part of
   * undo in general (loading a color is no edit to the design), but these two
   * steps change a slot *because* they change the beads, and undoing the beads
   * without the slot left the old color painted with no slot to pick it from.
   */
  trayChange?: TrayChange
  /**
   * Set on the step a resize made (and on its redo/undo counterpart): the
   * columns and the pair as they were. Every other step leaves them alone, so
   * only this one needs to carry them back — see `resizePattern`.
   */
  resize?: { cols: number; pair: PairData | undefined }
}

interface TrayChange {
  slot: SlotId
  before: string | null
  after: string | null
}

interface EditorState {
  patternId: string | null
  name: string
  technique: Technique
  cols: number
  rows: number
  beadTypeId: string
  /**
   * Changes the bead an existing pattern is woven with (see
   * `BeadTypeDialog`). Not an undo step and no weave-progress reset: not a
   * single cell moves — the bead type only decides the finished piece's
   * millimetres and which calibration row applies (`engine/calibration.ts`),
   * and the same control puts the old bead back.
   */
  setBeadType: (beadTypeId: string) => void
  /**
   * 0 or 1 — shifts brick's row-parity stagger check from a row's raw index
   * to `row + staggerPhase` (see `geometry.ts#cellPosition`). Legacy patterns
   * load with 0, reproducing their exact prior look. `addRowAtTop`/
   * `removeRowAtTop` flip it (see their own comments) so that inserting or
   * removing a row at the top — which reindexes every existing row — doesn't
   * shift their physical stagger and break the pattern's centering.
   *
   * Brick 2-drop and 3-drop carry their drop here too (see
   * `geometry.ts#BrickStagger`), so undo brings a drop back with its shape.
   */
  staggerPhase: StaggerPhase
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
  /**
   * The pattern at a new size — columns added or taken away on either side,
   * rows at the top or the bottom (see `engine/resize.ts`). One undo step;
   * the weave progress resets, since every bead's place in the order changes.
   * Returns how many painted beads were left out.
   */
  resizePattern: (plan: ResizePlan) => number
  /** Removes the topmost row — a no-op if only 1 row remains (a pattern always keeps at least 1 row). Single undo entry, same as `addRowAtTop`. */
  removeRowAtTop: () => void
  /**
   * Brick only: weaves 1-drop, 2-drop or 3-drop from now on. Rows round up to
   * whole stacks (added at the top, so the fringe keeps hanging from the same
   * row), a preset silhouette is rebuilt for the new drop, and the last row
   * keeps its half-bead shift so the fringe doesn't move. One undo step; the
   * weave progress resets, since every stitch changes.
   */
  setBrickDrop: (drop: BrickDrop) => void
  /** Shared plumbing for `addRowAtTop`/`removeRowAtTop`: one undo entry, one persisted write, and an explicit (never silent, never corrupted) weave-progress reset since a row-count change renumbers the whole weave order. */
  commitShapeChange: (next: { rows: number; rowShape: RowShape[]; cells: ColorMap; staggerPhase: StaggerPhase }) => void
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

  /** The earring pair this pattern belongs to, if any — see `engine/types.ts#PairData`. */
  pair: PairData | undefined
  /**
   * Which earring the canvas shows and edits. The working fields (`cells`,
   * `fringe`, `rowShape`, `staggerPhase`) always describe THIS earring, so
   * every tool works on the right one exactly as on the left; only where the
   * result is saved differs (`pair.rightCells` instead of the pattern's own
   * cells). Always 'left' for a single piece.
   */
  side: EarringSide
  setSide: (side: EarringSide) => void
  /**
   * Makes the pattern a pair, changes how its right earring is kept, or
   * (undefined) makes it a single piece again. Not part of undo history — the
   * caller offers an undo toast for the changes that lose something.
   */
  setPair: (pair: PairData | undefined) => void
  /** Gives the right earring colours of its own, starting from exactly what the mirror showed. */
  splitPairColors: () => void
  /**
   * The left earring — the pattern as saved, after flushing any pending
   * autosave. What exports and weave mode start from, whichever earring the
   * canvas happens to be showing.
   */
  leftPiece: () => Piece | null

  history: EditorSnapshot[]
  future: EditorSnapshot[]

  tool: Tool
  /** The palette tray — see `engine/tray.ts`. `null` is an empty slot. Saved with the pattern. */
  slots: Tray
  /** The slot being painted with, or -1 while no color is loaded yet. */
  activeSlot: SlotId
  /** "+ Casilla": adds an empty slot and opens the color chooser on it. */
  addSlot: () => void
  /**
   * Paint with this color: selects the slot that already holds it, or loads
   * it into the first empty slot. Never recolors the active slot —
   * overwriting it is what made a color picked from the eyedropper seem not
   * to stay.
   */
  chooseColor: (hex: string) => void
  /**
   * Loads several colors at once — "Paleta desde una foto": each goes into the
   * next empty slot (adding slots when there are none), colors already in the
   * tray are skipped, and nothing loaded or painted is replaced. The first new
   * color becomes the one to paint with.
   */
  loadColors: (hexes: string[]) => void
  /** Whether the "Paleta desde una foto" dialog is open — rendered once by the editor page. */
  photoPaletteOpen: boolean
  setPhotoPaletteOpen: (open: boolean) => void
  /** Puts `hex` in `slot` and paints with it (or with the slot already holding it). */
  fillSlot: (slot: SlotId, hex: string) => void
  /** Empties a slot — only one whose color isn't painted anywhere. */
  emptySlot: (slot: SlotId) => void
  /** Recolors every bead of the slot's color to `hex`, in one undo step, and the slot with it. */
  recolorSlot: (slot: SlotId, hex: string) => void
  /** The open color chooser, if any — rendered once by the editor page. */
  colorChooser: ColorChooserRequest | null
  openColorChooser: (slot: SlotId, mode?: ColorChooserRequest['mode']) => void
  /** Opens the chooser on the first empty slot — what painting with no color loaded does. */
  requestColor: () => void
  closeColorChooser: () => void
  /** The slot whose color card is open — what tapping the active color again shows. */
  colorCard: SlotId | null
  openColorCard: (slot: SlotId) => void
  closeColorCard: () => void
  /** Fuses the slot's color into `intoHex` everywhere, in one undo step, and empties its slot. */
  mergeSlotInto: (slot: SlotId, intoHex: string) => void
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
  /**
   * Lifts what's marked and lets it travel with the pointer, previewed like a
   * paste, until it's dropped somewhere else — where it was left is cleared
   * in the same step, so it's a move, not a copy. Nothing changes until the
   * drop: cancelling (Esc) leaves the pattern exactly as it was.
   */
  armMoveSelection: () => void
  /** Where a move was lifted from — those cells are cleared when it lands. Null for an ordinary paste. */
  moveSource: SelectionRect | null
  toggleFlipH: () => void
  toggleFlipV: () => void

  cloneDirection: CloneDirection
  setCloneDirection: (dir: CloneDirection) => void
  cloneSelection: (direction: CloneDirection, times: number) => void

  /**
   * Takes a mirrored copy of the selection and arms the paste with it: the
   * marked beads stay exactly as they are, and the reflection travels with
   * the pointer — previewed cell by cell — until it's dropped where the
   * weaver wants it (see `CanvasGrid`'s paste ghost). Mirroring a selection
   * *in place* is what this used to do, and it was the wrong half of the
   * job: a symmetric piece needs the original AND its reflection.
   */
  mirrorSelectionToPaste: (axis: 'horizontal' | 'vertical') => void

  loadPattern: (doc: PatternDoc) => void
  /**
   * Saves the open pattern as a template — after writing any edit still
   * waiting in the autosave, so the template is the pattern as it looks now.
   */
  saveAsTemplate: (name: string, replaceId?: string, meta?: TemplateMeta) => ReturnType<ReturnType<typeof usePatternsStore.getState>['saveTemplate']>
  setTool: (tool: Tool) => void
  setActiveSlot: (slot: SlotId) => void
  setZoom: (zoom: number) => void
  /**
   * Bumped by "Ajustar a pantalla" — the canvas is the only thing that knows
   * how much room it has, so the button asks and `CanvasGrid` answers with
   * the framing `lib/fitZoom.ts#initialFitZoom` gives a pattern when it
   * opens. A counter rather than a flag: asking twice in a row has to work,
   * and there is nothing to clear afterwards.
   */
  fitZoomRequest: number
  requestFitZoom: () => void
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
   * alike — if nothing is selected) with a gradient through `stops`, in
   * order, one band per color, with soft dithering where bands meet (see
   * `engine/gradient.ts#computeGradientCells`). One undo step, like
   * `mergeColors`/`floodFill`.
   */
  applyGradient: (stops: string[], direction: GradientDirection) => void

  /** Stroke = one drag gesture (pencil/eraser) collapsed into a single undo step. */
  strokeBase: ColorMap | null
  strokeStart: () => void
  strokeCell: (row: number, col: number, hex: string | null) => void
  strokeEnd: () => void
  /** Drops the stroke in progress as if it never happened — no undo step, nothing saved. For a touch that turns out to be the start of a pinch. */
  strokeCancel: () => void

  setSelection: (rect: SelectionRect | null) => void
  eraseSelection: () => void
  /** Empties every painted cell, keeping the piece and its size. One undo step, like any other edit. */
  clearAllCells: () => void
  /** Drops palette colours that aren't painted anywhere — the ones shown under "sin usar todavía". Always leaves at least one. */
  clearUnusedSlots: () => void
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

/** The rows woven as one stitch row with `row` — just `row` itself for 1-drop. */
function stackRows(row: number, rows: number, stagger: StaggerPhase): number[] {
  const drop = dropOf(stagger)
  const top = stitchRowOf(row, stagger) * drop
  return Array.from({ length: Math.min(drop, rows - top) }, (_, i) => top + i)
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
let pendingAutosave: (() => void) | null = null

/**
 * Saves the working cells 600ms after the last change — to the pattern's own
 * cells, or to the right earring's when that's the side being edited. The
 * side is captured when the save is scheduled, so switching earrings before
 * it fires can never write one earring's colours into the other.
 */
function scheduleAutosave(patternId: string, cells: ColorMap, side: EarringSide = 'left') {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  const save = () => {
    autosaveTimer = null
    pendingAutosave = null
    persistCells(patternId, cells, side)
  }
  pendingAutosave = save
  autosaveTimer = setTimeout(save, 600)
}

/** Runs a scheduled autosave right away — before anything reads the saved pattern back. */
function flushAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  pendingAutosave?.()
}

/** Tags the step just committed with the slot change that went with it — see `EditorSnapshot.trayChange`. */
function markTrayChange(get: () => EditorState, set: (partial: Partial<EditorState>) => void, trayChange: TrayChange) {
  const { history } = get()
  const last = history[history.length - 1]
  if (last) set({ history: [...history.slice(0, -1), { ...last, trayChange }] })
}

/**
 * Undoes or redoes a slot change: the slot goes from `from` back to `to` if
 * it still holds `from`. If the weaver has put something else there since,
 * `to` is loaded into another slot instead of overwriting her choice.
 */
function applyTrayChange(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  slot: SlotId,
  from: string | null,
  to: string | null,
) {
  const { slots, activeSlot } = get()
  if (slots[slot] === from) {
    const next = [...slots]
    next[slot] = to && slotOf(slots, to) < 0 ? to : null
    setTray(get, set, next, to ? slotOf(next, to) : activeAfterEmptying(next, activeSlot))
  } else if (to) {
    const next = loadColor(slots, to)
    setTray(get, set, next.tray, next.active)
  }
}

/** Sets the tray and the active slot, and saves the tray with the pattern. */
function setTray(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  slots: Tray,
  activeSlot: SlotId,
) {
  set({ slots, activeSlot })
  const { patternId } = get()
  if (patternId) usePatternsStore.getState().setPalette(patternId, slots)
}

function persistCells(patternId: string, cells: ColorMap, side: EarringSide) {
  if (side === 'left') {
    usePatternsStore.getState().setCells(patternId, cells)
    return
  }
  usePatternsStore.getState().setPair(patternId, { mode: 'independent', rightCells: cells })
}

/**
 * The right earring in 'mirror' mode is a live reflection with nothing of
 * its own to paint — it's shown, not edited. Painting it would either be
 * lost or silently repaint the left.
 */
function isReadOnlySide(state: { side: EarringSide; pair: PairData | undefined }): boolean {
  return state.side === 'right' && state.pair?.mode === 'mirror'
}

let noteAutosaveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleNoteAutosave(patternId: string, note: string) {
  if (noteAutosaveTimer) clearTimeout(noteAutosaveTimer)
  noteAutosaveTimer = setTimeout(() => {
    usePatternsStore.getState().setNote(patternId, note)
  }, 600)
}

export const useEditorStore = create<EditorState>()((set, get) => {
  /** Loads one earring into the working fields, from what's saved. See `EditorState.side`. */
  function showSide(side: EarringSide) {
    const { patternId } = get()
    if (!patternId) return
    const doc = usePatternsStore.getState().getPattern(patternId)
    if (!doc) return
    const left = leftPieceOf(doc)
    const piece = side === 'right' && doc.pair ? rightEarring(left, doc.pair) : left
    set({
      side: piece === left ? 'left' : 'right',
      pair: doc.pair,
      cells: { ...piece.cells },
      fringe: piece.fringe!,
      rowShape: piece.rowShape!,
      staggerPhase: piece.staggerPhase,
      // Undo steps describe one earring's cells — they don't carry over.
      history: [],
      future: [],
      selection: null,
      colorSelectionMask: null,
      strokeBase: null,
      pasteArmed: false,
      fringeSculptMode: false,
    })
  }

  return {
  patternId: null,
  name: '',
  technique: 'peyote',
  cols: 20,
  rows: 20,
  beadTypeId: 'miyuki-delica-11',
  staggerPhase: 0,
  setBeadType: (beadTypeId) => {
    const { beadTypeId: current, patternId } = get()
    if (beadTypeId === current) return
    set({ beadTypeId })
    if (patternId) usePatternsStore.getState().setBeadType(patternId, beadTypeId)
  },
  cells: {},

  fringe: createEmptyFringe(20),
  rowShape: createRectangleRowShape(20, 20),
  // Delegates to sculptFringeLengths (also mirroring onto the symmetric
  // counterpart column when fringeSymmetric is on) so a manual −/+ edit gets
  // the exact same single-commit trimming behavior as the quick shapes and
  // the drag gesture, instead of duplicating that logic a third time.
  setFringeLength: (col, rawLength) => {
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
    const { cols, fringeSymmetric } = get()
    const mirrorCol = cols - 1 - col
    const lengths: (number | undefined)[] = []
    lengths[col] = rawLength
    if (fringeSymmetric && mirrorCol !== col) lengths[mirrorCol] = rawLength
    get().sculptFringeLengths(lengths)
  },
  setFringeTurnBead: (col, isTurnBead) => {
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
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
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
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
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
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
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
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
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
    const { rowShape, cols, cells, rows, fringe, staggerPhase } = get()
    const shape = rowShape[row]
    if (!shape) return
    const next = edge === 'left' ? { offset: shape.offset - 1, length: shape.length + 1 } : { offset: shape.offset, length: shape.length + 1 }
    if (next.offset < 0 || next.offset + next.length > cols) return // already at the grid's own edge
    const nextRowShape = [...rowShape]
    // 2-drop/3-drop: the rows of a stack are one stitch row, so they change together.
    for (const r of stackRows(row, rows, staggerPhase)) nextRowShape[r] = next
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
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
    const { rowShape, cells, cols, rows, fringe, staggerPhase } = get()
    const shape = rowShape[row]
    if (!shape || shape.length <= 1) return // a row always keeps at least 1 bead
    const droppedCol = edge === 'left' ? shape.offset : shape.offset + shape.length - 1
    const next = edge === 'left' ? { offset: shape.offset + 1, length: shape.length - 1 } : { offset: shape.offset, length: shape.length - 1 }
    const nextRowShape = [...rowShape]
    const stack = stackRows(row, rows, staggerPhase)
    for (const r of stack) nextRowShape[r] = next
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
    const directKeys = stack.map((r) => cellKey(r, droppedCol))
    const withDirectDrop = directKeys.some((key) => key in cells) ? { ...cells } : cells
    for (const key of directKeys) delete withDirectDrop[key]
    const pruned = pruneOrphanedCells(withDirectDrop, cols, rows, fringe, recentered)
    if (pruned !== cells) get().commit(pruned)

    const id = get().patternId
    if (id) usePatternsStore.getState().setRowShape(id, recentered)
  },

  addRowAtTop: () => {
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
    const { cells, rows, rowShape, cols, fringe, staggerPhase } = get()
    const oldFirst = rowShape[0]
    // 2-drop/3-drop add a whole stack — one stitch row — and taper to two columns, not one.
    const drop = dropOf(staggerPhase)
    const length = Math.max(Math.min(cols, minTaperWidth(drop)), oldFirst.length - 1)
    // Inserting a row reindexes every existing row by +1, flipping which
    // absolute index (and thus brick parity) each one lands on — flipping
    // staggerPhase in lockstep exactly cancels that shift, so every
    // pre-existing row's real physical stagger (and its centered offset)
    // stays the same; only the new row's own slot is actually new. See this
    // file's `staggerPhase` field doc and `shape.ts#recenterRowShape`.
    const nextStaggerPhase = flipStagger(staggerPhase)
    // Prepend a placeholder (its offset doesn't matter — recenterRowShape
    // re-derives every row's offset from scratch right after) rather than
    // patching just this one row and leaving the rest untouched: inserting
    // a row shifts every existing row to a new absolute index, flipping its
    // brick parity, so an offset that was correct before is generally wrong
    // now (see `recenterRowShape`'s doc comment — this is the "romboide"
    // bug: 5 additions in a row used to skew the whole silhouette).
    const added = Array.from({ length: drop }, () => ({ offset: 0, length }))
    const nextRowShape = recenterRowShape([...added, ...rowShape], cols, nextStaggerPhase)
    // Every existing cell (body and fringe alike — they share the same
    // `cells` map) shifts down by one row to make room for the new top row.
    const shiftedCells: ColorMap = {}
    for (const [key, hex] of Object.entries(cells)) {
      const { row, col } = parseCellKey(key)
      shiftedCells[cellKey(row + drop, col)] = hex
    }
    // Recentering the rest of the rows could nudge one enough to orphan a
    // cell that was valid under the old (pre-shift) offsets.
    const nextCells = pruneOrphanedCells(shiftedCells, cols, rows + drop, fringe, nextRowShape)
    get().commitShapeChange({ rows: rows + drop, rowShape: nextRowShape, cells: nextCells, staggerPhase: nextStaggerPhase })
  },

  removeRowAtTop: () => {
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
    const { rows, rowShape, cells, cols, fringe, staggerPhase } = get()
    // 2-drop/3-drop remove a whole stack, and always keep one.
    const drop = dropOf(staggerPhase)
    if (rows <= drop) return // a pattern always keeps at least 1 row
    // Removing the top row reindexes every remaining row by -1 — the same
    // parity-cancelling flip as addRowAtTop (±1 mod 2 is the same shift).
    const nextStaggerPhase = flipStagger(staggerPhase)
    const nextRowShape = recenterRowShape(rowShape.slice(drop), cols, nextStaggerPhase)
    // Shifts every remaining row up by one; anything painted in the row
    // being removed no longer exists.
    const shiftedCells: ColorMap = {}
    for (const [key, hex] of Object.entries(cells)) {
      const { row, col } = parseCellKey(key)
      if (row < drop) continue
      shiftedCells[cellKey(row - drop, col)] = hex
    }
    const nextCells = pruneOrphanedCells(shiftedCells, cols, rows - drop, fringe, nextRowShape)
    get().commitShapeChange({ rows: rows - drop, rowShape: nextRowShape, cells: nextCells, staggerPhase: nextStaggerPhase })
  },

  resizePattern: (plan) => {
    // The right earring's shape follows the left, mirrored — it's resized there.
    if (get().side === 'right') return 0
    const { technique, cols, rows, cells, fringe, rowShape, staggerPhase, pair, loop, history, patternId } = get()
    const r = resizePiece({ technique, cols, rows, cells, fringe, rowShape, staggerPhase, pair }, plan)
    set({
      cols: r.cols,
      rows: r.rows,
      cells: r.cells,
      fringe: r.fringe,
      rowShape: r.rowShape,
      staggerPhase: r.staggerPhase,
      pair: r.pair,
      selection: null,
      colorSelectionMask: null,
      history: [...history, { cells, rows, rowShape, fringe, staggerPhase, loop, resize: { cols, pair } }].slice(-100),
      future: [],
    })
    if (!patternId) return r.lost
    usePatternsStore.getState().setShapeStructure(patternId, {
      rows: r.rows,
      rowShape: r.rowShape,
      cells: r.cells,
      fringe: r.fringe,
      staggerPhase: r.staggerPhase,
      cols: r.cols,
      pair: r.pair,
      hasPairChange: true,
    })
    // Every bead's place in the weave order changed: never leave old progress silently wrong.
    const weave = useWeaveStore.getState()
    const oldIndex = weave.getIndex(patternId)
    if (oldIndex > -1) {
      weave.reset(patternId)
      set({ weaveResetPending: oldIndex })
    }
    return r.lost
  },

  setBrickDrop: (drop) => {
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
    const { technique, cells, rows, rowShape, cols, fringe, staggerPhase } = get()
    const oldDrop = dropOf(staggerPhase)
    if (technique !== 'brick' || oldDrop === drop) return

    const nextRows = Math.ceil(rows / drop) * drop
    const added = nextRows - rows
    // The last row keeps its half-bead shift, so the fringe hangs where it did.
    const base = staggerOf(0, drop)
    const nextStaggerPhase = isShiftedRow(nextRows - 1, base) === isShiftedRow(rows - 1, staggerPhase) ? base : flipStagger(base)

    const preset = detectPreset(rowShape, cols, oldDrop)
    let nextRowShape: RowShape[]
    if (preset) {
      nextRowShape = createShapedRowShape(preset, cols, nextRows, nextStaggerPhase)
    } else {
      // A hand-edited silhouette: new rows on top copy the first row, and each
      // stack takes its widest row's width.
      const widths = [...Array.from({ length: added }, () => rowShape[0].length), ...rowShape.map((r) => r.length)]
      const stacked = widths.map((_, r) => Math.max(...stackRows(r, nextRows, nextStaggerPhase).map((sr) => widths[sr])))
      nextRowShape = recenterRowShape(stacked.map((length) => ({ offset: 0, length })), cols, nextStaggerPhase)
    }

    const shiftedCells: ColorMap = {}
    for (const [key, hex] of Object.entries(cells)) {
      const { row, col } = parseCellKey(key)
      shiftedCells[cellKey(row + added, col)] = hex
    }
    const nextCells = pruneOrphanedCells(shiftedCells, cols, nextRows, fringe, nextRowShape)
    get().commitShapeChange({ rows: nextRows, rowShape: nextRowShape, cells: nextCells, staggerPhase: nextStaggerPhase })
  },

  note: '',
  setNote: (note) => {
    set({ note })
    const id = get().patternId
    if (id) scheduleNoteAutosave(id, note)
  },

  loop: undefined,
  setLoop: (loop) => {
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
    const { cells, rows, rowShape, fringe, staggerPhase, loop: prevLoop, history } = get()
    set({ loop, history: [...history, { cells, rows, rowShape, fringe, staggerPhase, loop: prevLoop }].slice(-100), future: [] })
    const id = get().patternId
    if (id) usePatternsStore.getState().setLoop(id, loop)
  },

  pair: undefined,
  side: 'left',
  setSide: (side) => {
    const { patternId, pair, side: current } = get()
    if (!patternId || side === current || (side === 'right' && !pair)) return
    // Whatever is still waiting to be saved belongs to the earring being left.
    flushAutosave()
    showSide(side)
  },
  setPair: (pair) => {
    const { patternId, side } = get()
    if (!patternId) return
    flushAutosave()
    usePatternsStore.getState().setPair(patternId, pair)
    set({ pair })
    // The right earring's view is derived from the pair: redraw it from the
    // new one, or go back to the left when there's no longer a pair to show.
    if (side === 'right') showSide(pair ? 'right' : 'left')
  },
  leftPiece: () => {
    const { patternId } = get()
    if (!patternId) return null
    flushAutosave()
    const doc = usePatternsStore.getState().getPattern(patternId)
    return doc ? leftPieceOf(doc) : null
  },
  splitPairColors: () => {
    const { patternId, pair } = get()
    if (!patternId || pair?.mode !== 'mirror') return
    flushAutosave()
    const doc = usePatternsStore.getState().getPattern(patternId)
    if (!doc) return
    get().setPair(splitPair(leftPieceOf(doc)))
  },

  history: [],
  future: [],
  weaveResetPending: null,
  clearWeaveResetPending: () => set({ weaveResetPending: null }),

  tool: 'pencil',
  slots: Array<null>(TRAY_SIZE).fill(null),
  activeSlot: -1,
  addSlot: () => {
    const slot = get().slots.length
    setTray(get, set, [...get().slots, null], get().activeSlot)
    set({ colorChooser: { slot, mode: 'fill' } })
  },
  loadColors: (hexes) => {
    let tray = get().slots
    let firstNew = -1
    for (const hex of hexes) {
      if (slotOf(tray, hex) >= 0) continue
      const next = loadColor(tray, hex)
      tray = next.tray
      if (firstNew < 0) firstNew = next.active
    }
    if (firstNew >= 0) setTray(get, set, tray, firstNew)
  },
  photoPaletteOpen: false,
  setPhotoPaletteOpen: (open) => set({ photoPaletteOpen: open, ...(open ? { colorChooser: null } : {}) }),
  fillSlot: (slot, hex) => {
    const next = fillSlot(get().slots, slot, hex)
    setTray(get, set, next.tray, next.active)
  },
  emptySlot: (slot) => {
    const { slots, cells, activeSlot } = get()
    const hex = slots[slot]
    if (!hex || Object.values(cells).some((c) => c && c.toLowerCase() === hex.toLowerCase())) return
    const next = [...slots]
    next[slot] = null
    setTray(get, set, next, activeAfterEmptying(next, activeSlot))
  },
  recolorSlot: (slot, hex) => {
    const { slots, cells } = get()
    const old = slots[slot]
    if (!old || old.toLowerCase() === hex.toLowerCase()) return
    if (Object.values(cells).includes(old)) {
      const { patternId } = get()
      if (patternId) usePatternsStore.getState().shareLetter(patternId, old, hex)
      get().commit(replaceColorInCells(cells, old, hex))
    }
    const next = [...slots]
    // Recoloring into a color another slot already holds merges the two.
    const existing = slotOf(slots, hex)
    next[slot] = existing >= 0 ? null : hex
    setTray(get, set, next, existing >= 0 ? existing : slot)
    markTrayChange(get, set, { slot, before: old, after: next[slot] })
  },
  colorChooser: null,
  openColorChooser: (slot, mode = 'fill') => set({ colorChooser: { slot, mode }, colorCard: null }),
  colorCard: null,
  openColorCard: (slot) => set({ colorCard: slot }),
  closeColorCard: () => set({ colorCard: null }),
  mergeSlotInto: (slot, intoHex) => {
    const { slots, cells } = get()
    const from = slots[slot]
    if (!from || from.toLowerCase() === intoHex.toLowerCase()) return
    get().commit(replaceColorInCells(cells, from, intoHex))
    const next = [...slots]
    next[slot] = null
    const into = slotOf(next, intoHex)
    setTray(get, set, next, into >= 0 ? into : activeAfterEmptying(next, get().activeSlot))
    markTrayChange(get, set, { slot, before: from, after: null })
  },
  requestColor: () => {
    const { slots } = get()
    const vacant = slots.indexOf(null)
    if (vacant >= 0) set({ colorChooser: { slot: vacant, mode: 'fill' } })
    else get().addSlot()
  },
  closeColorChooser: () => {
    // A slot added by "+ Casilla" and then cancelled doesn't linger past six.
    const { slots, colorChooser, activeSlot } = get()
    if (colorChooser && slots.length > TRAY_SIZE && colorChooser.slot === slots.length - 1 && !slots[colorChooser.slot]) {
      setTray(get, set, slots.slice(0, -1), activeSlot)
    }
    set({ colorChooser: null })
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
  armPaste: () => set({ pasteArmed: true, pasteFlipH: false, pasteFlipV: false, moveSource: null }),
  disarmPaste: () => set({ pasteArmed: false, pasteFlipH: false, pasteFlipV: false, moveSource: null }),
  moveSource: null,
  armMoveSelection: () => {
    if (isReadOnlySide(get())) return
    const { selection } = get()
    if (!selection) return
    get().copySelection()
    if (!get().clipboard) return
    set({ pasteArmed: true, pasteFlipH: false, pasteFlipV: false, moveSource: selection })
  },
  toggleFlipH: () => set((s) => ({ pasteFlipH: !s.pasteFlipH })),
  toggleFlipV: () => set((s) => ({ pasteFlipV: !s.pasteFlipV })),

  cloneDirection: 'horizontal',
  setCloneDirection: (dir) => set({ cloneDirection: dir }),

  mirrorSelectionToPaste: (axis) => {
    if (isReadOnlySide(get())) return
    const { selection } = get()
    if (!selection) return
    get().copySelection()
    if (!get().clipboard) return
    set({ pasteArmed: true, pasteFlipH: axis === 'horizontal', pasteFlipV: axis === 'vertical' })
  },

  saveAsTemplate: (name, replaceId, meta) => {
    const { patternId } = get()
    if (!patternId) return null
    flushAutosave()
    return usePatternsStore.getState().saveTemplate(patternId, name, replaceId, meta)
  },

  loadPattern: (doc) => {
    // The tray saved with the pattern, or its painted colors — never colors
    // nobody chose. See `engine/tray.ts#trayFor`.
    const slots = trayFor(doc.palette, doc.cells)
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
      staggerPhase: effectiveStaggerPhase(doc.config),
      note: doc.note ?? '',
      loop: normalizeLoop(doc.loop),
      pair: doc.pair,
      side: 'left',
      history: [],
      future: [],
      weaveResetPending: null,
      selection: null,
      clipboard: null,
      pasteArmed: false,
      pasteFlipH: false,
      pasteFlipV: false,
      moveSource: null,
      slots,
      activeSlot: slots.findIndex(Boolean),
      colorChooser: null,
      colorCard: null,
      photoPaletteOpen: false,
    })
  },

  setTool: (tool) => {
    const keep = tool === 'select' || tool === 'rectErase'
    set({ tool, selection: keep ? get().selection : null, colorSelectionMask: keep ? get().colorSelectionMask : null })
  },
  setActiveSlot: (slot) => set({ activeSlot: slot }),
  chooseColor: (hex) => {
    const next = loadColor(get().slots, hex)
    setTray(get, set, next.tray, next.active)
  },
  setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  fitZoomRequest: 0,
  requestFitZoom: () => set((st) => ({ fitZoomRequest: st.fitZoomRequest + 1 })),
  setShowFringeDivider: (show) => set({ showFringeDivider: show }),

  renamePattern: (name) => {
    set({ name })
    const id = get().patternId
    if (id) usePatternsStore.getState().renamePattern(id, name)
  },

  commit: (next) => {
    if (isReadOnlySide(get())) return
    const { cells, rows, rowShape, fringe, staggerPhase, loop, history, side } = get()
    set({ cells: next, history: [...history, { cells, rows, rowShape, fringe, staggerPhase, loop }].slice(-100), future: [] })
    if (side === 'right') set({ pair: { mode: 'independent', rightCells: next } })
    const id = get().patternId
    if (id) scheduleAutosave(id, next, side)
  },

  commitShapeChange: (next) => {
    // The right earring's shape follows the left, mirrored — it's edited there.
    if (get().side === 'right') return
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
    if (hex) get().chooseColor(hex)
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

  applyGradient: (stops, direction) => {
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
    if (targets.length === 0 || stops.length === 0) return

    const gradientColors = computeGradientCells(targets, technique, rows, stops, direction, 0.6, staggerPhase)
    get().commit({ ...cells, ...gradientColors })
  },

  strokeStart: () => set({ strokeBase: get().cells }),

  strokeCell: (row, col, hex) => {
    if (isReadOnlySide(get())) return
    const { cells, cols, rows, fringe, rowShape } = get()
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
    const { side } = get()
    if (side === 'right') set({ pair: { mode: 'independent', rightCells: cells } })
    const id = get().patternId
    if (id) scheduleAutosave(id, cells, side)
  },

  strokeCancel: () => {
    const { strokeBase } = get()
    set(strokeBase ? { cells: strokeBase, strokeBase: null } : { strokeBase: null })
  },

  // A fresh manual drag always means "the whole rect" — any color mask from
  // a previous `selectColor` no longer applies.
  setSelection: (rect) => set({ selection: rect ? normalizeRect(rect) : null, colorSelectionMask: null }),

  clearAllCells: () => {
    if (isReadOnlySide(get())) return
    get().commit({})
  },

  clearUnusedSlots: () => {
    const { cells, slots, activeSlot } = get()
    const activeHex = slots[activeSlot]
    const next = withoutUnpainted(slots, cells)
    // Emptied slots are just empty now — they can be filled again — so there's
    // no need to keep an unpainted active color around as a way back.
    setTray(get, set, next, activeAfterEmptying(next, activeHex ? slotOf(next, activeHex) : -1))
  },

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
    const { clipboard, cells, cols, rows, fringe, rowShape, moveSource } = get()
    if (!clipboard) return
    const next = { ...cells }
    // A move empties its old place, but only where the bead actually landed:
    // part of a block can fall outside a shaped body (the hollow of a rhombus,
    // past the last row), and clearing those too would quietly destroy beads
    // that never made it across.
    const landed: string[] = []
    for (const [key, hex] of Object.entries(clipboard.cells)) {
      if (!hex) continue
      const { row: rr, col: rc } = parseCellKey(key)
      const fr = opts?.flipV ? clipboard.height - 1 - rr : rr
      const fc = opts?.flipH ? clipboard.width - 1 - rc : rc
      const targetRow = row + fr
      const targetCol = col + fc
      if (!isPaintableCell(targetRow, targetCol, cols, rows, fringe, rowShape)) continue
      if (moveSource) landed.push(cellKey(moveSource.r0 + rr, moveSource.c0 + rc))
      next[cellKey(targetRow, targetCol)] = hex
    }
    // Emptied after painting, and only the cells the block left behind — a
    // block dropped overlapping itself keeps what it just put down.
    if (moveSource) {
      const painted = new Set(Object.keys(clipboard.cells).map((key) => {
        const { row: rr, col: rc } = parseCellKey(key)
        const fr = opts?.flipV ? clipboard.height - 1 - rr : rr
        const fc = opts?.flipH ? clipboard.width - 1 - rc : rc
        return cellKey(row + fr, col + fc)
      }))
      for (const key of landed) if (!painted.has(key)) delete next[key]
    }
    set({ pasteArmed: false, pasteFlipH: false, pasteFlipV: false, moveSource: null, selection: moveSource ? null : get().selection })
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
    const { history, cells, rows, rowShape, fringe, staggerPhase, loop, future, cols, pair } = get()
    if (history.length === 0) return
    const prev = history[history.length - 1]
    set({
      cells: prev.cells,
      rows: prev.rows,
      rowShape: prev.rowShape,
      fringe: prev.fringe,
      staggerPhase: prev.staggerPhase,
      loop: prev.loop,
      ...(prev.resize ? { cols: prev.resize.cols, pair: prev.resize.pair } : {}),
      history: history.slice(0, -1),
      future: [
        { cells, rows, rowShape, fringe, staggerPhase, loop, trayChange: prev.trayChange, ...(prev.resize ? { resize: { cols, pair } } : {}) },
        ...future,
      ].slice(0, 100),
    })
    if (prev.trayChange) applyTrayChange(get, set, prev.trayChange.slot, prev.trayChange.after, prev.trayChange.before)
    const id = get().patternId
    if (id && get().side === 'right') {
      // On the right earring only its colours ever change (its shape follows the left).
      set({ pair: { mode: 'independent', rightCells: prev.cells } })
      persistCells(id, prev.cells, 'right')
    } else if (id) {
      usePatternsStore
        .getState()
        .setShapeStructure(id, prev.resize ? { ...prev, cols: prev.resize.cols, pair: prev.resize.pair, hasPairChange: true } : prev)
      // Not folded into setShapeStructure (that call predates the loop and only
      // covers rows/rowShape/cells/fringe) — undoing a `setLoop` change needs its
      // own persist, same reasoning as any other field this restores.
      usePatternsStore.getState().setLoop(id, prev.loop)
    }
  },

  redo: () => {
    const { future, cells, rows, rowShape, fringe, staggerPhase, loop, history, cols, pair } = get()
    if (future.length === 0) return
    const next = future[0]
    set({
      cells: next.cells,
      rows: next.rows,
      rowShape: next.rowShape,
      fringe: next.fringe,
      staggerPhase: next.staggerPhase,
      loop: next.loop,
      ...(next.resize ? { cols: next.resize.cols, pair: next.resize.pair } : {}),
      future: future.slice(1),
      history: [
        ...history,
        { cells, rows, rowShape, fringe, staggerPhase, loop, trayChange: next.trayChange, ...(next.resize ? { resize: { cols, pair } } : {}) },
      ].slice(-100),
    })
    if (next.trayChange) applyTrayChange(get, set, next.trayChange.slot, next.trayChange.before, next.trayChange.after)
    const id = get().patternId
    if (id && get().side === 'right') {
      set({ pair: { mode: 'independent', rightCells: next.cells } })
      persistCells(id, next.cells, 'right')
    } else if (id) {
      usePatternsStore
        .getState()
        .setShapeStructure(id, next.resize ? { ...next, cols: next.resize.cols, pair: next.resize.pair, hasPairChange: true } : next)
      usePatternsStore.getState().setLoop(id, next.loop)
    }
  },
}
})
