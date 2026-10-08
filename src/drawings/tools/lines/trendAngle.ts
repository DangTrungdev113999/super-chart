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
import type {
  Overlay,
  OverlayFigure,
  OverlayPerformEventParams,
  OverlayTemplate
} from '../../../component/Overlay'

import { isArray, isNumber, isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures, computeResizeCursor } from '../../interaction/anchors'
import {
  applySnap45,
  buildXAxisBandFigures,
  buildYAxisBandFigures,
  formatNum,
  getExtendedCoordinates,
  labelSpecOf,
  layoutDiagonalLabel,
  lineChartOf,
  lineColorOf,
  lineStyleOverrides,
  pricePrecisionOf,
  pushLineWithGap,
  pushSidePriceLabel,
  rememberLineChart
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'trendAngle' — TradingView Trend Angle. Two anchors; renders the main
 * line plus a dashed angle arc at P1, the degree label, and optional
 * horizontal baselines. TradingView stores the pixel-space angle/distance
 * (`_angle`/`_distance`) — mirrored here as `extendData.angle` (radians)
 * and `extendData.distance` (px): dragging P1 preserves the measured angle,
 * dragging P2 re-measures it.
 */

export interface TrendAngleExtendData extends LineExtendData {}

const BASELINE_COLOR = '#787B86'
const ARC_RADIUS = 30
const LABEL_OFFSET = 45

/** Recompute screen-space angle/distance into `extendData`. */
function measureAngle (overlay: Overlay<TrendAngleExtendData>, params: OverlayPerformEventParams): void {
  const chart = lineChartOf(overlay)
  if (chart === undefined || params.points.length < 2) {
    return
  }
  const converted = chart.convertToPixel(params.points, { paneId: overlay.paneId })
  if (!isArray(converted)) {
    return
  }
  const pc1 = converted[0]
  const pc2 = converted[1]
  if (!isValid(pc1) || !isValid(pc2) ||
    !isNumber(pc1.x) || !isNumber(pc1.y) || !isNumber(pc2.x) || !isNumber(pc2.y)) {
    return
  }
  const angle = Math.atan2(pc1.y - pc2.y, pc2.x - pc1.x)
  const dx = pc2.x - pc1.x
  const dy = pc2.y - pc1.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const ext: TrendAngleExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
  overlay.extendData = { ...ext, angle, distance }
  overlay.invalidateFigures()
}

const trendAngle: OverlayTemplate<TrendAngleExtendData> = {
  name: 'trendAngle',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: TrendAngleExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineStyles = lineStyleOverrides(overlay, chart, ext)

    const figures: OverlayFigure[] = []

    // ─── Stored angle (radians) + distance (px), TradingView parity.
    //     Absent → derive both from the raw anchors. ───
    const hasStored = isNumber(ext.angle) && isNumber(ext.distance) && ext.distance > 0
    const angleRad = hasStored && isNumber(ext.angle)
      ? ext.angle
      : Math.atan2(c1.y - c2.y, c2.x - c1.x)
    const distance = hasStored && isNumber(ext.distance)
      ? ext.distance
      : Math.sqrt((c2.x - c1.x) * (c2.x - c1.x) + (c2.y - c1.y) * (c2.y - c1.y))
    const c2r: Coordinate = hasStored
      ? { x: c1.x + Math.cos(angleRad) * distance, y: c1.y - Math.sin(angleRad) * distance }
      : c2
    const angleDeg = angleRad * (180 / Math.PI)

    // ─── Baselines (dashed): P1 → right edge, P2 → full width ───
    if (ext.showBaselines !== false) {
      const baselineStyle = { style: 'dashed', color: BASELINE_COLOR, size: 1, dashedValue: [4, 4] }
      figures.push({
        key: 'ta_baseline0',
        type: 'line',
        attrs: { coordinates: [c1, { x: bounding.width, y: c1.y }] },
        styles: baselineStyle,
        ignoreEvent: true
      })
      figures.push({
        key: 'ta_baseline1',
        type: 'line',
        attrs: { coordinates: [{ x: 0, y: c2r.y }, { x: bounding.width, y: c2r.y }] },
        styles: baselineStyle,
        ignoreEvent: true
      })
    }

    // ─── Main line (optional extension), gap when label sits on it ───
    const extendLeft = ext.extendLeft === true
    const extendRight = ext.extendRight === true
    let lineStart: Coordinate = { x: c1.x, y: c1.y }
    let lineEnd: Coordinate = { x: c2r.x, y: c2r.y }
    if (extendLeft || extendRight) {
      const [s, e] = getExtendedCoordinates(c1, c2r, bounding.width, bounding.height, extendLeft, extendRight)
      lineStart = s
      lineEnd = e
    }
    const spec = labelSpecOf(ext)
    const labelLayout = spec !== null
      ? layoutDiagonalLabel('ta_label', spec, lineStart, lineEnd, lineColor, lineStyles.size)
      : null
    pushLineWithGap(figures, 'ta', lineStart, lineEnd, labelLayout?.gap, lineStyles)
    if (labelLayout !== null) {
      figures.push(labelLayout.figure)
    }

    // ─── Angle arc at P1 (horizontal → line, counterclockwise = up) ───
    figures.push({
      key: 'ta_arc',
      type: 'arc',
      attrs: {
        x: c1.x,
        y: c1.y,
        r: ARC_RADIUS,
        startAngle: 0,
        endAngle: -angleRad
      },
      styles: {
        color: lineColor,
        size: 1,
        style: 'dashed',
        dashedValue: [2, 2]
      },
      ignoreEvent: true
    })

    // ─── Angle label on the arc bisector ───
    const half = angleRad / 2
    figures.push({
      key: 'ta_angle',
      type: 'text',
      attrs: {
        x: c1.x + LABEL_OFFSET * Math.cos(half),
        y: c1.y - LABEL_OFFSET * Math.sin(half),
        text: `${formatNum(angleDeg, 2)}°`,
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      styles: { color: lineColor, size: 12, weight: 'normal', backgroundColor: 'transparent' },
      ignoreEvent: true
    })

    // ─── Price labels beside the anchors (reference style) ───
    if (ext.showPriceLabel === true || ext.showPriceLabels === true) {
      pushSidePriceLabel(figures, 'ta_price0', c1, points[0]?.value, 'left', lineColor, precision)
      pushSidePriceLabel(figures, 'ta_price1', c2r, points[1]?.value, 'right', lineColor, precision)
    }

    // ─── Anchors at the rendered endpoints + optional midpoint ───
    const anchorCoords: Coordinate[] = [c1, c2r]
    const resizeCursor = computeResizeCursor(c1, c2r)
    figures.push(...createAnchorFigures({
      coordinates: anchorCoords,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      midPoint: ext.showMidpoint === true || ext.showMiddlePoint === true,
      cursors: [resizeCursor, resizeCursor]
    }))

    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: TrendAngleExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildYAxisBandFigures('ta', {
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
    const ext: TrendAngleExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildXAxisBandFigures('ta', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    })
  },

  performEventPressedMove: function (this: Overlay<TrendAngleExtendData>, params) {
    // Dragging the second anchor re-measures angle + distance (TV parity);
    // dragging P1 keeps the stored angle — the line translates rigidly.
    if (params.performPointIndex !== 1) {
      return
    }
    applySnap45(this, params, 0)
    measureAngle(this, params)
  },

  performEventMoveForDrawing: function (this: Overlay<TrendAngleExtendData>, params) {
    if (params.performPointIndex !== 1) {
      return
    }
    applySnap45(this, params, 0)
    measureAngle(this, params)
  }
}

export default trendAngle
