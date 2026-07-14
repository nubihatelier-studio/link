import { create } from 'zustand'
import type { ColorMap, PatternDoc, Technique } from '@/engine/types'
import { cellKey, parseCellKey } from '@/engine/cellKey'
import { lineCells } from '@/engine/line'
import { letterForIndex, paletteFromCells } from '@/lib/palette'
import { usePatternsStore } from './patternsStore'

export type Tool = 'pencil' | 'line' | 'eraser' | 'rectErase' | 'eyedropper' | 'select'
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

  loadPattern: (doc: PatternDoc) => void
  setTool: (tool: Tool) => void
  setActiveSlot: (slot: SlotId) => void
  setSlotColor: (slot: SlotId, hex: string) => void
  setZoom: (zoom: number) => void
  renamePattern: (name: string) => void

  paintCell: (row: number, col: number, hex: string | null) => void
  paintLine: (r0: number, c0: number, r1: number, c1: number, hex: string | null) => void
  pickColor: (row: number, col: number) => void

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

export const useEditorStore = create<EditorState>()((set, get) => ({
  patternId: null,
  name: '',
  technique: 'peyote',
  cols: 20,
  rows: 20,
  beadTypeId: 'miyuki-delica-11',
  cells: {},

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

  setTool: (tool) => set({ tool, selection: tool === 'select' || tool === 'rectErase' ? get().selection : null }),
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
    const { cells, cols, rows } = get()
    if (row < 0 || col < 0 || row >= rows || col >= cols) return
    const key = cellKey(row, col)
    if (cells[key] === (hex ?? undefined)) return
    const next = { ...cells }
    if (hex) next[key] = hex
    else delete next[key]
    get().commit(next)
  },

  paintLine: (r0, c0, r1, c1, hex) => {
    const { cells, cols, rows } = get()
    const next = { ...cells }
    for (const cell of lineCells(r0, c0, r1, c1)) {
      if (cell.row < 0 || cell.col < 0 || cell.row >= rows || cell.col >= cols) continue
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

  strokeStart: () => set({ strokeBase: get().cells }),

  strokeCell: (row, col, hex) => {
    const { cells, cols, rows } = get()
    if (row < 0 || col < 0 || row >= rows || col >= cols) return
    const key = cellKey(row, col)
    if (cells[key] === (hex ?? undefined)) return
    const next = { ...cells }
    if (hex) next[key] = hex
    else delete next[key]
    set({ cells: next })
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

  setSelection: (rect) => set({ selection: rect ? normalizeRect(rect) : null }),

  eraseSelection: () => {
    const { selection, cells } = get()
    if (!selection) return
    const next = { ...cells }
    for (let r = selection.r0; r <= selection.r1; r++) {
      for (let c = selection.c0; c <= selection.c1; c++) {
        delete next[cellKey(r, c)]
      }
    }
    get().commit(next)
  },

  copySelection: () => {
    const { selection, cells } = get()
    if (!selection) return
    const width = selection.c1 - selection.c0 + 1
    const height = selection.r1 - selection.r0 + 1
    const relCells: ColorMap = {}
    for (let r = selection.r0; r <= selection.r1; r++) {
      for (let c = selection.c0; c <= selection.c1; c++) {
        const hex = cells[cellKey(r, c)]
        if (hex) relCells[cellKey(r - selection.r0, c - selection.c0)] = hex
      }
    }
    set({ clipboard: { width, height, cells: relCells } })
  },

  pasteClipboardAt: (row, col, opts) => {
    const { clipboard, cells, cols, rows } = get()
    if (!clipboard) return
    const next = { ...cells }
    for (const [key, hex] of Object.entries(clipboard.cells)) {
      if (!hex) continue
      const { row: rr, col: rc } = parseCellKey(key)
      const fr = opts?.flipV ? clipboard.height - 1 - rr : rr
      const fc = opts?.flipH ? clipboard.width - 1 - rc : rc
      const targetRow = row + fr
      const targetCol = col + fc
      if (targetRow < 0 || targetCol < 0 || targetRow >= rows || targetCol >= cols) continue
      next[cellKey(targetRow, targetCol)] = hex
    }
    set({ pasteArmed: false, pasteFlipH: false, pasteFlipV: false })
    get().commit(next)
  },

  /** Repeats the selected block `times` total (the original plus `times - 1` copies) end to end in one direction. */
  cloneSelection: (direction, times) => {
    const { selection, cells, cols, rows } = get()
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
          if (targetRow < 0 || targetCol < 0 || targetRow >= rows || targetCol >= cols) continue
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
