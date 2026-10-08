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
  GRID_DASH,
  TRENDLINE_COLOR,
  fibLevel,
  formatLevelLabel,
  labelFigure,
  lineFigure,
  rayToBoundingEdge,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'fibSpeedFan' — Fibonacci Speed Resistance Fan (2-point). Rays fan from
 * P1 through the points that divide the P1→P2 box at coeff fractions of
 * BOTH axes: the vertical span on the P2.x edge and the horizontal span on
 * the P2.y edge. Rays extend to the pane edge (TradingView parity).
 */

export interface FibSpeedFanExtendData {
  levels?: FibLevelData[]
  /** Draw the P1→P2 box outline + the P1→P2 diagonal. */
  showBox?: boolean
  showLabels?: boolean
}

const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(1 / 3, FIB_COLORS.red, true, '1/3'),
  fibLevel(0.382, FIB_COLORS.orange),
  fibLevel(0.5, FIB_COLORS.green),
  fibLevel(0.618, FIB_COLORS.teal),
  fibLevel(2 / 3, FIB_COLORS.cyan, true, '2/3')
]

const fibSpeedFan: OverlayTemplate<FibSpeedFanExtendData> = {
  name: 'fibSpeedFan',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'dashed', dashedValue: GRID_DASH },
    text: { color: TRENDLINE_COLOR, size: 11 }
  },
  extendData: {
    levels: DEFAULT_LEVELS,
    showBox: true,
    showLabels: true
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, bounding, isSelected, isHovered }) => {
    const extendData = (overlay.extendData as FibSpeedFanExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      if (dx !== 0 || dy !== 0) {
        if (extendData.showBox ?? true) {
          // Box outline + the P1→P2 diagonal, both in styles.line.
          figures.push(lineFigure('srf_box', [[
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p1.y },
            { x: p2.x, y: p2.y },
            { x: p1.x, y: p2.y },
            { x: p1.x, y: p1.y }
          ]], {}))
          figures.push(lineFigure('srf_trend', [[p1, p2]], {}))
        }
        const levels = readLevels(extendData, DEFAULT_LEVELS)
        const showLabels = extendData.showLabels ?? true
        const lineSize = overlay.styles?.line?.size ?? 1
        const labelAlign: CanvasTextAlign = dx >= 0 ? 'left' : 'right'
        const labelOffset = dx >= 0 ? 4 : -4
        levels.forEach((level, index) => {
          if (!level.visible) {
            return
          }
          // Horizontal-axis family: division point on the P2.x edge.
          const hTarget = { x: p2.x, y: p1.y + dy * level.coeff }
          figures.push(lineFigure(
            `srf_h_${index}`,
            [[p1, rayToBoundingEdge(p1, hTarget, bounding)]],
            { style: 'solid', size: lineSize, color: level.color }
          ))
          // Vertical-axis family: division point on the P2.y edge.
          const vTarget = { x: p1.x + dx * level.coeff, y: p2.y }
          figures.push(lineFigure(
            `srf_v_${index}`,
            [[p1, rayToBoundingEdge(p1, vTarget, bounding)]],
            { style: 'solid', size: lineSize, color: level.color }
          ))
          if (showLabels) {
            figures.push(labelFigure(
              `srf_label_${index}`,
              hTarget.x + labelOffset,
              hTarget.y,
              formatLevelLabel(level),
              level.color,
              labelAlign,
              'middle'
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

export default fibSpeedFan
