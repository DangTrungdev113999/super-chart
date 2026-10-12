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

import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  FIB_COLORS,
  lineFigure,
  rayToBoundingEdge
} from './fibGeoCommon'

/**
 * 'fibSpiral' — TradingView Fib Spiral (2-point). P1 is the spiral
 * origin; P2 fixes scale and rotation: the rendered frame is rotated to
 * the P1→P2 direction and scaled by |P1P2| / 5, so the spiral passes
 * through P2 after one full revolution (radius = |P1P2| at the P2
 * angle). The radius is NOT the φ^(2θ/π) exponential — TV interpolates a
 * fibonacci table `[0,1,2,3,5,8,13,21,34,55,89]` piecewise-linearly with
 * a frac^1.15 ease, one table index per quarter turn (50 steps of
 * π/100), 10 quarter-turns total (~2.5 revolutions). `counterclockwise`
 * mirrors the sweep; the P1→P2 trendline extends past P2 to the pane
 * edge in the spiral's own line style (TV `extendright`).
 */

export interface FibSpiralExtendData {
  /** Mirror the spiral rotation (TradingView `counterclockwise`). */
  counterclockwise?: boolean
  /** Draw the P1→P2 guide ray (TradingView trendline, always on in TV). */
  trendlineVisible?: boolean
}

/** TradingView `_fib` table — one entry per quarter turn of the spiral. */
const FIB_SEQUENCE = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
/** Steps per quarter turn — the angle advances π/100 per step. */
const STEPS_PER_QUARTER = 50
const ANGLE_STEP = Math.PI / (2 * STEPS_PER_QUARTER)
const TOTAL_STEPS = STEPS_PER_QUARTER * (FIB_SEQUENCE.length - 1)

/** TradingView `_continiusFib` — piecewise-linear fib index, frac^1.15. */
function continuousFib (x: number): number | null {
  const lo = Math.floor(x)
  const hi = Math.ceil(x)
  if (hi >= FIB_SEQUENCE.length) {
    return null
  }
  const frac = Math.pow(x - lo, 1.15)
  return FIB_SEQUENCE[lo] + (FIB_SEQUENCE[hi] - FIB_SEQUENCE[lo]) * frac
}

const fibSpiral: OverlayTemplate<FibSpiralExtendData> = {
  name: 'fibSpiral',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    // TV defaults — colorSkyBlue500, linewidth 2, LINESTYLE_SOLID.
    line: { color: FIB_COLORS.cyan, size: 2, style: 'solid' }
  },
  extendData: {
    counterclockwise: false,
    trendlineVisible: true
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, bounding, isSelected, isHovered, isTouch }) => {
    const extendData = (overlay.extendData as FibSpiralExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const baseRadius = Math.sqrt(dx * dx + dy * dy)
      const baseAngle = Math.atan2(dy, dx)
      if (baseRadius >= 1) {
        const dir = (extendData.counterclockwise ?? false) ? -1 : 1
        // TV: ctx.translate(P1) → rotate(P1→P2 angle) → scale(s/5) —
        // i.e. world radius = fibIndex · |P1P2|/5 at angle base+θ.
        const scale = baseRadius / 5
        const spiralPoints: Coordinate[] = []
        for (let e = 0; e < TOTAL_STEPS; e++) {
          const n = continuousFib(e / STEPS_PER_QUARTER)
          if (n === null) {
            break
          }
          const angle = dir * e * ANGLE_STEP
          const r = n * scale
          spiralPoints.push({
            x: p1.x + r * Math.cos(baseAngle + angle),
            y: p1.y + r * Math.sin(baseAngle + angle)
          })
        }
        if (spiralPoints.length >= 2) {
          // Inherits styles.line (color/width/style from the toolbar).
          figures.push(lineFigure('fib_spiral', [spiralPoints], {}))
        }
        if (extendData.trendlineVisible ?? true) {
          // TV TrendLineRenderer extendright — the P1→P2 ray runs on to
          // the pane edge in the SAME line style as the spiral.
          figures.push(lineFigure(
            'fib_spiral_trend',
            [[p1, rayToBoundingEdge(p1, p2, bounding)]],
            {}
          ))
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
      keyPrefix: 'anchor_',
      midPoint: true,
      cursors: coordinates.length >= 2
        ? [computeResizeCursor(coordinates[1], coordinates[0]), computeResizeCursor(coordinates[0], coordinates[1])]
        : undefined
    }))
    return figures
  })
}

export default fibSpiral
