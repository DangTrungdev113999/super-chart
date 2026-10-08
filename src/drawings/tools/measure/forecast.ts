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

/**
 * 'forecast' — TradingView Forecast (LineToolPrediction).
 *
 * Data points: 2 (P1 source anchor, P2 target anchor), totalStep 3.
 *
 * Visual composition (back -> front):
 *   1.  Quadratic Bézier curve P1 -> P2 (path figure) - draw only
 *   2.  Curve hitbox (transparent polygon tube) - body-drag surface
 *   3.  P1 source pill (rect + 2 text lines)
 *   4.  P2 info pill (rect + 2 text lines)
 *   5.  Status badge above or below the P2 pill (hidden while drawing)
 *   6.  P2 arrow tip (small filled triangle along the curve tangent)
 *   7.  Endpoint dots (always visible) + selection anchors
 *   8.  Footer F / F* markers at the pane bottom (always visible)
 *
 * Selection-only axis figures: X-axis date pills + strip, Y-axis price
 * pills + strip.
 *
 * This replaces the kernel extension/overlay/forecast semantics in the
 * tools layer: selection state comes from the callback params (no
 * chartStore internals) and the draggable anchors come from
 * createAnchorFigures per the tools authoring contract.
 */

import type Coordinate from '../../../common/Coordinate'
import type Point from '../../../common/Point'
import type { KLineData } from '../../../common/Data'
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'
import { calcTextWidth } from '../../../common/utils/canvas'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  alpha,
  fmtNum,
  signedNum,
  formatISODate,
  getPricePrecision,
  resolveBarIndex
} from './measureCommon'

// ═══════════════════════════════════════
// ExtendData
// ═══════════════════════════════════════

export interface ForecastExtendData {
  lineColor?: string
  lineOpacity?: number
  lineWidth?: number

  sourceTextColor?: string
  sourceTextOpacity?: number
  sourceBgColor?: string
  sourceBgOpacity?: number
  sourceBorderColor?: string
  sourceBorderOpacity?: number

  targetTextColor?: string
  targetTextOpacity?: number
  targetBgColor?: string
  targetBgOpacity?: number
  targetBorderColor?: string
  targetBorderOpacity?: number

  successTextColor?: string
  successTextOpacity?: number
  successBgColor?: string
  successBgOpacity?: number

  failureTextColor?: string
  failureTextOpacity?: number
  failureBgColor?: string
  failureBgOpacity?: number

  pricePrecision?: number
}

const FORECAST_DEFAULTS: Required<Omit<ForecastExtendData, 'pricePrecision'>> = {
  lineColor: '#2962ff',
  lineOpacity: 1,
  lineWidth: 1,

  sourceTextColor: '#ffffff',
  sourceTextOpacity: 1,
  sourceBgColor: '#2962ff',
  sourceBgOpacity: 1,
  sourceBorderColor: '#2962ff',
  sourceBorderOpacity: 1,

  targetTextColor: '#ffffff',
  targetTextOpacity: 1,
  targetBgColor: '#2962ff',
  targetBgOpacity: 1,
  targetBorderColor: '#2962ff',
  targetBorderOpacity: 1,

  successTextColor: '#ffffff',
  successTextOpacity: 1,
  successBgColor: '#4caf50',
  successBgOpacity: 1,

  failureTextColor: '#ffffff',
  failureTextOpacity: 1,
  failureBgColor: '#ef5350',
  failureBgOpacity: 1
}

type ForecastResolved = Required<Omit<ForecastExtendData, 'pricePrecision'>> & Pick<ForecastExtendData, 'pricePrecision'>

function getExt (extendData: ForecastExtendData | undefined): ForecastResolved {
  return { ...FORECAST_DEFAULTS, ...(isValid(extendData) ? extendData : {}) }
}

// ═══════════════════════════════════════
// Layout constants (kernel forecast values)
// ═══════════════════════════════════════

const PILL_PADDING_H = 6
const PILL_PADDING_V = 4
const PILL_LINE_GAP = 2
const PILL_BORDER_RADIUS = 3
const PILL_FONT_SIZE = 11
const PILL_ANCHOR_GAP = 4

