/**
 * Regression Trend (Xu hướng hồi quy) — TradingView-style Linear Regression Channel.
 *
 * Data points: 2 (start bar + end bar). CPs render at the fitted regression Y,
 * NOT at the raw pointer Y.
 *
 * Three render modes in `createPointFigures`:
 *   A — Drawing in progress (overlay.currentStep !== -1)
 *       → single thin gray preview line between coordinates[0..1]
 *   B — CP drag in progress (pressedOverlayInfo.figureType === 'point')
 *       → same preview line
 *   C — Idle / selected / body-drag
 *       → up to 8 figures:
 *         upper fill, lower fill, center line, upper line, lower line,
 *         Pearson R label, CP0, CP1  (each gated by its visibility flag)
 *
 * On CP release, `performEventPressedMove` discards the raw pointer Y so
 * the next frame re-projects the CP onto the regression line.
 */

import type { OverlayTemplate, OverlayFigure } from '../../../component/Overlay'
import type Coordinate from '../../../common/Coordinate'
import type Point from '../../../common/Point'
import { isNumber } from '../../../common/utils/typeChecks'

import type { RegressionTrendExtendData } from './types'
import {
  REGRESSION_TREND_DEFAULTS,
  RT_PREVIEW,
  RT_UPPER_FILL, RT_LOWER_FILL,
  RT_CENTER_LINE, RT_UPPER_LINE, RT_LOWER_LINE,
  RT_PEARSON_R,
  RT_CP_0, RT_CP_1,
  DASH,
  CP_COLOR, CP_RADIUS, CP_CIRCLE_BORDER,
  PREVIEW_LINE_WIDTH, PREVIEW_FALLBACK_COLOR,
  PEARSON_FONT_SIZE, PEARSON_LABEL_OFFSET_X,
  BASE_LINE_WIDTH, UPPER_LINE_WIDTH, LOWER_LINE_WIDTH,
  FILL_OPACITY,
  type ChartInternal
} from './constants'
import {
  linearRegression, regressionStdDev, pearsonsR,
  getPriceFromSource, alphaRgba, extendToRight, isLightColor
} from './math'
import { buildXAxisPill, buildYAxisPill, formatDate } from '../lineCommon'

export type {
  RegressionTrendExtendData,
  RegressionSource,
  RegressionTrendLineStyle,
  VisibilityRange
} from './types'

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

function mergeExt (ext: RegressionTrendExtendData | undefined): Required<RegressionTrendExtendData> {
  return { ...REGRESSION_TREND_DEFAULTS, ...(ext ?? {}) }
}

/**
 * Find the current bar index for a stored point.
 *
 * KLineChart's `point.dataIndex` can drift when historical data is
 * lazy-loaded on scroll. `point.timestamp` is the stable identifier.
 * Look up by timestamp first; fall back to the stored dataIndex when the
 * timestamp is missing or the bar is no longer present in the data list.
 */
function resolveBarIndex (
  dataList: ReadonlyArray<{ timestamp: number }>,
  timestamp: number | undefined,
  fallback: number | undefined
): number {
  if (timestamp != null) {
    const i = dataList.findIndex(d => d.timestamp === timestamp)
    if (i !== -1) return i
  }
  return isNumber(fallback) ? fallback : -1
}

// ═══════════════════════════════════════
// Overlay template
// ═══════════════════════════════════════

