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

import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  FIB_COLORS,
  TRENDLINE_COLOR,
  TRENDLINE_DASH,
  distance,
  fibLevel,
  formatLevelLabel,
  labelFigure,
  lineFigure,
  midpoint,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'fibCircles' — TradingView Fib Circles (2-point). P1→P2 distance is the
 * base radius r; concentric circles at coeff × r centered on the segment
 * midpoint, plus the optional dashed radial trendline P1→P2.
 */

export interface FibCirclesExtendData {
  levels?: FibLevelData[]
  /** Draw the dashed P1→P2 radial line. */
  trendlineVisible?: boolean
  showLabels?: boolean
}

const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(0, FIB_COLORS.gray),
  fibLevel(0.236, FIB_COLORS.red),
  fibLevel(0.382, FIB_COLORS.orange),
  fibLevel(0.5, FIB_COLORS.green),
  fibLevel(0.618, FIB_COLORS.teal),
  fibLevel(0.786, FIB_COLORS.cyan),
  fibLevel(1, FIB_COLORS.blue),
  fibLevel(1.272, FIB_COLORS.orange),
  fibLevel(1.618, FIB_COLORS.purple)
]

const fibCircles: OverlayTemplate<FibCirclesExtendData> = {
  name: 'fibCircles',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'dashed', dashedValue: TRENDLINE_DASH },
    text: { color: TRENDLINE_COLOR, size: 11 }
  },
  extendData: {
    levels: DEFAULT_LEVELS,
    trendlineVisible: true,
    showLabels: true
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered }) => {
    const extendData = (overlay.extendData as FibCirclesExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      const baseRadius = distance(p1, p2)
      if (baseRadius > 0) {
        const center = midpoint(p1, p2)
        if (extendData.trendlineVisible ?? true) {
          // Inherits styles.line (dashed trendline color from the toolbar).
          figures.push(lineFigure('fib_circles_trend', [[p1, p2]], {}))
        }
        const levels = readLevels(extendData, DEFAULT_LEVELS)
        const showLabels = extendData.showLabels ?? true
        const lineSize = overlay.styles?.line?.size ?? 1
        levels.forEach((level, index) => {
          if (!level.visible) {
            return
          }
          const r = baseRadius * level.coeff
          if (r <= 0) {
            return
          }
          figures.push({
            key: `fib_circle_${index}`,
            type: 'circle',
            attrs: { x: center.x, y: center.y, r },
            styles: { style: 'stroke', borderColor: level.color, borderSize: lineSize },
            bounds: { x: center.x - r, y: center.y - r, width: r * 2, height: r * 2 }
          })
          if (showLabels) {
            // Label hangs off the circle's bottom point (TV labelPoint).
            figures.push(labelFigure(
              `fib_circle_label_${index}`,
              center.x,
              center.y + r,
              formatLevelLabel(level),
              level.color,
              'center',
              'top'
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
      keyPrefix: 'anchor_',
      midPoint: true,
      cursors: coordinates.length >= 2
        ? [computeResizeCursor(coordinates[1], coordinates[0]), computeResizeCursor(coordinates[0], coordinates[1])]
        : undefined
    }))
    return figures
  })
}

export default fibCircles
