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

import { isValid } from '../../../common/utils/typeChecks'

import {
  createAnchorFigures,
  createSelectionOutlineFigures,
  computeResizeCursor
} from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  alphaColor,
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  pricePrecisionOf
} from '../lines/lineCommon'

import {
  FIB_COLORS,
  fibLevel,
  formatLevelLabel,
  gannBoxFanSegments,
  gannTransparencyAlpha,
  labelFigure,
  lineFigure,
  readLevels,
  squareHandleFigure
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'gannBox' — TradingView Gann Box (`linetoolgannsquare`, display name
 * "Gann box"). Two anchors span the box; seven horizontal (price) and
 * seven vertical (time) level lines divide it at fib fractions
 * [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1] — the 0 and 1 levels are the box
 * edges. Optional: per-level background bands (TV `fillHorz/VertBackground`,
 * transparency 80), four-corner fans to the level divisions (TV `fans`,
 * hidden by default), coeff labels on all four sides, `reverse` (fractions
 * measured from P2 instead of P1), and corner-to-corner diagonals
 * (`showDiagonals`, a port addition — TV draws none).
 *
 * Resize parity: TV exposes four anchors (the two stored points plus the
 * two derived corners `p0.index×p1.price` and `p1.index×p0.price`). The two
 * derived corners are emitted as `squareHandleFigure`s whose drags split
 * the write — x into the owning slot, y into the sibling — via
 * `performEventPressedMove` on the figure key.
 */

export interface GannBoxExtendData {
  levels?: FibLevelData[]
  /** TV `fans.visible` — 4-corner rays to each level division (default off). */
  showFans?: boolean
  /** TV `fans.color` — single color for every fan ray. */
  fanColor?: string
  /** Port addition: the two corner-to-corner diagonals (default off). */
  showDiagonals?: boolean
  /** TV `fillHorzBackground`/`fillVertBackground` (default true). */
  fillBackground?: boolean
  /** TV transparency percent, 80 → 0.2 alpha (0-1 fraction tolerated). */
  transparency?: number
  showLeftLabels?: boolean
  showRightLabels?: boolean
  showTopLabels?: boolean
  showBottomLabels?: boolean
  /** TV `reverse` — fractions measured from the second point. */
  reverse?: boolean
}

const DEFAULT_LEVELS: FibLevelData[] = [
  fibLevel(0, FIB_COLORS.gray),
  fibLevel(0.25, FIB_COLORS.orange),
  fibLevel(0.382, FIB_COLORS.cyan),
  fibLevel(0.5, FIB_COLORS.teal),
  fibLevel(0.618, FIB_COLORS.green),
  fibLevel(0.75, FIB_COLORS.blue),
  fibLevel(1, FIB_COLORS.gray)
]

const gannBox: OverlayTemplate<GannBoxExtendData> = {
  name: 'gannBox',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: 'rgba(21, 56, 153, 0.8)', size: 1, style: 'solid' },
    text: { color: FIB_COLORS.gray, size: 12 }
  },
  extendData: {
    levels: DEFAULT_LEVELS,
    showFans: false,
    showDiagonals: false,
    fillBackground: true,
    transparency: 80,
    showLeftLabels: true,
    showRightLabels: true,
    showTopLabels: true,
    showBottomLabels: true,
    reverse: false
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    const ext: GannBoxExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [c0, c1] = coordinates
      const minX = Math.min(c0.x, c1.x)
      const maxX = Math.max(c0.x, c1.x)
      const minY = Math.min(c0.y, c1.y)
      const maxY = Math.max(c0.y, c1.y)
      const width = maxX - minX
      const height = maxY - minY
      if (width > 0 && height > 0) {
        const levels = readLevels(ext, DEFAULT_LEVELS)
        const reverse = ext.reverse === true
        const lineSize = overlay.styles?.line?.size ?? 1
        const lineColor = overlay.styles?.line?.color ?? 'rgba(21, 56, 153, 0.8)'
        // Fractions run P1→P2, or P2→P1 when reversed (TV `reverse`).
        const xs = levels.map(level => reverse ? c1.x + level.coeff * (c0.x - c1.x) : c0.x + level.coeff * (c1.x - c0.x))
        const ys = levels.map(level => reverse ? c1.y + level.coeff * (c0.y - c1.y) : c0.y + level.coeff * (c1.y - c0.y))

        // Background bands between consecutive VISIBLE levels, each band
        // tinted with the deeper level's color (TV fillHorz/VertBackground).
        if (ext.fillBackground ?? true) {
          const alpha = gannTransparencyAlpha(ext.transparency)
          const visIdx: number[] = []
          levels.forEach((level, index) => {
            if (level.visible) {
              visIdx.push(index)
            }
          })
          for (let i = 1; i < visIdx.length; i++) {
            const prev = visIdx[i - 1]
            const curr = visIdx[i]
            const level = levels[curr]
            figures.push({
              key: `gb_hband_${curr}`,
              type: 'rect',
              attrs: { x: minX, y: Math.min(ys[prev], ys[curr]), width, height: Math.abs(ys[curr] - ys[prev]) },
              styles: { style: 'fill', color: alphaColor(level.color, alpha) },
              ignoreEvent: true
            })
            figures.push({
              key: `gb_vband_${curr}`,
              type: 'rect',
              attrs: { x: Math.min(xs[prev], xs[curr]), y: minY, width: Math.abs(xs[curr] - xs[prev]), height },
              styles: { style: 'fill', color: alphaColor(level.color, alpha) },
              ignoreEvent: true
            })
          }
        }

        if (ext.showDiagonals === true) {
          figures.push(lineFigure('gb_diags', [
            [{ x: minX, y: minY }, { x: maxX, y: maxY }],
            [{ x: minX, y: maxY }, { x: maxX, y: minY }]
          ], { style: 'solid', size: lineSize, color: lineColor }))
        }

        // Level lines — edge fractions (0/1) draw the box sides.
        levels.forEach((level, index) => {
          if (!level.visible) {
            return
          }
          const x = xs[index]
          const y = ys[index]
          figures.push(lineFigure(`gb_lvl_${index}`, [
            [{ x, y: minY }, { x, y: maxY }],
            [{ x: minX, y }, { x: maxX, y }]
          ], { style: 'solid', size: lineSize, color: level.color }))
        })

        // Fans: all four corners ray to each level's division points on the
        // opposite edges (8 rays per division, single fan color — off by
        // default in TradingView).
        if (ext.showFans === true) {
          const fanColor = ext.fanColor ?? FIB_COLORS.gray
          levels.forEach((level, index) => {
            if (!level.visible || level.coeff <= 0 || level.coeff >= 1) {
              return
            }
            figures.push(lineFigure(
              `gb_fan_${index}`,
              gannBoxFanSegments(minX, minY, maxX, maxY, xs[index], ys[index]),
              { style: 'solid', size: lineSize, color: fanColor }
            ))
          })
        }

        // Coeff labels on all four sides (all on by default in TV).
        const showLeft = ext.showLeftLabels ?? true
        const showRight = ext.showRightLabels ?? true
        const showTop = ext.showTopLabels ?? true
        const showBottom = ext.showBottomLabels ?? true
        if (showLeft || showRight || showTop || showBottom) {
          levels.forEach((level, index) => {
            if (!level.visible) {
              return
            }
            const text = formatLevelLabel(level)
            if (showLeft) {
              figures.push(labelFigure(`gb_label_l_${index}`, minX - 5, ys[index], text, level.color, 'right', 'middle'))
            }
            if (showRight) {
              figures.push(labelFigure(`gb_label_r_${index}`, maxX + 5, ys[index], text, level.color, 'left', 'middle'))
            }
            if (showTop) {
              figures.push(labelFigure(`gb_label_t_${index}`, xs[index], minY - 3, text, level.color, 'center', 'bottom'))
            }
            if (showBottom) {
              figures.push(labelFigure(`gb_label_b_${index}`, xs[index], maxY + 5, text, level.color, 'center', 'top'))
            }
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
      isTouch,
      keyPrefix: 'anchor_',
      midPoint: true,
      cursors: coordinates.length >= 2
        ? [computeResizeCursor(coordinates[1], coordinates[0]), computeResizeCursor(coordinates[0], coordinates[1])]
        : undefined
    }))
    if (coordinates.length >= 2 && overlay.lock && isSelected === true) {
      // Locked: mark the two derived corners too (all four box corners read
      // as frozen resize points).
      const [c0, c1] = coordinates
      figures.push(...createSelectionOutlineFigures({
        coordinates: [{ x: c0.x, y: c1.y }, { x: c1.x, y: c0.y }],
        isTouch,
        keyPrefix: 'anchor_c'
      }))
    } else if (
      coordinates.length >= 2 && !overlay.isDrawing() &&
      ((isSelected ?? false) || (isHovered ?? false)) && !(overlay.lock)
    ) {
      // Derived-corner handles: x writes the owning slot, y is re-routed
      // to the sibling in performEventPressedMove.
      const [c0, c1] = coordinates
      figures.push(squareHandleFigure('gb_corner_01', { x: c0.x, y: c1.y }, {
        pointIndex: 0,
        cursor: computeResizeCursor({ x: c1.x, y: c0.y }, { x: c0.x, y: c1.y }),
        isTouch
      }))
      figures.push(squareHandleFigure('gb_corner_10', { x: c1.x, y: c0.y }, {
        pointIndex: 1,
        cursor: computeResizeCursor({ x: c0.x, y: c1.y }, { x: c1.x, y: c0.y }),
        isTouch
      }))
    }
    return figures
  }),

  createXAxisFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 1) {
      return []
    }
    const lineColor = overlay.styles?.line?.color ?? 'rgba(21, 56, 153, 0.8)'
    const figures: OverlayFigure[] = []
    const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const d0 = formatDate(p0.timestamp)
    if (d0 !== '') {
      figures.push(buildXAxisPill(coordinates[0].x, d0, lineColor, 'gb_x0'))
    }
    if (coordinates.length >= 2) {
      const p1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
      const d1 = formatDate(p1.timestamp)
      if (d1 !== '') {
        figures.push(buildXAxisPill(coordinates[1].x, d1, lineColor, 'gb_x1'))
      }
    }
    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) {
      return []
    }
    const lineColor = overlay.styles?.line?.color ?? 'rgba(21, 56, 153, 0.8)'
    const precision = pricePrecisionOf(chart, overlay, yAxis)
    const figures: OverlayFigure[] = []
    const pt0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const p0 = buildYAxisPill(coordinates[0].y, pt0.value, lineColor, precision, bounding, yAxis ?? undefined, 'gb_y0')
    if (p0 !== null) {
      figures.push(p0)
    }
    if (coordinates.length >= 2) {
      const pt1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
      const p1 = buildYAxisPill(coordinates[1].y, pt1.value, lineColor, precision, bounding, yAxis ?? undefined, 'gb_y1')
      if (p1 !== null) {
        figures.push(p1)
      }
    }
    return figures
  },

  performEventPressedMove: (params) => {
    // Derived-corner split write (TradingView setPoint case 2/3): the
    // kernel wrote the full cursor point into the x-owner slot — keep its
    // time/index, move its value onto the y-owner, restore the x-owner's
    // own value from the gesture-start point.
    const key = params.figureKey
    const points = params.points
    const index = params.performPointIndex
    if (key === 'gb_corner_01' && index === 0) {
      const moved = points[0]
      const other = points[1]
      const prev = params.prevPoints[0]
      if (isValid(moved) && isValid(other) && isValid(prev)) {
        other.value = moved.value
        moved.value = prev.value
      }
    } else if (key === 'gb_corner_10' && index === 1) {
      const moved = points[1]
      const other = points[0]
      const prev = params.prevPoints[1]
      if (isValid(moved) && isValid(other) && isValid(prev)) {
        other.value = moved.value
        moved.value = prev.value
      }
    }
  }
}

export default gannBox
