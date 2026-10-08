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
import type { YAxis } from '../../../component/YAxis'
import type {
  Overlay,
  OverlayFigure,
  OverlayPerformEventParams
} from '../../../component/Overlay'

import { isArray, isNumber, isString, isValid } from '../../../common/utils/typeChecks'
import type { LineType } from '../../../common/Styles'
import { formatPrecision } from '../../../common/utils/format'
import { calcTextWidth } from '../../../common/utils/canvas'
import { isSnap45Active, snap45Coordinate } from '../../interaction/snap45'
import {
  getArrowCoordinates,
  getExtendedCoordinates,
  formatNum,
  formatDate,
  alphaColor,
  buildXAxisPill,
  buildYAxisPill
} from '../../../extension/overlay/lineCommon'

// Re-export the kernel line helpers so every tool in this group shares one
// import surface (geometry, formatting, axis pill builders).
export {
  getArrowCoordinates,
  getExtendedCoordinates,
  formatNum,
  formatDate,
  alphaColor,
  buildXAxisPill,
  buildYAxisPill
}

export { getLinearYFromCoordinates } from '../../../extension/figure/line'

/**
 * Shared `extendData` vocabulary for the line family. Union of the kernel
 * line overlays' fields plus the consumer (`contents_pro`) extendData color
 * channel (`lineColor`/`lineWidth`/`lineStyle`). Everything optional and
 * JSON-safe — `extendData` may also be absent at runtime, always read via
 * `isValid(overlay.extendData) ? overlay.extendData : {}`.
 */
export interface LineExtendData {
  // ── Extension / end caps (kernel segment/ray/straight) ──
  extendLeft?: boolean
  extendRight?: boolean
  /** 0 = none, 1 = arrowhead. For vertical tools leftEnd = top, rightEnd = bottom. */
  leftEnd?: number
  rightEnd?: number
  // ── Middle translate handle ──
  showMiddlePoint?: boolean
  /** Consumer spelling of the same flag (infoLine/trendAngle). */
  showMidpoint?: boolean
  // ── Price labels at anchors ──
  showPriceLabels?: boolean
  /** Consumer spelling (singular) of the same flag. */
  showPriceLabel?: boolean
  /** priceLine's persistent on-line price pill (default true). */
  showPrice?: boolean
  // ── Text label (kernel field casing) ──
  showLabel?: boolean
  text?: string
  textcolor?: string
  fontsize?: number
  bold?: boolean
  italic?: boolean
  horzLabelsAlign?: string
  vertLabelsAlign?: string
  // ── Text label (consumer field casing, infoLine) ──
  textColor?: string
  textSize?: number
  textBold?: boolean
  textItalic?: boolean
  textHorizontalAlign?: 'left' | 'center' | 'right'
  textVerticalAlign?: 'top' | 'middle' | 'bottom'
  // ── Stats (kernel flat flags) ──
  showPriceRange?: boolean
  showPercentPriceRange?: boolean
  showPipsPriceRange?: boolean
  showBarsRange?: boolean
  showDateTimeRange?: boolean
  showDistance?: boolean
  showAngle?: boolean
  alwaysShowStats?: boolean
  /** Kernel numeric enum (0 left, 1 top, 2 right, 3 bottom) or the
   *  consumer infoLine strings ('top' | 'center' | 'bottom'). */
  statsPosition?: number | 'top' | 'center' | 'bottom'
  statsAlwaysVisible?: boolean
  // ── trendAngle persisted state + flags ──
  /** Screen-space angle of the main line in radians (TV `_angle`). */
  angle?: number
  /** Screen-space anchor distance in px (TV `_distance`). */
  distance?: number
  showBaselines?: boolean
  // ── infoLine stats config (consumer object shape) ──
  stats?: {
    priceRange?: boolean
    percentChange?: boolean
    pipChange?: boolean
    barRange?: boolean
    dateTimeRange?: boolean
    distance?: boolean
    angle?: boolean
  }
  /** Period info for infoLine duration estimates. */
  periodType?: string
  periodSpan?: number
  pricePrecision?: number
  // ── extendData color/style channel (consumer tools) ──
  lineColor?: string
  /** Legacy consumer alias for lineColor (crossLine). */
  color?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
}

