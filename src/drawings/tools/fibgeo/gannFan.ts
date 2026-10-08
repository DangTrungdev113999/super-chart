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
  fibLevel,
  formatLevelLabel,
  labelFigure,
  lineFigure,
  rayToBoundingEdge,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'gannFan' — Gann Fan (2-point). P1 is the fan apex; the P1→P2 vector is
 * the 1×1 angle. Each level's coeff is the price/time ratio n/d —
 * "n×d". Ratios > 1 are the steep fans: their division point lands on the
 * P2.x edge at y = P1.y + dy/coeff; ratios ≤ 1 land on the P2.y edge at
 * x = P1.x + dx·coeff (TradingView formula, fan extends to the pane edge).
 */

export interface GannFanExtendData {
  levels?: FibLevelData[]
  showLabels?: boolean
}

const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(1 / 8, FIB_COLORS.orange, true, '1×8'),
  fibLevel(1 / 4, FIB_COLORS.green, true, '1×4'),
  fibLevel(1 / 3, FIB_COLORS.teal, true, '1×3'),
  fibLevel(1 / 2, FIB_COLORS.green, true, '1×2'),
  fibLevel(1, FIB_COLORS.cyan, true, '1×1'),
  fibLevel(2, FIB_COLORS.blue, true, '2×1'),
  fibLevel(3, FIB_COLORS.purple, true, '3×1'),
  fibLevel(4, FIB_COLORS.pink, true, '4×1'),
  fibLevel(8, FIB_COLORS.red, true, '8×1')
]

const gannFan: OverlayTemplate<GannFanExtendData> = {
  name: 'gannFan',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'solid' },
    text: { color: TRENDLINE_COLOR, size: 11 }
  },
  extendData: {
    levels: DEFAULT_LEVELS,
    showLabels: true
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, bounding, isSelected, isHovered }) => {
    const extendData = (overlay.extendData as GannFanExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      if (dx !== 0 || dy !== 0) {
        const levels = readLevels(extendData, DEFAULT_LEVELS)
        const showLabels = extendData.showLabels ?? true
        const lineSize = overlay.styles?.line?.size ?? 1
        const labelAlign: CanvasTextAlign = dx >= 0 ? 'left' : 'right'
        const labelOffset = dx >= 0 ? 4 : -4
        levels.forEach((level, index) => {
          if (!level.visible) {
            return
          }
          // TradingView division point: steep ratios (>1) divide the y-span
          // on the P2.x edge; shallow ratios divide the x-span on P2.y edge.
          const division = level.coeff > 1
            ? { x: p2.x, y: p1.y + dy / level.coeff }
            : { x: p1.x + dx * level.coeff, y: p2.y }
          figures.push(lineFigure(
            `gann_fan_${index}`,
            [[p1, rayToBoundingEdge(p1, division, bounding)]],
            { style: 'solid', size: lineSize, color: level.color }
          ))
          if (showLabels) {
            figures.push(labelFigure(
              `gann_fan_label_${index}`,
              division.x + labelOffset,
              division.y,
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

export default gannFan
