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
  lineStyleOverrides,
  quadraticOnCurveControl,
  rememberShapeChart,
  sampleQuadratic,
  shapeFillColor,
  shapeFillEnabled
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'arc' — TradingView Arc (3 points, reference port). P1/P2 are the arc
 * endpoints; P3 is ON-CURVE — the quadratic control point is derived as
 * Pc = 2·P3 − (P1+P2)/2 so the rendered arc passes exactly through the
 * third click. The fill closes the arc region along the P2→P1 chord
 * (consumer behavior). Improvements over the reference: anchor factory
 * (locked outline, draw suppression), resize cursors, theme-aware stroke
 * and shared fill/border resolution.
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
      // Chord preview while the on-curve point is unplaced.
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
      const control = quadraticOnCurveControl(p1, coordinates[2], p2)
      const arcPoints = sampleQuadratic(p1, control, p2, ARC_SEGMENTS)

      if (shapeFillEnabled(ext)) {
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

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      cursors: [
        computeResizeCursor(p2, p1),
        computeResizeCursor(p1, p2),
        hasMid ? computeResizeCursor(coordinates[2], { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }) : 'pointer'
      ]
    }))

    return figures
  })
}

export default arc
