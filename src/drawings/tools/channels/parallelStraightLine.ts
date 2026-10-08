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

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { getLinearYFromCoordinates } from '../../../extension/figure/line'
import { createAnchorFigures, computeResizeCursor } from '../../interaction/anchors'

import {
  applySnap45,
  getExtendedCoordinates,
  lineChartOf,
  pricePrecisionOf,
  pushSidePriceLabel,
  rememberLineChart
} from '../lines/lineCommon'

import {
  type ChannelExtendData,
  channelBandPolygon,
  channelFillColor,
  channelFillEnabled,
  channelHandleFigure,
  channelStrokeOf,
  coordinateToPoint,
  pinPointIndex,
  pointToCoordinate,
  pushChannelXAxisPills,
  pushChannelYAxisPills
} from './channelCommon'

/**
 * 'parallelStraightLine' — TradingView Parallel Channel (simplified to the
 * baseline + offset edges the kernel overlay models).
 *
 * 3 stored points: P1→P2 is the baseline, P3 only carries the channel
 * offset — its time slot is pinned to P1 (`_correctLastPoint` /
 * `restorePoints` in the TV source), so the rendered third anchor sits on
 * the second edge's left corner at (P1.x, P1.y + offset). The offset is a
 * pure vertical pixel delta `a = P3.y - P1.y` — TV applies it as a (0, a)
 * translation, including for vertical baselines.
 *
 * Handles (TV LineAnchorRenderer parity):
 *   anchor_0 / anchor_1 — baseline endpoints (free drag, Shift = 45° snap)
 *   anchor_2            — second-edge left corner (moves the whole left side)
 *   pc_corner           — second-edge right corner (moves P2, keeps height)
 *   pc_mid1 / pc_mid2   — edge midpoints (VerticalResize: drag an edge
 *                         perpendicular while the opposite edge stays fixed)
 *
 * extendData: extendLeft/extendRight, fillBackground/showBackground,
 * transparency (0-100), background {enabled,color,opacity},
 * backgroundColor, showMedianLine + medianLineColor/Width/Style,
 * showPrices, plus the line channel (lineColor/borderColor/color,
 * lineWidth/borderWidth, lineStyle).
 */
export interface ParallelChannelExtendData extends ChannelExtendData {}

