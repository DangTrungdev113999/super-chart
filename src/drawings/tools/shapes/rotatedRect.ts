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
  rememberShapeChart,
  rotatedRectCorners,
  shapeFillColor,
  shapeFillEnabled,
  shapeHandleFigure,
  shapeStrokeOf
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'rotatedRect' — TradingView Rotated Rectangle (3 points). P1→P2 defines
 * one edge (position + angle); P3 projects onto the edge normal giving the
 * rect width. While placing the edge a line previews it; once P3 lands the
 * full 4-corner polygon renders. Finished overlays get 4 corner handles —
 * the two far corners both drive the width point (index 2), so each corner
 * stays grabbable regardless of which side the user pulled the width to.
 * Dragging the edge endpoints re-angles the rect; body drag translates.
 */

const rotatedRect: OverlayTemplate<ShapeExtendData> = {
  name: 'rotatedRect',
  totalStep: 4,
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
          figures.push(...createSelectionOutlineFigures({ coordinates: corners, isTouch }))
        }
      } else if (((isSelected ?? false) || (isHovered ?? false)) && !overlay.isDrawing()) {
        // Corner handles: c1/c2 move their own point; c3/c4 both write
        // the width point (index 2 — only its normal component shapes the
        // rect, so a tangential drift is harmless).
        const [c1, c2, c3, c4] = corners
        figures.push(shapeHandleFigure('rr_c1', c1, { pointIndex: 0, cursor: computeResizeCursor(c1, c3), isTouch }))
        figures.push(shapeHandleFigure('rr_c2', c2, { pointIndex: 1, cursor: computeResizeCursor(c2, c4), isTouch }))
        figures.push(shapeHandleFigure('rr_c3', c3, { pointIndex: 2, cursor: computeResizeCursor(c1, c3), isTouch }))
        figures.push(shapeHandleFigure('rr_c4', c4, { pointIndex: 2, cursor: computeResizeCursor(c2, c4), isTouch }))
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
    // in-progress one is built in). While finished the corner handles
    // above replace them — point 2's raw anchor would float mid-face.
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
    // the fixed endpoint. The width point (2) and replayed restores
    // (event === undefined) pass through untouched.
    if (params.performPointIndex <= 1 && params.points.length >= 2) {
      applySnap45(this, params, 1 - params.performPointIndex)
    }
  }
}

export default rotatedRect
