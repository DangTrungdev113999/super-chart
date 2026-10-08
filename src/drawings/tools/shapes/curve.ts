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
import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  coordinateToPoint,
  lineStyleOverrides,
  pointToCoordinate,
  quadControlOffset,
  rememberShapeChart,
  sampleQuadratic,
  shapeHandleFigure
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'curve' — TradingView Curve (TV's BezierQuadro): two CLICKS for the
 * endpoints; a Bezier control point generates automatically at
 * mid(P1,P2) + 0.15·len perpendicular and is written into points[2] by
 * onDrawing (kept in sync on every draw move so preview and committed
 * data match — TV pushes its control through addPoint the same way).
 *
 * Unlike 'arc', the third anchor is OFF-curve — a true quadratic-Bezier
 * control point, so dragging it bends the stroke without pinning it to
 * the curve. Overlays restored with only the 2 endpoints regenerate the
 * control on the fly and expose a lazy handle (kernel pads points[] on
 * first drag).
 */

const CURVE_SEGMENTS = 40

const curve: OverlayTemplate<ShapeExtendData> = {
  name: 'curve',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    rememberShapeChart(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = lineStyleOverrides(overlay, chart, {
      lineColor: ext.color ?? ext.lineColor,
      lineWidth: ext.lineWidth,
      lineStyle: ext.lineStyle
    })

    const [p1, p2] = coordinates
    // Stored control wins; a 2-point overlay (pre-expansion draw frame or
    // legacy restore) falls back to the generated one.
    const control = coordinates.length >= 3 ? coordinates[2] : quadControlOffset(p1, p2)

    const figures: OverlayFigure[] = [{
      key: 'curve_line',
      type: 'line',
      attrs: { coordinates: sampleQuadratic(p1, control, p2, CURVE_SEGMENTS) },
      styles: {
        style: stroke.style,
        color: stroke.color,
        size: stroke.size,
        dashedValue: stroke.dashedValue
      }
    }]

    const drawing = overlay.isDrawing()
    if (drawing || (isSelected !== true && isHovered !== true) || overlay.lock) {
      // While drawing only the two endpoints exist semantically — slice
      // so in-progress tail suppression hits the live endpoint. Locked →
      // factory outline over every stored coordinate.
      figures.push(...createAnchorFigures({
        coordinates: overlay.lock ? coordinates : coordinates.slice(0, 2),
        isSelected,
        isHovered,
        isDrawing: drawing,
        lock: overlay.lock,
        isTouch
      }))
    } else {
      figures.push(...createAnchorFigures({
        coordinates: coordinates.slice(0, 2),
        isSelected,
        isHovered,
        isDrawing: false,
        lock: false,
        isTouch,
        cursors: [computeResizeCursor(p1, p2), computeResizeCursor(p2, p1)]
      }))
      // Bezier control handle — carries pointIndex 2 even when the slot
      // was never persisted (kernel pads points[] on first drag).
      figures.push(shapeHandleFigure('curve_c', control, { pointIndex: 2, cursor: 'move', isTouch }))
    }

    return figures
  }),

  onDrawing: ({ chart, overlay }) => {
    // Second slot live (click-2 or its move-preview): sync the generated
    // control slot so the hover preview and the committed points agree.
    if (overlay.currentStep !== 2 || overlay.points.length < 2) {
      return
    }
    const c1 = pointToCoordinate(chart, overlay.paneId, overlay.points[0])
    const c2 = pointToCoordinate(chart, overlay.paneId, overlay.points[1])
    if (c1 === null || c2 === null) {
      return
    }
    const gc = coordinateToPoint(chart, overlay.paneId, quadControlOffset(c1, c2))
    if (gc !== null) {
      overlay.points[2] = gc
    }
  }
}

export default curve
