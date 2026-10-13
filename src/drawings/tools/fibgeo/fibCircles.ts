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

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'
import { alphaColor } from '../../../extension/overlay/lineCommon'

import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'
import { applySnap45 } from '../lines/lineCommon'

import {
  FIB_COLORS,
  TRENDLINE_DASH,
  ellipseRingPath,
  fibLevel,
  formatLevelLabel,
  gannTransparencyAlpha,
  labelFigure,
  lineFigure,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'fibCircles' — TradingView Fib Circles (2-point). ALL rings share the
 * MIDPOINT of P1→P2 as center; the level-coeff ring is the ellipse
 * inscribed in the P1P2 bounding box scaled by `coeff` —
 * rx = ½·|Δx|·coeff, ry = ½·|Δy|·coeff — so rings deform per-axis when
 * either axis zooms/pans instead of staying round (TV
 * `EllipseRendererSimple` parity). `fillBackground` shades the ring
 * between each visible ellipse and the previous one (innermost disc
 * filled whole), `showCoeffs` hangs each label just left of the ring's
 * bottom point, and `trendline` draws the dashed P1→P2 segment.
 */

export interface FibCirclesExtendData {
  levels?: FibLevelData[]
  /** TV `fillBackground` — ring fills between adjacent rings (default true). */
  fillBackground?: boolean
  /** TV `transparency` percent — 80 → alpha 0.2 (default 80). */
  transparency?: number
  /** Draw the dashed P1→P2 radial line (TV `trendline.visible`). */
  trendlineVisible?: boolean
  /** TV `showCoeffs` — per-level coeff captions (default true). */
  showLabels?: boolean
  /** TV `coeffsAsPercents` — render coeffs as '23.60%' (default false). */
  coeffsAsPercents?: boolean
}

// TradingView `linetoolfibcircles` — 11 levels, all visible.
const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(0.236, FIB_COLORS.red), // colorRipeRed500
  fibLevel(0.382, FIB_COLORS.orange), // colorTanOrange500
  fibLevel(0.5, FIB_COLORS.teal), // colorMintyGreen500
  fibLevel(0.618, FIB_COLORS.green), // colorIguanaGreen500
  fibLevel(0.786, FIB_COLORS.cyan), // colorSkyBlue500
  fibLevel(1, FIB_COLORS.coldGray), // colorColdGray500
  fibLevel(1.618, FIB_COLORS.blue), // colorTvBlue500
  fibLevel(2.618, FIB_COLORS.pink), // colorBerryPink500
  fibLevel(3.618, FIB_COLORS.blue), // colorTvBlue500
  fibLevel(4.236, FIB_COLORS.pink), // colorBerryPink500
  fibLevel(4.618, FIB_COLORS.red) // colorRipeRed500
]

const fibCircles: OverlayTemplate<FibCirclesExtendData> = {
  name: 'fibCircles',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    // TV `trendline` — colorColdGray500, width 1, LINESTYLE_DASHED.
    line: { color: FIB_COLORS.coldGray, size: 1, style: 'dashed', dashedValue: TRENDLINE_DASH },
    text: { color: FIB_COLORS.coldGray, size: 12 }
  },
  extendData: {
    levels: DEFAULT_LEVELS,
    fillBackground: true,
    transparency: 80,
    trendlineVisible: true,
    showLabels: true,
    coeffsAsPercents: false
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    const extendData = (overlay.extendData as FibCirclesExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      // TV: common centre at the segment midpoint; the coeff-1 ring is the
      // ellipse inscribed in the P1P2 box, so radii are HALF the box.
      const cx = (p1.x + p2.x) / 2
      const cy = (p1.y + p2.y) / 2
      const halfW = Math.abs(p2.x - p1.x) / 2
      const halfH = Math.abs(p2.y - p1.y) / 2
      if (halfW > 0 || halfH > 0) {
        const visible = readLevels(extendData, DEFAULT_LEVELS)
          .filter(level => level.visible)
          .map(level => ({ level, rx: halfW * level.coeff, ry: halfH * level.coeff }))
          .filter(ring => ring.rx > 0 && ring.ry > 0)
        if (extendData.fillBackground ?? true) {
          const alpha = gannTransparencyAlpha(extendData.transparency)
          visible.forEach((ring, index) => {
            const inner = index > 0 ? visible[index - 1] : { rx: 0, ry: 0 }
            figures.push({
              key: `fib_circle_fill_${index}`,
              type: 'path',
              attrs: {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                path: ellipseRingPath(cx, cy, ring.rx, ring.ry, inner.rx, inner.ry)
              },
              styles: { style: 'fill', color: alphaColor(ring.level.color, alpha) }
            })
          })
        }
        const lineSize = overlay.styles?.line?.size ?? 1
        const showLabels = extendData.showLabels ?? true
        visible.forEach((ring, index) => {
          figures.push({
            key: `fib_circle_${index}`,
            type: 'ellipse',
            attrs: { x: cx, y: cy, rx: ring.rx, ry: ring.ry },
            styles: { style: 'stroke', borderColor: ring.level.color, borderSize: lineSize },
            bounds: { x: cx - ring.rx, y: cy - ring.ry, width: ring.rx * 2, height: ring.ry * 2 }
          })
          if (showLabels) {
            // TV labelPoint is the ring's bottom point; `horzAlign Left` +
            // offsetX 4 → the label starts 4px right of it, vertically
            // centred on the ring edge. `coeffsAsPercents` swaps the
            // numeric coeff for the percentage format (tailSize 2).
            const text = extendData.coeffsAsPercents === true
              ? `${(ring.level.coeff * 100).toFixed(2)}%`
              : formatLevelLabel(ring.level)
            figures.push(labelFigure(
              `fib_circle_label_${index}`,
              cx + 4,
              cy + ring.ry,
              text,
              ring.level.color,
              'left',
              'middle',
              12
            ))
          }
        })
        if (extendData.trendlineVisible ?? true) {
          // Inherits styles.line (dashed trendline color from the toolbar).
          figures.push(lineFigure('fib_circles_trend', [[p1, p2]], {}))
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
  }),

  // TV `snapTo45DegreesAvailable() → true`: Shift/align-45 constrains the
  // dragged endpoint onto the nearest 45° ray from the other point.
  performEventPressedMove: function (this: Overlay<FibCirclesExtendData>, params) {
    if (params.performPointIndex === 0 || params.performPointIndex === 1) {
      applySnap45(this, params, params.performPointIndex === 0 ? 1 : 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<FibCirclesExtendData>, params) {
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  }
}

export default fibCircles
