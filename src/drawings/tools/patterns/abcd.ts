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

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  formatRatio,
  midpointOf,
  patternFontOf,
  patternPillColorsOf,
  patternStrokeOf,
  priceRatio,
  ratioPillFigure,
  ratioTrendFigure,
  TV_LINE_WIDTH,
  TV_MINTY_GREEN,
  vertexLabelAbove,
  vertexPillFigure
} from './patternCommon'
import type { PatternExtendData } from './patternCommon'

const ABCD_VERTEX_LABELS = ['A', 'B', 'C', 'D']

/**
 * 'abcd' — TradingView "ABCD pattern" (4 points: A·B·C·D).
 *
 * Polyline through the vertices plus two dotted aux diagonals at the tool
 * linewidth carrying retracement pills at their midpoints:
 *   A→C shows |C−B|/|B−A|      B→D shows |D−C|/|C−B|
 * Vertex pills A·B·C·D sit on the outer side of each vertex.
 */
const abcd: OverlayTemplate<PatternExtendData> = {
  name: 'abcd',
  totalStep: 5,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = patternStrokeOf(overlay, chart, ext, TV_MINTY_GREEN, TV_LINE_WIDTH)
    const font = patternFontOf(ext)
    const pillColors = patternPillColorsOf(ext, stroke.color)
    const showLabels = ext.showLabels ?? true

    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      figures.push({
        key: 'abcd_wave',
        type: 'line',
        attrs: { coordinates },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        }
      })

      const points = overlay.points
      if (coordinates.length >= 3) {
        // BC/AB retracement on the A→C diagonal.
        const ratio = priceRatio(points, 2, 1, 1, 0)
        if (isNumber(ratio)) {
          figures.push(ratioTrendFigure('abcd_aux_ac', coordinates[0], coordinates[2], stroke.color, stroke.size))
          figures.push(ratioPillFigure('abcd_ratio_ac', midpointOf(coordinates[0], coordinates[2]), formatRatio(ratio), pillColors, font))
        }
      }
      if (coordinates.length >= 4) {
        // CD/BC retracement on the B→D diagonal.
        const ratio = priceRatio(points, 3, 2, 2, 1)
        if (isNumber(ratio)) {
          figures.push(ratioTrendFigure('abcd_aux_bd', coordinates[1], coordinates[3], stroke.color, stroke.size))
          figures.push(ratioPillFigure('abcd_ratio_bd', midpointOf(coordinates[1], coordinates[3]), formatRatio(ratio), pillColors, font))
        }
      }

      if (showLabels) {
        coordinates.forEach((coordinate, index) => {
          const label = ABCD_VERTEX_LABELS[index]
          if (isValid(label)) {
            figures.push(vertexPillFigure(
              `abcd_vertex_${index}`,
              coordinate,
              label,
              vertexLabelAbove(coordinates, index),
              pillColors,
              font
            ))
          }
        })
      }
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

export default abcd
