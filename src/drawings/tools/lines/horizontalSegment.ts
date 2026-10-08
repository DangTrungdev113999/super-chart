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
import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import {
  buildXAxisBandFigures,
  buildYAxisPill,
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
 * 'horizontalSegment' — Horizontal Segment (catalog id
 * 'horizontalSegment'). Two anchors pinned to the same price level; a
 * finite horizontal span with optional arrows, midpoint handle, labels
 * and stats. Moving either anchor moves the whole level.
 */

export interface HorizSegmentExtendData extends LineExtendData {}

const horizontalSegment: OverlayTemplate<HorizSegmentExtendData> = {
  name: 'horizontalSegment',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: HorizSegmentExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // Both endpoints rendered at P1's Y — P1's value is authoritative.
    const lineStart: Coordinate = { x: c1.x, y: c1.y }
    const lineEnd: Coordinate = { x: c2.x, y: c1.y }

    figures.push({
      key: 'hs_line',
      type: 'line',
      attrs: { coordinates: [lineStart, lineEnd] }
    })

    // ─── Arrow end caps on the x-ordered endpoints ───
    const leftEnd = ext.leftEnd ?? 0
    const rightEnd = ext.rightEnd ?? 0
    const leftPt = lineStart.x <= lineEnd.x ? lineStart : lineEnd
    const rightPt = lineStart.x <= lineEnd.x ? lineEnd : lineStart
    if (leftEnd === 1) {
      const coords = getArrowCoordinates(rightPt, leftPt)
      if (coords.length === 3) {
        figures.push({ key: 'hs_arrow_left', type: 'polygon', attrs: { coordinates: coords }, styles: { style: 'fill', color: lineColor }, ignoreEvent: true })
      }
    }
    if (rightEnd === 1) {
      const coords = getArrowCoordinates(leftPt, rightPt)
      if (coords.length === 3) {
        figures.push({ key: 'hs_arrow_right', type: 'polygon', attrs: { coordinates: coords }, styles: { style: 'fill', color: lineColor }, ignoreEvent: true })
      }
    }

    // ─── Price labels at both ends ───
    const p1Value = points[0]?.value
    if ((ext.showPriceLabels === true || ext.showPriceLabel === true) && p1Value != null) {
      for (const [index, c] of [lineStart, lineEnd].entries()) {
        figures.push({
          key: `hs_price${index}`,
          type: 'text',
          attrs: {
            x: c.x,
            y: c.y - 6,
            text: formatNum(p1Value, precision),
            align: 'center' as CanvasTextAlign,
            baseline: 'bottom' as CanvasTextBaseline
          },
          styles: { color: lineColor, size: 11, weight: 'normal', backgroundColor: 'transparent' },
          ignoreEvent: true
        })
      }
    }

    // ─── Text label over the span ───
    const spec = labelSpecOf(ext)
    if (spec !== null) {
      pushFlatLabel(figures, 'hs_label', spec, lineStart.x, lineEnd.x, c1.y, lineColor, lineWidth)
    }

    // ─── Stats ───
    const showStats = ext.alwaysShowStats === true || isActive
    const hasAnyStats = ext.showBarsRange === true || ext.showDistance === true
    if (showStats && hasAnyStats && points.length >= 2) {
      const statLines: string[] = []
      const p1Index = points[0]?.dataIndex
      const p2Index = points[1]?.dataIndex
      if (ext.showBarsRange === true && p1Index != null && p2Index != null) {
        statLines.push(`${Math.abs(p2Index - p1Index)} bars`)
      }
      if (ext.showDistance === true) {
        statLines.push(`Dist: ${formatNum(Math.abs(c2.x - c1.x), 1)}px`)
      }
      if (statLines.length > 0) {
        const statsPos = typeof ext.statsPosition === 'number' ? ext.statsPosition : 2
        const midX = (c1.x + c2.x) / 2
        let sx = Math.max(c1.x, c2.x) + 8
        let sy = c1.y - 12
        let sAlign: CanvasTextAlign = 'left'
        let sBaseline: CanvasTextBaseline = 'bottom'
        switch (statsPos) {
          case 0:
            sx = Math.min(c1.x, c2.x) - 8
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
          key: 'hs_stats',
          type: 'text',
          attrs: { x: sx, y: sy, text: statLines.join('  '), align: sAlign, baseline: sBaseline },
          styles: { color: lineColor, size: 11, weight: 'normal', backgroundColor: 'transparent' },
          ignoreEvent: true
        })
      }
    }

    // ─── Anchors rendered on the locked line + midpoint handle ───
    // (midpoint translates horizontally only — kernel parity).
    const anchorCoords: Coordinate[] = [lineStart, lineEnd]
    const anchors = createAnchorFigures({
      coordinates: anchorCoords,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      midPoint: ext.showMiddlePoint === true || ext.showMidpoint === true
    })
    for (const figure of anchors) {
      if (figure.key === 'anchor_mid') {
        figure.moveDirection = 'horz'
      }
    }
    figures.push(...anchors)

    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: HorizSegmentExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const pill = buildYAxisPill(coordinates[0].y, overlay.points[0]?.value, lineColor, precision, bounding, yAxis ?? undefined, 'hs_y0')
    return pill != null ? [pill] : []
  },

  createXAxisFigures: ({ chart, overlay, coordinates, bounding }) => {
    if (coordinates.length < 1) return []
    const ext: HorizSegmentExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildXAxisBandFigures('hs', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    })
  },

  performEventPressedMove: function (this: Overlay<HorizSegmentExtendData>, params) {
    // Anchor drags re-level the whole segment (both endpoints share y).
    params.points[0].value = params.performPoint.value
    params.points[1].value = params.performPoint.value
  },

  performEventMoveForDrawing: function (this: Overlay<HorizSegmentExtendData>, params) {
    // While placing the second anchor the level follows the cursor.
    if (params.currentStep === 2) {
      params.points[0].value = params.performPoint.value
    }
  }
}

export default horizontalSegment