// ═══════════════════════════════════════
// Style resolution
// ═══════════════════════════════════════

export const FALLBACK_LINE_COLOR = '#2196F3'

/**
 * Effective main-line color: `styles.line` (kernel settings channel) wins,
 * then the extendData color channel (consumer tools), then the chart theme
 * default so secondary elements (arrows/labels/pills) match the line even
 * when `overlay.styles` is unset.
 */
export function lineColorOf (
  overlay: Overlay,
  chart: Chart,
  extColor?: string
): string {
  return overlay.styles?.line?.color ??
    extColor ??
    chart.getStyles().overlay.line.color
}

/** Effective line width — for label offset math and explicit-style figures. */
export function lineSizeOf (
  overlay: Overlay,
  chart: Chart,
  extWidth?: number
): number {
  return overlay.styles?.line?.size ??
    extWidth ??
    chart.getStyles().overlay.line.size
}

/** Explicit line-figure styles for tools driven by extendData styling. */
export function lineStyleOverrides (
  overlay: Overlay,
  chart: Chart,
  ext?: LineExtendData
): { color: string, size: number, style: LineType, dashedValue: number[] } {
  const themeLine = chart.getStyles().overlay.line
  const extStyle = ext?.lineStyle
  // 'dotted' is a first-class LineType — figures render it via dashedValue.
  const style: LineType = overlay.styles?.line?.style ??
    (extStyle === 'dashed' || extStyle === 'dotted' ? extStyle : 'solid')
  const dashedValue = overlay.styles?.line?.dashedValue ??
    (extStyle === 'dotted' ? [2, 2] : extStyle === 'dashed' ? [6, 4] : [2, 2])
  return {
    color: overlay.styles?.line?.color ?? ext?.lineColor ?? ext?.color ?? themeLine.color,
    size: overlay.styles?.line?.size ?? ext?.lineWidth ?? themeLine.size,
    style,
    dashedValue
  }
}

// ═══════════════════════════════════════
// Precision
// ═══════════════════════════════════════

/**
 * Display precision for price labels/pills: symbol precision on candle
 * panes, max indicator precision on indicator panes (fibonacciLine pattern).
 */
export function pricePrecisionOf (
  chart: Chart,
  overlay: Overlay,
  yAxis: YAxis | null | undefined,
  override?: number
): number {
  if (isNumber(override)) {
    return override
  }
  if (yAxis?.isInCandle() ?? true) {
    return chart.getSymbol()?.pricePrecision ?? 2
  }
  let precision = 0
  const indicators = chart.getIndicators({ paneId: overlay.paneId })
  indicators.forEach(indicator => {
    precision = Math.max(precision, indicator.precision)
  })
  return precision
}

// ═══════════════════════════════════════
// Chart registry for perform* callbacks
// ═══════════════════════════════════════

const lineChartRegistry = new WeakMap<object, Chart>()

/**
 * perform* callbacks receive no `chart` — snap45 and pixel math need one,
 * so createPointFigures registers the chart against the overlay each draw.
 */
export function rememberLineChart (overlay: Overlay, chart: Chart): void {
  lineChartRegistry.set(overlay, chart)
}

export function lineChartOf (overlay: Overlay): Chart | undefined {
  return lineChartRegistry.get(overlay)
}

// ═══════════════════════════════════════
// 45° snapping
// ═══════════════════════════════════════

/**
 * If Shift (or the persistent align-45 toggle) is active, snap the point
 * currently being moved (`params.performPointIndex`) to the nearest 45°
 * ray from `params.points[fixedIndex]`, preserving distance. Writes
 * dataIndex/timestamp/value back into the dragged point.
 */
