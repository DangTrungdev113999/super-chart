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
  fibLevel,
  formatLevelLabel,
  labelFigure,
  lineFigure,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'fibCircles' — TradingView Fib Circles (2-point). P1 is the center;
 * P2 defines the base radius vector. Levels render as ELLIPSES whose
 * rx = coeff × |Δx| and ry = coeff × |Δy| — radii scale per-axis, so
 * the circles deform correctly when either axis zooms/pans (TV behavior),
 * rather than staying round in pixel space.
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
  cullable: false,
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
  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    const extendData = (overlay.extendData as FibCirclesExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      const dx = Math.abs(p2.x - p1.x)
      const dy = Math.abs(p2.y - p1.y)
      if (dx > 0 || dy > 0) {
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
          const rx = dx * level.coeff
          const ry = dy * level.coeff
          if (rx <= 0 && ry <= 0) {
            return
          }
          figures.push({
            key: `fib_circle_${index}`,
            type: 'ellipse',
            attrs: { x: p1.x, y: p1.y, rx, ry },
            styles: { style: 'stroke', borderColor: level.color, borderSize: lineSize },
            bounds: { x: p1.x - rx, y: p1.y - ry, width: rx * 2, height: ry * 2 }
          })
          if (showLabels) {
            // Label hangs off the ellipse's bottom point (TV labelPoint).
            figures.push(labelFigure(
              `fib_circle_label_${index}`,
              p1.x,
              p1.y + ry,
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
      isTouch,
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
