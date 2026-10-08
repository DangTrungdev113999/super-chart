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
 * 'straightLine' — TradingView Extended Line (catalog id 'extendedLine').
 * Two anchors define the direction; the line always extends to both pane
 * edges (TradingView `LineToolExtended`: extendLeft = extendRight = true).
 */

export interface StraightLineExtendData extends LineExtendData {}

const straightLine: OverlayTemplate<StraightLineExtendData> = {
  name: 'straightLine',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: StraightLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // ─── Always extended to both pane edges ───
    const [lineStart, lineEnd] = getExtendedCoordinates(c1, c2, bounding.width, bounding.height, true, true)

    // ─── Label layout first (may request a gap in the line) ───
    const spec = labelSpecOf(ext)
    const labelLayout = spec !== null
      ? layoutDiagonalLabel('sl_label', spec, lineStart, lineEnd, lineColor, lineWidth)
      : null

    pushLineWithGap(figures, 'sl', lineStart, lineEnd, labelLayout?.gap)

    // ─── Arrow end caps at the extended edges ───
    const leftEnd = ext.leftEnd ?? 0
    const rightEnd = ext.rightEnd ?? 0
    if (leftEnd === 1) {
      const coords = getArrowCoordinates(c2, lineStart)
      if (coords.length === 3) {
        figures.push({
          key: 'sl_arrow_left',
          type: 'polygon',
          attrs: { coordinates: coords },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
      }
    }
    if (rightEnd === 1) {
      const coords = getArrowCoordinates(c1, lineEnd)
      if (coords.length === 3) {
        figures.push({
          key: 'sl_arrow_right',
          type: 'polygon',
          attrs: { coordinates: coords },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
      }
    }

    // ─── Price labels at the anchors ───
    if (ext.showPriceLabels === true || ext.showPriceLabel === true) {
      pushAnchorPriceLabel(figures, 'sl_price0', c1, points[0]?.value, lineColor, precision)
      pushAnchorPriceLabel(figures, 'sl_price1', c2, points[1]?.value, lineColor, precision)
    }

    if (labelLayout !== null) {
      figures.push(labelLayout.figure)
    }

    // ─── Stats ───
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
    pushInlineStats(figures, 'sl_stats', statLines, ext.statsPosition, lineStart, lineEnd, lineColor)

    // ─── Anchors + optional midpoint handle ───
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
    const ext: StraightLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildYAxisBandFigures('sl', {
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
    const ext: StraightLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildXAxisBandFigures('sl', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    })
  },

  performEventPressedMove: function (this: Overlay<StraightLineExtendData>, params) {
    if (params.performPointIndex === 0 || params.performPointIndex === 1) {
      applySnap45(this, params, params.performPointIndex === 0 ? 1 : 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<StraightLineExtendData>, params) {
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  }
}

export default straightLine