export function applySnap45 (
  overlay: Overlay,
  params: OverlayPerformEventParams,
  fixedIndex: number
): void {
  const event = params.event
  const chart = lineChartOf(overlay)
  if (event === undefined || chart === undefined) {
    return
  }
  if (!isSnap45Active(chart, event) || !isNumber(event.x) || !isNumber(event.y)) {
    return
  }
  const fixed = params.points[fixedIndex]
  if (!isValid(fixed)) {
    return
  }
  const from = chart.convertToPixel(fixed, { paneId: overlay.paneId }) as Partial<Coordinate>
  if (!isNumber(from.x) || !isNumber(from.y)) {
    return
  }
  const snapped = snap45Coordinate(
    { x: event.x, y: event.y },
    { x: from.x, y: from.y }
  )
  const converted = chart.convertFromPixel([snapped], { paneId: overlay.paneId })
  const point = isArray(converted) ? converted[0] : converted
  const target = params.points[params.performPointIndex]
  if (!isValid(target) || !isValid(point)) {
    return
  }
  target.timestamp = point.timestamp
  target.dataIndex = point.dataIndex
  target.value = point.value
}

// ═══════════════════════════════════════
// Text labels
// ═══════════════════════════════════════

export interface LabelSpec {
  text?: string
  textColor?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  hAlign?: string
  vAlign?: string
}

/** Read label fields honoring both kernel and consumer field casing. */
export function labelSpecOf (ext: LineExtendData): LabelSpec | null {
  const text = ext.text
  if (!isValid(text) || text === '') {
    return null
  }
  if (ext.showLabel === false) {
    return null
  }
  return {
    text,
    textColor: ext.textcolor ?? ext.textColor,
    fontSize: ext.fontsize ?? ext.textSize ?? 14,
    bold: ext.bold ?? ext.textBold ?? false,
    italic: ext.italic ?? ext.textItalic ?? false,
    hAlign: ext.horzLabelsAlign ?? ext.textHorizontalAlign ?? 'center',
    vAlign: ext.vertLabelsAlign ?? ext.textVerticalAlign ?? 'top'
  }
}

export interface DiagonalLabelLayout {
  figure: OverlayFigure
  /**
   * When the label sits ON the line (vAlign center/middle) this is the
   * [t0, t1] interval along lineStart→lineEnd the caller must leave empty
   * so the text doesn't overlap the stroke.
   */
  gap?: [number, number]
}

/**
 * TradingView trend-line label layout: rotated with the line, anchored at
 * 15%/50%/85% along the RENDERED line (extension included) and offset
 * perpendicular when vAlign is top/bottom. `center`/`middle` puts the text
 * on the line and reports a gap interval for the caller to cut out.
 */
