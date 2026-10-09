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
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  patternFillColorOf,
  patternFontOf,
  patternPillColorsOf,
  patternStrokeOf,
  TV_DEEP_BLUE,
  TV_LINE_WIDTH,
  vertexLabelAbove,
  vertexPillFigure
} from './patternCommon'
import type { PatternExtendData } from './patternCommon'

const TRIANGLE_VERTEX_LABELS = ['A', 'B', 'C', 'D']

/**
 * 'trianglePattern' — TradingView "Triangle pattern" (4 points A·B·C·D).
 *
 * Solid segments A→B→C→D plus a dotted, shaded wedge between the A–C and
 * B–D trend lines: closed on the edge nearest their crossing point and
 * converging on their intersection. Nothing renders when the two legs are
 * vertical or parallel — mirrors the reference's early return.
 */
const trianglePattern: OverlayTemplate<PatternExtendData> = {
  name: 'trianglePattern',
  totalStep: 5,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = patternStrokeOf(overlay, chart, ext, TV_DEEP_BLUE, TV_LINE_WIDTH)
    const font = patternFontOf(ext)
    const pillColors = patternPillColorsOf(ext, stroke.color)
    const fillEnabled = ext.fillBackground ?? true
    const showLabels = ext.showLabels ?? true

    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      figures.push(...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isDrawing: overlay.isDrawing(),
        lock: overlay.lock,
        isTouch
      }))
      return figures
    }

    // Apex wedge between lines A→C and B→D — TV solves their intersection
    // and caps the wedge on whichever side the crossing falls outside of.
    let wedge: Coordinate[] | null = null
    if (coordinates.length === 4) {
      const [a, b, c, d] = coordinates
      const degenerate = Math.abs(c.x - a.x) < 1 || Math.abs(d.x - b.x) < 1
      const slopeAC = (c.y - a.y) / (c.x - a.x)
      const slopeBD = (d.y - b.y) / (d.x - b.x)
      // Only the WEDGE is skipped when legs are vertical/parallel — legs,
      // labels and anchors still render (a degenerate wedge is not a
      // degenerate drawing).
      if (!degenerate && Math.abs(slopeAC - slopeBD) >= 1e-6) {
        let edgeX = Math.min(a.x, b.x, c.x, d.x)
        let wedgeA = { x: edgeX, y: a.y + (edgeX - a.x) * slopeAC }
        let wedgeB = { x: edgeX, y: b.y + (edgeX - b.x) * slopeBD }
        const apexX = (b.y - a.y + a.x * slopeAC - b.x * slopeBD) / (slopeAC - slopeBD)
        if (apexX < edgeX) {
          // Crossing sits left of every vertex — cap on the right edge.
          edgeX = Math.max(a.x, b.x, c.x, d.x)
          wedgeA = { x: edgeX, y: a.y + (edgeX - a.x) * slopeAC }
          wedgeB = { x: edgeX, y: b.y + (edgeX - b.x) * slopeBD }
        }
        const apex = { x: apexX, y: a.y + (apexX - a.x) * slopeAC }
        wedge = [wedgeA, wedgeB, apex]
      }
    }

    // Solid legs (TV draws three separate solid trend lines).
    for (let i = 1; i < coordinates.length; i++) {
      figures.push({
        key: `tp_leg_${i}`,
        type: 'line',
        attrs: { coordinates: [coordinates[i - 1], coordinates[i]] },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        }
      })
    }

    // Dotted + shaded wedge.
    if (wedge !== null) {
      figures.push({
        key: 'tp_wedge',
        type: 'polygon',
        attrs: { coordinates: wedge },
        styles: {
          style: fillEnabled ? 'stroke_fill' : 'stroke',
          color: fillEnabled ? patternFillColorOf(ext, stroke.color) : 'transparent',
          borderColor: stroke.color,
          borderSize: stroke.size,
          borderStyle: 'dashed',
          borderDashedValue: [2, 2]
        }
      })
    }

    if (showLabels) {
      coordinates.forEach((coordinate, index) => {
        const label = TRIANGLE_VERTEX_LABELS[index]
        if (isValid(label)) {
          figures.push(vertexPillFigure(
            `tp_vertex_${index}`,
            coordinate,
            label,
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

export default trianglePattern
