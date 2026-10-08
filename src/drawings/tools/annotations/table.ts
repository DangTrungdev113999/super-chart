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
import { isString } from '../../../common/utils/typeChecks'

import { createAnchorFigures } from '../../interaction/anchors'
import type { RichTextAttrs } from '../../figures/richText'
import type { TextBoxData, TextBoxHorzAlign } from '../../text/textBox'

import {
  baseTextBoxData,
  liveTextOf,
  openAnnotationEditor,
  pointToCoordinate,
  resolvedTextStyles,
  textEditorHooks,
  type AnnotationTextStyle
} from './common'

/**
 * 'table' — a grid of editable cells anchored at its top-left corner.
 * Cell contents live in extendData (rows × cols, flat row-major `cells`)
 * and are edited through the shared overlay text editor as a TSV-like
 * blob: rows separated by newlines, cells by tabs. Committing re-parses
 * the blob back into the grid; fully-empty content removes the overlay.
 */

export interface TableExtendData {
  /** Grid dimensions — derived from the edited blob on commit. */
  rows?: number
  cols?: number
  /** Flat row-major cell texts (length rows*cols; missing = ''). */
  cells?: string[]
  /** Outer size in px. */
  tableWidth?: number
  tableHeight?: number
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
}

const STYLE_KEY = 'table'
const DEFAULT_ROWS = 3
const DEFAULT_COLS = 3
const DEFAULT_TABLE_WIDTH = 300
const DEFAULT_TABLE_HEIGHT = 120
const DEFAULT_CELL_PADDING = 4

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

function getGrid (overlay: Overlay<TableExtendData>): { rows: number, cols: number, cells: string[] } {
  const live = liveTextOf(overlay)
  if (live !== undefined) {
    return tsvToGrid(live)
  }
  const extendData = getExtendData(overlay)
  const rows = Math.max(1, extendData.rows ?? DEFAULT_ROWS)
  const cols = Math.max(1, extendData.cols ?? DEFAULT_COLS)
  const cells: string[] = []
  for (let i = 0; i < rows * cols; i++) {
    cells.push(extendData.cells?.[i] ?? '')
  }
  return { rows, cols, cells }
}

function gridToTsv (rows: number, cols: number, cells: string[]): string {
  const lines: string[] = []
  for (let r = 0; r < rows; r++) {
    lines.push(cells.slice(r * cols, (r + 1) * cols).join('\t'))
  }
  return lines.join('\n')
}

function tsvToGrid (tsv: string): { rows: number, cols: number, cells: string[] } {
  const lines = tsv.split(/\r\n|\r|\n/)
  const grid = lines.map(line => line.split('\t'))
  const rows = grid.length
  let cols = 0
  for (const row of grid) {
    cols = Math.max(cols, row.length)
  }
  const cells: string[] = []
  for (const row of grid) {
    for (let c = 0; c < cols; c++) {
      cells.push(row[c] ?? '')
    }
  }
  return { rows, cols, cells }
}

function getBoxData (overlay: Overlay<TableExtendData>): TextBoxData {
  const styles = getTableStyles(overlay)
  const extendData = getExtendData(overlay)
  const { rows, cols, cells } = getGrid(overlay)
  return {
    ...baseTextBoxData(liveTextOf(overlay) ?? gridToTsv(rows, cols, cells), styles),
    boxWidth: extendData.tableWidth ?? DEFAULT_TABLE_WIDTH,
    boxHeight: extendData.tableHeight ?? DEFAULT_TABLE_HEIGHT,
    horzAlign: 'left',
    vertAlign: 'top'
  }
}

function openEditor (chart: Chart, overlay: Overlay<TableExtendData>): void {
  openAnnotationEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    anchor: () => pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {}),
    allowTab: true,
    onCommit: (value) => {
      const { rows, cols, cells } = tsvToGrid(value)
      chart.overrideOverlay({
        id: overlay.id,
        paneId: overlay.paneId,
        extendData: { ...(getExtendData(overlay)), rows, cols, cells }
      })
    }
  })
}

