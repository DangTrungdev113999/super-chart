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

import type { Overlay, OverlayFigure, OverlayTemplate, OverlayPerformEventParams } from '../../../component/Overlay'

import { isNumber, isValid } from '../../../common/utils/typeChecks'

import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import { isSnap45Active } from '../../interaction/snap45'
import { withPerfPipeline } from '../../interaction/perf'

import {
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  formatNum,
  lineChartOf,
  pricePrecisionOf,
  rememberLineChart
} from '../lines/lineCommon'

import {
  FIB_COLORS,
  TRENDLINE_COLOR,
  coordinateToPoint,
  defaultGannArcs,
  defaultGannFanLines,
  defaultGannSquareLevels,
  gannArcFigures,
  gannLevelLineFigures,
  gannP1FanFigures,
  labelFigure,
  pointToCoordinate,
  readArcs,
  readFanLines,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData, GannArcData, GannFanLineData } from './fibGeoCommon'

/**
 * 'gannComplex' — TradingView Gann Complex (`linetoolganncomplex`, shown
 * in the UI as "Gann square", the Square-of-9 variant). Two anchors span
 * the square: six fifth-division level lines (edges 0/1 are the border),
 * the {x, y} fanline ratios radiating from the start vertex, and the
 * {x, y} quarter-ellipse arc scales with ring-sector fill — the shared
 * gann-square family render, identical to linetoolgannfixed's interior.
 *
 * Labels (TV `showLabels`, on by default): the price span at the
 * (p1.x, p2.y) corner, the bar span at (p2.x, p1.y), and the implied
 * scale ratio |priceDiff/indexDiff| at the end corner — placed with TV's
 * alignment/offset rules in the last level's color.
 *
 * Square correction (TV `_correctPoint`): while the second point is being
 * drawn the box is always corrected to a pixel square (the dragged
 * point's y is re-derived from |dx| keeping the cursor's side); after the
 * draw, a plain drag is freeform and Shift (or the align-45 toggle)
 * re-applies the correction. `reverse` swaps the render start/end.
 */

export interface GannComplexExtendData {
  levels?: FibLevelData[]
  fanlines?: GannFanLineData[]
  arcs?: GannArcData[]
  /** TV `arcsBackground.fillBackground` (default true). */
  fillArcsBackground?: boolean
  /** TV `arcsBackground.transparency` percent, 80 → 0.2 alpha. */
  arcsTransparency?: number
  /** TV `showLabels` — the diff/ratio corner labels (default true). */
  showLabels?: boolean
  /** TV `reverse` — render from the second point toward the first. */
  reverse?: boolean
}

/**
 * TV `_correctPoint` pixel form: keep the dragged point's x, rewrite its
 * value so the pixel offset from the fixed point is square (|dy| = |dx|,
 * side preserved). The x is unchanged → only `value` is written.
 */
function correctToSquare (overlay: Overlay<GannComplexExtendData>, params: OverlayPerformEventParams, moveIndex: number, fixedIndex: number): void {
  const event = params.event
  const chart = lineChartOf(overlay)
  if (event === undefined || chart === undefined || !isNumber(event.x) || !isNumber(event.y)) {
    return
  }
  const fixed = params.points[fixedIndex]
  if (!isValid(fixed)) {
    return
  }
  const fixedPx = pointToCoordinate(chart, overlay.paneId, fixed)
  if (fixedPx === null) {
    return
  }
  const side = Math.abs(event.x - fixedPx.x)
  const correctedY = fixedPx.y + (event.y - fixedPx.y < 0 ? -side : side)
  const point = coordinateToPoint(chart, overlay.paneId, { x: event.x, y: correctedY })
  const target = params.points[moveIndex]
  if (point === null || !isValid(target) || !isNumber(point.value)) {
    return
  }
  target.value = point.value
}

