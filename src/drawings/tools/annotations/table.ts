/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'
import type { Chart } from '../../../Chart'
import { isNumber, isString, isValid } from '../../../common/utils/typeChecks'
import type Coordinate from '../../../common/Coordinate'
import { createDom } from '../../../common/utils/dom'

import { createAnchorFigures } from '../../interaction/anchors'
import type { RichTextAttrs } from '../../figures/richText'
import type { TextBoxData, TextBoxHorzAlign } from '../../text/textBox'
import { openOverlayTextEditor } from '../../editor/overlayTextEditor'
import type { TextEditorSession } from '../../editor/textEditor'
import { getPaneDomLayer } from '../../dom/domLayer'

import {
  annotationChartOf,
  baseTextBoxData,
  liveTextOf,
  paneIsDark,
  pointToCoordinate,
  rememberAnnotationContext,
  resolvedTextStyles,
  type AnnotationTextStyle
} from './common'

/**
 * 'table' — TradingView LineToolTable (module 995743). A grid of
 * individually editable cells anchored at its top-left corner: click a
 * cell to select it, double-click (or place) to open the in-place editor
 * for that cell, Tab / Shift-Tab cycle through cells, drag the internal
 * grid edges to resize a row/column, drag a corner to resize the table,
 * and right-click a cell for insert/remove row/column actions.
 *
 * Storage (extendData, additive): `rows`, `cols`, flat row-major `cells`,
 * `tableWidth`, `tableHeight` (kept truthful as ΣcolWidths/ΣrowHeights),
 * plus optional `colWidths`/`rowHeights` arrays once resized. A legacy
 * string payload still renders empty cells instead of crashing.
 */

export interface TableExtendData {
  /** Grid dimensions. */
  rows?: number
  cols?: number
  /** Flat row-major cell texts (length rows*cols; missing = ''). */
  cells?: string[]
  /** Outer size in px — kept in sync with the explicit arrays. */
  tableWidth?: number
  tableHeight?: number
  /** Per-column px widths — additive; absent = uniform split. */
  colWidths?: number[]
  /** Per-row px heights — additive; absent = uniform split. */
  rowHeights?: number[]
}

export interface TableStyle extends AnnotationTextStyle {
  /** Cell background — whole-table fill (default '#FFFFFF'). */
  backgroundColor?: string
  /** Grid line + outer border color (default '#787B86'). */
  borderColor?: string
  /** Paint the background fill (default true). */
  backgroundEnabled?: boolean
  /** Paint grid lines + outer border (default true). */
  borderEnabled?: boolean
  /** Cell text alignment (default 'center'). */
  textAlign?: 'left' | 'center' | 'right'
  /** Inner cell padding px (default 4). */
  cellPadding?: number
  /** Active-cell highlight color (default TradingView blue). */
  activeCellColor?: string
}

const STYLE_KEY = 'table'
const DEFAULT_ROWS = 3
const DEFAULT_COLS = 3
const DEFAULT_TABLE_WIDTH = 300
const DEFAULT_TABLE_HEIGHT = 120
const DEFAULT_CELL_PADDING = 4
const MIN_CELL_SIZE = 20
const EDGE_HANDLE_THICKNESS = 8
const CORNER_HANDLE_SIZE = 12

// ── Session state (not persisted) ────────────────────────────────────

/** Index (r*cols+c) of the selected cell — drives the highlight figure. */
const activeCells = new WeakMap<Overlay, number>()
/** Index of the cell whose editor is live — routes liveText to it. */
const editingCells = new WeakMap<Overlay, number>()
/** Press-start snapshot for resize drags (figureKey-routed). */
interface TableDragState {
  px: Coordinate
  colWidths: number[]
  rowHeights: number[]
}
const tableDragStates = new WeakMap<Overlay, TableDragState>()

interface TableGrid {
  rows: number
  cols: number
  cells: string[]
  colWidths: number[]
  rowHeights: number[]
  width: number
  height: number
}

function getTableStyles (overlay: Overlay<TableExtendData>): TableStyle {
  return resolvedTextStyles(overlay, STYLE_KEY) as TableStyle
}

