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
  alpha, formatDurationMinutes, formatVolume, windowStats,
  dashValueFor, pillFigures, type PillLine
} from './measureCommon'

/**
 * 'dateRange' — TradingView Date Range. Two anchors; shades the dragged
 * span and labels it with the covered bar count, elapsed time and volume.
 */

export interface DateRangeExtendData {
  color?: string
  /** Fill opacity for the shaded band (0..1, default 0.15). */
  fillOpacity?: number
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  /** Show the volume line inside the label (default true). */
  showVolume?: boolean
}

const DEFAULT_COLOR = '#2962FF'
const DEFAULT_FILL_OPACITY = 0.15
const ARROW_SIZE = 6

const dateRange: OverlayTemplate<DateRangeExtendData> = {
  name: 'dateRange',
  totalStep: 3,
  figureCacheDataRev: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, isSelected, isHovered }) => {
    if (coordinates.length < 2) {
      return []
    }
    const [start, end] = coordinates
    const ext: DateRangeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}

    const color = ext.color ?? DEFAULT_COLOR
    const fillColor = alpha(color, ext.fillOpacity ?? DEFAULT_FILL_OPACITY)
    const lineWidth = ext.lineWidth ?? 2
    const lineStyle = ext.lineStyle ?? 'solid'
    const dashed = dashValueFor(lineStyle)
    const lineFigureStyle = { style: lineStyle === 'solid' ? 'solid' : 'dashed', color, size: lineWidth, dashedValue: dashed }

    const stats = windowStats(chart.getDataList(), overlay.points[0], overlay.points[1])

    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    const midY = (start.y + end.y) / 2

    const figures: OverlayFigure[] = [{
      key: 'dr_rect',
      type: 'rect',
      attrs: { x, y, width, height },
      styles: { style: 'fill', color: fillColor },
      bounds: { x: x - ARROW_SIZE, y: y - ARROW_SIZE, width: width + ARROW_SIZE * 2, height: height + ARROW_SIZE * 2 }
    }]

    // Edge lines on both time bounds.
    figures.push({
      key: 'dr_edge_l',
      type: 'line',
      attrs: { coordinates: [{ x, y }, { x, y: y + height }] },
      styles: lineFigureStyle,
      ignoreEvent: true
    })
    figures.push({
      key: 'dr_edge_r',
      type: 'line',
      attrs: { coordinates: [{ x: x + width, y }, { x: x + width, y: y + height }] },
      styles: lineFigureStyle,
      ignoreEvent: true
    })

    // Horizontal arrow at mid-height pointing toward the end anchor.
    const direction = end.x >= start.x ? 1 : -1
    figures.push({
      key: 'dr_arrow',
      type: 'line',
      attrs: { coordinates: [{ x: start.x, y: midY }, { x: end.x, y: midY }] },
      styles: lineFigureStyle,
      ignoreEvent: true
    })
    figures.push({
      key: 'dr_arrow_head',
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

    // Label pill below the band: "N thanh, 3n 5h" (+ "Khối lượng 1.2M").
    const lines: PillLine[] = [
      { text: `${stats.bars} thanh, ${formatDurationMinutes(stats.minutes)}`, color: '#FFFFFF', weight: 'bold' }
    ]
    if (ext.showVolume !== false) {
      lines.push({ text: `Khối lượng ${formatVolume(stats.volume)}`, color: '#FFFFFF' })
    }
    figures.push(...pillFigures('dr_label', (start.x + end.x) / 2, y + height + 10, lines, {
      bgColor: color,
      borderRadius: 4
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

export default dateRange
