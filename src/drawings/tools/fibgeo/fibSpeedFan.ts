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

import { isBoolean, isNumber } from '../../../common/utils/typeChecks'

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'
import { alphaColor } from '../../../extension/overlay/lineCommon'

import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'
import { applySnap45 } from '../lines/lineCommon'

import {
  FIB_COLORS,
  fibLevel,
  formatLevelLabel,
  gannTransparencyAlpha,
  labelFigure,
  lineFigure,
  rayToBoundingEdge,
  rayWedgePolygon,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'fibSpeedFan' — TradingView Fib Speed Resistance Fan (2-point). TWO
 * level families at the same fractions: H-levels divide the PRICE span
 * (level positions computed in value space through `yAxis`), V-levels
 * divide the BAR-INDEX span (positions through `xAxis`, index-snapped).
 * Per visible level a ray fans from P1 through the level's box-edge
 * division point and runs to the pane edge (TV `extendright`); a grid
 * line crosses the box at the same position (levels 0/1 draw the box
 * edges — TV draws no separate outline or P1→P2 diagonal). Adjacent
 * visible levels get a wedge fill, and coeff labels hang 5px outside
 * each box edge. `reverse` measures fractions P1→P2 instead of P2→P1 —
 * TV's restore migration also maps old saves onto it.
 */

export interface FibSpeedFanExtendData {
  /** Horizontal-family levels (the dialog-bound `levels` contract). */
  levels?: FibLevelData[]
  /** Vertical-family levels — additive; defaults to the same TV set. */
  vlevels?: FibLevelData[]
  /** TV `fillBackground` — wedge fills between adjacent rays (default true). */
  fillBackground?: boolean
  /** TV `transparency` percent — 80 → alpha 0.2 (default 80). */
  transparency?: number
  /** TV `grid.visible` — box-cross lines at each visible level (default true). */
  gridVisible?: boolean
  /** TV `grid.color` (default 'rgba(21, 56, 153, 0.8)'). */
  gridColor?: string
  /**
   * TV `reverse` — measure level fractions from P1→P2 instead of P2→P1.
   * Drawings saved by the pre-parity build carried `showBox` and rendered
   * the P1→P2 convention, so an absent `reverse` on such data reads true
   * (mirrors TV's own `createProperties` migration).
   */
  reverse?: boolean
  /** Master label gate — pre-existing contract (default true). */
  showLabels?: boolean
  showLeftLabels?: boolean
  showRightLabels?: boolean
  showTopLabels?: boolean
  showBottomLabels?: boolean
  /**
   * Legacy field — TV renders no box/diagonal, so it only marks pre-parity
   * saves: it feeds the `reverse` migration probe and an absent
   * `gridVisible` falls back to it as the closest equivalent.
   */
  showBox?: boolean
}

// TradingView `linetoolfibspeedresistancefan` — 7 h + 7 v levels, all visible.
const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(0, FIB_COLORS.coldGray), // colorColdGray500
  fibLevel(0.25, FIB_COLORS.orange), // colorTanOrange500
  fibLevel(0.382, FIB_COLORS.cyan), // colorSkyBlue500
  fibLevel(0.5, FIB_COLORS.green), // colorIguanaGreen500
  fibLevel(0.618, FIB_COLORS.teal), // colorMintyGreen500
  fibLevel(0.75, FIB_COLORS.blue), // colorTvBlue500
  fibLevel(1, FIB_COLORS.coldGray) // colorColdGray500
]

/** TV `grid.color` default. */
const GRID_COLOR = 'rgba(21, 56, 153, 0.8)'
/** TV label gutter — text boxes sit 5px outside the box edge. */
const LABEL_GAP = 5
const LABEL_SIZE = 12