export function layoutDiagonalLabel (
  key: string,
  spec: LabelSpec,
  lineStart: Coordinate,
  lineEnd: Coordinate,
  lineColor: string,
  lineWidth: number
): DiagonalLabelLayout | null {
  const text = spec.text
  if (!isString(text) || text === '') {
    return null
  }
  const fontSize = spec.fontSize ?? 14
  const textColor = spec.textColor ?? lineColor

  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  let angle = Math.atan2(dy, dx)
  // Keep text readable (never upside down).
  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle < -Math.PI / 2) angle += Math.PI

  let t = 0.5
  if (spec.hAlign === 'left') t = 0.15
  else if (spec.hAlign === 'right') t = 0.85
  const anchorX = lineStart.x + dx * t
  const anchorY = lineStart.y + dy * t

  const vAlign = spec.vAlign ?? 'top'
  const gap = 5
  let offsetPx = 0
  let baseline: CanvasTextBaseline = 'middle'
  if (vAlign === 'top') {
    offsetPx = -(lineWidth / 2 + gap + fontSize)
    baseline = 'bottom'
  } else if (vAlign === 'bottom') {
    offsetPx = lineWidth / 2 + gap + fontSize
    baseline = 'top'
  }
  const perpX = -Math.sin(angle) * offsetPx
  const perpY = Math.cos(angle) * offsetPx

  const figure: OverlayFigure = {
    key,
    type: 'text',
    attrs: {
      x: anchorX + perpX,
      y: anchorY + perpY,
      text,
      align: 'center' as CanvasTextAlign,
      baseline,
      rotation: angle
    },
    styles: {
      color: textColor,
      size: fontSize,
      weight: spec.bold === true ? 'bold' : 'normal',
      style: spec.italic === true ? 'italic' : 'normal',
      backgroundColor: 'transparent'
    },
    ignoreEvent: true
  }

  const onLine = vAlign === 'center' || vAlign === 'middle'
  if (onLine && (dx !== 0 || dy !== 0)) {
    const lineLen = Math.sqrt(dx * dx + dy * dy)
    const textLen = calcTextWidth(text, fontSize, spec.bold === true ? 'bold' : 'normal') + 16
    const halfGap = Math.min(textLen / 2, lineLen * 0.4)
    const gapT: [number, number] = [
      Math.max(0, t - halfGap / lineLen),
      Math.min(1, t + halfGap / lineLen)
    ]
    return { figure, gap: gapT }
  }
  return { figure }
}

/**
 * Push a main-line figure, split in two around `gap` (a [t0,t1] interval
 * along start→end) when provided. `explicitStyles` for extendData-driven
 * tools; omit to inherit `overlay.styles.line` wholesale.
 */
export function pushLineWithGap (
  figures: OverlayFigure[],
  keyPrefix: string,
  lineStart: Coordinate,
  lineEnd: Coordinate,
  gap?: [number, number],
  explicitStyles?: { color: string, size: number, style: LineType, dashedValue: number[] }
): void {
  const makeFigure = (key: string, a: Coordinate, b: Coordinate): OverlayFigure => {
    const figure: OverlayFigure = {
      key,
      type: 'line',
      attrs: { coordinates: [a, b] }
    }
    if (explicitStyles !== undefined) {
      figure.styles = explicitStyles
    }
    return figure
  }
  if (gap === undefined) {
    figures.push(makeFigure(`${keyPrefix}_line`, lineStart, lineEnd))
    return
  }
  const dx = lineEnd.x - lineStart.x
  const dy = lineEnd.y - lineStart.y
  const midA: Coordinate = {
    x: lineStart.x + dx * gap[0],
    y: lineStart.y + dy * gap[0]
  }
  const midB: Coordinate = {
    x: lineStart.x + dx * gap[1],
    y: lineStart.y + dy * gap[1]
  }
  if (gap[0] > 0.01) {
    figures.push(makeFigure(`${keyPrefix}_line_a`, lineStart, midA))
  }
  if (gap[1] < 0.99) {
    figures.push(makeFigure(`${keyPrefix}_line_b`, midB, lineEnd))
  }
}

/**
 * Non-rotated label over a horizontal span (horizontal* tools). `x0..x1`
 * is the alignment range, `y` the line's vertical position.
 */
