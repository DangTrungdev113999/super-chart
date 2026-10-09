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
import type Point from '../../../common/Point'
import type { Chart } from '../../../Chart'

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isArray, isNumber, isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import type { RegressionSource } from '../../../extension/overlay/regressionTrend/types'
import {
  alphaRgba,
  extendToRight,
  getPriceFromSource,
  isLightColor,
  linearRegression,
  pearsonsR,
  regressionStdDev
} from '../../../extension/overlay/regressionTrend/math'

import {
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  lineChartOf,
  pricePrecisionOf,
  rememberLineChart
} from '../lines/lineCommon'

import { resolveBarIndex } from './channelCommon'

/**
 * 'regressionTrend' — TradingView Linear Regression Channel.
 *
 * 2 stored points spanning the bar range; the overlay fits a least-squares
 * regression over the bars between the anchors' dataIndexes and draws the
 * base line plus ±N standard-deviation bands. Stored point prices are
 * re-snapped to the fitted line after each drag (TradingView
 * `_updateAnchorsPrice`) so anchors sit ON the regression line, not at
 * the raw pointer y.
 *
 * Heavy math (data scan + OLS + stddev) is wrapped in `withPerfPipeline`
 * — the figure spec is cached on the coordinate/data signature instead of
 * recomputing every frame.
 *
 * extendData: deviations `upperDeviation`/`lowerDeviation` (2 / -2),
 * `useUpperDeviation`/`useLowerDeviation`, `source` ('close'|'open'|
 * 'high'|'low'|'hl2'|'hlc3'|'ohlc4'), `extendLines` (right edge),
 * `pearsonR`/`showPearsonsR`, `pricePrecision`; kernel style vocabulary
 * `baseVisible/baseColor/baseStyle`, `upperVisible/upperColor/upperStyle`,
 * `lowerVisible/lowerColor/lowerStyle`; consumer spellings `showBaseLine`,
 * `baseLineColor/baseLineWidth/baseLineStyle`, `upperLineColor/Width/
 * Style`, `upperFillColor`, `lowerLineColor/Width/Style`, `lowerFillColor`.
 */

type RegressionLineStyle = 'solid' | 'dashed' | 'dotted'

export interface RegressionTrendExtendData {
  // ─── Inputs ───
  upperDeviation?: number
  lowerDeviation?: number
  useUpperDeviation?: boolean
  useLowerDeviation?: boolean
  source?: RegressionSource
  // ─── Kernel style vocabulary ───
  baseVisible?: boolean
  baseColor?: string
  baseStyle?: RegressionLineStyle
  upperVisible?: boolean
  upperColor?: string
  upperStyle?: RegressionLineStyle
  lowerVisible?: boolean
  lowerColor?: string
  lowerStyle?: RegressionLineStyle
  extendLines?: boolean
  pearsonR?: boolean
  // ─── Consumer (contents_pro) spellings ───
  showBaseLine?: boolean
  baseLineColor?: string
  baseLineWidth?: number
  baseLineStyle?: RegressionLineStyle
  upperLineColor?: string
  upperLineWidth?: number
  upperLineStyle?: RegressionLineStyle
  upperFillColor?: string
  lowerLineColor?: string
  lowerLineWidth?: number
  lowerLineStyle?: RegressionLineStyle
  lowerFillColor?: string
  showPearsonsR?: boolean
  pricePrecision?: number
}

interface RegressionConfig {
  upperDeviation: number
  lowerDeviation: number
  useUpperDeviation: boolean
  useLowerDeviation: boolean
  source: RegressionSource
  baseVisible: boolean
  baseColor: string
  baseWidth: number
  baseStyle: RegressionLineStyle
  upperVisible: boolean
  upperColor: string
  upperWidth: number
  upperStyle: RegressionLineStyle
  upperFillColor: string | undefined
  lowerVisible: boolean
  lowerColor: string
  lowerWidth: number
  lowerStyle: RegressionLineStyle
  lowerFillColor: string | undefined
  extendLines: boolean
  pearsonR: boolean
}

const RT_DASH: Record<RegressionLineStyle, number[]> = {
  solid: [],
  dashed: [6, 4],
  dotted: [2, 2]
}