function getExtendData (overlay: Overlay<TableExtendData>): TableExtendData {
  const extendData = overlay.extendData as TableExtendData | string | undefined
  // Legacy string payloads can't express a grid — start empty instead.
  if (isString(extendData) || extendData === undefined) {
    return {}
  }
  return extendData
}

/**
 * Resolved grid: uniform column widths / row heights unless the additive
 * `colWidths`/`rowHeights` arrays exist (any resize materializes them).
 */
function getGrid (overlay: Overlay<TableExtendData>): TableGrid {
  const extendData = getExtendData(overlay)
  const rows = Math.max(1, extendData.rows ?? DEFAULT_ROWS)
  const cols = Math.max(1, extendData.cols ?? DEFAULT_COLS)
  const editing = editingCells.get(overlay)
  const live = liveTextOf(overlay)
  const cells: string[] = []
  for (let i = 0; i < rows * cols; i++) {
    cells.push(editing === i && live !== undefined ? live : extendData.cells?.[i] ?? '')
  }
  const width = extendData.tableWidth ?? DEFAULT_TABLE_WIDTH
  const height = extendData.tableHeight ?? DEFAULT_TABLE_HEIGHT
  const colWidths = extendData.colWidths?.length === cols
    ? [...extendData.colWidths]
    : new Array<number>(cols).fill(width / cols)
  const rowHeights = extendData.rowHeights?.length === rows
    ? [...extendData.rowHeights]
    : new Array<number>(rows).fill(height / rows)
  return {
    rows,
    cols,
    cells,
    colWidths,
    rowHeights,
    width: colWidths.reduce((a, b) => a + b, 0),
    height: rowHeights.reduce((a, b) => a + b, 0)
  }
}

/** Pixel-space offsets — cumulative sizes, one entry per gridline. */
function offsetsOf (sizes: number[]): number[] {
  const offsets = [0]
  for (const s of sizes) {
    offsets.push(offsets[offsets.length - 1] + s)
  }
  return offsets
}

function cellRect (origin: Coordinate, grid: TableGrid, r: number, c: number): { x: number, y: number, width: number, height: number } {
  const xs = offsetsOf(grid.colWidths)
  const ys = offsetsOf(grid.rowHeights)
  return {
    x: origin.x + xs[c],
    y: origin.y + ys[r],
    width: grid.colWidths[c],
    height: grid.rowHeights[r]
  }
}

/** Parse `cell_r_c` / `celltext_r_c` figure keys back to a flat index. */
function cellIndexFromKey (key: string | undefined, cols: number): number | null {
  if (key === undefined) {
    return null
  }
  const match = /^cell(?:text)?_(\d+)_(\d+)$/.exec(key)
  if (match === null) {
    return null
  }
  return Number(match[1]) * cols + Number(match[2])
}

/** Hit-test which cell a pane px point falls into (context menu, clicks). */
function cellIndexAt (origin: Coordinate, grid: TableGrid, px: Coordinate): number | null {
  if (px.x < origin.x || px.y < origin.y || px.x > origin.x + grid.width || px.y > origin.y + grid.height) {
    return null
  }
  const xs = offsetsOf(grid.colWidths)
  const ys = offsetsOf(grid.rowHeights)
  let c = grid.cols - 1
  let r = grid.rows - 1
  for (let i = 0; i < grid.cols; i++) {
    if (px.x <= origin.x + xs[i + 1]) {
      c = i
      break
    }
  }
  for (let i = 0; i < grid.rows; i++) {
    if (px.y <= origin.y + ys[i + 1]) {
      r = i
      break
    }
  }
  return r * grid.cols + c
}

/** Write cells/geometry through override so sync + undo see the change. */
function applyGrid (chart: Chart, overlay: Overlay<TableExtendData>, patch: Partial<TableExtendData>): void {
  chart.overrideOverlay({
    id: overlay.id,
    paneId: overlay.paneId,
    extendData: { ...getExtendData(overlay), ...patch }
  })
}

/** In-place drag write — bypasses override() replay; the gesture owns it. */
function patchExtendData (overlay: Overlay<TableExtendData>, patch: Partial<TableExtendData>): void {
  overlay.extendData = { ...getExtendData(overlay), ...patch }
}

