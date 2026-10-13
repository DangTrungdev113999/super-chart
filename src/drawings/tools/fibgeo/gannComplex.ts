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
import type { Chart } from '../../../Chart'

import { isArray, isNumber, isValid } from '../../../common/utils/typeChecks'

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
  fibLevel,
  gannArcFigures,
  gannLevelLineFigures,
  gannP1FanFigures,
  labelFigure,
  readArcs,
  readFanLines,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData, GannArcData, GannFanLineData } from './fibGeoCommon'

/**
 * 'gannComplex' — TradingView Gann Complex (`linetoolganncomplex`, shown
 * in the UI as "Gann square"). Two anchors span the square: six
 * fifth-division level lines (edges 0/1 are the border), the {x, y}
 * fanline ratios radiating from the start vertex, and the {x, y}
 * quarter-ellipse arc scales with ring-sector fill — the shared
 * gann-square family render, identical to linetoolgannfixed's interior.
 *
 * Labels (TV `showLabels`, on by default): the price span at the
 * (p1.x, p2.y) corner, the bar span at (p2.x, p1.y), and the implied
 * scale ratio |priceDiff/indexDiff| at the end corner — placed with TV's
 * alignment/offset rules in the last level's color.
 *
 * Square correction — TradingView `_correctPoint` / `scaleRatio`: the
 * square is locked in PRICE units, not pixels. While the second point is
 * being drawn (`setLastPoint`), and on every Shift (or align-45 toggle)
 * drag (`setPoint` + shift), the moved point's value is rewritten to
 * `fixed.value ± |indexDiff| × scaleRatio` — keeping the cursor's
 * price side, index/x untouched. The stored `scaleRatio` is null by
 * default: TradingView then auto-derives it as
 * `barSpacing / px-per-price` so the corrected square is a pixel square
 * at the current zoom. A freeform drag re-syncs the stored ratio to
 * |Δvalue/Δindex| (`_correctScaleRatio`); a ratio of 0 bars resets to
 * auto. On a 'logarithm' axis the auto ratio is null → no correction
 * (an explicit scaleRatio still applies, as in TV).
 * `reverse` swaps the render start/end.
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
  /**
   * TV `scaleRatio` — value units per bar index for the square
   * correction (default null → auto-derived, see `effectiveScaleRatio`).
   */
  scaleRatio?: number | null
}

/**
 * TV `gannLevelsDefaults`: six fifth-divisions including both edges —
 * exact colors (colorColdGray500 edges, then tanOrange/skyBlue/
 * iguanaGreen/mintyGreen).
 */
function gcLevels (): FibLevelData[] {
  return [
    fibLevel(0, '#808080'),
    fibLevel(0.2, FIB_COLORS.orange),
    fibLevel(0.4, FIB_COLORS.cyan),
    fibLevel(0.6, FIB_COLORS.green),
    fibLevel(0.8, FIB_COLORS.teal),
    fibLevel(1, '#808080')
  ]
}

/** TV `gannFanlinesDefaults`: 11 ratios — only 2×1, 1×1, 1×2 visible. */
function gcFanlines (): GannFanLineData[] {
  const row = (x: number, y: number, color: string, visible: boolean): GannFanLineData => ({ x, y, color, visible })
  return [
    row(8, 1, '#b39ddb', false),
    row(5, 1, FIB_COLORS.red, false),
    row(4, 1, '#808080', false),
    row(3, 1, FIB_COLORS.orange, false),
    row(2, 1, FIB_COLORS.cyan, true),
    row(1, 1, FIB_COLORS.green, true),
    row(1, 2, FIB_COLORS.teal, true),
    row(1, 3, FIB_COLORS.teal, false),
    row(1, 4, FIB_COLORS.blue, false),
    row(1, 5, '#9575cd', false),
    row(1, 8, '#b39ddb', false)
  ]
}