const RT_FILL_ALPHA = 0.2
const RT_CP_COLOR = '#1592E6'
const RT_PREVIEW_COLOR = '#888888'

function resolveConfig (ext: RegressionTrendExtendData): RegressionConfig {
  return {
    upperDeviation: ext.upperDeviation ?? 2,
    lowerDeviation: ext.lowerDeviation ?? -2,
    useUpperDeviation: ext.useUpperDeviation ?? true,
    useLowerDeviation: ext.useLowerDeviation ?? true,
    source: ext.source ?? 'close',
    baseVisible: ext.baseVisible ?? ext.showBaseLine ?? true,
    baseColor: ext.baseColor ?? ext.baseLineColor ?? '#F44336',
    baseWidth: ext.baseLineWidth ?? 1,
    baseStyle: ext.baseStyle ?? ext.baseLineStyle ?? 'dashed',
    upperVisible: ext.upperVisible ?? true,
    upperColor: ext.upperColor ?? ext.upperLineColor ?? '#2962FF',
    upperWidth: ext.upperLineWidth ?? 1,
    upperStyle: ext.upperStyle ?? ext.upperLineStyle ?? 'solid',
    upperFillColor: ext.upperFillColor,
    lowerVisible: ext.lowerVisible ?? true,
    lowerColor: ext.lowerColor ?? ext.lowerLineColor ?? '#2962FF',
    lowerWidth: ext.lowerLineWidth ?? 1,
    lowerStyle: ext.lowerStyle ?? ext.lowerLineStyle ?? 'solid',
    lowerFillColor: ext.lowerFillColor,
    extendLines: ext.extendLines ?? false,
    pearsonR: ext.pearsonR ?? ext.showPearsonsR ?? true
  }
}

interface RegressionFit {
  /** Clamped bar range actually fitted. */
  start: number
  end: number
  /** Resolved anchor bar indices (points[0], points[1] order preserved). */
  i1: number
  i2: number
  regStartVal: number
  regEndVal: number
  stdDev: number
  r: number
  prices: number[]
}

/**
 * Resolve the anchor bar range and fit the regression. Bar indices are
 * resolved by TIMESTAMP first (stable across lazy-load index drift), then
 * by the stored dataIndex — same contract as the kernel overlay.
 */
function computeRegression (
  chart: Chart,
  overlay: Overlay<RegressionTrendExtendData>,
  cfg: RegressionConfig
): RegressionFit | null {
  const dataList = chart.getDataList()
  if (dataList.length === 0) {
    return null
  }
  const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
  const p1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
  const i1 = resolveBarIndex(dataList, p0.timestamp, p0.dataIndex)
  const i2 = resolveBarIndex(dataList, p1.timestamp, p1.dataIndex)
  if (i1 < 0 || i2 < 0 || Math.abs(i2 - i1) < 1) {
    return null
  }
  // Floor/ceil fractional legacy indices — a fractional start would index
  // dataList[10.4] → undefined → getPriceFromSource returns 0 and the fit
  // collapses onto the price-0 baseline.
  const start = Math.max(0, Math.floor(Math.min(i1, i2)))
  const end = Math.min(dataList.length - 1, Math.ceil(Math.max(i1, i2)))
  if (end - start < 1) {
    return null
  }
  const prices: number[] = []
  for (let k = start; k <= end; k++) {
    prices.push(getPriceFromSource(dataList[k], cfg.source))
  }
  if (prices.length < 2) {
    return null
  }
  const { slope, intercept } = linearRegression(prices)
  return {
    start,
    end,
    i1,
    i2,
    regStartVal: intercept,
    regEndVal: slope * (prices.length - 1) + intercept,
    stdDev: regressionStdDev(prices, slope, intercept),
    r: pearsonsR(prices),
    prices
  }
}

/**
 * Cheap data signature for the figure cache — catches appends, prepends
 * and realtime close updates without rescanning the range.
 */
function regressionDataKey (chart: Chart): string {
  const dataList = chart.getDataList()
  if (dataList.length === 0) {
    return '0'
  }
  const first = dataList[0]
  const last = dataList[dataList.length - 1]
  return `${dataList.length}|${first.timestamp}|${last.timestamp}|${last.close}`
}

