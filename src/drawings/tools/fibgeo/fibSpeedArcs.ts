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
import type { ArcAttrs } from '../../../extension/figure/arc'

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
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'fibSpeedArcs' — Fibonacci Speed Resistance Arcs (2-point). Half-circle
 * arcs centered on P1 at radii coeff × |P1→P2|, opening toward P2's
 * vertical side (TradingView: dir = sign(P2.y − P1.y) picks the half).
 */

export interface FibSpeedArcsExtendData {
  levels?: FibLevelData[]
  /** Draw the dashed P1→P2 trendline. */
  trendlineVisible?: boolean
  showLabels?: boolean
}

const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(0.236, FIB_COLORS.red),
  fibLevel(0.382, FIB_COLORS.orange),
  fibLevel(0.5, FIB_COLORS.green),
  fibLevel(0.618, FIB_COLORS.teal),
  fibLevel(0.786, FIB_COLORS.cyan),
  fibLevel(1, FIB_COLORS.blue)
]

const fibSpeedArcs: OverlayTemplate<FibSpeedArcsExtendData> = {
  name: 'fibSpeedArcs',
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
    const extendData = (overlay.extendData as FibSpeedArcsExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      const baseRadius = distance(p1, p2)
      if (baseRadius > 0) {
        if (extendData.trendlineVisible ?? true) {
          figures.push(lineFigure('fib_sra_trend', [[p1, p2]], {}))
        }
        // The half-circle opens toward P2's vertical side: lower half when
        // P2 sits below P1 on screen (y down), upper half otherwise.
        const dir = p2.y - p1.y >= 0 ? 1 : -1
        const startAngle = dir > 0 ? 0 : Math.PI
        const endAngle = startAngle + Math.PI
        const labelBaseline: CanvasTextBaseline = dir > 0 ? 'top' : 'bottom'
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
          const attrs: ArcAttrs = { x: p1.x, y: p1.y, r, startAngle, endAngle }
          figures.push({
            key: `fib_sra_${index}`,
            type: 'arc',
            attrs,
            styles: { style: 'solid', size: lineSize, color: level.color },
            bounds: { x: p1.x - r, y: p1.y - r, width: r * 2, height: r * 2 }
          })
          if (showLabels) {
            figures.push(labelFigure(
              `fib_sra_label_${index}`,
              p1.x,
              p1.y + dir * r,
              formatLevelLabel(level),
              level.color,
              'center',
              labelBaseline
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

export default fibSpeedArcs
