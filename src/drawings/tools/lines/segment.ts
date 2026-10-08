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
import { createAnchorFigures, computeResizeCursor } from '../../interaction/anchors'
import {
  applySnap45,
  buildXAxisBandFigures,
  buildYAxisBandFigures,
  getArrowCoordinates,
  getExtendedCoordinates,
  inlineStatsLines,
  labelSpecOf,
  layoutDiagonalLabel,
  lineColorOf,
  lineSizeOf,
  pricePrecisionOf,
  pushAnchorPriceLabel,
  pushInlineStats,
  pushLineWithGap,
  rememberLineChart
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'segment' — TradingView Trend Line. Two anchors, finite segment with
 * optional left/right extensions, arrow end caps, midpoint handle, price
 * labels, rotated text label and selection-driven inline stats.
 */

export interface SegmentExtendData extends LineExtendData {}

const segment: OverlayTemplate<SegmentExtendData> = {
  name: 'segment',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: SegmentExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // ─── Rendered endpoints (extension to bounding edges when enabled) ───
    const extendLeft = ext.extendLeft === true
    const extendRight = ext.extendRight === true
    let lineStart: Coordinate = { x: c1.x, y: c1.y }
    let lineEnd: Coordinate = { x: c2.x, y: c2.y }
    if (extendLeft || extendRight) {
      const [s, e] = getExtendedCoordinates(c1, c2, bounding.width, bounding.height, extendLeft, extendRight)
      lineStart = s
      lineEnd = e
    }

    // ─── Text label layout first — it can request a gap in the line ───
    const spec = labelSpecOf(ext)
    const labelLayout = spec !== null
      ? layoutDiagonalLabel('seg_label', spec, lineStart, lineEnd, lineColor, lineWidth)
      : null

    pushLineWithGap(figures, 'seg', lineStart, lineEnd, labelLayout?.gap)

    // ─── Arrow end caps (tip at the rendered end when extended) ───
    const leftEnd = ext.leftEnd ?? 0
    const rightEnd = ext.rightEnd ?? 0
    if (leftEnd === 1) {
      const coords = getArrowCoordinates(c2, extendLeft ? lineStart : c1)
      if (coords.length === 3) {
        figures.push({
          key: 'seg_arrow_left',
          type: 'polygon',
          attrs: { coordinates: coords },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
      }
    }
    if (rightEnd === 1) {
      const coords = getArrowCoordinates(c1, extendRight ? lineEnd : c2)
      if (coords.length === 3) {
        figures.push({
          key: 'seg_arrow_right',
          type: 'polygon',
          attrs: { coordinates: coords },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
      }
    }

    // ─── Price labels at the anchors ───
    if (ext.showPriceLabels === true || ext.showPriceLabel === true) {
      pushAnchorPriceLabel(figures, 'seg_price0', c1, points[0]?.value, lineColor, precision)
      pushAnchorPriceLabel(figures, 'seg_price1', c2, points[1]?.value, lineColor, precision)
    }

    // ─── Text label ───
    if (labelLayout !== null) {
      figures.push(labelLayout.figure)
    }

    // ─── Stats (selection/hover, or always when alwaysShowStats) ───
    const statLines = inlineStatsLines({
      ext,
      points,
      anchorA: c1,
      anchorB: c2,
      spanA: lineStart,
      spanB: lineEnd,
      precision,
      isActive
    })
    pushInlineStats(figures, 'seg_stats', statLines, ext.statsPosition, c1, c2, lineColor)

    // ─── Anchors + optional midpoint translate handle ───
    const resizeCursor = computeResizeCursor(c1, c2)
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      midPoint: ext.showMiddlePoint === true || ext.showMidpoint === true,
      cursors: [resizeCursor, resizeCursor]
    }))

    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: SegmentExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildYAxisBandFigures('seg', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color),
      precision: pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision),
      yAxis: yAxis ?? undefined
    })
  },

  createXAxisFigures: ({ chart, overlay, coordinates, bounding }) => {
    if (coordinates.length < 1) return []
    const ext: SegmentExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildXAxisBandFigures('seg', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    })
  },

  performEventPressedMove: function (this: Overlay<SegmentExtendData>, params) {
    // Endpoint drags: Shift/align-45 snaps the moved anchor to 45° rays.
    if (params.performPointIndex === 0 || params.performPointIndex === 1) {
      applySnap45(this, params, params.performPointIndex === 0 ? 1 : 0)
    }
    // The midpoint handle routes through body move (kernel performs the
    // both-points translate itself).
  },

  performEventMoveForDrawing: function (this: Overlay<SegmentExtendData>, params) {
    // While placing the second anchor, Shift/align-45 snaps to 45°.
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  }
}

export default segment