function toPixelPoints (
  chart: Chart,
  paneId: string,
  points: Array<Partial<Point>>
): Array<Partial<Coordinate>> {
  const converted = chart.convertToPixel(points, { paneId })
  return isArray(converted) ? converted : [converted]
}

/**
 * TradingView `_updateAnchorsPrice` — after an anchor or body drag the
 * stored prices snap back onto the fitted line so serialization and axis
 * pills carry the regression values, not the raw pointer y.
 */
function snapAnchorsToFit (overlay: Overlay<RegressionTrendExtendData>, points: Array<Partial<Point>>): void {
  const chart = lineChartOf(overlay)
  if (chart === undefined) {
    return
  }
  const ext: RegressionTrendExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
  const fit = computeRegression(chart, overlay, resolveConfig(ext))
  if (fit === null) {
    return
  }
  const p0 = isValid(points[0]) ? points[0] : undefined
  const p1 = isValid(points[1]) ? points[1] : undefined
  const anchorAtStart = fit.i1 <= fit.i2 ? p0 : p1
  const anchorAtEnd = fit.i1 <= fit.i2 ? p1 : p0
  if (isValid(anchorAtStart)) {
    anchorAtStart.value = fit.regStartVal
  }
  if (isValid(anchorAtEnd)) {
    anchorAtEnd.value = fit.regEndVal
  }
}