const gannComplex: OverlayTemplate<GannComplexExtendData> = {
  name: 'gannComplex',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'solid' },
    text: { color: FIB_COLORS.gray, size: 12 }
  },
  extendData: {
    levels: defaultGannSquareLevels(),
    fanlines: defaultGannFanLines(),
    arcs: defaultGannArcs(),
    fillArcsBackground: true,
    arcsTransparency: 80,
    showLabels: true,
    reverse: false
  },
  createPointFigures: withPerfPipeline(({ chart, overlay, coordinates, yAxis, isSelected, isHovered }) => {
    rememberLineChart(overlay, chart)
    const ext: GannComplexExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const reversed = ext.reverse === true
      const start = reversed ? coordinates[1] : coordinates[0]
      const end = reversed ? coordinates[0] : coordinates[1]
      const dx = end.x - start.x
      const dy = end.y - start.y
      if (dx !== 0 || dy !== 0) {
        const lineSize = overlay.styles?.line?.size ?? 1
        const levels = readLevels(ext, defaultGannSquareLevels())
        figures.push(...gannLevelLineFigures(start, end, levels, lineSize, 'gc'))
        figures.push(...gannP1FanFigures(start, start, end, readFanLines(ext, defaultGannFanLines()), lineSize, 'gc'))
        figures.push(...gannArcFigures(
          start,
          end,
          readArcs(ext, defaultGannArcs()),
          ext.fillArcsBackground ?? true,
          ext.arcsTransparency,
          lineSize,
          'gc'
        ))

        if (ext.showLabels ?? true) {
          const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
          const p1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
          const v0 = p0.value
          const v1 = p1.value
          const i0 = p0.dataIndex
          const i1 = p1.dataIndex
          if (isNumber(v0) && isNumber(v1) && isNumber(i0) && isNumber(i1) && i1 !== i0) {
            // Signed diffs in ORIGINAL point order, then negated on
            // reverse — matches TradingView's label math.
            const h = reversed ? v0 - v1 : v1 - v0
            const d = reversed ? i0 - i1 : i1 - i0
            const textColor = levels.length > 0 ? levels[levels.length - 1].color : FIB_COLORS.gray
            const precision = pricePrecisionOf(chart, overlay, yAxis)
            const rightward = d > 0
            figures.push(labelFigure(
              'gc_label_price',
              start.x + 10,
              end.y + (h > 0 ? 8 : 10),
              formatNum(h, precision),
              textColor,
              rightward ? 'right' : 'left',
              h > 0 ? 'bottom' : 'top'
            ))
            figures.push(labelFigure(
              'gc_label_bars',
              end.x + 10,
              start.y + (h > 0 ? 10 : 8),
              `${d}`,
              textColor,
              rightward ? 'left' : 'right',
              h > 0 ? 'top' : 'bottom'
            ))
            figures.push(labelFigure(
              'gc_label_ratio',
              end.x + 10,
              end.y + (h > 0 ? 8 : 10),
              formatNum(Math.abs(h / d), 7),
              textColor,
              rightward ? 'left' : 'right',
              h > 0 ? 'bottom' : 'top'
            ))
          }
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
  }),

  createXAxisFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 1) {
      return []
    }
    const lineColor = overlay.styles?.line?.color ?? TRENDLINE_COLOR
    const figures: OverlayFigure[] = []
    const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const d0 = formatDate(p0.timestamp)
    if (d0 !== '') {
      figures.push(buildXAxisPill(coordinates[0].x, d0, lineColor, 'gc_x0'))
    }
    if (coordinates.length >= 2) {
      const p1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
      const d1 = formatDate(p1.timestamp)
      if (d1 !== '') {
        figures.push(buildXAxisPill(coordinates[1].x, d1, lineColor, 'gc_x1'))
      }
    }
    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) {
      return []
    }
    const lineColor = overlay.styles?.line?.color ?? TRENDLINE_COLOR
    const precision = pricePrecisionOf(chart, overlay, yAxis)
    const figures: OverlayFigure[] = []
    const pt0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const p0 = buildYAxisPill(coordinates[0].y, pt0.value, lineColor, precision, bounding, yAxis ?? undefined, 'gc_y0')
    if (p0 !== null) {
      figures.push(p0)
    }
    if (coordinates.length >= 2) {
      const pt1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
      const p1 = buildYAxisPill(coordinates[1].y, pt1.value, lineColor, precision, bounding, yAxis ?? undefined, 'gc_y1')
      if (p1 !== null) {
        figures.push(p1)
      }
    }
    return figures
  },

  performEventMoveForDrawing: function (this: Overlay<GannComplexExtendData>, params) {
    // TradingView `setLastPoint`: the second point is always square-
    // corrected while it is being placed.
    if (params.performPointIndex === 1) {
      correctToSquare(this, params, 1, 0)
    }
  },

  performEventPressedMove: function (this: Overlay<GannComplexExtendData>, params) {
    // Post-draw drags are freeform; Shift (or the align-45 toggle)
    // re-applies the square correction to the dragged corner.
    const index = params.performPointIndex
    if ((index === 0 || index === 1) && params.event !== undefined) {
      const chart = lineChartOf(this)
      if (chart !== undefined && isSnap45Active(chart, params.event)) {
        correctToSquare(this, params, index, 1 - index)
      }
    }
  }
}

export default gannComplex