/** TV `gannArcsDefaults`: 11 quarter-ellipse scales, all visible. */
function gcArcs (): GannArcData[] {
  const row = (x: number, y: number, color: string): GannArcData => ({ x, y, color, visible: true })
  return [
    row(1, 0, FIB_COLORS.orange),
    row(1, 1, FIB_COLORS.orange),
    row(1.5, 0, FIB_COLORS.orange),
    row(2, 0, FIB_COLORS.cyan),
    row(2, 1, FIB_COLORS.cyan),
    row(3, 0, FIB_COLORS.green),
    row(3, 1, FIB_COLORS.green),
    row(4, 0, FIB_COLORS.teal),
    row(4, 1, FIB_COLORS.teal),
    row(5, 0, FIB_COLORS.blue),
    row(5, 1, FIB_COLORS.blue)
  ]
}

/**
 * TradingView `scaleRatio` resolution: an explicit `extendData.scaleRatio`
 * wins (and applies on every axis type, as in TV); otherwise the auto
 * ratio `barSpacing / px-per-value` — TV's `scaleRatio(timeScale,
 * priceScale)` = `getValidBarSpacing() / (internalHeight / priceRange)`.
 * Null on a 'logarithm' axis, where TV disables the correction entirely.
 * Everything is sampled through the public convert API: the auto path is
 * self-calibrating (the corrected point lands on the pixel square).
 */
function effectiveScaleRatio (chart: Chart, overlay: Overlay<GannComplexExtendData>, params: OverlayPerformEventParams, indexDiff: number): number | null {
  const ext: GannComplexExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
  if (isNumber(ext.scaleRatio)) {
    return ext.scaleRatio
  }
  const paneOptions = chart.getPaneOptions(overlay.paneId)
  if (!isArray(paneOptions) && paneOptions?.axis?.name === 'logarithm') {
    return null
  }
  const height = chart.getSize(overlay.paneId, 'main')?.height
  const p0 = params.points[0]
  const p1 = params.points[1]
  if (
    !isValid(p0) || !isValid(p1) ||
    !isNumber(p0.dataIndex) || !isNumber(p1.dataIndex) ||
    !isNumber(height) || height <= 0 || indexDiff <= 0
  ) {
    return null
  }
  // px-per-value = pane height ÷ value span across it; px-per-index =
  // the overlay's own anchor x-span ÷ its bar span (rounding self-cancels
  // — the same |indexDiff| multiplies the result back).
  const values = chart.convertFromPixel([{ x: 0, y: 0 }, { x: 0, y: height }], { paneId: overlay.paneId })
  const xs = chart.convertToPixel([{ dataIndex: p0.dataIndex }, { dataIndex: p1.dataIndex }], { paneId: overlay.paneId })
  if (!isArray(values) || !isArray(xs)) {
    return null
  }
  const v0 = values[0]?.value
  const v1 = values[1]?.value
  const x0 = xs[0]?.x
  const x1 = xs[1]?.x
  if (!isNumber(v0) || !isNumber(v1) || !isNumber(x0) || !isNumber(x1)) {
    return null
  }
  const valueSpan = Math.abs(v1 - v0)
  const pxPerIndex = Math.abs(x1 - x0) / indexDiff
  if (valueSpan <= 0 || pxPerIndex <= 0) {
    return null
  }
  return (pxPerIndex * valueSpan) / height
}

/**
 * TradingView `_correctPoint`: rewrite the moved point's VALUE so that
 * |Δvalue| = |indexDiff| × scaleRatio, keeping its price side vs the
 * fixed point (TV's l·t·i form collapses to `fixed ± |indexDiff|·ratio`
 * for either moved index — the index/x stays untouched).
 */
function correctScaledPoint (overlay: Overlay<GannComplexExtendData>, params: OverlayPerformEventParams, moveIndex: number, fixedIndex: number): void {
  const chart = lineChartOf(overlay)
  const p0 = params.points[0]
  const p1 = params.points[1]
  const moved = params.points[moveIndex]
  const fixed = params.points[fixedIndex]
  if (
    chart === undefined ||
    !isValid(p0) || !isValid(p1) || !isValid(moved) || !isValid(fixed) ||
    !isNumber(p0.dataIndex) || !isNumber(p1.dataIndex) ||
    !isNumber(moved.value) || !isNumber(fixed.value)
  ) {
    return
  }
  const indexDiff = Math.abs(p1.dataIndex - p0.dataIndex)
  const ratio = effectiveScaleRatio(chart, overlay, params, indexDiff)
  if (ratio === null) {
    return
  }
  moved.value = fixed.value + (moved.value > fixed.value ? 1 : -1) * indexDiff * ratio
}