const regressionTrend: OverlayTemplate<RegressionTrendExtendData> = {
  name: 'regressionTrend',
  totalStep: 3,
  cullable: false,
  figureCacheDataRev: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline<RegressionTrendExtendData>((params) => {
    const { chart, overlay, coordinates, bounding, isSelected, isHovered, isTouch } = params
    rememberLineChart(overlay, chart)
    const figures: OverlayFigure[] = []
    if (coordinates.length < 1) {
      return figures
    }

    const isDrawing = overlay.isDrawing()

    // ─── Drawing preview (kernel Mode A parity): dashed vertical guides
    // through the placed anchors + a thin gray preview line + anchors. ───
    if (isDrawing) {
      const tickTextColor = String(chart.getStyles().yAxis.tickText.color)
      const cpBg = isLightColor(tickTextColor) ? '#131722' : '#ffffff'
      figures.push({
        key: 'rt_guide_0',
        type: 'line',
        attrs: { coordinates: [{ x: coordinates[0].x, y: 0 }, { x: coordinates[0].x, y: bounding.height }] },
        styles: { color: RT_PREVIEW_COLOR, size: 1, style: 'dashed', dashedValue: [4, 4] },
        ignoreEvent: true
      })
      if (coordinates.length >= 2) {
        figures.push({
          key: 'rt_guide_1',
          type: 'line',
          attrs: { coordinates: [{ x: coordinates[1].x, y: 0 }, { x: coordinates[1].x, y: bounding.height }] },
          styles: { color: RT_PREVIEW_COLOR, size: 1, style: 'dashed', dashedValue: [4, 4] },
          ignoreEvent: true
        })
        figures.push({
          key: 'rt_preview',
          type: 'line',
          attrs: { coordinates: [coordinates[0], coordinates[1]] },
          styles: { color: RT_PREVIEW_COLOR, size: 1, style: 'solid' },
          ignoreEvent: true
        })
      }
      figures.push(...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isDrawing: true,
        lock: overlay.lock,
        isTouch,
        styles: { borderColor: RT_CP_COLOR, backColor: cpBg }
      }))
      return figures
    }

    if (coordinates.length < 2) {
      return figures
    }

    const ext: RegressionTrendExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const cfg = resolveConfig(ext)
    const fit = computeRegression(chart, overlay, cfg)

    // ─── Degenerate range — keep the plain base line so the shape never
    // vanishes during transient states (scroll / lazy-load). ───
    if (fit === null) {
      if (cfg.baseVisible) {
        figures.push({
          key: 'rt_center_line',
          type: 'line',
          attrs: { coordinates: [coordinates[0], coordinates[1]] },
          styles: {
            color: cfg.baseColor,
            size: cfg.baseWidth,
            style: cfg.baseStyle === 'solid' ? 'solid' : 'dashed',
            dashedValue: RT_DASH[cfg.baseStyle]
          }
        })
      }
      figures.push(...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isDrawing: false,
        lock: overlay.lock,
        isTouch
      }))
      return figures
    }

    // ─── Project the fitted endpoints + band corners to pixels. ───
    const upOffset = cfg.upperDeviation * fit.stdDev
    const loOffset = cfg.lowerDeviation * fit.stdDev
    const pts: Array<Partial<Point>> = [
      { dataIndex: fit.start, value: fit.regStartVal },
      { dataIndex: fit.end, value: fit.regEndVal },
      { dataIndex: fit.start, value: fit.regStartVal + upOffset },
      { dataIndex: fit.end, value: fit.regEndVal + upOffset },
      { dataIndex: fit.start, value: fit.regStartVal + loOffset },
      { dataIndex: fit.end, value: fit.regEndVal + loOffset }
    ]
    const pixels = toPixelPoints(chart, overlay.paneId, pts)
    const toCoord = (c: Partial<Coordinate> | undefined): Coordinate => ({
      x: isValid(c) && isNumber(c.x) ? c.x : 0,
      y: isValid(c) && isNumber(c.y) ? c.y : 0
    })
    const regS = toCoord(pixels[0])
    const regE = toCoord(pixels[1])
    const upS = toCoord(pixels[2])
    const upE = toCoord(pixels[3])
    const loS = toCoord(pixels[4])
    const loE = toCoord(pixels[5])

    const regE2 = cfg.extendLines ? extendToRight(regS, regE, bounding) : regE
    const upE2 = cfg.extendLines ? extendToRight(upS, upE, bounding) : upE
    const loE2 = cfg.extendLines ? extendToRight(loS, loE, bounding) : loE

    // ─── Fills (one figure per band). ───
    if (cfg.useUpperDeviation) {
      figures.push({
        key: 'rt_upper_fill',
        type: 'polygon',
        attrs: { coordinates: [regS, regE2, upE2, upS] },
        styles: {
          style: 'fill',
          color: cfg.upperFillColor ?? alphaRgba(cfg.upperColor, RT_FILL_ALPHA)
        },
        ignoreEvent: true
      })
    }
    if (cfg.useLowerDeviation) {
      figures.push({
        key: 'rt_lower_fill',
        type: 'polygon',
        attrs: { coordinates: [regS, regE2, loE2, loS] },
        styles: {
          style: 'fill',
          color: cfg.lowerFillColor ?? alphaRgba(cfg.lowerColor, RT_FILL_ALPHA)
        },
        ignoreEvent: true
      })
    }

    // ─── Lines. ───
    if (cfg.baseVisible) {
      figures.push({
        key: 'rt_center_line',
        type: 'line',
        attrs: { coordinates: [regS, regE2] },
        styles: {
          color: cfg.baseColor,
          size: cfg.baseWidth,
          style: cfg.baseStyle === 'solid' ? 'solid' : 'dashed',
          dashedValue: RT_DASH[cfg.baseStyle]
        }
      })
    }
    if (cfg.upperVisible && cfg.useUpperDeviation) {
      figures.push({
        key: 'rt_upper_line',
        type: 'line',
        attrs: { coordinates: [upS, upE2] },
        styles: {
          color: cfg.upperColor,
          size: cfg.upperWidth,
          style: cfg.upperStyle === 'solid' ? 'solid' : 'dashed',
          dashedValue: RT_DASH[cfg.upperStyle]
        }
      })
    }
    if (cfg.lowerVisible && cfg.useLowerDeviation) {
      figures.push({
        key: 'rt_lower_line',
        type: 'line',
        attrs: { coordinates: [loS, loE2] },
        styles: {
          color: cfg.lowerColor,
          size: cfg.lowerWidth,
          style: cfg.lowerStyle === 'solid' ? 'solid' : 'dashed',
          dashedValue: RT_DASH[cfg.lowerStyle]
        }
      })
    }

    // ─── Pearson R — anchored left of the lower band start (kernel +
    // TradingView parity: full 15-digit precision). ───
    if (cfg.pearsonR) {
      figures.push({
        key: 'rt_pearson_r',
        type: 'text',
        attrs: {
          x: loS.x - 10,
          y: loS.y,
          text: fit.r.toFixed(15),
          align: 'right' as CanvasTextAlign,
          baseline: 'middle' as CanvasTextBaseline
        },
        styles: {
          color: cfg.upperColor,
          size: 12,
          weight: 'normal',
          family: 'Arial, sans-serif',
          backgroundColor: 'transparent'
        },
        ignoreEvent: true
      })
    }

    // ─── Anchors sit ON the fitted line (TradingView _updateAnchorsPrice
    // keeps the stored prices snapped after every recompute). ───
    figures.push(...createAnchorFigures({
      coordinates: [regS, regE],
      isSelected,
      isHovered,
      isDrawing: false,
      lock: overlay.lock,
      isTouch,
      cursors: ['move', 'move']
    }))
    return figures
  }, {
    slot: 'point',
    extraKey: ({ chart }) => regressionDataKey(chart)
  }),

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    rememberLineChart(overlay, chart)
    if (coordinates.length < 1) {
      return []
    }
    const ext: RegressionTrendExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const color = resolveConfig(ext).upperColor
    const figures: OverlayFigure[] = []
    const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const d0 = formatDate(p0.timestamp)
    if (d0 !== '') {
      figures.push(buildXAxisPill(coordinates[0].x, d0, color, 'rt_x0'))
    }
    if (coordinates.length >= 2) {
      const p1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
      const d1 = formatDate(p1.timestamp)
      if (d1 !== '') {
        figures.push(buildXAxisPill(coordinates[1].x, d1, color, 'rt_x1'))
      }
    }
    return figures
  },

  createYAxisFigures: withPerfPipeline<RegressionTrendExtendData>((params) => {
    const { chart, overlay, coordinates, bounding, yAxis } = params
    rememberLineChart(overlay, chart)
    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      return figures
    }
    const ext: RegressionTrendExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const cfg = resolveConfig(ext)
    const fit = computeRegression(chart, overlay, cfg)
    if (fit === null) {
      return figures
    }
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    // Anchor i sits at the fitted value of ITS OWN bar index — map the
    // earlier anchor to the start fit, the later to the end fit.
    const anchorAtStart = fit.i1 <= fit.i2 ? 0 : 1
    const anchorValues: number[] = []
    anchorValues[anchorAtStart] = fit.regStartVal
    anchorValues[1 - anchorAtStart] = fit.regEndVal

    const pixels = toPixelPoints(chart, overlay.paneId, [
      { dataIndex: fit.start, value: fit.regStartVal },
      { dataIndex: fit.end, value: fit.regEndVal }
    ])
    const y0 = anchorAtStart === 0 ? pixels[0]?.y : pixels[1]?.y
    const y1 = anchorAtStart === 0 ? pixels[1]?.y : pixels[0]?.y
    const pillY: Array<number | undefined> = [y0, y1]

    for (let i = 0; i < 2; i++) {
      const y = isNumber(pillY[i]) ? pillY[i] : coordinates[i].y
      const pill = buildYAxisPill(y ?? coordinates[i].y, anchorValues[i], cfg.upperColor, precision, bounding, yAxis ?? undefined, `rt_y${i}`)
      if (pill !== null) {
        figures.push(pill)
      }
    }
    return figures
  }, {
    slot: 'y',
    extraKey: ({ chart }) => regressionDataKey(chart)
  }),

  performEventPressedMove: function (this: Overlay<RegressionTrendExtendData>, params) {
    snapAnchorsToFit(this, params.points)
  },

  performEventBodyMove: function (this: Overlay<RegressionTrendExtendData>, params) {
    // Body drags shift BOTH anchors by the pointer delta — the stored
    // prices then sit off the fitted line at the new x-range. Re-snap
    // exactly like an anchor drag or serialized values desync.
    snapAnchorsToFit(this, params.points)
  }
}

export default regressionTrend