const parallelStraightLine: OverlayTemplate<ParallelChannelExtendData> = {
  name: 'parallelStraightLine',
  totalStep: 4,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  extendData: {
    fillBackground: true,
    transparency: 80,
    showMedianLine: true
  },

  createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      return figures
    }

    const ext: ParallelChannelExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = channelStrokeOf(overlay, chart, ext)
    const extendLeft = ext.extendLeft === true
    const extendRight = ext.extendRight === true
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    const [c0, c1] = coordinates
    const [s1, e1] = getExtendedCoordinates(c0, c1, bounding.width, bounding.height, extendLeft, extendRight)

    // Vertical pixel channel offset (TradingView `a = points[2].y - points[0].y`).
    const hasOffset = coordinates.length >= 3
    const offset = hasOffset ? coordinates[2].y - c0.y : 0
    const s2: Coordinate = { x: s1.x, y: s1.y + offset }
    const e2: Coordinate = { x: e1.x, y: e1.y + offset }

    // Fill band between the (possibly extended) edges.
    if (hasOffset && channelFillEnabled(ext) && Math.abs(offset) > 1e-10) {
      const band = channelBandPolygon(s1, e1, s2, e2, extendLeft, extendRight, bounding)
      if (band.length >= 3) {
        figures.push({
          key: 'pc_fill',
          type: 'polygon',
          attrs: { coordinates: band },
          styles: { style: 'fill', color: channelFillColor(ext, stroke.color) },
          ignoreEvent: true
        })
      }
    }

    figures.push({
      key: 'pc_line1',
      type: 'line',
      attrs: { coordinates: [s1, e1] },
      styles: stroke
    })
    if (hasOffset) {
      figures.push({
        key: 'pc_line2',
        type: 'line',
        attrs: { coordinates: [s2, e2] },
        styles: stroke
      })
    }

    // Median line — TradingView's coeff-0.5 level, dashed by default.
    const showMedian = ext.showMedianLine !== false
    if (hasOffset && showMedian && Math.abs(offset) > 1e-10) {
      const half = offset * 0.5
      const medianStyle = ext.medianLineStyle ?? 'dashed'
      figures.push({
        key: 'pc_median',
        type: 'line',
        attrs: {
          coordinates: [
            { x: s1.x, y: s1.y + half },
            { x: e1.x, y: e1.y + half }
          ]
        },
        styles: {
          color: ext.medianLineColor ?? stroke.color,
          size: ext.medianLineWidth ?? Math.max(1, stroke.size - 1),
          style: medianStyle === 'solid' ? 'solid' : 'dashed',
          dashedValue: medianStyle === 'dotted' ? [2, 4] : [6, 4]
        },
        ignoreEvent: true
      })
    }

    // Corner positions of the second edge — the pinned third anchor renders
    // on the left corner; the right corner is a dedicated handle.
    const cornerC: Coordinate = { x: c0.x, y: c0.y + offset }
    const cornerH: Coordinate = { x: c1.x, y: c1.y + offset }

    // Price labels at all four corners (TradingView `showPrices`).
    if (ext.showPrices === true || ext.showPriceLabels === true || ext.showPriceLabel === true) {
      const points = overlay.points
      const p0 = isValid(points[0]) ? points[0] : {}
      const p1 = isValid(points[1]) ? points[1] : {}
      const p2 = isValid(points[2]) ? points[2] : {}
      pushSidePriceLabel(figures, 'pc_price0', c0, p0.value, 'left', stroke.color, precision)
      pushSidePriceLabel(figures, 'pc_price1', c1, p1.value, 'right', stroke.color, precision)
      if (hasOffset) {
        pushSidePriceLabel(figures, 'pc_price2', cornerC, p2.value, 'left', stroke.color, precision)
        const hPoint = coordinateToPoint(chart, overlay.paneId, cornerH)
        pushSidePriceLabel(figures, 'pc_price3', cornerH, isValid(hPoint) ? hPoint.value : undefined, 'right', stroke.color, precision)
      }
    }

    // Anchors at the stored points — the pinned third anchor sits on the
    // second edge's left corner.
    const anchorCoords = hasOffset ? [c0, c1, cornerC] : coordinates
    const resizeCursor = computeResizeCursor(c0, c1)
    figures.push(...createAnchorFigures({
      coordinates: anchorCoords,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      cursors: [resizeCursor, resizeCursor, 'pointer']
    }))

    // Auxiliary handles: right corner of edge 2 + both edge midpoints —
    // only for an interactive (visible, unlocked, finished) overlay.
    const interactive = !overlay.lock && !overlay.isDrawing() &&
      ((isSelected ?? false) || (isHovered ?? false))
    if (interactive && hasOffset && Math.abs(offset) > 1e-10) {
      figures.push(channelHandleFigure('pc_corner', cornerH, {
        pointIndex: 1,
        cursor: resizeCursor,
        isTouch
      }))
      // TV drops the mid handles for a vertical baseline (p0.index === p1.index).
      if (Math.abs(c1.x - c0.x) > 1e-10) {
        figures.push(channelHandleFigure('pc_mid1', {
          x: (c0.x + c1.x) / 2,
          y: (c0.y + c1.y) / 2
        }, {
          pointIndex: 0,
          moveDirection: 'vert',
          cursor: 'ns-resize',
          isTouch
        }))
        figures.push(channelHandleFigure('pc_mid2', {
          x: (cornerC.x + cornerH.x) / 2,
          y: (cornerC.y + cornerH.y) / 2
        }, {
          pointIndex: 2,
          moveDirection: 'vert',
          cursor: 'ns-resize',
          isTouch
        }))
      }
    }

    return figures
  },

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: ParallelChannelExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    pushChannelXAxisPills(figures, 'pc', coordinates, overlay.points, channelStrokeOf(overlay, chart, ext).color)
    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: ParallelChannelExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    pushChannelYAxisPills(
      figures,
      'pc',
      coordinates,
      overlay.points,
      channelStrokeOf(overlay, chart, ext).color,
      pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision),
      bounding,
      yAxis
    )
    return figures
  },

  performEventPressedMove: function (this: Overlay<ParallelChannelExtendData>, params) {
    const points = params.points
    const index = params.performPointIndex
    const key = params.figureKey
    const event = params.event
    const chart = lineChartOf(this)

    // Gesture-start pixel geometry: `a` is the channel pixel height the
    // drags preserve (TradingView `_coordOffsetWhileMovingOrChanging`).
    const prev0 = isValid(params.prevPoints[0]) ? params.prevPoints[0] : {}
    const prev1 = isValid(params.prevPoints[1]) ? params.prevPoints[1] : {}
    const prev2 = isValid(params.prevPoints[2]) ? params.prevPoints[2] : {}
    const px0 = chart !== undefined ? pointToCoordinate(chart, this.paneId, prev0) : null
    const px1 = chart !== undefined ? pointToCoordinate(chart, this.paneId, prev1) : null
    const px2 = chart !== undefined ? pointToCoordinate(chart, this.paneId, prev2) : null
    const hasGesture = px0 !== null && px1 !== null && px2 !== null
    const offsetPx = hasGesture ? px2.y - px0.y : 0

    const valueAtPixelY = (x: number, y: number): number | undefined => {
      if (chart === undefined) {
        return undefined
      }
      const point = coordinateToPoint(chart, this.paneId, { x, y })
      return isValid(point) ? point.value : undefined
    }

    if (key === 'pc_mid1' || key === 'pc_mid2') {
      // Edge-midpoint drag — TradingView VerticalResize handles: move this
      // edge perpendicular to the baseline while the opposite edge stays
      // fixed. `n` is the cursor's vertical distance from the gesture-start
      // baseline measured at the cursor x.
      if (event === undefined || !isNumber(event.x) || !isNumber(event.y) || !hasGesture) {
        return
      }
      const baseY = Math.abs(px1.x - px0.x) > 1e-10
        ? getLinearYFromCoordinates(px0, px1, { x: event.x, y: event.y })
        : px0.y
      const n = event.y - baseY
      const p0 = points[0]
      const p1 = points[1]
      const p2 = points[2]
      if (key === 'pc_mid1') {
        const v0 = valueAtPixelY(event.x, px0.y + n)
        const v1 = valueAtPixelY(event.x, px1.y + n)
        if (isValid(p0) && isNumber(v0)) {
          p0.value = v0
        }
        if (isValid(p1) && isNumber(v1)) {
          p1.value = v1
        }
      } else {
        const v2 = valueAtPixelY(event.x, px0.y + n)
        if (isValid(p2) && isNumber(v2)) {
          p2.value = v2
        }
      }
      return
    }

    if (key === 'pc_corner') {
      // Second-edge right corner — drags P2 while the channel pixel height
      // stays `a`: p1.value is the price `a` px above the cursor.
      if (event !== undefined && isNumber(event.x) && isNumber(event.y) && hasGesture) {
        const v = valueAtPixelY(event.x, event.y - offsetPx)
        if (isValid(points[1]) && isNumber(v)) {
          points[1].value = v
        }
      }
      return
    }

    if (index === 0) {
      // P0 drag — keep the channel pixel height, pin the offset point's
      // index to P0 (TradingView setPoint case 0).
      if (isValid(points[0]) && isValid(points[2])) {
        points[2].dataIndex = points[0].dataIndex
        points[2].timestamp = points[0].timestamp
        if (event !== undefined && isNumber(event.x) && isNumber(event.y) && hasGesture) {
          const v = valueAtPixelY(event.x, event.y + offsetPx)
          if (isNumber(v)) {
            points[2].value = v
          }
        }
      }
      return
    }

    if (index === 2) {
      if (key === 'anchor_2') {
        // Second-edge left corner — the kernel wrote P3 = cursor; move P0's
        // index with it and keep the height (TradingView setPoint case 2).
        const p2 = points[2]
        if (isValid(p2) && isValid(points[0])) {
          points[0].dataIndex = p2.dataIndex
          points[0].timestamp = p2.timestamp
          if (event !== undefined && isNumber(event.x) && isNumber(event.y) && hasGesture) {
            const v = valueAtPixelY(event.x, event.y - offsetPx)
            if (isNumber(v)) {
              points[0].value = v
            }
          }
        }
      } else {
        // Draw-complete replay / API-driven write — normalize the stored
        // offset point into the pinned slot (P3 keeps only its price).
        pinPointIndex(points, 2, 0)
      }
      return
    }

    if (index === 1) {
      applySnap45(this, params, 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<ParallelChannelExtendData>, params) {
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
    if (params.performPointIndex === 2) {
      // TradingView pins the offset point to the baseline start index
      // (`_correctLastPoint`) — only its price is meaningful.
      pinPointIndex(params.points, 2, 0)
    }
  }
}

export default parallelStraightLine