// ── Cell structure operations (context menu) ─────────────────────────

function insertRowAt (grid: TableGrid, r: number): Partial<TableExtendData> {
  const cells = [...grid.cells]
  cells.splice(r * grid.cols, 0, ...new Array<string>(grid.cols).fill(''))
  const rowHeights = [...grid.rowHeights]
  rowHeights.splice(r, 0, rowHeights[Math.max(0, r - 1)] ?? grid.height / grid.rows)
  return { rows: grid.rows + 1, cells, rowHeights, tableHeight: rowHeights.reduce((a, b) => a + b, 0) }
}

function removeRowAt (grid: TableGrid, r: number): Partial<TableExtendData> | null {
  if (grid.rows <= 1) {
    return null
  }
  const cells = [...grid.cells]
  cells.splice(r * grid.cols, grid.cols)
  const rowHeights = [...grid.rowHeights]
  rowHeights.splice(r, 1)
  return { rows: grid.rows - 1, cells, rowHeights, tableHeight: rowHeights.reduce((a, b) => a + b, 0) }
}

function insertColAt (grid: TableGrid, c: number): Partial<TableExtendData> {
  const cells: string[] = []
  for (let r = 0; r < grid.rows; r++) {
    cells.push(...grid.cells.slice(r * grid.cols, r * grid.cols + c), '', ...grid.cells.slice(r * grid.cols + c, (r + 1) * grid.cols))
  }
  const colWidths = [...grid.colWidths]
  colWidths.splice(c, 0, colWidths[Math.max(0, c - 1)] ?? grid.width / grid.cols)
  return { cols: grid.cols + 1, cells, colWidths, tableWidth: colWidths.reduce((a, b) => a + b, 0) }
}

function removeColAt (grid: TableGrid, c: number): Partial<TableExtendData> | null {
  if (grid.cols <= 1) {
    return null
  }
  const cells: string[] = []
  for (let r = 0; r < grid.rows; r++) {
    cells.push(...grid.cells.slice(r * grid.cols, r * grid.cols + c), ...grid.cells.slice(r * grid.cols + c + 1, (r + 1) * grid.cols))
  }
  const colWidths = [...grid.colWidths]
  colWidths.splice(c, 1)
  return { cols: grid.cols - 1, cells, colWidths, tableWidth: colWidths.reduce((a, b) => a + b, 0) }
}

// ── Per-cell editing ─────────────────────────────────────────────────

/** Editor box for one cell — wraps + clips inside the cell rect. */
function cellEditorData (overlay: Overlay<TableExtendData>, grid: TableGrid, index: number): TextBoxData {
  const styles = getTableStyles(overlay)
  const cellPadding = styles.cellPadding ?? DEFAULT_CELL_PADDING
  const textAlign: TextBoxHorzAlign = styles.textAlign ?? 'center'
  const rect = cellRect({ x: 0, y: 0 }, grid, Math.floor(index / grid.cols), index % grid.cols)
  return {
    ...baseTextBoxData(grid.cells[index], styles),
    wordWrapWidth: Math.max(1, rect.width - 2 * cellPadding),
    boxWidth: rect.width,
    boxHeight: rect.height,
    boxPaddingHorz: cellPadding,
    boxPaddingVert: cellPadding,
    horzAlign: 'left',
    vertAlign: 'middle',
    horzTextAlign: textAlign
  }
}

function writeCell (chart: Chart, overlay: Overlay<TableExtendData>, index: number, value: string): void {
  const grid = getGrid(overlay)
  const cells = [...grid.cells]
  cells[index] = value
  if (cells.every(c => c === '')) {
    // Fully-empty content removes the overlay (previous behavior kept).
    chart.removeOverlay({ id: overlay.id, paneId: overlay.paneId })
    return
  }
  applyGrid(chart, overlay, { cells })
}

/**
 * Open the shared invisible-textarea editor bound to a single cell. Tab /
 * Shift-Tab hop to the next/previous cell (TradingView switchActiveCell):
 * the textarea ships no Tab-move hook, so a capture-phase listener on it
 * commits the session and re-opens the neighbor.
 */