export function pushFlatLabel (
  figures: OverlayFigure[],
  key: string,
  spec: LabelSpec,
  x0: number,
  x1: number,
  y: number,
  lineColor: string,
  lineWidth: number
): void {
  const text = spec.text
  if (!isString(text) || text === '') {
    return
  }
  const fontSize = spec.fontSize ?? 14
  const leftX = Math.min(x0, x1)
  const width = Math.abs(x1 - x0)
  let tx = leftX + width * 0.5
  if (spec.hAlign === 'left') tx = leftX + width * 0.15
  else if (spec.hAlign === 'right') tx = leftX + width * 0.85

  const gap = 5
  let offsetY = 0
  let baseline: CanvasTextBaseline = 'middle'
  if (spec.vAlign === 'top') {
    offsetY = -(lineWidth / 2 + gap + fontSize)
    baseline = 'bottom'
  } else if (spec.vAlign === 'bottom') {
    offsetY = lineWidth / 2 + gap + fontSize
    baseline = 'top'
  }

  figures.push({
    key,
    type: 'text',
    attrs: { x: tx, y: y + offsetY, text, align: 'center' as CanvasTextAlign, baseline },
    styles: {
      color: spec.textColor ?? lineColor,
      size: fontSize,
      weight: spec.bold === true ? 'bold' : 'normal',
      style: spec.italic === true ? 'italic' : 'normal',
      backgroundColor: 'transparent'
    },
    ignoreEvent: true
  })
}

/**
 * Rotated (-90°) label beside a vertical span (vertical* tools). `x` is
 * the line's horizontal position, `y0..y1` the alignment range.
 */
export function pushVertLabel (
  figures: OverlayFigure[],
  key: string,
  spec: LabelSpec,
  x: number,
  y0: number,
  y1: number,
  lineColor: string,
  lineWidth: number
): void {
  const text = spec.text
  if (!isString(text) || text === '') {
    return
  }
  const fontSize = spec.fontSize ?? 14
  const topY = Math.min(y0, y1)
  const spanH = Math.abs(y1 - y0)
  let ty = topY + spanH * 0.5
  if (spec.hAlign === 'left') ty = topY + spanH * 0.15
  else if (spec.hAlign === 'right') ty = topY + spanH * 0.85

  const gap = 5
  let offsetX = 0
  let baseline: CanvasTextBaseline = 'middle'
  if (spec.vAlign === 'top') {
    offsetX = lineWidth / 2 + gap + fontSize
    baseline = 'bottom'
  } else if (spec.vAlign === 'bottom') {
    offsetX = -(lineWidth / 2 + gap + fontSize)
    baseline = 'top'
  }

  figures.push({
    key,
    type: 'text',
    attrs: {
      x: x + offsetX,
      y: ty,
      text,
      align: 'center' as CanvasTextAlign,
      baseline,
      rotation: -Math.PI / 2
    },
    styles: {
      color: spec.textColor ?? lineColor,
      size: fontSize,
      weight: spec.bold === true ? 'bold' : 'normal',
      style: spec.italic === true ? 'italic' : 'normal',
      backgroundColor: 'transparent'
    },
    ignoreEvent: true
  })
}

// ═══════════════════════════════════════
// Price labels at anchors
// ═══════════════════════════════════════

/** Kernel-style price text 18px above an anchor point. */
export function pushAnchorPriceLabel (
  figures: OverlayFigure[],
  key: string,
  coordinate: Coordinate,
  value: number | undefined,
  color: string,
  precision: number
): void {
  if (!isNumber(value)) {
    return
  }
  figures.push({
    key,
    type: 'text',
    attrs: {
      x: coordinate.x,
      y: coordinate.y - 18,
      text: formatNum(value, precision),
      align: 'center' as CanvasTextAlign,
      baseline: 'bottom' as CanvasTextBaseline
    },
    styles: { color, size: 11, weight: 'normal', backgroundColor: 'transparent' },
    ignoreEvent: true
  })
}

/** Reference-style price text beside an anchor (dark background). */
export function pushSidePriceLabel (
  figures: OverlayFigure[],
  key: string,
  coordinate: Coordinate,
  value: number | undefined,
  side: 'left' | 'right',
  color: string,
  precision: number
): void {
  if (!isNumber(value)) {
    return
  }
  figures.push({
    key,
    type: 'text',
    attrs: {
      x: coordinate.x + (side === 'right' ? 5 : -5),
      y: coordinate.y,
      text: formatPrecision(value, precision),
      align: (side === 'right' ? 'left' : 'right') as CanvasTextAlign,
      baseline: 'middle' as CanvasTextBaseline
    },
    styles: {
      color,
      size: 10,
      weight: 'normal',
      backgroundColor: 'rgba(30, 30, 30, 0.8)',
      paddingLeft: 4,
      paddingRight: 4,
      paddingTop: 2,
      paddingBottom: 2
    },
    ignoreEvent: true
  })
}

