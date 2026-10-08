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
  rememberShapeChart,
  sampleCatmullRom4,
  sCurveIntermediates,
  shapeHandleFigure
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'doubleCurve' — TradingView Double Curve. Two CLICKS (endpoints), like
 * TV's line-tool-bezier-cubic.js: the second click generates two S-curve
 * intermediates
 *   A = P0 + ⅓·(P1−P0) + 0.25·len·perp
 *   B = P0 + ⅔·(P1−P0) − 0.25·len·perp
 * which onDrawing writes into points[2]/[3] (kept in sync on every draw
 * move so the hover preview and the committed data match — TV pushes the
 * generated controls through its own addPoint path the same way). The
 * finished overlay therefore carries 4 real anchors even though only 2
 * were clicked.
 *
 * The renderer uses a Catmull-Rom spline through all four points, so the
 * curve passes through every anchor (consumer reference behavior) rather
 * than pulling off-curve like a raw cubic Bezier.
 *
 * Resilience: overlays restored with only the 2 endpoints (older saved
 * data) render identical generated intermediates and expose lazy anchor
 * handles at those positions — dragging one writes a real point (the
 * kernel pads points[] automatically), upgrading the data in place.
 */

const CURVE_SEGMENTS = 48

const doubleCurve: OverlayTemplate<ShapeExtendData> = {
  name: 'doubleCurve',
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

    const [p0, p3] = coordinates
    const generated = sCurveIntermediates(p0, p3)
    // Real stored intermediates win; missing slots fall back to generated —
    // covers 2-pt restores and the pre-expansion click states.
    const c1 = coordinates.length >= 3 ? coordinates[2] : generated[0]
    const c2 = coordinates.length >= 4 ? coordinates[3] : generated[1]

    const figures: OverlayFigure[] = [{
      key: 'dc_curve',
      type: 'line',
      attrs: { coordinates: sampleCatmullRom4(p0, c1, c2, p3, CURVE_SEGMENTS) },
      styles: {
        style: stroke.style,
        color: stroke.color,
        size: stroke.size,
        dashedValue: stroke.dashedValue
      }
    }]

    const drawing = overlay.isDrawing()
    if (drawing || (isSelected !== true && isHovered !== true) || overlay.lock) {
      // While drawing only the clicked endpoints exist semantically —
      // slice(0,2) so the in-progress tail suppression hits the live
      // endpoint, not a generated control. Locked overlays get the
      // factory's selection outline over all four coordinates.
      figures.push(...createAnchorFigures({
        coordinates: overlay.lock ? coordinates : coordinates.slice(0, 2),
        isSelected,
        isHovered,
        isDrawing: drawing,
        lock: overlay.lock,
        isTouch
      }))
    } else {
      // Finished + interactive: endpoint anchors via the factory, control
      // anchors via square handles at the (possibly generated) positions.
      // A handle on an unwritten slot carries pointIndex 2/3 — the kernel
      // pads points[] on first drag.
      figures.push(...createAnchorFigures({
        coordinates: coordinates.slice(0, 2),
        isSelected,
        isHovered,
        isDrawing: false,
        lock: false,
        isTouch,
        cursors: [computeResizeCursor(p0, p3), computeResizeCursor(p3, p0)]
      }))
      figures.push(shapeHandleFigure('dc_c1', c1, { pointIndex: 2, cursor: 'move', isTouch }))
      figures.push(shapeHandleFigure('dc_c2', c2, { pointIndex: 3, cursor: 'move', isTouch }))
    }

    return figures
  }),

  onDrawing: ({ chart, overlay }) => {
    // Fires on every draw click AND move once the second slot is live.
    // Re-derive the S-controls each time so the preview curve and the
    // points committed at drawEnd always describe the same geometry.
    if (overlay.currentStep !== 2 || overlay.points.length < 2) {
      return
    }
    const c0 = pointToCoordinate(chart, overlay.paneId, overlay.points[0])
    const c1 = pointToCoordinate(chart, overlay.paneId, overlay.points[1])
    if (c0 === null || c1 === null) {
      return
    }
    const [g1, g2] = sCurveIntermediates(c0, c1)
    const gp1 = coordinateToPoint(chart, overlay.paneId, g1)
    const gp2 = coordinateToPoint(chart, overlay.paneId, g2)
    if (gp1 === null || gp2 === null) {
      return
    }
    overlay.points[2] = gp1
    overlay.points[3] = gp2
  }
}

export default doubleCurve