function openCellEditor (chart: Chart, overlay: Overlay<TableExtendData>, index: number): void {
  if (overlay.ghost || overlay.synced || overlay.lock) {
    return
  }
  const grid = getGrid(overlay)
  if (index < 0 || index >= grid.cells.length) {
    index = 0
  }
  const cellIndex = index
  activeCells.set(overlay, cellIndex)
  overlay.invalidateFigures()
  const session: TextEditorSession = openOverlayTextEditor({
    chart,
    overlay,
    data: () => cellEditorData(overlay, getGrid(overlay), cellIndex),
    anchor: () => {
      const origin = pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {})
      const live = getGrid(overlay)
      const rect = cellRect(origin, live, Math.floor(cellIndex / live.cols), cellIndex % live.cols)
      return { x: rect.x, y: rect.y + rect.height / 2 }
    },
    forbidLineBreaks: true,
    onCommit: (value) => {
      editingCells.delete(overlay)
      writeCell(chart, overlay, cellIndex, value)
    },
    onEmpty: () => {
      editingCells.delete(overlay)
      writeCell(chart, overlay, cellIndex, '')
    }
  })
  editingCells.set(overlay, cellIndex)

  // The just-opened wrapper is the last text-editor child of this pane's
  // DOM layer — attach Tab navigation directly to its textarea.
  const layer = getPaneDomLayer(chart, overlay.paneId)
  const editors = layer?.getElement().querySelectorAll('[data-name="text-editor"] textarea')
  const textarea = editors?.[editors.length - 1]
  textarea?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.isComposing) {
      return
    }
    e.preventDefault()
    const total = getGrid(overlay).cells.length
    const next = (cellIndex + (e.shiftKey ? -1 : 1) + total) % total
    // close() commits the live value synchronously; reopen on the target.
    session.close('hotkey')
    if (chart.getOverlayById(overlay.id) !== null) {
      openCellEditor(chart, overlay, next)
    }
  })
}

// ── Context menu (TradingView `additionalActions`) ───────────────────

const MENU_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  minWidth: '160px',
  padding: '4px 0',
  borderRadius: '6px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  fontSize: '12px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
  userSelect: 'none'
}

function openTableMenu (chart: Chart, overlay: Overlay<TableExtendData>, px: Coordinate, cellIndex: number): void {
  const layer = getPaneDomLayer(chart, overlay.paneId)
  if (layer === null) {
    return
  }
  const grid = getGrid(overlay)
  const row = Math.floor(cellIndex / grid.cols)
  const col = cellIndex % grid.cols
  const dark = paneIsDark(chart)

  const menu = createDom('div', {
    ...MENU_STYLE,
    left: `${Math.round(px.x)}px`,
    top: `${Math.round(px.y)}px`,
    background: dark ? '#1e222d' : '#ffffff',
    border: `1px solid ${dark ? '#363c4e' : '#e0e3eb'}`,
    color: dark ? '#d1d4dc' : '#131722'
  })

  const items: Array<{ label: string, run: () => void }> = [
    { label: 'Insert row above', run: () => { applyGrid(chart, overlay, insertRowAt(getGrid(overlay), row)) } },
    { label: 'Insert row below', run: () => { applyGrid(chart, overlay, insertRowAt(getGrid(overlay), row + 1)) } },
    { label: 'Insert column left', run: () => { applyGrid(chart, overlay, insertColAt(getGrid(overlay), col)) } },
    { label: 'Insert column right', run: () => { applyGrid(chart, overlay, insertColAt(getGrid(overlay), col + 1)) } },
    {
      label: 'Remove row',
      run: () => {
        const patch = removeRowAt(getGrid(overlay), row)
        if (patch === null) {
          chart.removeOverlay({ id: overlay.id, paneId: overlay.paneId })
        } else {
          applyGrid(chart, overlay, patch)
        }
      }
    },
    {
      label: 'Remove column',
      run: () => {
        const patch = removeColAt(getGrid(overlay), col)
        if (patch === null) {
          chart.removeOverlay({ id: overlay.id, paneId: overlay.paneId })
        } else {
          applyGrid(chart, overlay, patch)
        }
      }
    },
    { label: 'Remove table', run: () => chart.removeOverlay({ id: overlay.id, paneId: overlay.paneId }) }
  ]

  const unmounts: Array<() => void> = []
  const close = (): void => {
    unmounts.forEach(u => { u() })
    unmounts.length = 0
  }
  for (const item of items) {
    const entry = createDom('div', { padding: '6px 14px', cursor: 'default', whiteSpace: 'nowrap' })
    entry.textContent = item.label
    entry.addEventListener('mouseenter', () => {
      entry.style.background = dark ? '#2a2e39' : '#f0f3fa'
    })
    entry.addEventListener('mouseleave', () => {
      entry.style.background = ''
    })
    entry.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
    })
    entry.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      close()
      item.run()
    })
    menu.appendChild(entry)
  }
  unmounts.push(layer.mount(menu, { interactive: true, zIndex: 10 }))

  // Outside press / Escape closes — listen once, self-remove.
  const onDocDown = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) {
      close()
    }
  }
  const onDocKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close()
    }
  }
  document.addEventListener('mousedown', onDocDown)
  document.addEventListener('keydown', onDocKey)
  unmounts.push(() => {
    document.removeEventListener('mousedown', onDocDown)
    document.removeEventListener('keydown', onDocKey)
  })
}

