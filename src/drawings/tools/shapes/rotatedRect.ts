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
import {
  computeResizeCursor,
  createAnchorFigures,
  createSelectionOutlineFigures
} from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'
import { applySnap45 } from '../lines/lineCommon'

import {
  coordinateToPoint,
  edgeFrameOf,
  pointToCoordinate,
  rememberShapeChart,
  rotatedRectCorners,
  shapeChartOf,
  shapeFillColor,
  shapeFillEnabled,
  shapeHandleFigure,
  shapeStrokeOf,
  signedLineDistance
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'rotatedRect' — TradingView Rotated Rectangle (3 points). P1→P2 is the
 * rectangle's CENTERLINE: the quad expands symmetrically by the unsigned
 * perpendicular distance of P3 to the P1P2 line on BOTH sides (full
 * width = 2·distance — TradingView `distanceToLine` parity). While
 * placing the edge a line previews it; once P3 lands the 4-corner
 * polygon renders. Finished overlays get 6 handles — the two stored
 * edge-mid anchors (re-angle the rect, preserving the gesture-start
 * width exactly like TV's startChanging/setPoint) plus the 4 quad
 * corners, which all drive the width point (index 2) so every corner
 * stays grabbable on either side. Body drag translates.
 */

const rotatedRect: OverlayTemplate<ShapeExtendData> = {
  name: 'rotatedRect',
  totalStep: 4,
  // Normal-projected far corners escape the anchor hull — culling only
  // tests stored anchors.
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    rememberShapeChart(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = shapeStrokeOf(overlay, chart, ext, 'polygon')
    const fillOn = shapeFillEnabled(ext)
    const fillColor = shapeFillColor(overlay, ext, stroke.color, 'polygon')

    const [p1, p2] = coordinates
    const complete = coordinates.length >= 3
    const figures: OverlayFigure[] = []

    if (complete) {
      const corners = rotatedRectCorners(p1, p2, coordinates[2])
      figures.push({
        key: 'rr_body',
        type: 'polygon',
        attrs: { coordinates: corners },
        styles: {
          style: 'stroke_fill',
          color: fillOn ? fillColor : 'transparent',
          borderColor: stroke.color,
          borderSize: stroke.size,
          borderStyle: stroke.style,
          borderDashedValue: stroke.dashedValue
        }
      })

      if (overlay.lock) {
        if (isSelected === true) {
          // Locked selection outline over the TV anchor positions.
          figures.push(...createSelectionOutlineFigures({ coordinates: [p1, p2, ...corners], isTouch }))
        }
      } else if (((isSelected ?? false) || (isHovered ?? false)) && !overlay.isDrawing()) {
        // TV anchor set: the two stored edge-mid anchors (idx 0/1, default
        // cursor) then the 4 quad corners — every corner routes to the
        // width point (idx 2) with the perpendicular resize cursor.
        const perpCursor = computeResizeCursor(corners[3], corners[0])
        figures.push(shapeHandleFigure('rr_p1', p1, { pointIndex: 0, cursor: 'pointer', isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('rr_p2', p2, { pointIndex: 1, cursor: 'pointer', isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('rr_c1', corners[0], { pointIndex: 2, cursor: perpCursor, isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('rr_c2', corners[1], { pointIndex: 2, cursor: perpCursor, isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('rr_c3', corners[2], { pointIndex: 2, cursor: perpCursor, isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('rr_c4', corners[3], { pointIndex: 2, cursor: perpCursor, isTouch, shape: 'circle' }))
      }
    } else {
      // Edge preview while P3 is unplaced.
      figures.push({
        key: 'rr_edge',
        type: 'line',
        attrs: { coordinates: [p1, p2] },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        }
      })
    }

    // Factory anchors for the stored points (drawing suppression for the
    // in-progress one is built in). While finished the handle set above
    // replaces them — the raw P3 anchor would float off the quad.
    if (!complete || overlay.isDrawing()) {
      figures.push(...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isDrawing: overlay.isDrawing(),
        lock: overlay.lock,
        isTouch,
        cursors: coordinates.map((_, i) =>
          i < 2 ? computeResizeCursor(p1, p2) : 'pointer'
        )
      }))
    }

    return figures
  }),

  performEventMoveForDrawing: function (this: Overlay<ShapeExtendData>, params) {
    // Shift (or the persistent align-45 toggle) while placing P2 snaps the
    // P1→P2 edge to 45° — the edge angle is the rect's rotation.
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  },

  performEventPressedMove: function (this: Overlay<ShapeExtendData>, params) {
    // Edge-endpoint handles (indexes 0/1) snap the same way relative to
    // the fixed endpoint, then rebuild the width point from the
    // gesture-start distance — P3 := P1′ + rightNormal(edge′)·d₀, the
    // TradingView startChanging/setPoint pair (`_distance` cached at
    // drag start ≈ `prevPoints`). Corner handles (idx 2) and replayed
    // restores (event === undefined) pass through untouched.
    if (
      params.performPointIndex > 1 ||
      params.event === undefined ||
      params.points.length < 3
    ) {
      return
    }
    applySnap45(this, params, 1 - params.performPointIndex)
    const chart = shapeChartOf(this)
    const prev = params.prevPoints
    if (chart === undefined || prev.length < 3) {
      return
    }
    const paneId = this.paneId
    const prevP1 = pointToCoordinate(chart, paneId, isValid(prev[0]) ? prev[0] : {})
    const prevP2 = pointToCoordinate(chart, paneId, isValid(prev[1]) ? prev[1] : {})
    const prevP3 = pointToCoordinate(chart, paneId, isValid(prev[2]) ? prev[2] : {})
    const curP1 = pointToCoordinate(chart, paneId, params.points[0] ?? {})
    const curP2 = pointToCoordinate(chart, paneId, params.points[1] ?? {})
    if (
      prevP1 === null || prevP2 === null || prevP3 === null ||
      curP1 === null || curP2 === null
    ) {
      return
    }
    const half = Math.abs(signedLineDistance(prevP1, prevP2, prevP3))
    const frame = edgeFrameOf(curP1, curP2)
    const target = params.points[2]
    if (frame === null || !isValid(target)) {
      return
    }
    // TV writes the width point onto the right-normal side of the new
    // edge (Point(dy, -dx)·distance) — the symmetric polygon renders
    // identically either way; the sign just keeps the stored point tidy.
    const point = coordinateToPoint(chart, paneId, {
      x: curP1.x - frame.nx * half,
      y: curP1.y - frame.ny * half
    })
    if (point === null) {
      return
    }
    target.timestamp = point.timestamp
    target.dataIndex = point.dataIndex
    target.value = point.value
  }
}

export default rotatedRect
