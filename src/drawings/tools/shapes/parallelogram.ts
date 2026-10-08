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

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import {
  computeResizeCursor,
  createAnchorFigures,
  createSelectionOutlineFigures
} from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  rememberShapeChart,
  shapeFillColor,
  shapeFillEnabled,
  shapeHandleFigure,
  shapeStrokeOf
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'parallelogram' — TradingView Parallelogram (3 points). P0→P1 is one
 * edge, P2 is the opposing vertex; the fourth corner derives as
 * P4 = P0 + (P2 − P1) so the quad always stays a parallelogram. Finished
 * overlays get 4 corner handles — the derived corner writes back into
 * point[2] with the (P1 − P0) offset so the handle tracks the cursor
 * exactly. Dragging any of the 3 stored points reshapes; body translates.
 */

const parallelogram: OverlayTemplate<ShapeExtendData> = {
  name: 'parallelogram',
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

    const [p0, p1] = coordinates
    const complete = coordinates.length >= 3
    const figures: OverlayFigure[] = []

    if (complete) {
      const p2 = coordinates[2]
      const p4 = { x: p0.x + p2.x - p1.x, y: p0.y + p2.y - p1.y }
      const quad = [p0, p1, p2, p4]
      figures.push({
        key: 'pg_body',
        type: 'polygon',
        attrs: { coordinates: quad },
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
          figures.push(...createSelectionOutlineFigures({ coordinates: quad, isTouch }))
        }
      } else if (((isSelected ?? false) || (isHovered ?? false)) && !overlay.isDrawing()) {
        // Corner handles. c4 is derived — it maps back into point[2] via
        // the 'pg_c4' offset in performEventPressedMove.
        figures.push(shapeHandleFigure('pg_c0', p0, { pointIndex: 0, cursor: computeResizeCursor(p0, p2), isTouch }))
        figures.push(shapeHandleFigure('pg_c1', p1, { pointIndex: 1, cursor: computeResizeCursor(p1, p4), isTouch }))
        figures.push(shapeHandleFigure('pg_c2', p2, { pointIndex: 2, cursor: computeResizeCursor(p0, p2), isTouch }))
        figures.push(shapeHandleFigure('pg_c4', p4, { pointIndex: 2, cursor: computeResizeCursor(p1, p4), isTouch }))
      }
    } else {
      // Edge preview while P2 is unplaced.
      figures.push({
        key: 'pg_edge',
        type: 'line',
        attrs: { coordinates: [p0, p1] },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        }
      })
    }

    if (!complete || overlay.isDrawing()) {
      figures.push(...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isDrawing: overlay.isDrawing(),
        lock: overlay.lock,
        isTouch,
        cursors: coordinates.map((_, i) =>
          i < 2 ? computeResizeCursor(p0, p1) : 'pointer'
        )
      }))
    }

    return figures
  }),

  performEventPressedMove: function (this: Overlay<ShapeExtendData>, params) {
    // 'pg_c4' — the derived-corner handle. The kernel wrote the raw cursor
    // into point[2]; shift it by (P1 − P0) so the RENDERED corner
    // (p0 + p2 − p1) lands exactly under the cursor.
    if (params.figureKey !== 'pg_c4' || params.prevPoints.length < 3) {
      return
    }
    const prev = params.prevPoints
    const p0 = isValid(prev[0]) ? prev[0] : {}
    const p1 = isValid(prev[1]) ? prev[1] : {}
    const target = params.points[2]
    if (!isValid(target)) {
      return
    }
    if (isNumber(target.dataIndex) && isNumber(p1.dataIndex) && isNumber(p0.dataIndex)) {
      target.dataIndex += p1.dataIndex - p0.dataIndex
    }
    if (isNumber(target.timestamp) && isNumber(p1.timestamp) && isNumber(p0.timestamp)) {
      target.timestamp += p1.timestamp - p0.timestamp
    }
    if (isNumber(target.value) && isNumber(p1.value) && isNumber(p0.value)) {
      target.value += p1.value - p0.value
    }
  }
}

export default parallelogram
