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
  TRENDLINE_DASH,
  lineFigure
} from './fibGeoCommon'

/**
 * 'fibSpiral' — golden spiral (2-point). P1 is the spiral origin; P2 sits
 * ON the spiral at θ=0, so |P1→P2| is the base radius and the P1→P2
 * direction the spiral's rotation. r = baseRadius · φ^(2θ/π) — the
 * continuous golden-spiral form of successive fibonacci squares.
 * Ported from the consumer fibonacci-spiral.ts overlay.
 */

export interface FibSpiralExtendData {
  /** Mirror the spiral rotation (TradingView `counterclockwise`). */
  counterclockwise?: boolean
  /** Draw the dashed P1→P2 guide line. */
  trendlineVisible?: boolean
}

const PHI = 1.618033988749895
const SPIRAL_STEPS = 360
const MIN_THETA = -4 * Math.PI
const MAX_THETA = 4 * Math.PI
const MAX_RADIUS_FACTOR = 20
const MIN_RADIUS_PX = 0.5

const fibSpiral: OverlayTemplate<FibSpiralExtendData> = {
  name: 'fibSpiral',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: '#2962ff', size: 2, style: 'solid' }
  },
  extendData: {
    counterclockwise: false,
    trendlineVisible: true
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered }) => {
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
        const maxRadius = baseRadius * MAX_RADIUS_FACTOR
        const spiralPoints: Coordinate[] = []
        for (let i = 0; i <= SPIRAL_STEPS; i++) {
          const theta = MIN_THETA + (i / SPIRAL_STEPS) * (MAX_THETA - MIN_THETA)
          const r = baseRadius * Math.pow(PHI, (2 * theta) / Math.PI)
          if (r < MIN_RADIUS_PX) {
            continue
          }
          if (r > maxRadius) {
            break
          }
          spiralPoints.push({
            x: p1.x + r * Math.cos(baseAngle + dir * theta),
            y: p1.y + r * Math.sin(baseAngle + dir * theta)
          })
        }
        if (spiralPoints.length >= 2) {
          // Inherits styles.line (color/width from the toolbar).
          figures.push(lineFigure('fib_spiral', [spiralPoints], {}))
        }
        if (extendData.trendlineVisible ?? true) {
          const lineColor = overlay.styles?.line?.color ?? '#2962ff'
          figures.push(lineFigure(
            'fib_spiral_trend',
            [[p1, p2]],
            { style: 'dashed', size: 1, color: lineColor, dashedValue: TRENDLINE_DASH },
            true
          ))
        }
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

export default fibSpiral