// ═══════════════════════════════════════
// Inline stats (kernel format: segments joined by two spaces)
// ═══════════════════════════════════════

export interface InlineStatsInput {
  ext: LineExtendData
  points: Array<Partial<Point>>
  /** Anchor coords — price-range source is `points`, angle uses these. */
  anchorA: Coordinate
  anchorB: Coordinate
  /** Rendered endpoints — distance uses these (ray tip, extended edge). */
  spanA: Coordinate
  spanB: Coordinate
  precision: number
  isActive: boolean
}

/**
 * Kernel stats vocabulary: `+Δ  +N%  M bars  Dist: Xpx  Y°` joined inline.
 * Returns [] when stats shouldn't render.
 */
export function inlineStatsLines (input: InlineStatsInput): string[] {
  const { ext, points, anchorA, anchorB, spanA, spanB, precision, isActive } = input
  const showStats = ext.alwaysShowStats === true || isActive
  const hasAny = ext.showPriceRange === true ||
    ext.showPercentPriceRange === true ||
    ext.showBarsRange === true ||
    ext.showDistance === true ||
    ext.showAngle === true
  if (!showStats || !hasAny || points.length < 2) {
    return []
  }
  const p1Value = points[0].value
  const p2Value = points[1].value
  const p1Index = points[0].dataIndex
  const p2Index = points[1].dataIndex
  const statLines: string[] = []

  if (ext.showPriceRange === true && isNumber(p1Value) && isNumber(p2Value)) {
    const diff = p2Value - p1Value
    statLines.push(`${diff >= 0 ? '+' : ''}${formatNum(diff, precision)}`)
  }
  if (ext.showPercentPriceRange === true && isNumber(p1Value) && isNumber(p2Value) && p1Value !== 0) {
    const pct = ((p2Value - p1Value) / Math.abs(p1Value)) * 100
    statLines.push(`${pct >= 0 ? '+' : ''}${formatNum(pct)}%`)
  }
  if (ext.showBarsRange === true && isNumber(p1Index) && isNumber(p2Index)) {
    statLines.push(`${Math.abs(p2Index - p1Index)} bars`)
  }
  if (ext.showDistance === true) {
    const dx = spanB.x - spanA.x
    const dy = spanB.y - spanA.y
    statLines.push(`Dist: ${formatNum(Math.sqrt(dx * dx + dy * dy), 1)}px`)
  }
  if (ext.showAngle === true) {
    const dx = anchorB.x - anchorA.x
    const dy = anchorB.y - anchorA.y
    statLines.push(`${formatNum(Math.atan2(-dy, dx) * (180 / Math.PI), 1)}°`)
  }
  return statLines
}

/**
 * Position + push the inline stats text. `a`/`b` bracket the reference
 * span (anchors or rendered tips). Kernel enum: 0 left, 1 top, 2 right
 * (default), 3 bottom.
 */