/**
 * TradingView `_correctScaleRatio`: after a freeform setPoint the stored
 * ratio is re-synced to |Δvalue/Δindex|; a 0-bar diff sets null, which
 * refills with the auto ratio at next use (`_adjustScaleRatio`).
 */
function storeScaleRatio (overlay: Overlay<GannComplexExtendData>): void {
  const p0 = overlay.points[0]
  const p1 = overlay.points[1]
  const ext: GannComplexExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
  ext.scaleRatio =
    isValid(p0) && isValid(p1) &&
    isNumber(p0.value) && isNumber(p1.value) &&
    isNumber(p0.dataIndex) && isNumber(p1.dataIndex) &&
    p1.dataIndex !== p0.dataIndex
      ? Math.abs((p1.value - p0.value) / (p1.dataIndex - p0.dataIndex))
      : null
  overlay.extendData = ext
  overlay.invalidateFigures()
}

const gannComplex: OverlayTemplate<GannComplexExtendData> = {
  name: 'gannComplex',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'solid' },
    text: { color: FIB_COLORS.gray, size: 12 }
  },
  extendData: {
    levels: gcLevels(),
    fanlines: gcFanlines(),
    arcs: gcArcs(),
    fillArcsBackground: true,
    arcsTransparency: 80,
    showLabels: true,
    reverse: false,
    scaleRatio: null
  },
  createPointFigures: withPerfPipeline(({ chart, overlay, coordinates, yAxis, isSelected, isHovered, isTouch }) => {
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
        const levels = readLevels(ext, gcLevels())
        figures.push(...gannLevelLineFigures(start, end, levels, lineSize, 'gc'))
        figures.push(...gannP1FanFigures(start, start, end, readFanLines(ext, gcFanlines()), lineSize, 'gc'))
        figures.push(...gannArcFigures(
          start,
          end,
          readArcs(ext, gcArcs()),
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
            // TV labelsStyle.fontSize default is 12.
            const label = (key: string, x: number, y: number, text: string, align: CanvasTextAlign, baseline: CanvasTextBaseline): OverlayFigure => {
              const figure = labelFigure(key, x, y, text, textColor, align, baseline)
              figure.styles = { ...(figure.styles as Record<string, unknown>), size: 12 }
              return figure
            }
            figures.push(label(
              'gc_label_price',
              start.x + 10,
              end.y + (h > 0 ? 8 : 10),
              formatNum(h, precision),
              rightward ? 'right' : 'left',
              h > 0 ? 'bottom' : 'top'
            ))
            figures.push(label(
              'gc_label_bars',
              end.x + 10,
              start.y + (h > 0 ? 10 : 8),
              `${d}`,
              rightward ? 'left' : 'right',
              h > 0 ? 'top' : 'bottom'
            ))
            figures.push(label(
              'gc_label_ratio',
              end.x + 10,
              end.y + (h > 0 ? 8 : 10),
              formatNum(Math.abs(h / d), 7),
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

  createXAxisFigures: ({ overlay, coordinates, isSelected }) => {
    if (isSelected !== true) {
      return []
    }
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

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected }) => {
    if (isSelected !== true) {
      return []
    }
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
    // TradingView `setLastPoint`: the second point is always scaleRatio-
    // corrected while it is being placed (log axis → null ratio → no-op).
    if (params.performPointIndex === 1) {
      correctScaledPoint(this, params, 1, 0)
    }
  },

  performEventPressedMove: function (this: Overlay<GannComplexExtendData>, params) {
    const index = params.performPointIndex
    if (index !== 0 && index !== 1) {
      return
    }
    const chart = lineChartOf(this)
    if (chart !== undefined && isSnap45Active(chart, params.event)) {
      // Shift (or align-45) → TradingView `_correctPoint`: re-square the
      // dragged corner to |Δvalue| = |Δindex| × scaleRatio.
      correctScaledPoint(this, params, index, 1 - index)
    } else {
      // Freeform drag → TradingView `_correctScaleRatio`: the stored
      // ratio is re-synced to the dragged geometry.
      storeScaleRatio(this)
    }
  }
}

export default gannComplex
