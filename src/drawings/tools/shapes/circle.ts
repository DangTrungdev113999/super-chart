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
import type Point from '../../../common/Point'

import { isValid } from '../../../common/utils/typeChecks'
import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import {
  alphaColor,
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  pricePrecisionOf
} from '../lines/lineCommon'

import {
  coordinateToPoint,
  MIN_RADIUS_PX,
  pointToCoordinate,
  rememberShapeChart,
  shapeChartOf,
  shapeFillColor,
  shapeFillEnabled,
  shapeLabelSpecOf,
  shapeStrokeOf,
  shapeTextFigure,
  translatePointByPixelDelta
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'circle' — TradingView Circle. Center + edge anchors; radius is the
 * Euclidean distance between them (inherently square — Shift needs no
 * constraint). Kernel feature set preserved: fill + border, inscribed
 * text, selection-driven axis diameter strips with pills. Improvements
 * over the kernel original: anchors via `createAnchorFigures` (locked
 * outline, touch sizing, in-progress suppression for free) and a
 * pixel-exact center drag (the kernel's value-delta translate drifted on
 * log axes).
 */

// Pills + strips always use TV blue, regardless of shape color.
const AXIS_PILL_COLOR = '#2962FF'

/**
 * Re-snap the edge anchor so it carries the CENTER's pixel delta — keeps
 * radius = |edge − center| exact on log/percentage axes where a shared
 * Δvalue translates non-uniformly in pixels.
 */
function snapEdgeToCenterPixelDelta (overlay: Overlay<ShapeExtendData>, prevPoints: Array<Partial<Point>>, nowPoints: Overlay<ShapeExtendData>['points']): void {
  const chart = shapeChartOf(overlay)
  if (chart === undefined) {
    return
  }
  const prevCenter = pointToCoordinate(chart, overlay.paneId, isValid(prevPoints[0]) ? prevPoints[0] : {})
  const prevEdge = pointToCoordinate(chart, overlay.paneId, isValid(prevPoints[1]) ? prevPoints[1] : {})
  const nowCenter = pointToCoordinate(chart, overlay.paneId, isValid(nowPoints[0]) ? nowPoints[0] : {})
  const target = nowPoints[1]
  if (prevCenter === null || prevEdge === null || nowCenter === null || !isValid(target)) {
    return
  }
  translatePointByPixelDelta(
    chart,
    overlay.paneId,
    target,
    prevEdge,
    nowCenter.x - prevCenter.x,
    nowCenter.y - prevCenter.y
  )
}

const circle: OverlayTemplate<ShapeExtendData> = {
  name: 'circle',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    rememberShapeChart(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const [center, edge] = coordinates
    const radius = Math.max(Math.hypot(edge.x - center.x, edge.y - center.y), MIN_RADIUS_PX)

    const stroke = shapeStrokeOf(overlay, chart, ext, 'circle')
    const fillOn = shapeFillEnabled(ext)
    const fillColor = shapeFillColor(overlay, ext, stroke.color, 'circle')

    const figures: OverlayFigure[] = [
      // Fill carries the interior hit-test — body drag requires it stay
      // interactive (no ignoreEvent).
      {
        key: 'circle_fill',
        type: 'circle',
        attrs: { x: center.x, y: center.y, r: radius },
        styles: {
          style: 'fill',
          color: fillOn ? fillColor : 'transparent'
        }
      },
      {
        key: 'circle_border',
        type: 'circle',
        attrs: { x: center.x, y: center.y, r: radius },
        styles: {
          style: 'stroke',
          borderColor: stroke.color,
          borderSize: stroke.size,
          borderStyle: stroke.style,
          borderDashedValue: stroke.dashedValue
        }
      }
    ]

    // Inscribed-square text clip (side = r·√2 — largest rect in circle).
    const spec = shapeLabelSpecOf(ext)
    if (spec !== null) {
      const wrap = (radius * Math.SQRT2) / 2
      figures.push(shapeTextFigure('circle_text', spec, {
        left: center.x - wrap,
        top: center.y - wrap,
        right: center.x + wrap,
        bottom: center.y + wrap
      }, stroke.color))
    }

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      shape: 'circle',
      cursors: ['move', computeResizeCursor(center, edge)]
    }))

    return figures
  },

  performEventPressedMove: function (this: Overlay<ShapeExtendData>, params) {
    // anchor_0 = center: translate the edge anchor by the center's exact
    // pixel delta so the radius is preserved on any axis scale.
    if (params.figureKey !== 'anchor_0') {
      return
    }
    snapEdgeToCenterPixelDelta(this, params.prevPoints, params.points)
  },

  performEventBodyMove: function (this: Overlay<ShapeExtendData>, params) {
    // Body drags translate every stored point by a constant Δvalue — on
    // log/percentage axes equal value-delta ≠ equal pixel-delta, so the
    // radius visibly warps mid-drag. Re-snap the edge to the center's
    // pixel delta to hold the radius invariant.
    snapEdgeToCenterPixelDelta(this, params.prevPoints, params.points)
  },

  // ─── X axis: diameter strip + edge pills while selected/hovered ───
  createXAxisFigures: ({ chart, overlay, coordinates, bounding, isSelected, isHovered }) => {
    if (coordinates.length < 2) {
      return []
    }
    if (isSelected !== true && isHovered !== true) {
      return []
    }
    const [center, edge] = coordinates
    const radius = Math.max(Math.hypot(edge.x - center.x, edge.y - center.y), MIN_RADIUS_PX)
    const leftX = center.x - radius
    const rightX = center.x + radius
    const stripWidth = rightX - leftX

    const leftPoint = coordinateToPoint(chart, overlay.paneId, { x: leftX, y: 0 })
    const rightPoint = coordinateToPoint(chart, overlay.paneId, { x: rightX, y: 0 })
    const leftTs = leftPoint?.timestamp
    const rightTs = rightPoint?.timestamp

    const figs: OverlayFigure[] = []
    if (stripWidth > 0) {
      figs.push({
        key: 'circle_xstrip',
        type: 'rect',
        attrs: { x: leftX, y: 0, width: stripWidth, height: bounding.height },
        styles: { style: 'fill', color: alphaColor(AXIS_PILL_COLOR, 0.2) },
        ignoreEvent: true
      })
    }
    const dLeft = formatDate(leftTs)
    const dRight = formatDate(rightTs)
    if (dLeft !== '') {
      figs.push(buildXAxisPill(leftX, dLeft, AXIS_PILL_COLOR, 'circle_x0'))
    }
    if (dRight !== '' && rightX !== leftX) {
      figs.push(buildXAxisPill(rightX, dRight, AXIS_PILL_COLOR, 'circle_x1'))
    }
    return figs
  },

  // ─── Y axis: diameter strip + edge pills while selected/hovered ───
  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered }) => {
    if (coordinates.length < 2) {
      return []
    }
    if (isSelected !== true && isHovered !== true) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    const [center, edge] = coordinates
    const radius = Math.max(Math.hypot(edge.x - center.x, edge.y - center.y), MIN_RADIUS_PX)
    const topY = center.y - radius
    const bottomY = center.y + radius
    const stripHeight = bottomY - topY

    const topPoint = coordinateToPoint(chart, overlay.paneId, { x: 0, y: topY })
    const botPoint = coordinateToPoint(chart, overlay.paneId, { x: 0, y: bottomY })
    const topVal = topPoint?.value
    const bottomVal = botPoint?.value

    const figs: OverlayFigure[] = []
    if (stripHeight > 0) {
      figs.push({
        key: 'circle_ystrip',
        type: 'rect',
        attrs: { x: 0, y: topY, width: bounding.width, height: stripHeight },
        styles: { style: 'fill', color: alphaColor(AXIS_PILL_COLOR, 0.2) },
        ignoreEvent: true
      })
    }
    const pillTop = buildYAxisPill(topY, topVal, AXIS_PILL_COLOR, precision, bounding, yAxis ?? undefined, 'circle_y0')
    if (pillTop != null) {
      figs.push(pillTop)
    }
    if (bottomY !== topY) {
      const pillBot = buildYAxisPill(bottomY, bottomVal, AXIS_PILL_COLOR, precision, bounding, yAxis ?? undefined, 'circle_y1')
      if (pillBot != null) {
        figs.push(pillBot)
      }
    }
    return figs
  }
}

export default circle
