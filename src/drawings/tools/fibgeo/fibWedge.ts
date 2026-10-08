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

import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  FIB_COLORS,
  TRENDLINE_COLOR,
  distance,
  fibLevel,
  formatLevelLabel,
  labelFigure,
  lineFigure,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'fibWedge' — Fibonacci Wedge (3-point). P1 is the apex; the two boundary
 * rays run P1→P2 and P1→P3, both clipped to the wedge radius r = |P1→P2|
 * (P3 is projected onto its own ray at length r — TradingView behavior).
 * Fib-ratio intermediate rays subdivide the enclosed sector angle; a sector
 * arc at radius r closes the wedge.
 */

export interface FibWedgeExtendData {
  levels?: FibLevelData[]
  showLabels?: boolean
}

const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(0.236, FIB_COLORS.red),
  fibLevel(0.382, FIB_COLORS.orange),
  fibLevel(0.5, FIB_COLORS.green),
  fibLevel(0.618, FIB_COLORS.teal),
  fibLevel(0.786, FIB_COLORS.cyan)
]

/** Signed smallest rotation from a1 to a2 in (−π, π] — the wedge always spans the small sector. */
function signedSectorAngle (a1: number, a2: number): number {
  let da = a2 - a1
  while (da > Math.PI) {
    da -= Math.PI * 2
  }
  while (da <= -Math.PI) {
    da += Math.PI * 2
  }
  return da
}

const fibWedge: OverlayTemplate<FibWedgeExtendData> = {
  name: 'fibWedge',
  totalStep: 4,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'solid' },
    arc: { color: TRENDLINE_COLOR, size: 1, style: 'solid' },
    text: { color: TRENDLINE_COLOR, size: 11 }
  },
  extendData: {
    levels: DEFAULT_LEVELS,
    showLabels: true
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered }) => {
    const extendData = (overlay.extendData as FibWedgeExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 3) {
      const [p1, p2, p3] = coordinates
      const radius = distance(p1, p2)
      const spread = distance(p1, p3)
      if (radius > 0 && spread > 0) {
        const a1 = Math.atan2(p2.y - p1.y, p2.x - p1.x)
        const a2 = Math.atan2(p3.y - p1.y, p3.x - p1.x)
        const da = signedSectorAngle(a1, a2)
        const lineSize = overlay.styles?.line?.size ?? 1
        const lineColor = overlay.styles?.line?.color ?? TRENDLINE_COLOR
        // Boundary rays — P1→P2 exact, P1→P3 projected onto its own ray at
        // the wedge radius so both edges close on the same sector arc.
        figures.push(lineFigure('fib_wedge_edge', [
          [p1, p2],
          [p1, { x: p1.x + Math.cos(a2) * radius, y: p1.y + Math.sin(a2) * radius }]
        ], {}))
        // Fib-ratio intermediate rays subdividing the sector angle.
        const levels = readLevels(extendData, DEFAULT_LEVELS)
        const showLabels = extendData.showLabels ?? true
        levels.forEach((level, index) => {
          if (!level.visible) {
            return
          }
          const angle = a1 + da * level.coeff
          const end = { x: p1.x + Math.cos(angle) * radius, y: p1.y + Math.sin(angle) * radius }
          figures.push(lineFigure(
            `fib_wedge_ray_${index}`,
            [[p1, end]],
            { style: 'solid', size: lineSize, color: level.color }
          ))
          if (showLabels) {
            const labelRadius = radius + 12
            figures.push(labelFigure(
              `fib_wedge_label_${index}`,
              p1.x + Math.cos(angle) * labelRadius,
              p1.y + Math.sin(angle) * labelRadius,
              formatLevelLabel(level),
              level.color,
              'center',
              'middle'
            ))
          }
        })
        // Sector arc at the wedge radius closing the two boundary rays.
        if (da !== 0) {
          const attrs: ArcAttrs = {
            x: p1.x,
            y: p1.y,
            r: radius,
            startAngle: da > 0 ? a1 : a1 + da,
            endAngle: da > 0 ? a1 + da : a1
          }
          figures.push({
            key: 'fib_wedge_arc',
            type: 'arc',
            attrs,
            styles: { style: 'solid', size: lineSize, color: lineColor },
            bounds: { x: p1.x - radius, y: p1.y - radius, width: radius * 2, height: radius * 2 }
          })
        }
      }
    }
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_'
    }))
    return figures
  })
}

export default fibWedge