const BADGE_GAP = 3
const BADGE_PADDING_H = 6
const BADGE_PADDING_V = 3
const BADGE_FONT_SIZE = 11

const DOT_COLOR = '#2962ff'
const DOT_RADIUS = 2.5

const FOOTER_COLOR = '#4caf50'
const FOOTER_MARGIN_BOTTOM = 14
const FOOTER_RADIUS = 6
const FOOTER_BORDER_SIZE = 1.2
const FOOTER_FONT_SIZE = 9

const XAXIS_PILL_Y = 0
const XAXIS_PILL_PADDING_H = 6
const XAXIS_PILL_PADDING_V = 3

const AXIS_STRIP_COLOR = '#2962ff'
const AXIS_STRIP_OPACITY = 0.15

const CURVE_HITBOX_HALF_WIDTH = 6
const CURVE_SAMPLES = 30

const ARROW_LENGTH = 8
const ARROW_HALF_WIDTH = 5

// Clock char between price and date on the P2 pill's second line.
const CLOCK_CHAR = '⏰'

// ═══════════════════════════════════════
// Bezier / status math (ported from kernel utils)
// ═══════════════════════════════════════

/** Evaluate forecast outcome over bars in (P1, P2] resolved by timestamp. */
function evaluateStatus (
  dataList: KLineData[],
  p1: Partial<Point>,
  p2: Partial<Point>
): 'success' | 'failure' {
  if (p1.timestamp == null || p2.timestamp == null) return 'failure'
  if (p1.value == null || p2.value == null) return 'failure'

  const i1 = dataList.findIndex(d => d.timestamp === p1.timestamp)
  const i2 = dataList.findIndex(d => d.timestamp === p2.timestamp)
  if (i1 < 0 || i2 < 0) return 'failure'

  const lo = Math.min(i1, i2)
  const hi = Math.max(i1, i2)
  if (lo + 1 > hi) return 'success'
  if (p2.value === p1.value) return 'success'

  const bullish = p2.value > p1.value
  for (let i = lo + 1; i <= hi; i++) {
    const bar = dataList[i]
    if (bullish && bar.high >= p2.value) return 'success'
    if (!bullish && bar.low <= p2.value) return 'success'
  }
  return 'failure'
}

/** Control point at the chord corner — quarter-ellipse signature curve. */
function computeBezierControlPoint (c1: Coordinate, c2: Coordinate): Coordinate {
  return { x: c2.x, y: c1.y }
}

function quadBezierPoint (c1: Coordinate, cp: Coordinate, c2: Coordinate, t: number): Coordinate {
  const mt = 1 - t
  return {
    x: mt * mt * c1.x + 2 * mt * t * cp.x + t * t * c2.x,
    y: mt * mt * c1.y + 2 * mt * t * cp.y + t * t * c2.y
  }
}

function quadBezierTangent (c1: Coordinate, cp: Coordinate, c2: Coordinate, t: number): Coordinate {
  return {
    x: 2 * (1 - t) * (cp.x - c1.x) + 2 * t * (c2.x - cp.x),
    y: 2 * (1 - t) * (cp.y - c1.y) + 2 * t * (c2.y - cp.y)
  }
}

/** Closed polygon "tube" around the curve for hit-testing. */
function buildCurveHitbox (
  c1: Coordinate,
  cp: Coordinate,
  c2: Coordinate,
  halfWidth: number,
  samples: number
): Coordinate[] {
  const upper: Coordinate[] = []
  const lower: Coordinate[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const pt = quadBezierPoint(c1, cp, c2, t)
    const tan = quadBezierTangent(c1, cp, c2, t)
    const rawLen = Math.hypot(tan.x, tan.y)
    const len = rawLen === 0 ? 1 : rawLen
    const nx = -tan.y / len
    const ny = tan.x / len
    upper.push({ x: pt.x + nx * halfWidth, y: pt.y + ny * halfWidth })
    lower.unshift({ x: pt.x - nx * halfWidth, y: pt.y - ny * halfWidth })
  }
  return [...upper, ...lower]
}