const fibSpeedFan: OverlayTemplate<FibSpeedFanExtendData> = {
  name: 'fibSpeedFan',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    // Tool `linewidth`/`linestyle` drive the fan rays (levels carry color).
    line: { color: FIB_COLORS.coldGray, size: 1, style: 'solid' },
    text: { color: FIB_COLORS.coldGray, size: LABEL_SIZE }
  },
  // `reverse` deliberately NOT seeded — an absent key on restored saves
  // falls through to the `showBox` legacy probe (see below); new drawings
  // get it stamped by onDrawStart so the settings dialog can toggle it.
  extendData: {
    levels: DEFAULT_LEVELS,
    vlevels: DEFAULT_LEVELS,
    fillBackground: true,
    transparency: 80,
    gridVisible: true,
    gridColor: GRID_COLOR,
    showLabels: true,
    showLeftLabels: true,
    showRightLabels: true,
    showTopLabels: true,
    showBottomLabels: true
  },
  onDrawStart: ({ overlay }) => {
    // Stamp the new-drawing default — TradingView's `createProperties`
    // shim in reverse: restored saves skip draw events entirely, so an
    // absent `reverse` key marks pre-parity data (see the read below).
    const extendData = (overlay.extendData as FibSpeedFanExtendData | undefined) ?? {}
    if (extendData.reverse === undefined) {
      overlay.extendData = { ...extendData, reverse: false }
      overlay.invalidateFigures()
    }
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, bounding, xAxis, yAxis, isSelected, isHovered, isTouch }) => {
    const extendData = (overlay.extendData as FibSpeedFanExtendData | undefined) ?? {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [p1, p2] = coordinates
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      if (dx !== 0 || dy !== 0) {
        const minX = Math.min(p1.x, p2.x)
        const maxX = Math.max(p1.x, p2.x)
        const minY = Math.min(p1.y, p2.y)
        const maxY = Math.max(p1.y, p2.y)
        // Absent on old saves (which carried `showBox` and drew the
        // reversed convention) — read it as a legacy marker, exactly the
        // migration TradingView performs in `createProperties`.
        const reverse = extendData.reverse ?? isBoolean(extendData.showBox)

        const v1 = overlay.points[0]?.value
        const v2 = overlay.points[1]?.value
        const i1 = overlay.points[0]?.dataIndex
        const i2 = overlay.points[1]?.dataIndex

        // TV: `d = p + coeff·c` in PRICE space, then priceToCoordinate —
        // linear in raw value (NOT the log-aware real-space lerp).
        const levelY = (coeff: number): number => {
          const fallback = reverse
            ? p1.y + (p2.y - p1.y) * coeff
            : p2.y + (p1.y - p2.y) * coeff
          if (isNumber(v1) && isNumber(v2) && yAxis !== null) {
            const value = reverse ? v1 + (v2 - v1) * coeff : v2 + (v1 - v2) * coeff
            const y = yAxis.convertToPixel(value)
            if (Number.isFinite(y)) {
              return y
            }
          }
          return fallback
        }
        // TV: `o = round(u + coeff·h)` on bar indexes, then indexToCoordinate.
        const levelX = (coeff: number): number => {
          const fallback = reverse
            ? p1.x + (p2.x - p1.x) * coeff
            : p2.x + (p1.x - p2.x) * coeff
          if (isNumber(i1) && isNumber(i2) && xAxis !== null) {
            const index = Math.round(reverse ? i1 + (i2 - i1) * coeff : i2 + (i1 - i2) * coeff)
            const x = xAxis.convertToPixel(index)
            if (Number.isFinite(x)) {
              return x
            }
          }
          return fallback
        }

        const hLevels = readLevels(extendData, DEFAULT_LEVELS)
          .filter(level => level.visible)
          .map(level => ({ level, y: levelY(level.coeff) }))
        // Old saves carried ONE `levels` array drawn on both edges — mirror
        // it when `vlevels` is absent so restored geometry keeps its set.
        const vLevels = readLevels({ levels: extendData.vlevels ?? extendData.levels }, DEFAULT_LEVELS)
          .filter(level => level.visible)
          .map(level => ({ level, x: levelX(level.coeff) }))

        const lineSize = overlay.styles?.line?.size ?? 1
        const lineStyle = overlay.styles?.line?.style ?? 'solid'
        const lineDash = overlay.styles?.line?.dashedValue ?? [2, 2]

        // Wedge fills between adjacent visible levels — drawn under all
        // linework (TV `fillBackground`, ChannelRenderer parity).
        if (extendData.fillBackground ?? true) {
          const alpha = gannTransparencyAlpha(extendData.transparency)
          for (let e = 1; e < hLevels.length; e++) {
            const wedge = rayWedgePolygon(
              p1,
              { x: p2.x, y: hLevels[e].y },
              { x: p2.x, y: hLevels[e - 1].y },
              bounding
            )
            if (wedge.length >= 3) {
              figures.push({
                key: `srf_hfill_${e}`,
                type: 'polygon',
                attrs: { coordinates: wedge },
                styles: { style: 'fill', color: alphaColor(hLevels[e].level.color, alpha) }
              })
            }
          }
          for (let e = 1; e < vLevels.length; e++) {
            const wedge = rayWedgePolygon(
              p1,
              { x: vLevels[e].x, y: p2.y },
              { x: vLevels[e - 1].x, y: p2.y },
              bounding
            )
            if (wedge.length >= 3) {
              figures.push({
                key: `srf_vfill_${e}`,
                type: 'polygon',
                attrs: { coordinates: wedge },
                styles: { style: 'fill', color: alphaColor(vLevels[e].level.color, alpha) }
              })
            }
          }
        }

        // Grid: one box-crossing line per visible level — coeffs 0 and 1
        // land on the box edges, which is how TV draws the "outline".
        const gridVisible = extendData.gridVisible ?? extendData.showBox ?? true
        if (gridVisible) {
          const gridColor = extendData.gridColor ?? GRID_COLOR
          hLevels.forEach((entry, index) => {
            figures.push(lineFigure(`srf_grid_h_${index}`, [
              [{ x: minX, y: entry.y }, { x: maxX, y: entry.y }]
            ], { style: 'solid', size: 1, color: gridColor }))
          })
          vLevels.forEach((entry, index) => {
            figures.push(lineFigure(`srf_grid_v_${index}`, [
              [{ x: entry.x, y: minY }, { x: entry.x, y: maxY }]
            ], { style: 'solid', size: 1, color: gridColor }))
          })
        }

        // Fan rays — P1 through the box-edge division point, extended to
        // the pane edge (TV TrendLineRenderer `extendright`).
        hLevels.forEach((entry, index) => {
          figures.push(lineFigure(`srf_h_${index}`, [
            [p1, rayToBoundingEdge(p1, { x: p2.x, y: entry.y }, bounding)]
          ], { style: lineStyle, size: lineSize, color: entry.level.color, dashedValue: lineDash }))
        })
        vLevels.forEach((entry, index) => {
          figures.push(lineFigure(`srf_v_${index}`, [
            [p1, rayToBoundingEdge(p1, { x: entry.x, y: p2.y }, bounding)]
          ], { style: lineStyle, size: lineSize, color: entry.level.color, dashedValue: lineDash }))
        })

        // Coeff labels hang 5px OUTSIDE the box edges (TV TextRenderer —
        // h-family on left/right at level height, v-family on top/bottom).
        const showLabels = extendData.showLabels ?? true
        if (showLabels) {
          const left = extendData.showLeftLabels ?? true
          const right = extendData.showRightLabels ?? true
          const top = extendData.showTopLabels ?? true
          const bottom = extendData.showBottomLabels ?? true
          hLevels.forEach((entry, index) => {
            const text = formatLevelLabel(entry.level)
            if (left) {
              figures.push(labelFigure(
                `srf_label_l_${index}`,
                minX - LABEL_GAP,
                entry.y,
                text,
                entry.level.color,
                'right',
                'middle',
                LABEL_SIZE
              ))
            }
            if (right) {
              figures.push(labelFigure(
                `srf_label_r_${index}`,
                maxX + LABEL_GAP,
                entry.y,
                text,
                entry.level.color,
                'left',
                'middle',
                LABEL_SIZE
              ))
            }
          })
          vLevels.forEach((entry, index) => {
            const text = formatLevelLabel(entry.level)
            if (top) {
              figures.push(labelFigure(
                `srf_label_t_${index}`,
                entry.x,
                minY - LABEL_GAP,
                text,
                entry.level.color,
                'center',
                'bottom',
                LABEL_SIZE
              ))
            }
            if (bottom) {
              figures.push(labelFigure(
                `srf_label_b_${index}`,
                entry.x,
                maxY + LABEL_GAP,
                text,
                entry.level.color,
                'center',
                'top',
                LABEL_SIZE
              ))
            }
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
  performEventPressedMove: function (this: Overlay<FibSpeedFanExtendData>, params) {
    if (params.performPointIndex === 0 || params.performPointIndex === 1) {
      applySnap45(this, params, params.performPointIndex === 0 ? 1 : 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<FibSpeedFanExtendData>, params) {
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  }
}

export default fibSpeedFan
