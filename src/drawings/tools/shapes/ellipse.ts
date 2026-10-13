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

import type { Chart } from '../../../Chart'
import type Coordinate from '../../../common/Coordinate'
import type Point from '../../../common/Point'
import { isString, isValid } from '../../../common/utils/typeChecks'
import { computeResizeCursor, createAnchorFigures, createSelectionOutlineFigures } from '../../interaction/anchors'
import { isSnap45Active } from '../../interaction/snap45'
import {
  alphaColor,
  applySnap45,
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  pricePrecisionOf
} from '../lines/lineCommon'

import {
  coordinateToPoint,
  edgeFrameOf,
  hiddenAtPeriod,
  pointToCoordinate,
  rememberShapeChart,
  sampleRotatedEllipsePolygon,
  shapeChartOf,
  shapeFillColor,
  shapeFillEnabled,
  shapeHandleFigure,
  shapeLabelSpecOf,
  shapeStrokeOf,
  shapeTextFigure,
  shapeTextPlaceholderFigure,
  signedLineDistance
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'ellipse' — TradingView Ellipse (3 points). P1→P2 is the ellipse's
 * diameter along the drawn direction — NOT a bounding-box corner pair:
 * the ellipse is centered at mid(P1,P2), rotated by the edge angle with
 * semi-axis |P1P2|/2 along the edge and perpendicular semi-axis = P3's
 * unsigned distance to the P1P2 line (TradingView translate/rotate/
 * scale parity, 64-sample polygon). A perpendicular distance < 1 px
 * renders the bare chord — TV's degenerate fallback. Kernel feature set
 * preserved: fill + border, inscribed text rotated by the edge angle
 * (+ "+ Add text" placeholder), per-period visibility gate, and
 * selection-driven axis strips over the rotated AABB. Snap improvements
 * (TradingView snapTo45DegreesAvailable parity): Shift → 45° diameter
 * while drawing and Shift → circle (radius = half the diameter) on both
 * the third point and endpoint drags.
 */

// Pills + strips always use TV blue, regardless of shape color.
const AXIS_PILL_COLOR = '#2962FF'

const ellipse: OverlayTemplate<ShapeExtendData> = {
  name: 'ellipse',
  totalStep: 4,
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

    // Per-period visibility gate (kernel parity — fails open).
    if (hiddenAtPeriod(ext, chart.getPeriod())) {
      return []
    }

    const [p1, p2] = coordinates
    const frame = edgeFrameOf(p1, p2)
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    const hasRadius = coordinates.length >= 3 && frame !== null
    const major = frame?.len ?? 0
    const minor = hasRadius ? Math.abs(signedLineDistance(p1, p2, coordinates[2])) : 0

    const stroke = shapeStrokeOf(overlay, chart, ext, 'circle')
    const fillOn = shapeFillEnabled(ext)
    const fillColor = shapeFillColor(overlay, ext, stroke.color, 'circle')

    const figures: OverlayFigure[] = []

    if (!hasRadius || minor < 1) {
      // Chord preview — TV draws the bare P1→P2 line until the radius
      // point exists and its distance clears 1 px.
      figures.push({
        key: 'ellipse_chord',
        type: 'line',
        attrs: { coordinates: [p1, p2] },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        }
      })
    } else {
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      figures.push({
        key: 'ellipse_body',
        type: 'polygon',
        attrs: { coordinates: sampleRotatedEllipsePolygon(mid.x, mid.y, major / 2, minor, angle, 64) },
        styles: {
          style: 'stroke_fill',
          color: fillOn ? fillColor : 'transparent',
          borderColor: stroke.color,
          borderSize: stroke.size,
          borderStyle: stroke.style,
          borderDashedValue: stroke.dashedValue
        }
      })

      // Inscribed-rect text (half-axes a/√2, b/√2), rotated by the edge
      // angle — TradingView `angle: atan(slope)` parity.
      const spec = shapeLabelSpecOf(ext)
      const inscribedBox = {
        left: mid.x - major / (2 * Math.SQRT2),
        top: mid.y - minor / Math.SQRT2,
        right: mid.x + major / (2 * Math.SQRT2),
        bottom: mid.y + minor / Math.SQRT2
      }
      const textAngle = Math.atan((p1.y - p2.y) / (p1.x - p2.x))
      if (spec !== null) {
        figures.push(shapeTextFigure('ellipse_text', spec, inscribedBox, stroke.color, textAngle))
      } else if (
        ext.isEditing !== true &&
        (!isString(ext.text) || ext.text === '') &&
        ((isSelected ?? false) || (isHovered ?? false)) &&
        // Kernel gate: the placeholder appears only when the text tab is on.
        ext.textEnabled === true
      ) {
        figures.push(shapeTextPlaceholderFigure('ellipse_text_ph', inscribedBox, stroke.color, textAngle))
      }
    }

    // ─── Handles (selected/hovered; locked → outline) ───
    if (overlay.lock) {
      if (isSelected === true) {
        // Locked selection outline at the TV anchor positions — the two
        // stored diameter endpoints plus both perpendicular apexes (the
        // stored coords when the edge is degenerate).
        const outline = hasRadius
          ? [
              p1,
              p2,
              { x: mid.x + frame.nx * minor, y: mid.y + frame.ny * minor },
              { x: mid.x - frame.nx * minor, y: mid.y - frame.ny * minor }
            ]
          : coordinates
        figures.push(...createSelectionOutlineFigures({ coordinates: outline, isTouch }))
      }
    } else if (((isSelected ?? false) || (isHovered ?? false)) && !overlay.isDrawing()) {
      if (hasRadius) {
        // TV anchor set: P1(0), P2(1) at the diameter endpoints, then the
        // two perpendicular apexes. TV routes the +apex to pointIndex 2
        // and the −apex to a virtual index 3 that shares the same
        // setPoint branch — the kernel would append a stray point for
        // index 3, so both apexes drive index 2 (same write path).
        const apexP = { x: mid.x + frame.nx * minor, y: mid.y + frame.ny * minor }
        const apexM = { x: mid.x - frame.nx * minor, y: mid.y - frame.ny * minor }
        const perpCursor = computeResizeCursor(apexM, apexP)
        figures.push(shapeHandleFigure('ellipse_p1', p1, { pointIndex: 0, cursor: 'pointer', isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('ellipse_p2', p2, { pointIndex: 1, cursor: 'pointer', isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('ellipse_a1', apexP, { pointIndex: 2, cursor: perpCursor, isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('ellipse_a2', apexM, { pointIndex: 2, cursor: perpCursor, isTouch, shape: 'circle' }))
      } else {
        // Legacy 2-point data or a degenerate diameter — stored-point
        // anchors only.
        figures.push(...createAnchorFigures({
          coordinates,
          isSelected,
          isHovered,
          isDrawing: false,
          lock: false,
          isTouch
        }))
      }
    }

    // Factory anchors while drawing (in-progress point suppression is
    // built in).
    if (overlay.isDrawing()) {
      figures.push(...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isDrawing: true,
        lock: false,
        isTouch
      }))
    }

    return figures
  },

  performEventMoveForDrawing: function (this: Overlay<ShapeExtendData>, params) {
    if (params.performPointIndex === 1) {
      // Shift while placing the diameter endpoint → 45° ray.
      applySnap45(this, params, 0)
      return
    }
    if (params.performPointIndex !== 2 || params.event === undefined) {
      return
    }
    // Shift while placing the radius point → circle: the radius snaps to
    // half the diameter (TradingView `_calcPoint2` default under snap-45).
    const chart = shapeChartOf(this)
    if (chart === undefined || !isSnap45Active(chart, params.event)) {
      return
    }
    const paneId = this.paneId
    const c0 = pointToCoordinate(chart, paneId, params.points[0] ?? {})
    const c1 = pointToCoordinate(chart, paneId, params.points[1] ?? {})
    if (c0 === null || c1 === null) {
      return
    }
    const frame = edgeFrameOf(c0, c1)
    const target = params.points[2]
    if (frame === null || !isValid(target)) {
      return
    }
    const point = coordinateToPoint(chart, paneId, {
      x: (c0.x + c1.x) / 2 + frame.nx * (frame.len / 2),
      y: (c0.y + c1.y) / 2 + frame.ny * (frame.len / 2)
    })
    if (point === null) {
      return
    }
    target.timestamp = point.timestamp
    target.dataIndex = point.dataIndex
    target.value = point.value
  },

  performEventPressedMove: function (this: Overlay<ShapeExtendData>, params) {
    // Replayed restores (event === undefined) keep the stored point.
    if (params.event === undefined || params.points.length < 3) {
      return
    }
    const chart = shapeChartOf(this)
    if (chart === undefined) {
      return
    }
    const paneId = this.paneId
    const mpi = params.performPointIndex

    if (mpi === 0 || mpi === 1) {
      // Diameter endpoint: Shift snaps it to 45° first; the radius point
      // is then rebuilt at mid′ + n̂′·r — r = the gesture-start distance
      // (TradingView `_radius2`), or half the new diameter when snapped
      // (TV `_calcPoint2` default → circle).
      applySnap45(this, params, 1 - mpi)
      const c0 = pointToCoordinate(chart, paneId, params.points[0] ?? {})
      const c1 = pointToCoordinate(chart, paneId, params.points[1] ?? {})
      if (c0 === null || c1 === null) {
        return
      }
      const frame = edgeFrameOf(c0, c1)
      if (frame === null) {
        return
      }
      let radius = frame.len / 2
      if (!isSnap45Active(chart, params.event)) {
        const prev = params.prevPoints
        if (prev.length < 3) {
          return
        }
        const p0 = pointToCoordinate(chart, paneId, isValid(prev[0]) ? prev[0] : {})
        const p1 = pointToCoordinate(chart, paneId, isValid(prev[1]) ? prev[1] : {})
        const p2 = pointToCoordinate(chart, paneId, isValid(prev[2]) ? prev[2] : {})
        if (p0 === null || p1 === null || p2 === null) {
          return
        }
        radius = Math.abs(signedLineDistance(p0, p1, p2))
      }
      writeRadiusPoint(chart, paneId, params.points[2], c0, c1, frame, radius)
      return
    }

    if (mpi === 2) {
      // Apex handle: the cursor's perpendicular distance sets the minor
      // radius; the point is written back onto the mid-perpendicular on
      // the +left-normal side (TradingView setPoint case 2/3 — both
      // handles write mid + n̂·unsignedDistance).
      const c0 = pointToCoordinate(chart, paneId, params.points[0] ?? {})
      const c1 = pointToCoordinate(chart, paneId, params.points[1] ?? {})
      const c2 = pointToCoordinate(chart, paneId, params.points[2] ?? {})
      if (c0 === null || c1 === null || c2 === null) {
        return
      }
      const frame = edgeFrameOf(c0, c1)
      if (frame === null) {
        return
      }
      const radius = Math.abs((c2.x - c0.x) * frame.nx + (c2.y - c0.y) * frame.ny)
      writeRadiusPoint(chart, paneId, params.points[2], c0, c1, frame, radius)
    }
  },

  // ─── X axis: rotated-AABB strip + edge pills while selected/hovered ───
  createXAxisFigures: ({ chart, overlay, coordinates, bounding, isSelected, isHovered }) => {
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    if (hiddenAtPeriod(ext, chart.getPeriod())) {
      return []
    }
    if (isSelected !== true && isHovered !== true) {
      return []
    }
    const [p1, p2] = coordinates
    const frame = edgeFrameOf(p1, p2)
    const minor = coordinates.length >= 3 ? Math.abs(signedLineDistance(p1, p2, coordinates[2])) : 0
    const midX = (p1.x + p2.x) / 2
    const a = (frame?.len ?? 0) / 2
    const cos = frame?.ux ?? 1
    const sin = frame?.uy ?? 0
    const hx = Math.sqrt(a * a * cos * cos + minor * minor * sin * sin)
    const leftX = midX - hx
    const rightX = midX + hx
    const stripWidth = rightX - leftX

    const figs: OverlayFigure[] = []
    if (stripWidth > 0) {
      figs.push({
        key: 'ellipse_xstrip',
        type: 'rect',
        attrs: { x: leftX, y: 0, width: stripWidth, height: bounding.height },
        styles: { style: 'fill', color: alphaColor(AXIS_PILL_COLOR, 0.2) }
      })
    }
    // Pill labels come from the AABB edge positions — converted back to
    // bar time since the rotated extremes aren't stored points.
    const leftPoint = coordinateToPoint(chart, overlay.paneId, { x: leftX, y: 0 })
    const rightPoint = coordinateToPoint(chart, overlay.paneId, { x: rightX, y: 0 })
    const dLeft = formatDate(leftPoint?.timestamp)
    const dRight = formatDate(rightPoint?.timestamp)
    if (dLeft !== '') {
      figs.push(buildXAxisPill(leftX, dLeft, AXIS_PILL_COLOR, 'ellipse_x0'))
    }
    if (dRight !== '' && rightX !== leftX) {
      figs.push(buildXAxisPill(rightX, dRight, AXIS_PILL_COLOR, 'ellipse_x1'))
    }
    return figs
  },

  // ─── Y axis: rotated-AABB strip + edge pills while selected/hovered ───
  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered }) => {
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    if (hiddenAtPeriod(ext, chart.getPeriod())) {
      return []
    }
    if (isSelected !== true && isHovered !== true) {
      return []
    }
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    const [p1, p2] = coordinates
    const frame = edgeFrameOf(p1, p2)
    const minor = coordinates.length >= 3 ? Math.abs(signedLineDistance(p1, p2, coordinates[2])) : 0
    const midY = (p1.y + p2.y) / 2
    const a = (frame?.len ?? 0) / 2
    const cos = frame?.ux ?? 1
    const sin = frame?.uy ?? 0
    const hy = Math.sqrt(a * a * sin * sin + minor * minor * cos * cos)
    const topY = midY - hy
    const bottomY = midY + hy
    const stripHeight = bottomY - topY

    const figs: OverlayFigure[] = []
    if (stripHeight > 0) {
      figs.push({
        key: 'ellipse_ystrip',
        type: 'rect',
        attrs: { x: 0, y: topY, width: bounding.width, height: stripHeight },
        styles: { style: 'fill', color: alphaColor(AXIS_PILL_COLOR, 0.2) }
      })
    }
    const topPoint = coordinateToPoint(chart, overlay.paneId, { x: 0, y: topY })
    const bottomPoint = coordinateToPoint(chart, overlay.paneId, { x: 0, y: bottomY })
    const pillTop = buildYAxisPill(topY, topPoint?.value, AXIS_PILL_COLOR, precision, bounding, yAxis ?? undefined, 'ellipse_y0')
    if (pillTop != null) {
      figs.push(pillTop)
    }
    if (bottomY !== topY) {
      const pillBot = buildYAxisPill(bottomY, bottomPoint?.value, AXIS_PILL_COLOR, precision, bounding, yAxis ?? undefined, 'ellipse_y1')
      if (pillBot != null) {
        figs.push(pillBot)
      }
    }
    return figs
  }
}

/**
 * Write `mid(c0,c1) + n̂·radius` (pixel space) back into `target` as data
 * coordinates — the shared tail of both radius-point rewrites.
 */
function writeRadiusPoint (
  chart: Chart,
  paneId: string,
  target: Partial<Point> | undefined,
  c0: Coordinate,
  c1: Coordinate,
  frame: { nx: number, ny: number },
  radius: number
): void {
  if (!isValid(target)) {
    return
  }
  const point = coordinateToPoint(chart, paneId, {
    x: (c0.x + c1.x) / 2 + frame.nx * radius,
    y: (c0.y + c1.y) / 2 + frame.ny * radius
  })
  if (point === null) {
    return
  }
  target.timestamp = point.timestamp
  target.dataIndex = point.dataIndex
  target.value = point.value
}

export default ellipse