export function pushInlineStats (
  figures: OverlayFigure[],
  key: string,
  statLines: string[],
  statsPosition: number | string | undefined,
  a: Coordinate,
  b: Coordinate,
  color: string
): void {
  if (statLines.length === 0) {
    return
  }
  const statsText = statLines.join('  ')
  const statsPos = typeof statsPosition === 'string'
    ? statsPosition === 'top' ? 1 : statsPosition === 'bottom' ? 3 : 2
    : statsPosition ?? 2
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  let sx = Math.max(a.x, b.x) + 8
  let sy = midY
  let sAlign: CanvasTextAlign = 'left'
  let sBaseline: CanvasTextBaseline = 'middle'

  switch (statsPos) {
    case 0:
      sx = Math.min(a.x, b.x) - 8
      sy = midY
      sAlign = 'right'
      break
    case 1:
      sx = midX
      sy = Math.min(a.y, b.y) - 12
      sAlign = 'center'
      sBaseline = 'bottom'
      break
    case 3:
      sx = midX
      sy = Math.max(a.y, b.y) + 12
      sAlign = 'center'
      sBaseline = 'top'
      break
    default:
      break
  }

  figures.push({
    key,
    type: 'text',
    attrs: { x: sx, y: sy, text: statsText, align: sAlign, baseline: sBaseline },
    styles: { color, size: 11, weight: 'normal', backgroundColor: 'transparent' },
    ignoreEvent: true
  })
}

// ═══════════════════════════════════════
// Axis pill bundles (kernel parity)
// ═══════════════════════════════════════

export interface AxisViewParams {
  overlay: Overlay
  coordinates: Coordinate[]
  bounding: { width: number, height: number }
  lineColor: string
  /** Required for y-axis price pills; unused by the x-axis builder. */
  precision?: number
  yAxis?: { isFromZero: () => boolean }
}

/** Y-axis: faint strip between anchor prices + a pill per anchor. */
export function buildYAxisBandFigures (keyPrefix: string, params: AxisViewParams): OverlayFigure[] {
  const { overlay, coordinates, bounding, lineColor, precision, yAxis } = params
  const figures: OverlayFigure[] = []
  if (coordinates.length >= 2) {
    const stripTop = Math.min(coordinates[0].y, coordinates[1].y)
    const stripH = Math.abs(coordinates[1].y - coordinates[0].y)
    if (stripH > 0) {
      figures.push({
        key: `${keyPrefix}_ystrip`,
        type: 'rect',
        attrs: { x: 0, y: stripTop, width: bounding.width, height: stripH },
        styles: { style: 'fill', color: alphaColor('#2962ff', 0.1) },
        ignoreEvent: true
      })
    }
  }
  const p1 = buildYAxisPill(coordinates[0].y, overlay.points[0]?.value, lineColor, precision ?? 2, bounding, yAxis, `${keyPrefix}_y0`)
  if (p1 != null) {
    figures.push(p1)
  }
  if (coordinates.length >= 2) {
    const p2 = buildYAxisPill(coordinates[1].y, overlay.points[1]?.value, lineColor, precision ?? 2, bounding, yAxis, `${keyPrefix}_y1`)
    if (p2 != null) {
      figures.push(p2)
    }
  }
  return figures
}

/** X-axis: faint strip between anchor positions + a date pill per anchor. */
export function buildXAxisBandFigures (keyPrefix: string, params: AxisViewParams): OverlayFigure[] {
  const { overlay, coordinates, bounding, lineColor } = params
  const figures: OverlayFigure[] = []
  if (coordinates.length >= 2) {
    const stripLeft = Math.min(coordinates[0].x, coordinates[1].x)
    const stripW = Math.abs(coordinates[1].x - coordinates[0].x)
    if (stripW > 0) {
      figures.push({
        key: `${keyPrefix}_xstrip`,
        type: 'rect',
        attrs: { x: stripLeft, y: 0, width: stripW, height: bounding.height },
        styles: { style: 'fill', color: alphaColor('#2962ff', 0.1) },
        ignoreEvent: true
      })
    }
  }
  const d0 = formatDate(overlay.points[0]?.timestamp)
  if (d0 !== '') {
    figures.push(buildXAxisPill(coordinates[0].x, d0, lineColor, `${keyPrefix}_x0`))
  }
  if (coordinates.length >= 2) {
    const d1 = formatDate(overlay.points[1]?.timestamp)
    if (d1 !== '') {
      figures.push(buildXAxisPill(coordinates[1].x, d1, lineColor, `${keyPrefix}_x1`))
    }
  }
  return figures
}