/** Small filled triangle at `tip`, base `length` px back along -tangent. */
function buildArrowPolygon (
  tip: Coordinate,
  tangent: Coordinate,
  length: number,
  halfWidth: number
): Coordinate[] {
  const tanLen = Math.hypot(tangent.x, tangent.y)
  if (tanLen === 0) {
    return [tip, tip, tip]
  }
  const tx = tangent.x / tanLen
  const ty = tangent.y / tanLen
  const nx = -ty
  const ny = tx
  const baseCx = tip.x - tx * length
  const baseCy = tip.y - ty * length
  return [
    tip,
    { x: baseCx + nx * halfWidth, y: baseCy + ny * halfWidth },
    { x: baseCx - nx * halfWidth, y: baseCy - ny * halfWidth }
  ]
}

/** "DD Tháng {name} 'YY" for X-axis date pills (kernel forecast parity). */
const VI_MONTHS: string[] = [
  'Tháng Một', 'Tháng Hai', 'Tháng Ba', 'Tháng Tư',
  'Tháng Năm', 'Tháng Sáu', 'Tháng Bảy', 'Tháng Tám',
  'Tháng Chín', 'Tháng Mười', 'Tháng Mười Một', 'Tháng Mười Hai'
]

function formatViDatePill (timestamp: number | undefined): string {
  if (timestamp == null) return ''
  const d = new Date(timestamp)
  const month = VI_MONTHS[d.getMonth()] ?? ''
  const yy = String(d.getFullYear() % 100).padStart(2, '0')
  return `${d.getDate()} ${month} '${yy}`
}

// ═══════════════════════════════════════
// Overlay template
// ═══════════════════════════════════════

