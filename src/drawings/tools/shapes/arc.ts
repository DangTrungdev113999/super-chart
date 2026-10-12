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
import { computeResizeCursor, createAnchorFigures, createSelectionOutlineFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  coordinateToPoint,
  edgeFrameOf,
  lineStyleOverrides,
  pointToCoordinate,
  rememberShapeChart,
  sampleTVArc,
  shapeChartOf,
  shapeFillColor,
  shapeFillEnabled,
  shapeHandleFigure,
  signedLineDistance
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'arc' — TradingView Arc (3 points). P1→P2 is the chord; P3 sets the
 * SIGNED perpendicular distance `d` of the arc apex from the chord
 * midpoint — TV draws the 60° circular arc of radius |chord| centered
 * on the perpendicular bisector, then scales it perpendicular to the
 * chord so the apex lands at mid + n̂·d (an affine-stretched elliptical
 * arc through P1, apex, P2 — TradingView's exact translate/rotate/scale
 * draw, not a quadratic Bezier with a free control point). |d| < 1 px
 * renders as the bare chord (TV's degenerate fallback). The fill closes
 * the arc region along the chord. Anchors: P1, P2 plus the apex handle
 * at mid + n̂·d — it drags perpendicular distance on the cursor's side;
 * endpoint drags preserve the gesture-start signed distance (TradingView
 * startChanging/setPoint parity).
 */

const ARC_SEGMENTS = 40

const arc: OverlayTemplate<ShapeExtendData> = {
  name: 'arc',
  totalStep: 4,
  // geometry escapes the anchor hull (control points / fixed-size box)
  // or user-widened boxes — must not be view-culled
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
    // The overlay style table has a dedicated `arc` channel — honor it for
    // the stroke (settings channel → extendData → theme), while the fill
    // still resolves through the shared polygon channel below.
    const arcChannel = overlay.styles?.arc
    const baseStroke = lineStyleOverrides(overlay, chart, {
      lineColor: ext.color ?? ext.lineColor ?? ext.borderColor,
      lineWidth: ext.lineWidth ?? ext.borderWidth,
      lineStyle: ext.lineStyle ?? ext.borderStyle
    })
    const stroke = {
      color: arcChannel?.color ?? baseStroke.color,
      size: arcChannel?.size ?? baseStroke.size,
      style: arcChannel?.style ?? baseStroke.style,
      dashedValue: arcChannel?.dashedValue ?? baseStroke.dashedValue
    }

    const [p1, p2] = coordinates
    const hasMid = coordinates.length >= 3
    const figures: OverlayFigure[] = []

    if (!hasMid) {
      // Chord preview while the apex point is unplaced.
      figures.push({
        key: 'arc_chord',
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
      // |d| < 1 samples to the bare chord — same figure either way.
      const arcPoints = sampleTVArc(p1, p2, coordinates[2], ARC_SEGMENTS)

      if (shapeFillEnabled(ext) && arcPoints.length > 2) {
        // Region bounded by the arc and its chord — stays interactive so
        // the filled area participates in body dragging.
        figures.push({
          key: 'arc_fill',
          type: 'polygon',
          attrs: { coordinates: [...arcPoints, p1] },
          styles: {
            style: 'fill',
            color: shapeFillColor(overlay, ext, stroke.color, 'polygon')
          }
        })
      }
      figures.push({
        key: 'arc_line',
        type: 'line',
        attrs: { coordinates: arcPoints },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        }
      })
    }

    // ─── Anchors: TV emits [P1, P2, apex(mid + n̂·d)] when complete ───
    const drawing = overlay.isDrawing()
    const frame = hasMid ? edgeFrameOf(p1, p2) : null
    const interactive = !overlay.lock &&
      ((isSelected ?? false) || (isHovered ?? false)) &&
      !drawing

    if (frame !== null && (interactive || (overlay.lock && isSelected === true))) {
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      const d = signedLineDistance(p1, p2, coordinates[2])
      const apex = { x: mid.x + frame.nx * d, y: mid.y + frame.ny * d }
      if (overlay.lock) {
        // Locked selection outline at the TV anchor positions.
        figures.push(...createSelectionOutlineFigures({ coordinates: [p1, p2, apex], isTouch }))
      } else {
        const perpCursor = computeResizeCursor(
          { x: mid.x - frame.nx * d, y: mid.y - frame.ny * d },
          apex
        )
        figures.push(shapeHandleFigure('arc_p1', p1, { pointIndex: 0, cursor: 'pointer', isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('arc_p2', p2, { pointIndex: 1, cursor: 'pointer', isTouch, shape: 'circle' }))
        figures.push(shapeHandleFigure('arc_apex', apex, { pointIndex: 2, cursor: perpCursor, isTouch, shape: 'circle' }))
      }
    } else {
      // Drawing, degenerate edge, or unselected — factory anchors for the
      // stored points (in-progress suppression + lock outline built in).
      figures.push(...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isDrawing: drawing,
        lock: overlay.lock,
        isTouch,
        cursors: [
          computeResizeCursor(p2, p1),
          computeResizeCursor(p1, p2),
          'pointer'
        ]
      }))
    }

    return figures
  }),

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

    if (mpi === 2) {
      // Apex drag: snap the stored point onto the mid-perpendicular on
      // the cursor's side — P3 := mid + n̂·signedDistance(cursor), the
      // TradingView setPoint case-2 write (tangential drift is dropped).
      const c0 = pointToCoordinate(chart, paneId, params.points[0] ?? {})
      const c1 = pointToCoordinate(chart, paneId, params.points[1] ?? {})
      const c2 = pointToCoordinate(chart, paneId, params.points[2] ?? {})
      if (c0 === null || c1 === null || c2 === null) {
        return
      }
      const frame = edgeFrameOf(c0, c1)
      const target = params.points[2]
      if (frame === null || !isValid(target)) {
        return
      }
      const d = (c2.x - c0.x) * frame.nx + (c2.y - c0.y) * frame.ny
      const point = coordinateToPoint(chart, paneId, {
        x: (c0.x + c1.x) / 2 + frame.nx * d,
        y: (c0.y + c1.y) / 2 + frame.ny * d
      })
      if (point === null) {
        return
      }
      target.timestamp = point.timestamp
      target.dataIndex = point.dataIndex
      target.value = point.value
      return
    }

    if (mpi === 0 || mpi === 1) {
      // Chord endpoint: rebuild the apex from the gesture-start SIGNED
      // distance — P3 := mid′ + n̂′·d₀. TradingView startChanging caches
      // `_dist` (sign included); setPoint rewrites the point — prevPoints
      // is the same gesture-start snapshot.
      const prev = params.prevPoints
      if (prev.length < 3) {
        return
      }
      const p0 = pointToCoordinate(chart, paneId, isValid(prev[0]) ? prev[0] : {})
      const p1 = pointToCoordinate(chart, paneId, isValid(prev[1]) ? prev[1] : {})
      const p2 = pointToCoordinate(chart, paneId, isValid(prev[2]) ? prev[2] : {})
      const c0 = pointToCoordinate(chart, paneId, params.points[0] ?? {})
      const c1 = pointToCoordinate(chart, paneId, params.points[1] ?? {})
      if (p0 === null || p1 === null || p2 === null || c0 === null || c1 === null) {
        return
      }
      const d0 = signedLineDistance(p0, p1, p2)
      const frame = edgeFrameOf(c0, c1)
      const target = params.points[2]
      if (frame === null || !isValid(target)) {
        return
      }
      const point = coordinateToPoint(chart, paneId, {
        x: (c0.x + c1.x) / 2 + frame.nx * d0,
        y: (c0.y + c1.y) / 2 + frame.ny * d0
      })
      if (point === null) {
        return
      }
      target.timestamp = point.timestamp
      target.dataIndex = point.dataIndex
      target.value = point.value
    }
  }
}

export default arc
