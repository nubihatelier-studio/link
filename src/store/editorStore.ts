import { create } from 'zustand'
import type { ColorMap, FringeData, PatternDoc, RowShape, Technique } from '@/engine/types'
import { cellKey, parseCellKey } from '@/engine/cellKey'
import { lineCells } from '@/engine/line'
import { floodFillCells } from '@/engine/floodFill'
import { createEmptyFringe, isPaintableCell, normalizeFringe } from '@/engine/fringe'
import { createRectangleRowShape, normalizeRowShape } from '@/engine/shape'
import { mirroredCell, reflectRegion, type MirrorMode } from '@/engine/mirror'
import { letterForIndex, paletteFromCells, replaceColorInCells, selectionForColor, swapColorsInCells } from '@/lib/palette'
import { usePatternsStore } from './patternsStore'

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

interface EditorState {
  patternId: string | null
  name: string
  technique: Technique
  cols: number
  rows: number
  beadTypeId: string
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

  /** Free-text note, shown on the PDF's ficha page — see `engine/types.ts#PatternDoc.note`. */
  note: string
  setNote: (note: string) => void

  history: ColorMap[]
  future: ColorMap[]

  tool: Tool
  slots: string[]
  activeSlot: SlotId
  addSlot: (hex?: string) => void
  /**
   * Stable hex → letter (A, B, C…) map, assigned the first time a color is
   * ever introduced (a default slot, a loaded pattern's existing cells, or
   * a color picked into a slot) and never reassigned afterwards. Shown
   * consistently on slot buttons, canvas cells, and the palette list, so
   * adding a new slot can never change a letter already in use anywhere —
   * and the palette list is where you can see exactly which colors already
   * hold the letters a new slot's jumps past.
   */
  colorLetters: Record<string, string>
  registerColor: (hex: string) => void

  zoom: number
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
  cells: {},

