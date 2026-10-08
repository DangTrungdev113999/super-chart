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

import type Coordinate from '../../../common/Coordinate'
import type Bounding from '../../../common/Bounding'
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  lineSegIntersection,
  patternFillColorOf,
  patternFontOf,
  patternPillColorsOf,
  patternStrokeOf,
  TV_LINE_WIDTH,
  TV_MINTY_GREEN,
  vertexLabelAbove,
  vertexPillFigure
} from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * Extend a ray `from + t·dir` (t > 0) to the first pane edge it hits,
 * padded just off-screen. Mirrors TradingView's `extendleft/extendright`
 * trend-line flags for the neckline.
 */
function extendRayToPaneEdge (from: Coordinate, dir: Coordinate, bounding: Bounding): Coordinate {
  const pad = 8
  let tBest = Infinity
  if (Math.abs(dir.x) > 1e-9) {
    const tx = ((dir.x > 0 ? bounding.width + pad : -pad) - from.x) / dir.x
    if (tx > 0) {
      tBest = Math.min(tBest, tx)
    }
  }
  if (Math.abs(dir.y) > 1e-9) {
    const ty = ((dir.y > 0 ? bounding.height + pad : -pad) - from.y) / dir.y
    if (ty > 0) {
      tBest = Math.min(tBest, ty)
    }
  }
  const t = isFinite(tBest) ? tBest : 0
  return { x: from.x + dir.x * t, y: from.y + dir.y * t }
}

/**
 * 'headAndShoulders' — TradingView "Head and shoulders" (7 points):
 * 0 start · 1 left shoulder · 2 left valley · 3 head · 4 right valley ·
 * 5 right shoulder · 6 end.
 *
 * Polyline through all vertices; the neckline is the dotted line through
 * the two valleys, extended to the pane edge when it does not cross the
 * outer arm segments (TV `extendleft`/`extendright` fallbacks). Shading:
 * the head triangle [2,3,4] plus the [neckline,1,2] / [4,5,neckline]
 * shoulder triangles when the neckline actually intersects those segments.
 * Pill labels on the two shoulders and the head.
 */
const headAndShoulders: OverlayTemplate<PatternExtendData> = {
  name: 'headAndShoulders',
  totalStep: 8,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, bounding, overlay, isSelected, isHovered, isTouch }) => {
    const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = patternStrokeOf(overlay, chart, ext, TV_MINTY_GREEN, TV_LINE_WIDTH)
    const font = patternFontOf(ext)
    const pillColors = patternPillColorsOf(ext, stroke.color)
    const fillEnabled = ext.fillBackground ?? true
    const showLabels = ext.showLabels ?? true

    const figures: OverlayFigure[] = []

    // Neckline intersections — line through the two valleys (2→4) vs the
    // outer arm segments 0→1 and 5→6 (TV intersectLineSegments: the hit
    // must land INSIDE the arm segment, anywhere along the neckline).
    let neckLeft: Coordinate | null = null
    let neckRight: Coordinate | null = null
    if (coordinates.length >= 5) {
      neckLeft = lineSegIntersection(coordinates[2], coordinates[4], coordinates[0], coordinates[1])
      if (coordinates.length === 7) {
        neckRight = lineSegIntersection(coordinates[2], coordinates[4], coordinates[5], coordinates[6])
      }
    }

    if (coordinates.length >= 2) {
      figures.push({
        key: 'hs_wave',
        type: 'line',
        attrs: { coordinates },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        },
        ignoreEvent: true
      })
    }

    if (coordinates.length >= 5) {
      const leftEnd = neckLeft ?? extendRayToPaneEdge(
        coordinates[2],
        { x: coordinates[2].x - coordinates[4].x, y: coordinates[2].y - coordinates[4].y },
        bounding
      )
      const rightEnd = neckRight ?? extendRayToPaneEdge(
        coordinates[4],
        { x: coordinates[4].x - coordinates[2].x, y: coordinates[4].y - coordinates[2].y },
        bounding
      )
      // Neckline — TV draws it dotted at the tool linewidth.
      figures.push({
        key: 'hs_neckline',
        type: 'line',
        attrs: { coordinates: [leftEnd, rightEnd] },
        styles: { style: 'dashed', color: stroke.color, size: stroke.size, dashedValue: [2, 2] },
        ignoreEvent: true
      })

      if (fillEnabled) {
        const fill = patternFillColorOf(ext, stroke.color)
        figures.push({
          key: 'hs_tri_head',
          type: 'polygon',
          attrs: { coordinates: [coordinates[2], coordinates[3], coordinates[4]] },
          styles: { style: 'fill', color: fill },
          ignoreEvent: true
        })
        if (isValid(neckLeft)) {
          figures.push({
            key: 'hs_tri_left',
            type: 'polygon',
            attrs: { coordinates: [neckLeft, coordinates[1], coordinates[2]] },
            styles: { style: 'fill', color: fill },
            ignoreEvent: true
          })
        }
        if (isValid(neckRight)) {
          figures.push({
            key: 'hs_tri_right',
            type: 'polygon',
            attrs: { coordinates: [coordinates[4], coordinates[5], neckRight] },
            styles: { style: 'fill', color: fill },
            ignoreEvent: true
          })
        }
      }
    }

    if (showLabels) {
      const labels: Array<[number, string]> = [[1, 'Left Shoulder'], [3, 'Head'], [5, 'Right Shoulder']]
      labels.forEach(([index, text]) => {
        const coordinate = coordinates[index]
        if (isValid(coordinate)) {
          figures.push(vertexPillFigure(
            `hs_label_${index}`,
            coordinate,
            text,
            vertexLabelAbove(coordinates, index),
            pillColors,
            font
          ))
        }
      })
    }

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch
    }))
    return figures
  })
}

export default headAndShoulders
