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
import { alpha, fmtNum, signedPct, dashValueFor, pillFigures, getPricePrecision } from './measureCommon'

/**
 * 'priceRange' — TradingView Price Range. Two anchors; shades a price
 * band over the dragged span and labels it "Δ (±%) ticks".
 */

export interface PriceRangeExtendData {
  color?: string
  /** Fill opacity for the shaded band (0..1, default 0.15). */
  fillOpacity?: number
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  pricePrecision?: number
}

const DEFAULT_COLOR = '#2962FF'
const DEFAULT_FILL_OPACITY = 0.15
const ARROW_SIZE = 6

const priceRange: OverlayTemplate<PriceRangeExtendData> = {
  name: 'priceRange',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) {
      return []
    }
    const [start, end] = coordinates
    const ext: PriceRangeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}

    const color = ext.color ?? DEFAULT_COLOR
    const fillColor = alpha(color, ext.fillOpacity ?? DEFAULT_FILL_OPACITY)
    const lineWidth = ext.lineWidth ?? 2
    const lineStyle = ext.lineStyle ?? 'solid'
    const dashed = dashValueFor(lineStyle)
    const precision = getPricePrecision(chart, ext.pricePrecision)

    const startPrice = overlay.points[0]?.value ?? 0
    const endPrice = overlay.points[1]?.value ?? 0
    const priceDiff = endPrice - startPrice
    const pricePct = startPrice !== 0 ? (priceDiff / Math.abs(startPrice)) * 100 : 0
    const tickSize = Math.pow(10, -precision)
    const ticks = Math.round(priceDiff / tickSize)

    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    const midX = (start.x + end.x) / 2

    const figures: OverlayFigure[] = [{
      key: 'pr_rect',
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
      bounds: { x: x - ARROW_SIZE, y: y - ARROW_SIZE - 20, width: width + ARROW_SIZE * 2, height: height + ARROW_SIZE * 2 + 40 }
    }]

    // Horizontal edge lines on both price bounds.
    figures.push({
      key: 'pr_edge_t',
      type: 'line',
      attrs: { coordinates: [{ x, y }, { x: x + width, y }] },
      styles: { style: lineStyle === 'solid' ? 'solid' : 'dashed', color, size: lineWidth, dashedValue: dashed },
      ignoreEvent: true
    })
    figures.push({
      key: 'pr_edge_b',
      type: 'line',
      attrs: { coordinates: [{ x, y: y + height }, { x: x + width, y: y + height }] },
      styles: { style: lineStyle === 'solid' ? 'solid' : 'dashed', color, size: lineWidth, dashedValue: dashed },
      ignoreEvent: true
    })

    // Vertical arrow at mid-width + circle marker on the start level.
    const vDirection = end.y >= start.y ? 1 : -1
    figures.push({
      key: 'pr_arrow',
      type: 'line',
      attrs: { coordinates: [{ x: midX, y: start.y }, { x: midX, y: end.y }] },
      styles: { style: 'solid', color, size: lineWidth },
      ignoreEvent: true
    })
    figures.push({
      key: 'pr_arrow_head',
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
    figures.push({
      key: 'pr_start_dot',
      type: 'circle',
      attrs: { x: midX, y: start.y, r: 3 },
      styles: { style: 'stroke', borderColor: color, borderSize: 1 },
      ignoreEvent: true
    })

    // Label on the end side: "Δ (±%) ticks" — center sits one gap past
    // the end level (mirrors the consumer tooltip placement).
    const labelText = `${fmtNum(priceDiff, precision)} (${signedPct(pricePct)}) ${ticks}`
    const pillH = 12 + 5 * 2
    const labelTop = end.y + vDirection * (pillH / 2 + 10) - pillH / 2
    figures.push(...pillFigures('pr_label', midX, labelTop, [
      { text: labelText, color: '#FFFFFF' }
    ], { bgColor: color, borderRadius: 4, fontSize: 12 }))

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
  }
}

export default priceRange