  fringe: createEmptyFringe(20),
  rowShape: createRectangleRowShape(20, 20),
  setFringeLength: (col, rawLength) => {
    const { fringe, rows: bodyRows, cells } = get()
    const oldLength = fringe.lengths[col] ?? 0
    const length = Math.max(0, Math.min(60, Math.round(rawLength)))
    if (length === oldLength) return

    const nextLengths = [...fringe.lengths]
    nextLengths[col] = length
    const nextTurnBeads = [...fringe.turnBeads]
    if (length === 0) nextTurnBeads[col] = false
    const nextFringe: FringeData = { lengths: nextLengths, turnBeads: nextTurnBeads }
    set({ fringe: nextFringe })

    // Shrinking drops any painted color beyond the new, shorter length —
    // those cells no longer exist. This goes through `commit` (undoable),
    // unlike the length change itself.
    if (length < oldLength) {
      const next = { ...cells }
      let changed = false
      for (let d = length; d < oldLength; d++) {
        const key = cellKey(bodyRows + d, col)
        if (key in next) {
          delete next[key]
          changed = true
        }
      }
      if (changed) get().commit(next)
    }

    const id = get().patternId
    if (id) usePatternsStore.getState().setFringe(id, nextFringe)
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

  growRowEdge: (row, edge) => {
    const { rowShape, cols } = get()
    const shape = rowShape[row]
    if (!shape) return
    const next = edge === 'left' ? { offset: shape.offset - 1, length: shape.length + 1 } : { offset: shape.offset, length: shape.length + 1 }
    if (next.offset < 0 || next.offset + next.length > cols) return // already at the grid's own edge
    const nextRowShape = [...rowShape]
    nextRowShape[row] = next
    set({ rowShape: nextRowShape })
    const id = get().patternId
    if (id) usePatternsStore.getState().setRowShape(id, nextRowShape)
  },

  shrinkRowEdge: (row, edge) => {
    const { rowShape, cells } = get()
    const shape = rowShape[row]
    if (!shape || shape.length <= 1) return // a row always keeps at least 1 bead
    const droppedCol = edge === 'left' ? shape.offset : shape.offset + shape.length - 1
    const next = edge === 'left' ? { offset: shape.offset + 1, length: shape.length - 1 } : { offset: shape.offset, length: shape.length - 1 }
    const nextRowShape = [...rowShape]
    nextRowShape[row] = next
    set({ rowShape: nextRowShape })

    // Shrinking drops any painted color in the bead that just fell outside the row's new span —
    // it no longer exists. Goes through commit() (undoable), unlike the shape edit itself.
    const key = cellKey(row, droppedCol)
    if (key in cells) {
      const nextCells = { ...cells }
      delete nextCells[key]
      get().commit(nextCells)
    }

    const id = get().patternId
    if (id) usePatternsStore.getState().setRowShape(id, nextRowShape)
  },

  note: '',
  setNote: (note) => {
    set({ note })
    const id = get().patternId
    if (id) scheduleNoteAutosave(id, note)
  },

  history: [],
  future: [],

  tool: 'pencil',
  slots: ['#1c1c1e', '#c9a227', '#8da2b0', '#ffffff'],
  activeSlot: 0,
  addSlot: (hex) => {
    const newHex = hex ?? NEUTRAL_SLOT_DEFAULTS[get().slots.length % NEUTRAL_SLOT_DEFAULTS.length]
    set((s) => ({ slots: [...s.slots, newHex], activeSlot: s.slots.length }))
    get().registerColor(newHex)
  },

  colorLetters: {},
  registerColor: (hex) => {
    if (!hex || get().colorLetters[hex]) return
    set((s) => ({ colorLetters: { ...s.colorLetters, [hex]: letterForIndex(Object.keys(s.colorLetters).length) } }))
  },

  zoom: 100,
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
      note: doc.note ?? '',
      history: [],
      future: [],
      selection: null,
      clipboard: null,
      pasteArmed: false,
      pasteFlipH: false,
      pasteFlipV: false,
      slots,
      activeSlot: 0,
      colorLetters: {},
    })
    for (const hex of slots) get().registerColor(hex)
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
    get().registerColor(hex)
  },
  setZoom: (zoom) => set({ zoom: Math.max(25, Math.min(400, zoom)) }),

  renamePattern: (name) => {
    set({ name })
    const id = get().patternId
    if (id) usePatternsStore.getState().renamePattern(id, name)
  },

  commit: (next) => {
    const { cells, history } = get()
    set({ cells: next, history: [...history, cells].slice(-100), future: [] })
    const id = get().patternId
    if (id) scheduleAutosave(id, next)
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
      get().registerColor(hex)
    }
  },

  mergeColors: (fromHex, toHex) => {
    get().registerColor(toHex)
    get().commit(replaceColorInCells(get().cells, fromHex, toHex))
  },

  swapColors: (hexA, hexB) => {
    get().commit(swapColorsInCells(get().cells, hexA, hexB))
  },

  floodFill: (row, col, hex) => {
    const { cells, cols, rows, fringe, rowShape } = get()
    if (hex) get().registerColor(hex)
    get().commit(floodFillCells(cells, cols, rows, row, col, hex, fringe, rowShape))
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
    const { strokeBase, cells, history } = get()
    if (!strokeBase || strokeBase === cells) {
      set({ strokeBase: null })
      return
    }
    set({ history: [...history, strokeBase].slice(-100), future: [], strokeBase: null })
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
    const { history, cells, future } = get()
    if (history.length === 0) return
    const prev = history[history.length - 1]
    set({ cells: prev, history: history.slice(0, -1), future: [cells, ...future].slice(0, 100) })
    const id = get().patternId
    if (id) scheduleAutosave(id, prev)
  },

  redo: () => {
    const { future, cells, history } = get()
    if (future.length === 0) return
    const next = future[0]
    set({ cells: next, future: future.slice(1), history: [...history, cells].slice(-100) })
    const id = get().patternId
    if (id) scheduleAutosave(id, next)
  },
}))
