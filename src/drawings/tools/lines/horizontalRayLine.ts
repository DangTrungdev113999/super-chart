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

import type Coordinate from '../../../common/Coordinate'
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import {
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  formatNum,
  getArrowCoordinates,
  labelSpecOf,
  lineColorOf,
  lineSizeOf,
  pricePrecisionOf,
  pushFlatLabel
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'horizontalRayLine' — TradingView Horizontal Ray (catalog id
 * 'horizontalRay'). One anchor; the ray runs horizontally from the anchor
 * to the pane edge in the ray direction.
 *
 * Direction: TradingView's `LineToolHorzRay` is a single-point tool that
 * always extends right. Overlays deserialized from the kernel's two-point
 * version keep their direction — a stored second point left of the anchor
 * renders leftward.
 */

export interface HorizRayLineExtendData extends LineExtendData {}

const horizontalRayLine: OverlayTemplate<HorizRayLineExtendData> = {
  name: 'horizontalRayLine',
  totalStep: 2,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 1) return []

    const [c1] = coordinates
    const ext: HorizRayLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // ─── Ray tip: right edge by default; left edge for legacy two-point
    //     overlays whose direction point sits left of the anchor ───
    const c2 = coordinates[1]
    const tipX = isValid(c2) && c2.x < c1.x ? 0 : bounding.width
    const rayTip: Coordinate = { x: tipX, y: c1.y }

    figures.push({
      key: 'hrl_line',
      type: 'line',
      attrs: { coordinates: [c1, rayTip] }
    })

    // ─── Arrow at the ray tip (on by default) ───
    const rightEnd = ext.rightEnd ?? 1
    if (rightEnd === 1) {
      const coords = getArrowCoordinates(c1, rayTip)
      if (coords.length === 3) {
        figures.push({
          key: 'hrl_arrow',
          type: 'polygon',
          attrs: { coordinates: coords },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
      }
    }

    // ─── Price label at the anchor ───
    const p1Value = points[0]?.value
    if ((ext.showPriceLabels === true || ext.showPriceLabel === true) && p1Value != null) {
      figures.push({
        key: 'hrl_price0',
        type: 'text',
        attrs: {
          x: c1.x,
          y: c1.y - 6,
          text: formatNum(p1Value, precision),
          align: 'center' as CanvasTextAlign,
          baseline: 'bottom' as CanvasTextBaseline
        },
        styles: { color: lineColor, size: 11, weight: 'normal', backgroundColor: 'transparent' },
        ignoreEvent: true
      })
    }

    // ─── Text label over the rendered ray span ───
    const spec = labelSpecOf(ext)
    if (spec !== null) {
      pushFlatLabel(figures, 'hrl_label', spec, c1.x, rayTip.x, c1.y, lineColor, lineWidth)
    }

    // ─── Stats ───
    const showStats = ext.alwaysShowStats === true || isActive
    const hasAnyStats = ext.showBarsRange === true || ext.showDistance === true
    if (showStats && hasAnyStats) {
      const statLines: string[] = []
      const p1Index = points[0]?.dataIndex
      const p2Index = points[1]?.dataIndex
      if (ext.showBarsRange === true && p1Index != null && p2Index != null) {
        statLines.push(`${Math.abs(p2Index - p1Index)} bars`)
      }
      if (ext.showDistance === true) {
        statLines.push(`Dist: ${formatNum(Math.abs(rayTip.x - c1.x), 1)}px`)
      }
      if (statLines.length > 0) {
        const statsPos = typeof ext.statsPosition === 'number' ? ext.statsPosition : 2
        const midX = (c1.x + rayTip.x) / 2
        let sx = Math.max(c1.x, rayTip.x) + 8
        let sy = c1.y - 12
        let sAlign: CanvasTextAlign = 'left'
        let sBaseline: CanvasTextBaseline = 'bottom'
        switch (statsPos) {
          case 0:
            sx = Math.min(c1.x, rayTip.x) - 8
            sAlign = 'right'
            break
          case 1:
            sx = midX
            sAlign = 'center'
            break
          case 3:
            sy = c1.y + 12
            sBaseline = 'top'
            break
          default:
            break
        }
        figures.push({
          key: 'hrl_stats',
          type: 'text',
          attrs: { x: sx, y: sy, text: statLines.join('  '), align: sAlign, baseline: sBaseline },
          styles: { color: lineColor, size: 11, weight: 'normal', backgroundColor: 'transparent' },
          ignoreEvent: true
        })
      }
    }

    // ─── Anchor ───
    figures.push(...createAnchorFigures({
      coordinates: [c1],
      pointIndexes: [0],
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch
    }))

    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: HorizRayLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const pill = buildYAxisPill(coordinates[0].y, overlay.points[0]?.value, lineColor, precision, bounding, yAxis ?? undefined, 'hrl_y0')
    return pill != null ? [pill] : []
  },

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) return []
    const ext: HorizRayLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const d0 = formatDate(overlay.points[0]?.timestamp)
    if (d0 === '') return []
    return [buildXAxisPill(coordinates[0].x, d0, lineColor, 'hrl_x0')]
  },

  performEventPressedMove: ({ points, performPoint }) => {
    // Keep any legacy second point level with the anchor.
    if (points.length > 1) {
      points[1].value = performPoint.value
    }
  }
}

export default horizontalRayLine
