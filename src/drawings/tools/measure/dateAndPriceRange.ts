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

import { createAnchorFigures } from '../../interaction/anchors'
import {
  alpha, signedNum, signedPct, formatDurationMinutes, formatVolume,
  windowStats, dashValueFor, pillFigures, getPricePrecision
} from './measureCommon'

/**
 * 'dateAndPriceRange' — TradingView "Date and Price Range" (the combined
 * measure tool). Two anchors; shades the drag rect and shows a persistent
 * tooltip with Δprice / Δ% / bars / duration / volume.
 */

export interface DateAndPriceRangeExtendData {
  color?: string
  /** Fill opacity for the shaded rect (0..1, default 0.15). */
  fillOpacity?: number
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  pricePrecision?: number
}

const DEFAULT_COLOR = '#2962FF'
const DEFAULT_FILL_OPACITY = 0.15
const TOOLTIP_BG = 'rgba(30, 30, 30, 0.9)'
const ARROW_SIZE = 6

const dateAndPriceRange: OverlayTemplate<DateAndPriceRangeExtendData> = {
  name: 'dateAndPriceRange',
  totalStep: 3,
  figureCacheDataRev: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, bounding, isSelected, isHovered }) => {
    if (coordinates.length < 2) {
      return []
    }
    const [start, end] = coordinates
    const ext: DateAndPriceRangeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}

    const color = ext.color ?? DEFAULT_COLOR
    const fillColor = alpha(color, ext.fillOpacity ?? DEFAULT_FILL_OPACITY)
    const lineWidth = ext.lineWidth ?? 2
    const lineStyle = ext.lineStyle ?? 'solid'
    const dashed = dashValueFor(lineStyle)
    const lineFigureStyle = { style: lineStyle === 'solid' ? 'solid' : 'dashed', color, size: lineWidth, dashedValue: dashed }
    const precision = getPricePrecision(chart, ext.pricePrecision)

    const startPrice = overlay.points[0]?.value ?? 0
    const endPrice = overlay.points[1]?.value ?? 0
    const priceDiff = endPrice - startPrice
    const pricePct = startPrice !== 0 ? (priceDiff / startPrice) * 100 : 0
    const pips = Math.round(priceDiff * 100)

    const stats = windowStats(chart.getDataList(), overlay.points[0], overlay.points[1])

    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2

    const figures: OverlayFigure[] = [{
      key: 'dpr_rect',
      type: 'rect',
      attrs: { x, y, width, height },
      styles: {
        style: 'stroke_fill',
        color: fillColor,
        borderColor: color,
        borderSize: lineWidth,
        borderStyle: lineStyle === 'solid' ? 'solid' : 'dashed',
        borderDashedValue: dashed
      },
      bounds: { x: x - ARROW_SIZE, y: y - ARROW_SIZE, width: width + ARROW_SIZE * 2, height: height + ARROW_SIZE * 2 }
    }]

    // Crosshair edges at the end corner (consumer parity).
    figures.push({
      key: 'dpr_cross_h',
      type: 'line',
      attrs: { coordinates: [{ x: start.x, y: end.y }, { x: end.x, y: end.y }] },
      styles: lineFigureStyle,
      ignoreEvent: true
    })
    figures.push({
      key: 'dpr_cross_v',
      type: 'line',
      attrs: { coordinates: [{ x: end.x, y: start.y }, { x: end.x, y: end.y }] },
      styles: lineFigureStyle,
      ignoreEvent: true
    })

    // Horizontal arrow at mid-height.
    const direction = end.x >= start.x ? 1 : -1
    figures.push({
      key: 'dpr_arrow_h',
      type: 'line',
      attrs: { coordinates: [{ x: start.x, y: midY }, { x: end.x, y: midY }] },
      styles: lineFigureStyle,
      ignoreEvent: true
    })
    figures.push({
      key: 'dpr_arrow_h_head',
      type: 'line',
      attrs: {
        coordinates: [
          { x: end.x - ARROW_SIZE * direction, y: midY - ARROW_SIZE / 2 },
          { x: end.x, y: midY },
          { x: end.x - ARROW_SIZE * direction, y: midY + ARROW_SIZE / 2 }
        ]
      },
      styles: { style: 'solid', color, size: 1 },
      ignoreEvent: true
    })

    // Vertical arrow at mid-width.
    const vDirection = end.y >= start.y ? 1 : -1
    figures.push({
      key: 'dpr_arrow_v',
      type: 'line',
      attrs: { coordinates: [{ x: midX, y: start.y }, { x: midX, y: end.y }] },
      styles: { style: 'solid', color, size: lineWidth },
      ignoreEvent: true
    })
    figures.push({
      key: 'dpr_arrow_v_head',
      type: 'line',
      attrs: {
        coordinates: [
          { x: midX - ARROW_SIZE / 2, y: end.y - ARROW_SIZE * vDirection },
          { x: midX, y: end.y },
          { x: midX + ARROW_SIZE / 2, y: end.y - ARROW_SIZE * vDirection }
        ]
      },
      styles: { style: 'solid', color, size: 1 },
      ignoreEvent: true
    })

    // Dark tooltip below the rect (above when it would clip the pane):
    // "+Δ (+%) , pips" / "N thanh, 3n" / "Khối lượng 1.2M".
    const line1 = `${signedNum(priceDiff, precision)} (${signedPct(pricePct)}) , ${pips}`
    const line2 = `${stats.bars} thanh, ${formatDurationMinutes(stats.minutes)}`
    const line3 = `Khối lượng ${formatVolume(stats.volume)}`
    const pillH = (12 + 11 + 11) + 2 * 2 + 10
    const belowTop = Math.max(start.y, end.y) + 15
    const topY = belowTop + pillH > bounding.height ? y - pillH - 15 : belowTop
    figures.push(...pillFigures('dpr_tip', midX, topY, [
      { text: line1, color, weight: 'bold', size: 12 },
      { text: line2, color: '#FFFFFF' },
      { text: line3, color: '#FFFFFF' }
    ], {
      bgColor: TOOLTIP_BG,
      borderColor: color,
      borderSize: 1,
      borderRadius: 4,
      fontSize: 11
    }))

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_'
    }))
    return figures
  }
}

export default dateAndPriceRange