const regressionTrend: OverlayTemplate<RegressionTrendExtendData> = {
  name: 'regressionTrend',
  // 2 clicks → OVERLAY_DRAW_STEP_FINISHED (-1). TAD §2.1: CPs live at
  // the regression Y, not at points[i].value, so default point figures
  // are disabled.
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay }) => {
    const figures: OverlayFigure[] = []
    if (coordinates.length < 1) return figures

    // ─── Mode detection (drawing vs CP drag vs full channel) ───
    const chartStore = (chart as unknown as ChartInternal).getChartStore()
    const pressed = chartStore.getPressedOverlayInfo()
    const currentStep = (overlay as { currentStep?: number }).currentStep
    const isDrawing = currentStep != null && currentStep !== -1
    const isCpDrag =
      !isDrawing &&
      pressed.overlay?.id === overlay.id &&
      pressed.figureType === 'point'

    // ─── Mode A / Mode B: preview line + CP marker(s) ───
    // Reference: docs/ai-chart/regression-trend/exploration/screenshots/draw-flow-2.png
    // Click 1 anchor visible as a small circle, with a thin gray line to cursor.
    if (isDrawing || isCpDrag) {
      if (coordinates.length < 1) return figures
      const tickTextColor = String(chart.getStyles().yAxis.tickText.color)
      const cpBg = isLightColor(tickTextColor) ? '#131722' : '#ffffff'

      // Vertical guide lines through every known anchor X — helps the user see
      // which bar they have just clicked. Light dashed gray, full pane height.
      const guideTop = 0
      const guideBottom = bounding.height
      figures.push({
        key: 'rt_guide_0',
        type: 'line',
        attrs: { coordinates: [{ x: coordinates[0].x, y: guideTop }, { x: coordinates[0].x, y: guideBottom }] },
        styles: {
          color: PREVIEW_FALLBACK_COLOR,
          size: 1,
          style: 'dashed',
          dashedValue: [4, 4]
        },
        ignoreEvent: true
      })

      // Preview line (only when both endpoints are known)
      if (coordinates.length >= 2) {
        figures.push({
          key: 'rt_guide_1',
          type: 'line',
          attrs: { coordinates: [{ x: coordinates[1].x, y: guideTop }, { x: coordinates[1].x, y: guideBottom }] },
          styles: {
            color: PREVIEW_FALLBACK_COLOR,
            size: 1,
            style: 'dashed',
            dashedValue: [4, 4]
          },
          ignoreEvent: true
        })
        figures.push({
          key: RT_PREVIEW,
          type: 'line',
          attrs: { coordinates: [coordinates[0], coordinates[1]] },
          styles: {
            color: PREVIEW_FALLBACK_COLOR,
            size: PREVIEW_LINE_WIDTH,
            style: 'solid'
          },
          ignoreEvent: true
        })
      }

      // CP markers — render at every known anchor position so the user can see
      // where they have already clicked. During CP drag both markers stay visible.
      figures.push({
        key: RT_CP_0,
        type: 'circle',
        attrs: { x: coordinates[0].x, y: coordinates[0].y, r: CP_RADIUS + CP_CIRCLE_BORDER },
        styles: {
          style: 'stroke_fill',
          color: cpBg,
          borderColor: CP_COLOR,
          borderSize: CP_CIRCLE_BORDER
        },
        pointIndex: 0,
        cursor: 'move'
      })
      if (coordinates.length >= 2) {
        figures.push({
          key: RT_CP_1,
          type: 'circle',
          attrs: { x: coordinates[1].x, y: coordinates[1].y, r: CP_RADIUS + CP_CIRCLE_BORDER },
          styles: {
            style: 'stroke_fill',
            color: cpBg,
            borderColor: CP_COLOR,
            borderSize: CP_CIRCLE_BORDER
          },
          pointIndex: 1,
          cursor: 'move'
        })
      }
      return figures
    }

    // ─── Mode C: full channel ───
    if (coordinates.length < 2) return figures

    const ext = mergeExt(overlay.extendData)
    const dataList = chart.getDataList()

    // Resolve bar indices via TIMESTAMP (robust against scroll / data shifts).
    // Falls back to stored dataIndex when timestamp lookup misses.
    const p0 = overlay.points[0]
    const p1 = overlay.points[1]
    const i1 = resolveBarIndex(dataList, p0.timestamp, p0.dataIndex)
    const i2 = resolveBarIndex(dataList, p1.timestamp, p1.dataIndex)

    // Degenerate case — less than 2 distinct bars OR data not loaded yet.
    // Render plain center line as a fallback so the shape never silently
    // vanishes during transient state changes (scroll / lazy-load).
    if (
      !isNumber(i1) || !isNumber(i2) || i1 < 0 || i2 < 0 ||
      Math.abs(i2 - i1) < 1 || dataList.length === 0
    ) {
      figures.push({
        key: RT_CENTER_LINE,
        type: 'line',
        attrs: { coordinates: [coordinates[0], coordinates[1]] },
        styles: {
          color: ext.baseColor,
          size: BASE_LINE_WIDTH,
          style: ext.baseStyle,
          dashedValue: DASH[ext.baseStyle]
        }
      })
      return figures
    }

    // ─── Clamp bar range + extract prices ───
    const startIdx = Math.min(i1, i2)
    const endIdx = Math.max(i1, i2)
    const start = Math.max(0, startIdx)
    const end = Math.min(dataList.length - 1, endIdx)
    if (end - start < 1) return figures

    const prices: number[] = []
    for (let k = start; k <= end; k++) {
      prices.push(getPriceFromSource(dataList[k], ext.source))
    }
    if (prices.length < 2) return figures

    // ─── Regression + Pearson R ───
    const { slope, intercept } = linearRegression(prices)
    const stdDev = regressionStdDev(prices, slope, intercept)
    const r = pearsonsR(prices)

    const regStartVal = intercept
    const regEndVal = slope * (prices.length - 1) + intercept
    const upOffset = ext.upperDeviation * stdDev
    const loOffset = ext.lowerDeviation * stdDev

    // ─── Project 6 anchor prices to pixel ───
    const pts: Array<Partial<Point>> = [
      { dataIndex: start, value: regStartVal },
      { dataIndex: end, value: regEndVal },
      { dataIndex: start, value: regStartVal + upOffset },
      { dataIndex: end, value: regEndVal + upOffset },
      { dataIndex: start, value: regStartVal + loOffset },
      { dataIndex: end, value: regEndVal + loOffset }
    ]
    const pixels = chart.convertToPixel(pts, { paneId: overlay.paneId }) as Array<Partial<Coordinate>>
    const toCoord = (c: Partial<Coordinate> | undefined): Coordinate => ({ x: c?.x ?? 0, y: c?.y ?? 0 })

    const regS = toCoord(pixels[0])
    const regE = toCoord(pixels[1])
    const upS = toCoord(pixels[2])
    const upE = toCoord(pixels[3])
    const loS = toCoord(pixels[4])
    const loE = toCoord(pixels[5])

    // ─── Extend right (optional) ───
    const regE2 = ext.extendLines ? extendToRight(regS, regE, bounding) : regE
    const upE2 = ext.extendLines ? extendToRight(upS, upE, bounding) : upE
    const loE2 = ext.extendLines ? extendToRight(loS, loE, bounding) : loE

    // ─── Fills (bottom) ───
    if (ext.useUpperDeviation) {
      figures.push({
        key: RT_UPPER_FILL,
        type: 'polygon',
        attrs: { coordinates: [regS, regE2, upE2, upS] },
        styles: {
          style: 'fill',
          color: alphaRgba(ext.upperColor, FILL_OPACITY)
        }
      })
    }
    if (ext.useLowerDeviation) {
      figures.push({
        key: RT_LOWER_FILL,
        type: 'polygon',
        attrs: { coordinates: [regS, regE2, loE2, loS] },
        styles: {
          style: 'fill',
          // Lower fill tracks the base line color (matches reference screenshot:
          // blue above, red below — visual trend-direction cue).
          color: alphaRgba(ext.baseColor, FILL_OPACITY)
        }
      })
    }

    // ─── Lines ───
    if (ext.baseVisible) {
      figures.push({
        key: RT_CENTER_LINE,
        type: 'line',
        attrs: { coordinates: [regS, regE2] },
        styles: {
          color: ext.baseColor,
          size: BASE_LINE_WIDTH,
          style: ext.baseStyle,
          dashedValue: DASH[ext.baseStyle]
        }
      })
    }
    if (ext.upperVisible && ext.useUpperDeviation) {
      figures.push({
        key: RT_UPPER_LINE,
        type: 'line',
        attrs: { coordinates: [upS, upE2] },
        styles: {
          color: ext.upperColor,
          size: UPPER_LINE_WIDTH,
          style: ext.upperStyle,
          dashedValue: DASH[ext.upperStyle]
        }
      })
    }
    if (ext.lowerVisible && ext.useLowerDeviation) {
      figures.push({
        key: RT_LOWER_LINE,
        type: 'line',
        attrs: { coordinates: [loS, loE2] },
        styles: {
          color: ext.lowerColor,
          size: LOWER_LINE_WIDTH,
          style: ext.lowerStyle,
          dashedValue: DASH[ext.lowerStyle]
        }
      })
    }

    // ─── Pearson R label ───
    // Anchored at the LEFT end of the LOWER band (matches reference image).
    // Text color = upperColor (band color, per TAD §6).
    if (ext.pearsonR) {
      figures.push({
        key: RT_PEARSON_R,
        type: 'text',
        attrs: {
          x: loS.x - PEARSON_LABEL_OFFSET_X,
          y: loS.y,
          text: r.toFixed(15),
          align: 'right' as CanvasTextAlign,
          baseline: 'middle' as CanvasTextBaseline
        },
        styles: {
          color: ext.upperColor,
          size: PEARSON_FONT_SIZE,
          weight: 'normal',
          family: 'Arial, sans-serif',
          backgroundColor: 'transparent'
        },
        ignoreEvent: true
      })
    }

    // ─── Control points (selected or hovered) ───
    const isSelected = chartStore.getClickOverlayInfo().overlay?.id === overlay.id
    const hoverInfo = chartStore.getHoverOverlayInfo()
    const isHovered = hoverInfo.overlay?.id === overlay.id && hoverInfo.figureType !== 'none'

    if (isSelected || isHovered) {
      const tickTextColor = String(chart.getStyles().yAxis.tickText.color)
      const cpBg = isLightColor(tickTextColor) ? '#131722' : '#ffffff'

      figures.push({
        key: RT_CP_0,
        type: 'circle',
        attrs: { x: regS.x, y: regS.y, r: CP_RADIUS + CP_CIRCLE_BORDER },
        styles: {
          style: 'stroke_fill',
          color: cpBg,
          borderColor: CP_COLOR,
          borderSize: CP_CIRCLE_BORDER
        },
        pointIndex: 0,
        cursor: 'move'
      })
      figures.push({
        key: RT_CP_1,
        type: 'circle',
        attrs: { x: regE.x, y: regE.y, r: CP_RADIUS + CP_CIRCLE_BORDER },
        styles: {
          style: 'stroke_fill',
          color: cpBg,
          borderColor: CP_COLOR,
          borderSize: CP_CIRCLE_BORDER
        },
        pointIndex: 1,
        cursor: 'move'
      })
    }

    return figures
  },

  // ─── X-axis pills (date labels at each anchor bar) ───
  createXAxisFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 1) return []
    const ext = mergeExt(overlay.extendData)
    const lineColor = ext.upperColor
    const figs: OverlayFigure[] = []
    const d0 = formatDate(overlay.points[0]?.timestamp)
    if (d0 !== '') figs.push(buildXAxisPill(coordinates[0].x, d0, lineColor, 'rt_x0'))
    if (coordinates.length >= 2) {
      const d1 = formatDate(overlay.points[1]?.timestamp)
      if (d1 !== '') figs.push(buildXAxisPill(coordinates[1].x, d1, lineColor, 'rt_x1'))
    }
    return figs
  },

  // ─── Y-axis pills (price labels at the REGRESSION Y of each anchor) ───
  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 2) return []
    const ext = mergeExt(overlay.extendData)
    const lineColor = ext.upperColor
    const precision = chart.getSymbol()?.pricePrecision ?? 2
    const dataList = chart.getDataList()
    if (dataList.length === 0) return []

    const p0 = overlay.points[0]
    const p1 = overlay.points[1]
    const i1 = resolveBarIndex(dataList, p0.timestamp, p0.dataIndex)
    const i2 = resolveBarIndex(dataList, p1.timestamp, p1.dataIndex)
    if (!isNumber(i1) || !isNumber(i2) || i1 < 0 || i2 < 0 || Math.abs(i2 - i1) < 1) {
      return []
    }

    const startIdx = Math.min(i1, i2)
    const endIdx = Math.max(i1, i2)
    const start = Math.max(0, startIdx)
    const end = Math.min(dataList.length - 1, endIdx)
    const prices: number[] = []
    for (let k = start; k <= end; k++) prices.push(getPriceFromSource(dataList[k], ext.source))
    if (prices.length < 2) return []

    const { slope, intercept } = linearRegression(prices)
    const regStartVal = intercept
    const regEndVal = slope * (prices.length - 1) + intercept

    // Map each anchor's bar index back to its regression Y in pixel space.
    const idxStart = i1 < i2 ? 0 : 1
    const idxEnd = 1 - idxStart
    const regS = chart.convertToPixel(
      [{ dataIndex: start, value: regStartVal }, { dataIndex: end, value: regEndVal }],
      { paneId: overlay.paneId }
    ) as Array<Partial<Coordinate>>
    const yStart = regS[0]?.y ?? coordinates[idxStart].y
    const yEnd = regS[1]?.y ?? coordinates[idxEnd].y

    const figs: OverlayFigure[] = []
    const pill0 = buildYAxisPill(yStart, regStartVal, lineColor, precision, bounding, yAxis ?? undefined, 'rt_y0')
    if (pill0 != null) figs.push(pill0)
    const pill1 = buildYAxisPill(yEnd, regEndVal, lineColor, precision, bounding, yAxis ?? undefined, 'rt_y1')
    if (pill1 != null) figs.push(pill1)
    return figs
  }
}

export default regressionTrend