const forecast: OverlayTemplate<ForecastExtendData> = {
  name: 'forecast',
  totalStep: 3,
  figureCacheDataRev: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  mode: 'normal',

  createPointFigures: withPerfPipeline(({ chart, coordinates, bounding, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) {
      return []
    }

    const ext = getExt(overlay.extendData)
    const precision = getPricePrecision(chart, ext.pricePrecision)

    const p1 = overlay.points[0] ?? {}
    const p2 = overlay.points[1] ?? {}
    const c1 = coordinates[0]
    const c2 = coordinates[1]
    const isDrawing = overlay.isDrawing()

    const figures: OverlayFigure[] = []

    // ─── 1. Bezier curve (visual only) ───
    const cp = computeBezierControlPoint(c1, c2)
    const lineColorAlpha = alpha(ext.lineColor, ext.lineOpacity)
    figures.push({
      key: 'fc_curve',
      type: 'path',
      attrs: {
        x: 0,
        y: 0,
        width: bounding.width,
        height: bounding.height,
        path: `M ${c1.x} ${c1.y} Q ${cp.x} ${cp.y} ${c2.x} ${c2.y}`
      },
      styles: {
        style: 'stroke',
        color: lineColorAlpha,
        lineWidth: ext.lineWidth
      },
      ignoreEvent: true
    })

    // ─── 2. Curve hitbox (transparent tube, body-drag surface) ───
    const hitboxPoly = buildCurveHitbox(c1, cp, c2, CURVE_HITBOX_HALF_WIDTH, CURVE_SAMPLES)
    figures.push({
      key: 'fc_curve_hitbox',
      type: 'polygon',
      attrs: { coordinates: hitboxPoly },
      styles: { style: 'fill', color: 'transparent' },
      cursor: 'move'
    })

    // ─── 3. P1 source pill ───
    const p1PriceText = p1.value != null ? fmtNum(p1.value, precision) : ''
    const p1DateText = formatISODate(p1.timestamp)
    const p1TextWidth = Math.max(
      calcTextWidth(p1PriceText, PILL_FONT_SIZE),
      calcTextWidth(p1DateText, PILL_FONT_SIZE)
    )
    const p1PillW = p1TextWidth + 2 * PILL_PADDING_H
    const p1PillH = 2 * PILL_FONT_SIZE + PILL_LINE_GAP + 2 * PILL_PADDING_V
    const p1PillX = c1.x - PILL_ANCHOR_GAP - p1PillW
    const p1PillY = c1.y - p1PillH / 2

    figures.push({
      key: 'fc_p1_pill',
      type: 'rect',
      attrs: { x: p1PillX, y: p1PillY, width: p1PillW, height: p1PillH },
      styles: {
        style: 'stroke_fill',
        color: alpha(ext.sourceBgColor, ext.sourceBgOpacity),
        borderColor: alpha(ext.sourceBorderColor, ext.sourceBorderOpacity),
        borderSize: 1,
        borderRadius: PILL_BORDER_RADIUS
      },
      cursor: 'move'
    })

    const p1PillCX = p1PillX + p1PillW / 2
    figures.push({
      key: 'fc_p1_text_price',
      type: 'text',
      attrs: {
        x: p1PillCX,
        y: p1PillY + PILL_PADDING_V + PILL_FONT_SIZE / 2,
        text: p1PriceText,
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      styles: {
        color: alpha(ext.sourceTextColor, ext.sourceTextOpacity),
        size: PILL_FONT_SIZE,
        backgroundColor: 'transparent'
      },
      ignoreEvent: true
    })
    figures.push({
      key: 'fc_p1_text_date',
      type: 'text',
      attrs: {
        x: p1PillCX,
        y: p1PillY + PILL_PADDING_V + PILL_FONT_SIZE + PILL_LINE_GAP + PILL_FONT_SIZE / 2,
        text: p1DateText,
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      styles: {
        color: alpha(ext.sourceTextColor, ext.sourceTextOpacity),
        size: PILL_FONT_SIZE,
        backgroundColor: 'transparent'
      },
      ignoreEvent: true
    })

    // ─── 4. P2 info pill ───
    const dataList = chart.getDataList()
    let deltaLine = ''
    let priceLine = ''
    if (p1.value != null && p2.value != null) {
      const delta = p2.value - p1.value
      const deltaPctStr = p1.value !== 0
        ? ((delta / Math.abs(p1.value)) * 100).toFixed(2)
        : '-'
      const deltaPctSigned = p1.value !== 0 && delta >= 0 ? `+${deltaPctStr}` : deltaPctStr

      const i1 = resolveBarIndex(dataList, p1.timestamp)
      const i2 = resolveBarIndex(dataList, p2.timestamp)
      let barCount = 0
      if (i1 >= 0 && i2 >= 0) {
        barCount = Math.abs(i2 - i1)
      } else if (p1.dataIndex != null && p2.dataIndex != null) {
        barCount = Math.abs(p2.dataIndex - p1.dataIndex)
      }

      deltaLine = `${signedNum(delta, precision)} (${deltaPctSigned}%) trong ${barCount}n`
      priceLine = `${fmtNum(p2.value, precision)} ${CLOCK_CHAR} ${formatISODate(p2.timestamp)}`
    }

    const p2TextWidth = Math.max(
      calcTextWidth(deltaLine, PILL_FONT_SIZE),
      calcTextWidth(priceLine, PILL_FONT_SIZE)
    )
    const p2PillW = p2TextWidth + 2 * PILL_PADDING_H
    const p2PillH = 2 * PILL_FONT_SIZE + PILL_LINE_GAP + 2 * PILL_PADDING_V
    const p2PillX = c2.x + PILL_ANCHOR_GAP
    const p2PillY = c2.y - p2PillH / 2

    figures.push({
      key: 'fc_p2_pill',
      type: 'rect',
      attrs: { x: p2PillX, y: p2PillY, width: p2PillW, height: p2PillH },
      styles: {
        style: 'stroke_fill',
        color: alpha(ext.targetBgColor, ext.targetBgOpacity),
        borderColor: alpha(ext.targetBorderColor, ext.targetBorderOpacity),
        borderSize: 1,
        borderRadius: PILL_BORDER_RADIUS
      },
      cursor: 'move'
    })

    const p2PillCX = p2PillX + p2PillW / 2
    figures.push({
      key: 'fc_p2_text_line1',
      type: 'text',
      attrs: {
        x: p2PillCX,
        y: p2PillY + PILL_PADDING_V + PILL_FONT_SIZE / 2,
        text: deltaLine,
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      styles: {
        color: alpha(ext.targetTextColor, ext.targetTextOpacity),
        size: PILL_FONT_SIZE,
        backgroundColor: 'transparent'
      },
      ignoreEvent: true
    })
    figures.push({
      key: 'fc_p2_text_line2',
      type: 'text',
      attrs: {
        x: p2PillCX,
        y: p2PillY + PILL_PADDING_V + PILL_FONT_SIZE + PILL_LINE_GAP + PILL_FONT_SIZE / 2,
        text: priceLine,
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      styles: {
        color: alpha(ext.targetTextColor, ext.targetTextOpacity),
        size: PILL_FONT_SIZE,
        backgroundColor: 'transparent'
      },
      ignoreEvent: true
    })

    // ─── 5. Status badge (hidden while drawing) ───
    if (!isDrawing && p1.value != null && p2.value != null) {
      const status = evaluateStatus(dataList, p1, p2)
      const bullish = p2.value > p1.value

      const badgeText = status === 'success' ? '✓ THÀNH CÔNG' : '☹ THẤT BẠI'
      const badgeTextW = calcTextWidth(badgeText, BADGE_FONT_SIZE)
      const badgeW = badgeTextW + 2 * BADGE_PADDING_H
      const badgeH = BADGE_FONT_SIZE + 2 * BADGE_PADDING_V

      const badgeBgHex = status === 'success' ? ext.successBgColor : ext.failureBgColor
      const badgeBgOpacity = status === 'success' ? ext.successBgOpacity : ext.failureBgOpacity
      const badgeTextHex = status === 'success' ? ext.successTextColor : ext.failureTextColor
      const badgeTextOpacity = status === 'success' ? ext.successTextOpacity : ext.failureTextOpacity

      const badgeX = p2PillX
      const badgeY = bullish
        ? p2PillY - badgeH - BADGE_GAP
        : p2PillY + p2PillH + BADGE_GAP

      figures.push({
        key: 'fc_badge_bg',
        type: 'rect',
        attrs: { x: badgeX, y: badgeY, width: badgeW, height: badgeH },
        styles: {
          style: 'fill',
          color: alpha(badgeBgHex, badgeBgOpacity),
          borderRadius: PILL_BORDER_RADIUS
        },
        cursor: 'move'
      })
      figures.push({
        key: 'fc_badge_text',
        type: 'text',
        attrs: {
          x: badgeX + badgeW / 2,
          y: badgeY + badgeH / 2,
          text: badgeText,
          align: 'center' as CanvasTextAlign,
          baseline: 'middle' as CanvasTextBaseline
        },
        styles: {
          color: alpha(badgeTextHex, badgeTextOpacity),
          size: BADGE_FONT_SIZE,
          backgroundColor: 'transparent'
        },
        ignoreEvent: true
      })
    }

    // ─── 6. P2 arrow tip along the curve tangent ───
    const tanAtP2 = quadBezierTangent(c1, cp, c2, 1)
    const arrowPoly = buildArrowPolygon(c2, tanAtP2, ARROW_LENGTH, ARROW_HALF_WIDTH)
    figures.push({
      key: 'fc_arrow',
      type: 'polygon',
      attrs: { coordinates: arrowPoly },
      styles: { style: 'fill', color: lineColorAlpha },
      ignoreEvent: true
    })

    // ─── 7. Endpoint dots + selection anchors ───
    // Always-visible dots keep the kernel/TV look; createAnchorFigures adds
    // the draggable squares on top when selected/hovered.
    figures.push({
      key: 'fc_dot_p1',
      type: 'circle',
      attrs: { x: c1.x, y: c1.y, r: DOT_RADIUS },
      styles: { style: 'fill', color: DOT_COLOR },
      ignoreEvent: true
    })
    figures.push({
      key: 'fc_dot_p2',
      type: 'circle',
      attrs: { x: c2.x, y: c2.y, r: DOT_RADIUS },
      styles: { style: 'fill', color: DOT_COLOR },
      ignoreEvent: true
    })
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing,
      lock: overlay.lock,
      isTouch
    }))

    // ─── 8. Footer F / F* markers (always visible, pane bottom) ───
    const footerY = bounding.height - FOOTER_MARGIN_BOTTOM
    figures.push({
      key: 'fc_footer_bg_p1',
      type: 'circle',
      attrs: { x: c1.x, y: footerY, r: FOOTER_RADIUS },
      styles: { style: 'stroke', borderColor: FOOTER_COLOR, borderSize: FOOTER_BORDER_SIZE },
      ignoreEvent: true
    })
    figures.push({
      key: 'fc_footer_text_p1',
      type: 'text',
      attrs: {
        x: c1.x,
        y: footerY,
        text: 'F',
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      styles: { color: FOOTER_COLOR, size: FOOTER_FONT_SIZE, backgroundColor: 'transparent' },
      ignoreEvent: true
    })
    figures.push({
      key: 'fc_footer_bg_p2',
      type: 'circle',
      attrs: { x: c2.x, y: footerY, r: FOOTER_RADIUS },
      styles: { style: 'stroke', borderColor: FOOTER_COLOR, borderSize: FOOTER_BORDER_SIZE },
      ignoreEvent: true
    })
    figures.push({
      key: 'fc_footer_text_p2',
      type: 'text',
      attrs: {
        x: c2.x,
        y: footerY,
        text: 'F*',
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      styles: { color: FOOTER_COLOR, size: FOOTER_FONT_SIZE, backgroundColor: 'transparent' },
      ignoreEvent: true
    })

    return figures
  }, {
    slot: 'point',
    // dataList feeds bar-count + success/failure — not covered by the
    // coordinate/figuresRev signature, so key on the data tail.
    extraKey: ({ chart }) => {
      const dataList = chart.getDataList()
      const lastBar = dataList.length > 0 ? dataList[dataList.length - 1] : undefined
      return `${dataList.length}:${lastBar?.timestamp ?? 0}:${lastBar?.high ?? 0}:${lastBar?.low ?? 0}`
    }
  }),

  createXAxisFigures: withPerfPipeline(({ overlay, coordinates, bounding, isSelected }) => {
    if (isSelected !== true || coordinates.length < 2) {
      return []
    }

    const c1 = coordinates[0]
    const c2 = coordinates[1]
    const figures: OverlayFigure[] = []

    const ext = getExt(overlay.extendData)
    const p1 = overlay.points[0] ?? {}
    const p2 = overlay.points[1] ?? {}
    const p1Date = formatViDatePill(p1.timestamp)
    const p2Date = formatViDatePill(p2.timestamp)

    const stripLeftX = Math.min(c1.x, c2.x)
    const stripRightX = Math.max(c1.x, c2.x)
    const stripWidthX = stripRightX - stripLeftX
    if (stripWidthX > 0) {
      figures.push({
        key: 'fc_xstrip',
        type: 'rect',
        attrs: { x: stripLeftX, y: 0, width: stripWidthX, height: bounding.height },
        styles: { style: 'fill', color: alpha(AXIS_STRIP_COLOR, AXIS_STRIP_OPACITY) },
        ignoreEvent: true
      })
    }

    if (p1Date.length > 0) {
      figures.push({
        key: 'fc_xpill_p1',
        type: 'text',
        attrs: {
          x: c1.x,
          y: XAXIS_PILL_Y,
          text: p1Date,
          align: 'center' as CanvasTextAlign,
          baseline: 'top' as CanvasTextBaseline
        },
        styles: {
          color: alpha(ext.sourceTextColor, ext.sourceTextOpacity),
          backgroundColor: alpha(ext.sourceBgColor, ext.sourceBgOpacity),
          paddingLeft: XAXIS_PILL_PADDING_H,
          paddingRight: XAXIS_PILL_PADDING_H,
          paddingTop: XAXIS_PILL_PADDING_V,
          paddingBottom: XAXIS_PILL_PADDING_V,
          borderRadius: PILL_BORDER_RADIUS,
          size: PILL_FONT_SIZE
        },
        ignoreEvent: true
      })
    }
    if (p2Date.length > 0) {
      figures.push({
        key: 'fc_xpill_p2',
        type: 'text',
        attrs: {
          x: c2.x,
          y: XAXIS_PILL_Y,
          text: p2Date,
          align: 'center' as CanvasTextAlign,
          baseline: 'top' as CanvasTextBaseline
        },
        styles: {
          color: alpha(ext.targetTextColor, ext.targetTextOpacity),
          backgroundColor: alpha(ext.targetBgColor, ext.targetBgOpacity),
          paddingLeft: XAXIS_PILL_PADDING_H,
          paddingRight: XAXIS_PILL_PADDING_H,
          paddingTop: XAXIS_PILL_PADDING_V,
          paddingBottom: XAXIS_PILL_PADDING_V,
          borderRadius: PILL_BORDER_RADIUS,
          size: PILL_FONT_SIZE
        },
        ignoreEvent: true
      })
    }

    return figures
  }, { slot: 'x' }),

  createYAxisFigures: withPerfPipeline(({ chart, overlay, coordinates, bounding, yAxis, isSelected }) => {
    if (isSelected !== true || coordinates.length < 2) {
      return []
    }

    const ext = getExt(overlay.extendData)
    const precision = getPricePrecision(chart, ext.pricePrecision)
    const p1 = overlay.points[0] ?? {}
    const p2 = overlay.points[1] ?? {}

    const isFromZero = yAxis?.isFromZero() ?? false
    const textAlign: CanvasTextAlign = isFromZero ? 'left' : 'right'
    const x = isFromZero ? 0 : bounding.width

    const figures: OverlayFigure[] = []

    const c1y = coordinates[0].y
    const c2y = coordinates[1].y
    const stripTopY = Math.min(c1y, c2y)
    const stripBottomY = Math.max(c1y, c2y)
    const stripHeightY = stripBottomY - stripTopY
    if (stripHeightY > 0) {
      figures.push({
        key: 'fc_ystrip',
        type: 'rect',
        attrs: { x: 0, y: stripTopY, width: bounding.width, height: stripHeightY },
        styles: { style: 'fill', color: alpha(AXIS_STRIP_COLOR, AXIS_STRIP_OPACITY) },
        ignoreEvent: true
      })
    }

    if (p1.value != null) {
      figures.push({
        key: 'fc_ypill_p1',
        type: 'text',
        attrs: {
          x,
          y: c1y,
          text: fmtNum(p1.value, precision),
          align: textAlign,
          baseline: 'middle' as CanvasTextBaseline
        },
        styles: {
          color: alpha(ext.sourceTextColor, ext.sourceTextOpacity),
          backgroundColor: alpha(ext.sourceBgColor, ext.sourceBgOpacity),
          paddingLeft: XAXIS_PILL_PADDING_H,
          paddingRight: XAXIS_PILL_PADDING_H,
          paddingTop: XAXIS_PILL_PADDING_V,
          paddingBottom: XAXIS_PILL_PADDING_V,
          borderRadius: PILL_BORDER_RADIUS,
          size: PILL_FONT_SIZE
        },
        ignoreEvent: true
      })
    }
    if (p2.value != null) {
      figures.push({
        key: 'fc_ypill_p2',
        type: 'text',
        attrs: {
          x,
          y: c2y,
          text: fmtNum(p2.value, precision),
          align: textAlign,
          baseline: 'middle' as CanvasTextBaseline
        },
        styles: {
          color: alpha(ext.targetTextColor, ext.targetTextOpacity),
          backgroundColor: alpha(ext.targetBgColor, ext.targetBgOpacity),
          paddingLeft: XAXIS_PILL_PADDING_H,
          paddingRight: XAXIS_PILL_PADDING_H,
          paddingTop: XAXIS_PILL_PADDING_V,
          paddingBottom: XAXIS_PILL_PADDING_V,
          borderRadius: PILL_BORDER_RADIUS,
          size: PILL_FONT_SIZE
        },
        ignoreEvent: true
      })
    }

    return figures
  }, { slot: 'y' })
}

export default forecast
