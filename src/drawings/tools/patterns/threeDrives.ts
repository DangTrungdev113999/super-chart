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
  TV_DEEP_BLUE,
  TV_LINE_WIDTH
} from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * 'threeDrives' — TradingView "Three drives pattern" (7 points; drives at
 * vertices 1, 3, 5 with corrections between them).
 *
 * Solid polyline through all vertices plus two dotted diagonals at the
 * tool linewidth carrying retracement pills:
 *   1→3 shows |P3−P2|/|P2−P1|     3→5 shows |P5−P4|/|P4−P3|
 * TV draws no vertex labels on this tool.
 */
const threeDrives: OverlayTemplate<PatternExtendData> = {
  name: 'threeDrives',
  totalStep: 8,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = patternStrokeOf(overlay, chart, ext, TV_DEEP_BLUE, TV_LINE_WIDTH)
    const font = patternFontOf(ext)
    const pillColors = patternPillColorsOf(ext, stroke.color)
    const showLabels = ext.showLabels ?? true

    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      figures.push({
        key: 'td_wave',
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

      const points = overlay.points
      if (showLabels && coordinates.length >= 4) {
        const ratio = priceRatio(points, 3, 2, 2, 1)
        if (isNumber(ratio)) {
          figures.push(ratioTrendFigure('td_aux_13', coordinates[1], coordinates[3], stroke.color, stroke.size))
          figures.push(ratioPillFigure('td_ratio_13', midpointOf(coordinates[1], coordinates[3]), formatRatio(ratio), pillColors, font))
        }
      }
      if (showLabels && coordinates.length >= 6) {
        const ratio = priceRatio(points, 5, 4, 4, 3)
        if (isNumber(ratio)) {
          figures.push(ratioTrendFigure('td_aux_35', coordinates[3], coordinates[5], stroke.color, stroke.size))
          figures.push(ratioPillFigure('td_ratio_35', midpointOf(coordinates[3], coordinates[5]), formatRatio(ratio), pillColors, font))
        }
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

export default threeDrives
