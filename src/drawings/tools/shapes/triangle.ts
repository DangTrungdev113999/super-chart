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
  rememberShapeChart,
  shapeFillColor,
  shapeFillEnabled,
  shapeStrokeOf
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'triangle' — TradingView Triangle. Three free vertex anchors; the
 * polygon closes automatically. While placing the second/third vertex a
 * line previews the trailing edge. Improvements over the reference:
 * anchor factory (locked outline, in-progress suppression, touch sizing),
 * per-vertex resize cursors from the centroid, extendData/style-channel
 * fill+border resolution shared with the rest of the group.
 */

const triangle: OverlayTemplate<ShapeExtendData> = {
  name: 'triangle',
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

    const figures: OverlayFigure[] = []
    const vertices = coordinates.slice(0, 3)
    if (vertices.length >= 3) {
      // Single stroke_fill polygon — carries fill, border and the
      // interior hit-test used for body dragging.
      figures.push({
        key: 'tri_body',
        type: 'polygon',
        attrs: { coordinates: vertices },
        styles: {
          style: 'stroke_fill',
          color: fillOn ? fillColor : 'transparent',
          borderColor: stroke.color,
          borderSize: stroke.size,
          borderStyle: stroke.style,
          borderDashedValue: stroke.dashedValue
        }
      })
    } else {
      // In-progress edge preview (P1→P2 while P3 is unplaced).
      figures.push({
        key: 'tri_preview',
        type: 'line',
        attrs: { coordinates: vertices },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        }
      })
    }

    // Per-vertex resize cursors bucketed on the vertex↔centroid ray.
    const third = vertices.length >= 3 ? vertices[2] : vertices[0]
    const centroid = {
      x: (vertices[0].x + vertices[1].x + third.x) / 3,
      y: (vertices[0].y + vertices[1].y + third.y) / 3
    }
    figures.push(...createAnchorFigures({
      coordinates: vertices,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      cursors: vertices.map(v => computeResizeCursor(centroid, v))
    }))

    return figures
  })
}

export default triangle
