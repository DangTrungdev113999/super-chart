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

import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'

import { alpha, fmtNum, signedPct, formatDurationMinutes, formatVolume, getPricePrecision, windowStats, pillFigures } from './measureCommon'

/**
 * 'measure' — the TradingView ruler. Press-drag-release: a rect spanning
 * the drag shows Δprice / Δ% / bars / duration / volume while the pointer
 * is down, then the overlay removes itself — `transient: true` keeps it
 * out of persistence, undo history and drawings.list().
 *
 * Mechanics: `freehand` on an unlimited-step template is the only kernel
 * path that keeps updating a point for the WHOLE drag — a finite-step
 * freehand commits its last slot at the first qualifying move and freezes
 * the rect. Anchors 0 and N-1 of the collected stroke are the rect
 * corners; the overlay is deleted in `onDrawEnd`, so the point list never
 * persists.
 */

export interface MeasureExtendData {
  /** Rect tint when price moved up (default '#1E88E5'). */
  upColor?: string
  /** Rect tint when price moved down (default '#F44336'). */
  downColor?: string
  pricePrecision?: number
}

const DEFAULT_UP_COLOR = '#1E88E5'
const DEFAULT_DOWN_COLOR = '#F44336'
const TOOLTIP_BG = 'rgba(30, 30, 30, 0.9)'
const ARROW_SIZE = 6

const measure: OverlayTemplate<MeasureExtendData> = {
  name: 'measure',
  // Unlimited-step freehand: the stroke collects points for the whole
  // press-drag gesture; only the first/last points are ever read.
  totalStep: Number.MAX_SAFE_INTEGER,
  freehand: true,
  freehandMinDistance: 4,
  transient: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, bounding }) => {
    if (coordinates.length < 2) {
      return []
    }

    const start = coordinates[0]
    const end = coordinates[coordinates.length - 1]
    const p1 = isValid(overlay.points[0]) ? overlay.points[0] : undefined
    const p2 = isValid(overlay.points[overlay.points.length - 1]) ? overlay.points[overlay.points.length - 1] : undefined

    const startPrice = p1?.value ?? 0
    const endPrice = p2?.value ?? 0
    const priceDiff = endPrice - startPrice
    const pricePct = startPrice !== 0 ? (priceDiff / startPrice) * 100 : 0
    const pips = Math.round(priceDiff * 100)

    const stats = windowStats(chart.getDataList(), p1, p2)
    const ext = isValid(overlay.extendData) ? overlay.extendData : undefined
    const precision = getPricePrecision(chart, ext?.pricePrecision)

    const isUp = priceDiff >= 0
    const base = isUp ? (ext?.upColor ?? DEFAULT_UP_COLOR) : (ext?.downColor ?? DEFAULT_DOWN_COLOR)
    const fillColor = alpha(base, 0.25)
    const borderColor = base

    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2

    const figures: OverlayFigure[] = [{
      key: 'ms_rect',
      type: 'rect',
      attrs: { x, y, width, height },
      styles: {
        style: 'stroke_fill',
        color: fillColor,
        borderColor,
        borderSize: 1
      },
      bounds: { x: x - ARROW_SIZE, y: y - ARROW_SIZE, width: width + ARROW_SIZE * 2, height: height + ARROW_SIZE * 2 },
      ignoreEvent: true
    }]

    // Crosshair edges at the release corner (consumer parity).
    figures.push({
      key: 'ms_cross_h',
      type: 'line',
      attrs: { coordinates: [{ x: start.x, y: end.y }, { x: end.x, y: end.y }] },
      styles: { style: 'solid', color: borderColor, size: 1 },
      ignoreEvent: true
    })
    figures.push({
      key: 'ms_cross_v',
      type: 'line',
      attrs: { coordinates: [{ x: end.x, y: start.y }, { x: end.x, y: end.y }] },
      styles: { style: 'solid', color: borderColor, size: 1 },
      ignoreEvent: true
    })

    // Horizontal arrow at mid-height.
    const direction = end.x >= start.x ? 1 : -1
    figures.push({
      key: 'ms_arrow_h',
      type: 'line',
      attrs: { coordinates: [{ x: start.x, y: midY }, { x: end.x, y: midY }] },
      styles: { style: 'solid', color: borderColor, size: 1 },
      ignoreEvent: true
    })
    figures.push({
      key: 'ms_arrow_h_head',
      type: 'line',
      attrs: {
        coordinates: [
          { x: end.x - ARROW_SIZE * direction, y: midY - ARROW_SIZE / 2 },
          { x: end.x, y: midY },
          { x: end.x - ARROW_SIZE * direction, y: midY + ARROW_SIZE / 2 }
        ]
      },
      styles: { style: 'solid', color: borderColor, size: 1 },
      ignoreEvent: true
    })

    // Vertical arrow at mid-width.
    const vDirection = end.y >= start.y ? 1 : -1
    figures.push({
      key: 'ms_arrow_v',
      type: 'line',
      attrs: { coordinates: [{ x: midX, y: start.y }, { x: midX, y: end.y }] },
      styles: { style: 'solid', color: borderColor, size: 1 },
      ignoreEvent: true
    })
    figures.push({
      key: 'ms_arrow_v_head',
      type: 'line',
      attrs: {
        coordinates: [
          { x: midX - ARROW_SIZE / 2, y: end.y - ARROW_SIZE * vDirection },
          { x: midX, y: end.y },
          { x: midX + ARROW_SIZE / 2, y: end.y - ARROW_SIZE * vDirection }
        ]
      },
      styles: { style: 'solid', color: borderColor, size: 1 },
      ignoreEvent: true
    })

    // Tooltip pinned below the rect — above it when it would clip the pane.
    const line1 = `${fmtNum(priceDiff, precision)} (${signedPct(pricePct)}) , ${pips}`
    const line2 = `${stats.bars} thanh, ${formatDurationMinutes(stats.minutes)}`
    const line3 = `Khối lượng ${formatVolume(stats.volume)}`
    const tooltipTop = Math.max(start.y, end.y) + 15
    const tooltipH = 3 * 11 + 2 * 4 + 10
    const topY = tooltipTop + tooltipH > bounding.height ? y - tooltipH - 15 : tooltipTop
    figures.push(...pillFigures('ms_tip', midX, topY, [
      { text: line1, color: borderColor, weight: 'bold', size: 12 },
      { text: line2, color: '#FFFFFF' },
      { text: line3, color: '#FFFFFF' }
    ], {
      bgColor: TOOLTIP_BG,
      borderColor,
      borderSize: 1,
      borderRadius: 4,
      fontSize: 11
    }))

    return figures
  },

  onDrawEnd: ({ chart, overlay }) => {
    // TV parity: the ruler lives only for the drag — release removes it.
    // Ghosts/mirrors are never created for transient tools, but guard anyway.
    if (!overlay.ghost && !overlay.synced) {
      chart.removeOverlay({ id: overlay.id })
    }
  },

  onDeselected: ({ chart, overlay }) => {
    // Safety net — a ruler that survived by any path still vanishes on
    // deselect, matching the "gone on click-away" consumer behavior.
    if (!overlay.ghost && !overlay.synced) {
      chart.removeOverlay({ id: overlay.id })
    }
  }
}

export default measure
