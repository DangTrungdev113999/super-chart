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

import { alphaColor } from '../../../extension/overlay/lineCommon'

import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  FIB_COLORS,
  TRENDLINE_COLOR,
  fibLevel,
  formatLevelLabel,
  gannTransparencyAlpha,
  labelFigure,
  lineFigure,
  rayToBoundingEdge,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'gannFan' — Gann Fan (2-point). P1 is the fan apex; the P1→P2 vector is
 * the 1×1 angle. Each level's coeff is the price/time ratio n/d —
 * "n/d". Ratios > 1 are the steep fans: their division point lands on the
 * P2.x edge at y = P1.y + dy/coeff; ratios ≤ 1 land on the P2.y edge at
 * x = P1.x + dx·coeff (TradingView formula, fan lines extend to the pane
 * edge — `extendright` in the TrendLineRenderer).
 *
 * TradingView `fillBackground` (on by default, transparency 80): a
 * translucent triangle is shaded between each pair of adjacent visible
 * rays, apex → division_i → division_neighbor, inside the P1→P2 box only.
 * Level slots 1-3 (1/8…1/3) shade toward the NEXT visible ray, slots 5-9
 * (1/1…8/1) shade toward the PREVIOUS one — each band taking its emitting
 * level's color; the 1/2 slot (index 4) emits no band of its own.
 *
 * Labels (TV `showLabels`, on by default) sit ON the division point:
 * left/middle aligned, offset +5px down, size 12, "n/d" text.
 */

export interface GannFanExtendData {
  levels?: FibLevelData[]
  showLabels?: boolean
  /** TV `fillBackground` — translucent bands between the rays (default true). */
  fillBackground?: boolean
  /** TV `transparency` percent for the bands, 80 → 0.2 alpha. */
  transparency?: number
}

const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(1 / 8, FIB_COLORS.orange, true, '1/8'),
  fibLevel(1 / 4, FIB_COLORS.teal, true, '1/4'),
  fibLevel(1 / 3, FIB_COLORS.green, true, '1/3'),
  fibLevel(1 / 2, FIB_COLORS.teal, true, '1/2'),
  fibLevel(1, FIB_COLORS.cyan, true, '1/1'),
  fibLevel(2, FIB_COLORS.blue, true, '2/1'),
  fibLevel(3, FIB_COLORS.purple, true, '3/1'),
  fibLevel(4, FIB_COLORS.pink, true, '4/1'),
  fibLevel(8, FIB_COLORS.red, true, '8/1')
]

const gannFan: OverlayTemplate<GannFanExtendData> = {
  name: 'gannFan',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'solid' },
    text: { color: TRENDLINE_COLOR, size: 12 }
  },
  extendData: {
    levels: DEFAULT_LEVELS,
    showLabels: true,
    fillBackground: true,
    transparency: 80
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, bounding, isSelected, isHovered, isTouch }) => {
    const extendData = (overlay.extendData as GannFanExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      if (dx !== 0 || dy !== 0) {
        const levels = readLevels(extendData, DEFAULT_LEVELS)
        const showLabels = extendData.showLabels ?? true
        const fillBackground = extendData.fillBackground ?? true
        const alpha = gannTransparencyAlpha(extendData.transparency)
        const lineSize = overlay.styles?.line?.size ?? 1
        // TradingView division point: steep ratios (>1) divide the y-span
        // on the P2.x edge; shallow ratios divide the x-span on P2.y edge.
        // `n[]`/`index` parity: the slot number is the level's 1-based
        // position in the array — it decides the fill-band direction.
        const divisions: Array<{ x: number, y: number }> = []
        const slots: number[] = []
        levels.forEach((level, index) => {
          if (!level.visible) {
            return
          }
          divisions.push(level.coeff > 1
            ? { x: p2.x, y: p1.y + dy / level.coeff }
            : { x: p1.x + dx * level.coeff, y: p2.y })
          slots.push(index + 1)
        })
        divisions.forEach((division, e) => {
          const level = levels[slots[e] - 1]
          // TV ChannelRenderer band: shaded triangle apex → division_e →
          // division_neighbor inside the P2 box (never to the pane edge).
          if (fillBackground) {
            const neighbor = slots[e] < 4 ? e + 1 : slots[e] > 4 ? e - 1 : -1
            if (neighbor >= 0 && neighbor < divisions.length) {
              figures.push({
                key: `gann_fan_fill_${e}`,
                type: 'polygon',
                attrs: { coordinates: [p1, division, divisions[neighbor]] },
                styles: { style: 'fill', color: alphaColor(level.color, alpha) },
                ignoreEvent: true
              })
            }
          }
          figures.push(lineFigure(
            `gann_fan_${e}`,
            [[p1, rayToBoundingEdge(p1, division, bounding)]],
            { style: 'solid', size: lineSize, color: level.color }
          ))
          if (showLabels) {
            // TV TextRenderer: on the division point — left/middle aligned,
            // +5px down, "n/d" text. fontsize 12 (labelsStyle default).
            const label = labelFigure(
              `gann_fan_label_${e}`,
              division.x,
              division.y + 5,
              formatLevelLabel(level),
              level.color,
              'left',
              'middle'
            )
            label.styles = { ...(label.styles as Record<string, unknown>), size: 12 }
            figures.push(label)
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

export default gannFan
