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
 * 'fibWedge' — TradingView Fib Wedge (3-point). P1 is the apex; boundary
 * rays run P1→P2 and P1→P3 (P3 projected onto its ray at wedge radius
 * r = |P1→P2|). Fib-ratio CONCENTRIC ARCS at radius coeff × r subdivide
 * the enclosed sector — the wedge is a set of annular arcs between the
 * two boundary rays, not radial spokes.
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
  cullable: false,
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
  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
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
        // Fib-ratio concentric arcs spanning the sector — annular sectors
        // at radius coeff × r, from boundary ray a1 to boundary ray a2.
        const levels = readLevels(extendData, DEFAULT_LEVELS)
        const showLabels = extendData.showLabels ?? true
        const startAngle = da > 0 ? a1 : a1 + da
        const endAngle = da > 0 ? a1 + da : a1
        levels.forEach((level, index) => {
          if (!level.visible) {
            return
          }
          const r = radius * level.coeff
          if (r <= 0) {
            return
          }
          const attrs: ArcAttrs = {
            x: p1.x,
            y: p1.y,
            r,
            startAngle,
            endAngle
          }
          figures.push({
            key: `fib_wedge_arc_${index}`,
            type: 'arc',
            attrs,
            styles: { style: 'solid', size: lineSize, color: level.color },
            bounds: { x: p1.x - r, y: p1.y - r, width: r * 2, height: r * 2 }
          })
          if (showLabels) {
            // Label sits at the arc's angular midpoint (TV labelPoint).
            const midAngle = a1 + da / 2
            const labelRadius = r
            figures.push(labelFigure(
              `fib_wedge_label_${index}`,
              p1.x + Math.cos(midAngle) * labelRadius,
              p1.y + Math.sin(midAngle) * labelRadius,
              formatLevelLabel(level),
              level.color,
              'center',
              'bottom'
            ))
          }
        })
        // Closing arc at the full wedge radius.
        if (da !== 0) {
          const attrs: ArcAttrs = {
            x: p1.x,
            y: p1.y,
            r: radius,
            startAngle,
            endAngle
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
      isTouch,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_'
    }))
    return figures
  })
}

export default fibWedge
