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
  applySnap45,
  buildXAxisBandFigures,
  buildYAxisBandFigures,
  getArrowCoordinates,
  getLinearYFromCoordinates,
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
 * 'rayLine' — TradingView Ray. Two anchors: P1 is the origin, P2 sets the
 * direction; the line extends from P1 through P2 to the pane edge (a
 * vertical ray when both anchors share x). Arrow at the tip by default.
 */

export interface RayLineExtendData extends LineExtendData {}

const rayLine: OverlayTemplate<RayLineExtendData> = {
  name: 'rayLine',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: RayLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // ─── Ray tip: edge of the pane in the P1→P2 direction ───
    const rayTip: Coordinate = c1.x === c2.x && c1.y !== c2.y
      ? { x: c1.x, y: c1.y < c2.y ? bounding.height : 0 }
      : c1.x > c2.x
        ? { x: 0, y: getLinearYFromCoordinates(c1, c2, { x: 0, y: c1.y }) }
        : { x: bounding.width, y: getLinearYFromCoordinates(c1, c2, { x: bounding.width, y: c1.y }) }

    // ─── Label layout first (may request a gap in the line) ───
    const spec = labelSpecOf(ext)
    const labelLayout = spec !== null
      ? layoutDiagonalLabel('ray_label', spec, c1, rayTip, lineColor, lineWidth)
      : null

    pushLineWithGap(figures, 'ray', c1, rayTip, labelLayout?.gap)

    // ─── Arrow at the ray tip (on by default, TradingView parity) ───
    const rightEnd = ext.rightEnd ?? 1
    if (rightEnd === 1) {
      const coords = getArrowCoordinates(c1, rayTip)
      if (coords.length === 3) {
        figures.push({
          key: 'ray_arrow',
          type: 'polygon',
          attrs: { coordinates: coords },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
      }
    }

    // ─── Price label at the origin anchor ───
    if (ext.showPriceLabels === true || ext.showPriceLabel === true) {
      pushAnchorPriceLabel(figures, 'ray_price0', c1, points[0]?.value, lineColor, precision)
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
      spanA: c1,
      spanB: rayTip,
      precision,
      isActive
    })
    pushInlineStats(figures, 'ray_stats', statLines, ext.statsPosition, c1, rayTip, lineColor)

    // ─── Anchors + optional midpoint handle (anchor midpoint, TV parity) ───
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      midPoint: ext.showMiddlePoint === true || ext.showMidpoint === true
    }))

    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: RayLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildYAxisBandFigures('ray', {
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
    const ext: RayLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildXAxisBandFigures('ray', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    })
  },

  performEventPressedMove: function (this: Overlay<RayLineExtendData>, params) {
    if (params.performPointIndex === 0 || params.performPointIndex === 1) {
      applySnap45(this, params, params.performPointIndex === 0 ? 1 : 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<RayLineExtendData>, params) {
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  }
}

export default rayLine