const table: OverlayTemplate<TableExtendData> = {
  name: 'table',
  totalStep: 2,
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
      cellPadding: DEFAULT_CELL_PADDING
    }
  },
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const point = coordinates[0]
    const styles = getTableStyles(overlay)
    const extendData = getExtendData(overlay)
    const { rows, cols, cells } = getGrid(overlay)
    const tableWidth = extendData.tableWidth ?? DEFAULT_TABLE_WIDTH
    const tableHeight = extendData.tableHeight ?? DEFAULT_TABLE_HEIGHT
    const cellPadding = styles.cellPadding ?? DEFAULT_CELL_PADDING
    const cellWidth = tableWidth / cols
    const cellHeight = tableHeight / rows
    const backgroundEnabled = styles.backgroundEnabled ?? true
    const borderEnabled = styles.borderEnabled ?? true
    const borderColor = styles.borderColor
    const textAlign: TextBoxHorzAlign = styles.textAlign ?? 'center'

    const figures: OverlayFigure[] = []

    // Background fill — one rect for the whole grid.
    if (backgroundEnabled) {
      figures.push({
        key: 'background',
        type: 'rect',
        attrs: { x: point.x, y: point.y, width: tableWidth, height: tableHeight },
        styles: { style: 'fill', color: styles.backgroundColor },
        ignoreEvent: true
      })
    }

    // Grid lines — rows+1 horizontal, cols+1 vertical.
    if (borderEnabled) {
      for (let r = 0; r <= rows; r++) {
        const y = point.y + r * cellHeight
        figures.push({
          key: `gridH_${r}`,
          type: 'line',
          attrs: {
            coordinates: [
              { x: point.x, y },
              { x: point.x + tableWidth, y }
            ]
          },
          styles: { color: borderColor, size: 1 },
          ignoreEvent: true
        })
      }
      for (let c = 0; c <= cols; c++) {
        const x = point.x + c * cellWidth
        figures.push({
          key: `gridV_${c}`,
          type: 'line',
          attrs: {
            coordinates: [
              { x, y: point.y },
              { x, y: point.y + tableHeight }
            ]
          },
          styles: { color: borderColor, size: 1 },
          ignoreEvent: true
        })
      }
    }

    // Cell texts — richText so bold/italic/fontFamily render consistently;
    // no box background, just the glyphs.
    const cellData: TextBoxData = {
      ...baseTextBoxData('', styles),
      vertAlign: 'middle',
      horzTextAlign: textAlign
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const content = cells[r * cols + c]
        if (content === '') {
          continue
        }
        const cellLeft = point.x + c * cellWidth
        const cellMidY = point.y + r * cellHeight + cellHeight / 2
        let anchorX = cellLeft + cellWidth / 2
        let horzAlign: TextBoxHorzAlign = 'center'
        if (textAlign === 'left') {
          anchorX = cellLeft + cellPadding
          horzAlign = 'left'
        } else if (textAlign === 'right') {
          anchorX = cellLeft + cellWidth - cellPadding
          horzAlign = 'right'
        }
        const attrs: RichTextAttrs = {
          x: anchorX,
          y: cellMidY,
          ...cellData,
          text: content,
          horzAlign
        }
        figures.push({
          key: `cell_${r}_${c}`,
          type: 'richText',
          attrs,
          styles: { color: styles.color },
          ignoreEvent: true
        })
      }
    }

    // Outer border + whole-grid hit body for dragging.
    figures.push({
      key: 'frame',
      type: 'rect',
      attrs: { x: point.x, y: point.y, width: tableWidth, height: tableHeight },
      styles: {
        style: 'stroke',
        color: 'transparent',
        borderColor: borderEnabled ? borderColor : 'transparent',
        borderSize: borderEnabled ? 1 : 0
      },
      bounds: { x: point.x, y: point.y, width: tableWidth, height: tableHeight }
    })

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
  ...textEditorHooks(openEditor)
}

export default table