// ── Resize routing keys ──────────────────────────────────────────────

const CORNER_KEYS = new Set(['resize_tl', 'resize_tr', 'resize_br', 'resize_bl'])

function isResizeKey (key: string | undefined): key is string {
  if (key === undefined) {
    return false
  }
  return CORNER_KEYS.has(key) || /^rowEdge_\d+$/.test(key) || /^colEdge_\d+$/.test(key)
}

const table: OverlayTemplate<TableExtendData> = {
  name: 'table',
  totalStep: 2,
  // Cell texts, edges and handles escape the anchor hull; fixed-size box.
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    table: {
      color: '#131722',
      backgroundColor: '#FFFFFF',
      borderColor: '#787B86',
      backgroundEnabled: true,
      borderEnabled: true,
      fontSize: 12,
      textAlign: 'center',
      cellPadding: DEFAULT_CELL_PADDING,
      activeCellColor: '#2962FF'
    }
  },
  createPointFigures: ({ overlay, coordinates, bounding, chart, isSelected, isHovered, isTouch }) => {
    rememberAnnotationContext(overlay, chart, bounding)
    if (coordinates.length === 0) {
      return []
    }
    const point = coordinates[0]
    const styles = getTableStyles(overlay)
    const grid = getGrid(overlay)
    const cellPadding = styles.cellPadding ?? DEFAULT_CELL_PADDING
    const backgroundEnabled = styles.backgroundEnabled ?? true
    const borderEnabled = styles.borderEnabled ?? true
    const borderColor = styles.borderColor
    const textAlign: TextBoxHorzAlign = styles.textAlign ?? 'center'
    const xs = offsetsOf(grid.colWidths)
    const ys = offsetsOf(grid.rowHeights)

    const figures: OverlayFigure[] = []

    if (backgroundEnabled) {
      figures.push({
        key: 'background',
        type: 'rect',
        attrs: { x: point.x, y: point.y, width: grid.width, height: grid.height },
        styles: { style: 'fill', color: styles.backgroundColor },
        ignoreEvent: true
      })
    }

    // Outer border + whole-grid hit body for dragging — pushed BEFORE the
    // cell rects so per-cell hover/click targets win (dispatch walks
    // last-registered first).
    figures.push({
      key: 'frame',
      type: 'rect',
      attrs: { x: point.x, y: point.y, width: grid.width, height: grid.height },
      styles: {
        style: 'stroke',
        color: 'transparent',
        borderColor: borderEnabled ? borderColor : 'transparent',
        borderSize: borderEnabled ? 1 : 0
      },
      bounds: { x: point.x, y: point.y, width: grid.width, height: grid.height }
    })

    // Per-cell hit targets — every cell clickable, text or not. Later in
    // the array than 'frame' → they win hover (text cursor) and clicks.
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const rect = cellRect(point, grid, r, c)
        figures.push({
          key: `cell_${r}_${c}`,
          type: 'rect',
          attrs: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          styles: { style: 'fill', color: 'transparent' },
          cursor: 'text',
          bounds: rect
        })
      }
    }

    // Cell texts — wrap inside the cell, clip to its height (TV cells clip
    // overflow; maxHeight trims wrapped lines to the cell).
    const cellData: TextBoxData = {
      ...baseTextBoxData('', styles),
      vertAlign: 'middle',
      horzTextAlign: textAlign
    }
    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const content = grid.cells[r * grid.cols + c]
        if (content === '') {
          continue
        }
        const rect = cellRect(point, grid, r, c)
        let anchorX = rect.x + rect.width / 2
        let horzAlign: TextBoxHorzAlign = 'center'
        if (textAlign === 'left') {
          anchorX = rect.x + cellPadding
          horzAlign = 'left'
        } else if (textAlign === 'right') {
          anchorX = rect.x + rect.width - cellPadding
          horzAlign = 'right'
        }
        const attrs: RichTextAttrs = {
          x: anchorX,
          y: rect.y + rect.height / 2,
          ...cellData,
          text: content,
          horzAlign,
          wordWrapWidth: Math.max(1, rect.width - 2 * cellPadding),
          maxHeight: Math.max(1, rect.height - 2 * cellPadding)
        }
        figures.push({
          key: `celltext_${r}_${c}`,
          type: 'richText',
          attrs,
          styles: { color: styles.color },
          cursor: 'text',
          ignoreEvent: true
        })
      }
    }

    // Grid lines — cumulative offsets, rows+1 horizontal, cols+1 vertical.
    if (borderEnabled) {
      for (let r = 0; r <= grid.rows; r++) {
        const y = point.y + ys[r]
        figures.push({
          key: `gridH_${r}`,
          type: 'line',
          attrs: {
            coordinates: [
              { x: point.x, y },
              { x: point.x + grid.width, y }
            ]
          },
          styles: { color: borderColor, size: 1 },
          ignoreEvent: true
        })
      }
      for (let c = 0; c <= grid.cols; c++) {
        const x = point.x + xs[c]
        figures.push({
          key: `gridV_${c}`,
          type: 'line',
          attrs: {
            coordinates: [
              { x, y: point.y },
              { x, y: point.y + grid.height }
            ]
          },
          styles: { color: borderColor, size: 1 },
          ignoreEvent: true
        })
      }
    }

    // Selected-cell highlight — TradingView marks the active cell.
    const activeIndex = activeCells.get(overlay)
    if ((isSelected === true || isHovered === true) && isNumber(activeIndex) && activeIndex < grid.cells.length) {
      const rect = cellRect(point, grid, Math.floor(activeIndex / grid.cols), activeIndex % grid.cols)
      figures.push({
        key: 'cellSel',
        type: 'rect',
        attrs: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: {
          style: 'stroke_fill',
          color: `${styles.activeCellColor ?? '#2962FF'}33`,
          borderColor: styles.activeCellColor ?? '#2962FF',
          borderSize: 1.5
        },
        ignoreEvent: true
      })
    }

    // Row/column resize strips on the internal gridlines (selected only —
    // TradingView surfaces them through its active-edge hit zones).
    if (isSelected === true && !overlay.lock && !overlay.isDrawing()) {
      const half = EDGE_HANDLE_THICKNESS / 2
      for (let r = 1; r < grid.rows; r++) {
        const y = point.y + ys[r]
        figures.push({
          key: `rowEdge_${r}`,
          type: 'rect',
          attrs: { x: point.x, y: y - half, width: grid.width, height: EDGE_HANDLE_THICKNESS },
          styles: { style: 'fill', color: 'transparent' },
          cursor: 'ns-resize'
        })
      }
      for (let c = 1; c < grid.cols; c++) {
        const x = point.x + xs[c]
        figures.push({
          key: `colEdge_${c}`,
          type: 'rect',
          attrs: { x: x - half, y: point.y, width: EDGE_HANDLE_THICKNESS, height: grid.height },
          styles: { style: 'fill', color: 'transparent' },
          cursor: 'ew-resize'
        })
      }
      // Corner resize handles — TV's four corner anchors. These are
      // non-point figures: drags reach performEventBodyMove keyed by
      // `figureKey` and resize instead of translating.
      const cs = CORNER_HANDLE_SIZE
      const corners: Array<{ key: string, x: number, y: number, cursor: string }> = [
        { key: 'resize_tl', x: point.x, y: point.y, cursor: 'nwse-resize' },
        { key: 'resize_tr', x: point.x + grid.width, y: point.y, cursor: 'nesw-resize' },
        { key: 'resize_br', x: point.x + grid.width, y: point.y + grid.height, cursor: 'nwse-resize' },
        { key: 'resize_bl', x: point.x, y: point.y + grid.height, cursor: 'nesw-resize' }
      ]
      for (const corner of corners) {
        figures.push({
          key: corner.key,
          type: 'rect',
          attrs: { x: corner.x - cs / 2, y: corner.y - cs / 2, width: cs, height: cs },
          styles: {
            style: 'stroke_fill',
            color: '#ffffff',
            borderColor: '#1592E6',
            borderSize: 1.5
          },
          cursor: corner.cursor
        })
      }
    }

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isTouch,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_'
    }))
    return figures
  },
  onPressedMoveStart: ({ overlay, figure, x, y }) => {
    const key = figure?.key
    if (isResizeKey(key)) {
      const grid = getGrid(overlay)
      tableDragStates.set(overlay, {
        px: { x: x ?? 0, y: y ?? 0 },
        colWidths: [...grid.colWidths],
        rowHeights: [...grid.rowHeights]
      })
    }
  },
  // `this` is the overlay — the perform params carry none.
  performEventBodyMove: function (this: Overlay<TableExtendData>, params) {
    const key = params.figureKey
    const event = params.event
    const state = tableDragStates.get(this)
    if (!isResizeKey(key) || event === undefined || state === undefined) {
      return
    }
    const chart = annotationChartOf(this)
    if (chart === undefined || !isNumber(event.x) || !isNumber(event.y)) {
      return
    }
    const dx = event.x - state.px.x
    const dy = event.y - state.px.y
    const prev = params.prevPoints[0] ?? {}

    // Row/column edge drags resize ONE band — the kernel's translate is
    // reverted and the delta lands on the adjacent row/column.
    const rowEdge = /^rowEdge_(\d+)$/.exec(key)
    if (rowEdge !== null) {
      const i = Number(rowEdge[1])
      this.points = params.prevPoints.map(p => ({ ...p }))
      const rowHeights = [...state.rowHeights]
      rowHeights[i - 1] = Math.max(MIN_CELL_SIZE, rowHeights[i - 1] + dy)
      patchExtendData(this, { rowHeights, tableHeight: rowHeights.reduce((a, b) => a + b, 0) })
      return
    }
    const colEdge = /^colEdge_(\d+)$/.exec(key)
    if (colEdge !== null) {
      const j = Number(colEdge[1])
      this.points = params.prevPoints.map(p => ({ ...p }))
      const colWidths = [...state.colWidths]
      colWidths[j - 1] = Math.max(MIN_CELL_SIZE, colWidths[j - 1] + dx)
      patchExtendData(this, { colWidths, tableWidth: colWidths.reduce((a, b) => a + b, 0) })
      return
    }

    // Corner drags resize the whole table; the top-left anchor moves with
    // the cursor for the TL/TR/BL corners (opposite corner stays put).
    const grid = getGrid(this)
    const w0 = state.colWidths.reduce((a, b) => a + b, 0)
    const h0 = state.rowHeights.reduce((a, b) => a + b, 0)
    const minW = grid.cols * MIN_CELL_SIZE
    const minH = grid.rows * MIN_CELL_SIZE
    let effDx = dx
    let effDy = dy
    switch (key) {
      case 'resize_tl':
        effDx = Math.min(dx, w0 - minW)
        effDy = Math.min(dy, h0 - minH)
        break
      case 'resize_tr':
        effDx = Math.max(dx, minW - w0)
        effDy = Math.min(dy, h0 - minH)
        break
      case 'resize_br':
        effDx = Math.max(dx, minW - w0)
        effDy = Math.max(dy, minH - h0)
        break
      case 'resize_bl':
        effDx = Math.min(dx, w0 - minW)
        effDy = Math.max(dy, minH - h0)
        break
      default:
        break
    }
    const newW = key === 'resize_tl' || key === 'resize_bl' ? w0 - effDx : w0 + effDx
    const newH = key === 'resize_tl' || key === 'resize_tr' ? h0 - effDy : h0 + effDy

    // Restore the kernel-translated points, then re-apply only the axes a
    // given corner owns (TL both, TR y-only, BL x-only, BR none) — pixel
    // space → data point so log/percent scales stay exact.
    this.points = params.prevPoints.map(p => ({ ...p }))
    const prevPx = pointToCoordinate(chart, this.paneId, prev)
    const moveX = key === 'resize_tl' || key === 'resize_bl' ? effDx : 0
    const moveY = key === 'resize_tl' || key === 'resize_tr' ? effDy : 0
    if (moveX !== 0 || moveY !== 0) {
      const converted = chart.convertFromPixel([{ x: prevPx.x + moveX, y: prevPx.y + moveY }], { paneId: this.paneId })
      const point = Array.isArray(converted) ? converted[0] : converted
      const target = this.points[0]
      if (isValid(point) && isValid(target)) {
        if (isNumber(point.timestamp)) target.timestamp = point.timestamp
        if (isNumber(point.dataIndex)) target.dataIndex = point.dataIndex
        if (isNumber(point.value)) target.value = point.value
      }
    }

    // Explicit bands scale proportionally on a corner resize (TV parity);
    // a uniform table just stores the new outer size.
    if (getExtendData(this).colWidths !== undefined || getExtendData(this).rowHeights !== undefined) {
      const colWidths = state.colWidths.map(w => Math.max(MIN_CELL_SIZE, w * (newW / w0)))
      const rowHeights = state.rowHeights.map(h => Math.max(MIN_CELL_SIZE, h * (newH / h0)))
      patchExtendData(this, {
        colWidths,
        rowHeights,
        tableWidth: colWidths.reduce((a, b) => a + b, 0),
        tableHeight: rowHeights.reduce((a, b) => a + b, 0)
      })
    } else {
      patchExtendData(this, { tableWidth: newW, tableHeight: newH })
    }
  },
  onClick: ({ overlay, chart, figure, x, y }) => {
    const grid = getGrid(overlay)
    let index = cellIndexFromKey(figure?.key, grid.cols)
    if (index === null && isNumber(x) && isNumber(y)) {
      index = cellIndexAt(pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {}), grid, { x, y })
    }
    if (index === null) {
      return
    }
    if (activeCells.get(overlay) === index) {
      // Second click on the active cell edits it (TradingView).
      openCellEditor(chart, overlay, index)
      return
    }
    activeCells.set(overlay, index)
    overlay.invalidateFigures()
  },
  onDoubleClick: ({ overlay, chart, figure, x, y }) => {
    const grid = getGrid(overlay)
    let index = cellIndexFromKey(figure?.key, grid.cols)
    if (index === null && isNumber(x) && isNumber(y)) {
      index = cellIndexAt(pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {}), grid, { x, y })
    }
    openCellEditor(chart, overlay, index ?? 0)
  },
  onRightClick: ({ overlay, chart, figure, x, y }) => {
    const grid = getGrid(overlay)
    let index = cellIndexFromKey(figure?.key, grid.cols)
    if (index === null && isNumber(x) && isNumber(y)) {
      index = cellIndexAt(pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {}), grid, { x, y })
    }
    if (index === null) {
      return
    }
    activeCells.set(overlay, index)
    overlay.invalidateFigures()
    openTableMenu(chart, overlay, { x: x ?? 0, y: y ?? 0 }, index)
  },
  onDrawEnd: ({ overlay, chart }) => {
    if (!overlay.isDrawing()) {
      openCellEditor(chart, overlay, 0)
    }
  }
}

export default table
