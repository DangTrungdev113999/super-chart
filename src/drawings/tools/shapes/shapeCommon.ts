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
import type { Period } from '../../../common/Period'
import type { Chart } from '../../../Chart'
import type {
  Overlay,
  OverlayFigure,
  OverlayFigureMoveDirection,
  OverlayPerformEventParams
} from '../../../component/Overlay'

import { isArray, isBoolean, isNumber, isString, isValid } from '../../../common/utils/typeChecks'
import type { LineType } from '../../../common/Styles'
import { alphaRgba } from '../../../extension/overlay/ellipse/math'
import { PERIOD_VIS_KEY } from '../../../extension/overlay/ellipse/constants'

import { ANCHOR_HALF_MOUSE, ANCHOR_HALF_TOUCH } from '../../interaction/anchors'
import { isSnap45Active } from '../../interaction/snap45'

import { lineChartOf, rememberLineChart } from '../lines/lineCommon'

// The perform* callbacks receive no `chart` — the line group's WeakMap
// registry is shared so shape tools resolve their chart the same way.
export { lineChartOf as shapeChartOf, rememberLineChart as rememberShapeChart }
export { lineStyleOverrides, alphaColor } from '../lines/lineCommon'

// ═══════════════════════════════════════
// extendData vocabulary
// ═══════════════════════════════════════

export interface ShapeBackgroundSpec {
  enabled?: boolean
  color?: string
  /** 0-100 percent (consumer reference) or 0-1 fraction (kernel circle). */
  opacity?: number
}

export interface ShapeVisibilityRange {
  enabled?: boolean
  min?: number
  max?: number
}

/**
 * Shared `extendData` vocabulary for the shapes family — union of the
 * consumer (`contents_pro`) fields and the kernel rect/circle/ellipse
 * fields. Everything optional and JSON-safe. `extendData` may be absent at
 * runtime — always read via `isValid(overlay.extendData) ? overlay.extendData : {}`.
 */
export interface ShapeExtendData {
  // ── Border / line style (consumer casing first, kernel aliases) ──
  borderColor?: string
  borderWidth?: number
  borderStyle?: 'solid' | 'dashed' | 'dotted'
  lineColor?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  /** Consumer stroke alias (arc/curve/doubleCurve/path use `color`). */
  color?: string
  // ── Fill ──
  /** Consumer object form: { enabled, color, opacity }. */
  background?: ShapeBackgroundSpec
  fillEnabled?: boolean
  fillColor?: string
  /** Kernel circle percent (0-100); kernel ellipse fraction (0-1). */
  fillOpacity?: number
  /** TV-style string fill + percent transparency (0-100 or 0-1). */
  backgroundColor?: string
  fillBackground?: boolean
  showBackground?: boolean
  transparency?: number
  // ── Rectangle extras (kernel rect) ──
  extendLeft?: boolean
  extendRight?: boolean
  showMiddleLine?: boolean
  middleLineColor?: string
  middleLineStyle?: 'solid' | 'dashed' | 'dotted'
  middleLineWidth?: number
  // ── Text (kernel + consumer casing) ──
  /** Kernel circle master gate; ellipse uses `textEnabled`. */
  showLabel?: boolean
  textEnabled?: boolean
  text?: string
  textColor?: string
  textcolor?: string
  textSize?: number
  fontsize?: number
  isBold?: boolean
  bold?: boolean
  textBold?: boolean
  isItalic?: boolean
  italic?: boolean
  textItalic?: boolean
  horzAlign?: 'left' | 'center' | 'right'
  horzLabelsAlign?: string
  textHorizontalAlign?: 'left' | 'center' | 'right'
  vertAlign?: 'top' | 'middle' | 'bottom'
  vertLabelsAlign?: string
  textVerticalAlign?: 'top' | 'middle' | 'bottom'
  /** Transient — consumer opens its own editor; hide text while editing. */
  isEditing?: boolean
  // ── Path ──
  endArrow?: boolean
  pricePrecision?: number
  // ── Per-period visibility (kernel ellipse parity) ──
  vis_ticks?: ShapeVisibilityRange
  vis_hours?: ShapeVisibilityRange
  vis_days?: ShapeVisibilityRange
  vis_weeks?: ShapeVisibilityRange
  vis_months?: ShapeVisibilityRange
}

// ═══════════════════════════════════════
// Style resolution
// ═══════════════════════════════════════

export interface ShapeStroke {
  color: string
  size: number
  style: LineType
  dashedValue: number[]
}

type ShapeStyleChannel = 'rect' | 'polygon' | 'circle'

interface ChannelShapeStyle {
  color?: string | CanvasGradient
  borderColor?: string
  borderSize?: number
  borderStyle?: LineType
  borderDashedValue?: number[]
}

const SHAPE_DASH_MAP: Record<'solid' | 'dashed' | 'dotted', number[]> = {
  solid: [],
  dashed: [8, 4],
  dotted: [2, 2]
}

/**
 * Resolved border for fill-capable shapes. Priority: `overlay.styles`
 * channel for the figure type (kernel settings dialog), then the
 * extendData color channel, then the theme default.
 */
export function shapeStrokeOf (
  overlay: Overlay,
  chart: Chart,
  ext: ShapeExtendData,
  channel: ShapeStyleChannel
): ShapeStroke {
  const themePoly = chart.getStyles().overlay[channel]
  const channelStyles: ChannelShapeStyle = overlay.styles?.[channel] ?? {}
  const extStyle = ext.borderStyle ?? ext.lineStyle
  const style: LineType = channelStyles.borderStyle ??
    (extStyle === 'solid' || extStyle === 'dotted' ? extStyle : extStyle !== undefined ? 'dashed' : themePoly.borderStyle)
  const dashedValue = channelStyles.borderDashedValue ??
    (extStyle !== undefined ? SHAPE_DASH_MAP[extStyle] : themePoly.borderDashedValue)
  return {
    color: channelStyles.borderColor ?? ext.borderColor ?? ext.lineColor ?? ext.color ?? themePoly.borderColor,
    size: channelStyles.borderSize ?? ext.borderWidth ?? ext.lineWidth ?? themePoly.borderSize,
    style,
    dashedValue
  }
}

/**
 * Whether the shape body is filled. The consumer `background.enabled`
 * wins over the kernel flat flags; default is filled.
 */
export function shapeFillEnabled (ext: ShapeExtendData): boolean {
  const bg = ext.background
  if (isValid(bg) && isBoolean(bg.enabled)) {
    return bg.enabled
  }
  return ext.fillEnabled ?? ext.fillBackground ?? ext.showBackground ?? true
}

function normalizeOpacity (opacity: number): number {
  // Percent (20 = 20%) vs fraction (0.2 = 20%) — both spellings exist in
  // the wild, so treat <=1 as a fraction.
  return Math.max(0, Math.min(1, opacity <= 1 ? opacity : opacity / 100))
}

/**
 * Resolved fill color honoring every field casing:
 * `background{color,opacity}` (consumer) → `fillColor`+`fillOpacity`
 * (kernel) → `backgroundColor`+`transparency` (TV) → stroke tint.
 */
export function shapeFillColor (
  overlay: Overlay,
  ext: ShapeExtendData,
  strokeColor: string,
  channel: ShapeStyleChannel
): string | CanvasGradient {
  const channelStyles: ChannelShapeStyle = overlay.styles?.[channel] ?? {}
  if (isValid(channelStyles.color)) {
    // The kernel settings channel wins outright — string or gradient.
    return channelStyles.color
  }
  const bg = ext.background
  if (isValid(bg) && (isString(bg.color) || isNumber(bg.opacity))) {
    const color = isString(bg.color) ? bg.color : strokeColor
    const opacity = isNumber(bg.opacity) ? bg.opacity : 20
    return alphaRgba(color, normalizeOpacity(opacity))
  }
  if (isString(ext.backgroundColor)) {
    if (!ext.backgroundColor.startsWith('#')) {
      return ext.backgroundColor
    }
    const t = isNumber(ext.transparency) ? ext.transparency : 80
    const pct = t <= 1 ? t * 100 : t
    return alphaRgba(ext.backgroundColor, Math.max(0, Math.min(1, (100 - pct) / 100)))
  }
  if (isString(ext.fillColor)) {
    const opacity = isNumber(ext.fillOpacity) ? ext.fillOpacity : 20
    return alphaRgba(ext.fillColor, normalizeOpacity(opacity))
  }
  const t = isNumber(ext.transparency) ? ext.transparency : 80
  const pct = t <= 1 ? t * 100 : t
  return alphaRgba(strokeColor, Math.max(0, Math.min(1, (100 - pct) / 100)))
}

// ═══════════════════════════════════════
// Text label
// ═══════════════════════════════════════

export interface ShapeLabelSpec {
  text: string
  color?: string
  fontSize: number
  bold: boolean
  italic: boolean
  hAlign: 'left' | 'center' | 'right'
  vAlign: 'top' | 'middle' | 'bottom'
}

/**
 * Normalized text spec. Returns null when no text is configured, a master
 * gate (`textEnabled`/`showLabel`) is off, or an external editor owns the
 * text right now (`isEditing`).
 */
export function shapeLabelSpecOf (ext: ShapeExtendData): ShapeLabelSpec | null {
  if (ext.isEditing === true) {
    return null
  }
  if (ext.textEnabled === false || ext.showLabel === false) {
    return null
  }
  const text = ext.text
  if (!isString(text) || text === '') {
    return null
  }
  const hRaw = ext.horzAlign ?? ext.textHorizontalAlign ?? ext.horzLabelsAlign ?? 'center'
  const vRaw = ext.vertAlign ?? ext.textVerticalAlign ?? ext.vertLabelsAlign ?? 'middle'
  return {
    text,
    color: ext.textColor ?? ext.textcolor,
    fontSize: ext.textSize ?? ext.fontsize ?? 14,
    bold: ext.isBold ?? ext.bold ?? ext.textBold ?? false,
    italic: ext.isItalic ?? ext.italic ?? ext.textItalic ?? false,
    hAlign: hRaw === 'left' || hRaw === 'right' ? hRaw : 'center',
    vAlign: vRaw === 'top' || vRaw === 'bottom' ? vRaw : 'middle'
  }
}

export interface ShapeTextBox {
  left: number
  top: number
  right: number
  bottom: number
}

const TEXT_PAD = 8

/**
 * In-box text figure (kernel rect pattern): alignment offsets the anchor
 * inside the box; `width`/`height` clip the text bounds. `rotation`
 * (radians around the text anchor) renders rotated labels — the TradingView
 * ellipse tilts its inscribed text by the edge angle.
 */
export function shapeTextFigure (
  key: string,
  spec: ShapeLabelSpec,
  box: ShapeTextBox,
  fallbackColor: string,
  rotation?: number
): OverlayFigure {
  let tx = (box.left + box.right) / 2
  let ty = (box.top + box.bottom) / 2
  if (spec.hAlign === 'left') {
    tx = box.left + TEXT_PAD
  } else if (spec.hAlign === 'right') {
    tx = box.right - TEXT_PAD
  }
  if (spec.vAlign === 'top') {
    ty = box.top + TEXT_PAD
  } else if (spec.vAlign === 'bottom') {
    ty = box.bottom - TEXT_PAD
  }
  return {
    key,
    type: 'text',
    attrs: {
      x: tx,
      y: ty,
      text: spec.text,
      align: spec.hAlign,
      baseline: spec.vAlign === 'middle' ? 'middle' : spec.vAlign,
      width: Math.max(0, box.right - box.left - TEXT_PAD * 2),
      height: Math.max(0, box.bottom - box.top - TEXT_PAD * 2),
      rotation
    },
    styles: {
      color: spec.color ?? fallbackColor,
      size: spec.fontSize,
      weight: spec.bold ? 'bold' : '600',
      // `style` on a text figure is the fill/stroke draw mode — italic goes
      // through fontStyle or the font string is never italicized.
      fontStyle: spec.italic ? 'italic' : undefined,
      backgroundColor: 'transparent'
    },
    ignoreEvent: true
  }
}

/** "+ Add text" placeholder (kernel rect parity) for selected empty-text shapes. */
export function shapeTextPlaceholderFigure (
  key: string,
  box: ShapeTextBox,
  color: string,
  rotation?: number
): OverlayFigure {
  return {
    key,
    type: 'text',
    attrs: {
      x: (box.left + box.right) / 2,
      y: (box.top + box.bottom) / 2,
      text: '+ Add text',
      align: 'center' as CanvasTextAlign,
      baseline: 'middle' as CanvasTextBaseline,
      rotation
    },
    styles: {
      color,
      size: 13,
      weight: 'normal',
      style: 'normal',
      backgroundColor: 'transparent'
    },
    cursor: 'text'
  }
}

// ═══════════════════════════════════════
// Handles (non-coordinate anchor positions)
// ═══════════════════════════════════════

export interface ShapeHandleOptions {
  pointIndex: number
  moveDirection?: OverlayFigureMoveDirection
  cursor?: string
  isTouch?: boolean
  /** 'circle' = TradingView round handle, 'square' = corner/edge box handle. */
  shape?: 'circle' | 'square'
}

/**
 * Square drag handle at an arbitrary pixel position (computed corners,
 * edge midpoints, generated controls — the channelCommon precedent). The
 * factory `createAnchorFigures` only anchors at stored coordinates, so
 * handles whose pixel position differs from `points[i]` are built here.
 */
export function shapeHandleFigure (
  key: string,
  coordinate: Coordinate,
  options: ShapeHandleOptions
): OverlayFigure {
  const half = options.isTouch === true ? ANCHOR_HALF_TOUCH : ANCHOR_HALF_MOUSE
  const cx = Math.round(coordinate.x) - 0.5
  const cy = Math.round(coordinate.y) - 0.5
  const shape = options.shape ?? 'square'
  return {
    key,
    type: shape === 'circle' ? 'circle' : 'rect',
    attrs: shape === 'circle'
      ? { x: cx, y: cy, r: half }
      : { x: cx - half, y: cy - half, width: half * 2, height: half * 2 },
    styles: {
      style: 'stroke_fill',
      color: '#ffffff',
      borderColor: '#1592E6',
      borderSize: 1.5
    },
    pointIndex: options.pointIndex,
    moveDirection: options.moveDirection ?? 'both',
    cursor: options.cursor ?? 'pointer'
  }
}

// ═══════════════════════════════════════
// Point ↔ pixel helpers (union-narrowed)
// ═══════════════════════════════════════

export function pointToCoordinate (
  chart: Chart,
  paneId: string,
  point: Partial<Point>
): Coordinate | null {
  const converted = chart.convertToPixel(point, { paneId })
  const c = isArray(converted) ? converted[0] : converted
  if (isValid(c) && isNumber(c.x) && isNumber(c.y)) {
    return { x: c.x, y: c.y }
  }
  return null
}

export function coordinateToPoint (
  chart: Chart,
  paneId: string,
  coordinate: Coordinate
): Partial<Point> | null {
  const converted = chart.convertFromPixel([coordinate], { paneId })
  const point = isArray(converted) ? converted[0] : converted
  return isValid(point) ? point : null
}

/**
 * Move `target` to the pixel position `prevPx + (dx, dy)` — exact
 * translation regardless of axis scale (log axes included).
 */
export function translatePointByPixelDelta (
  chart: Chart,
  paneId: string,
  target: Partial<Point>,
  prevPx: Coordinate,
  dx: number,
  dy: number
): void {
  const point = coordinateToPoint(chart, paneId, { x: prevPx.x + dx, y: prevPx.y + dy })
  if (point !== null) {
    target.timestamp = point.timestamp
    target.dataIndex = point.dataIndex
    target.value = point.value
  }
}

// ═══════════════════════════════════════
// Shift constraints
// ═══════════════════════════════════════

/** Square constraint: equal pixel extents on both axes, direction kept. */
export function squareCoordinate (to: Coordinate, from: Coordinate): Coordinate {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: from.x + (dx < 0 ? -side : side),
    y: from.y + (dy < 0 ? -side : side)
  }
}

/**
 * Shift (or the persistent align-45 toggle) → rewrite the moving point so
 * its pixel offset from `points[fixedIndex]` is square — TV's Shift-square
 * for rectangle/ellipse drawing. Same call shape as `applySnap45`.
 */
export function applySquareSnap (
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
  const from = pointToCoordinate(chart, overlay.paneId, fixed)
  if (from === null) {
    return
  }
  const point = coordinateToPoint(
    chart,
    overlay.paneId,
    squareCoordinate({ x: event.x, y: event.y }, from)
  )
  const target = params.points[params.performPointIndex]
  if (point === null || !isValid(target)) {
    return
  }
  target.timestamp = point.timestamp
  target.dataIndex = point.dataIndex
  target.value = point.value
}

// ═══════════════════════════════════════
// Per-period visibility (kernel ellipse parity)
// ═══════════════════════════════════════

/**
 * Fails OPEN — no configured range → visible. `enabled === false` hides on
 * that band; otherwise the period span must sit inside [min, max].
 * Mirrors the kernel ellipse `isEllipseVisibleAtPeriod` gate.
 */
export function hiddenAtPeriod (ext: ShapeExtendData, period: Period | null): boolean {
  if (period === null) {
    return false
  }
  const key = PERIOD_VIS_KEY[period.type]
  const range = ext[key]
  if (!isValid(range)) {
    return false
  }
  if (range.enabled === false) {
    return true
  }
  if (!isNumber(period.span)) {
    return false
  }
  const min = isNumber(range.min) ? range.min : Number.MIN_SAFE_INTEGER
  const max = isNumber(range.max) ? range.max : Number.MAX_SAFE_INTEGER
  return period.span < min || period.span > max
}

// ═══════════════════════════════════════
// Curve math
// ═══════════════════════════════════════

/**
 * Quadratic Bezier control point that makes the curve pass through the
 * on-curve midpoint `mid`: Pc = 2·mid − 0.5·p1 − 0.5·p2 (reference).
 */
export function quadraticOnCurveControl (
  p1: Coordinate,
  mid: Coordinate,
  p2: Coordinate
): Coordinate {
  return {
    x: 2 * mid.x - 0.5 * (p1.x + p2.x),
    y: 2 * mid.y - 0.5 * (p1.y + p2.y)
  }
}

/** Sample a quadratic Bezier into `segments` line-ready coordinates. */
export function sampleQuadratic (
  p0: Coordinate,
  pc: Coordinate,
  p1: Coordinate,
  segments: number
): Coordinate[] {
  const steps = Math.max(2, Math.floor(segments))
  const pts: Coordinate[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const mt = 1 - t
    pts.push({
      x: mt * mt * p0.x + 2 * mt * t * pc.x + t * t * p1.x,
      y: mt * mt * p0.y + 2 * mt * t * pc.y + t * t * p1.y
    })
  }
  return pts
}

function catmullRom (
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}

/**
 * Catmull-Rom spline through all four control points (the curve passes
 * through every anchor — reference doubleCurve renderer). Phantom
 * endpoints mirror the boundary tangents.
 */
export function sampleCatmullRom4 (
  p0: Coordinate,
  p1: Coordinate,
  p2: Coordinate,
  p3: Coordinate,
  segments: number
): Coordinate[] {
  const per = Math.max(1, Math.floor(segments / 3))
  const phantom0: Coordinate = {
    x: p0.x - (p1.x - p0.x),
    y: p0.y - (p1.y - p0.y)
  }
  const phantom3: Coordinate = {
    x: p3.x + (p3.x - p2.x),
    y: p3.y + (p3.y - p2.y)
  }
  const pts: Coordinate[] = []
  for (let i = 0; i <= per; i++) {
    const t = i / per
    pts.push({
      x: catmullRom(t, phantom0.x, p0.x, p1.x, p2.x),
      y: catmullRom(t, phantom0.y, p0.y, p1.y, p2.y)
    })
  }
  for (let i = 1; i <= per; i++) {
    const t = i / per
    pts.push({
      x: catmullRom(t, p0.x, p1.x, p2.x, p3.x),
      y: catmullRom(t, p0.y, p1.y, p2.y, p3.y)
    })
  }
  for (let i = 1; i <= per; i++) {
    const t = i / per
    pts.push({
      x: catmullRom(t, p1.x, p2.x, p3.x, phantom3.x),
      y: catmullRom(t, p1.y, p2.y, p3.y, phantom3.y)
    })
  }
  return pts
}

/**
 * S-curve intermediates between the two endpoints (reference doubleCurve
 * generation): 1/3 and 2/3 along the segment, offset ±0.25·len along the
 * perpendicular. Position-invariant (unlike TV's raw `e.add(t).scaled`).
 */
export function sCurveIntermediates (
  p0: Coordinate,
  p3: Coordinate
): [Coordinate, Coordinate] {
  const dx = p3.x - p0.x
  const dy = p3.y - p0.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const px = len > 0 ? -dy / len : 0
  const py = len > 0 ? dx / len : 0
  const offset = len * 0.25
  return [
    { x: p0.x + dx / 3 + px * offset, y: p0.y + dy / 3 + py * offset },
    { x: p0.x + (2 * dx) / 3 - px * offset, y: p0.y + (2 * dy) / 3 - py * offset }
  ]
}

/**
 * Quadratic-Bezier control midpoint + perpendicular offset (TV
 * BezierQuadro generation): mid(p1,p2) + 0.15·len perpendicular.
 */
export function quadControlOffset (
  p1: Coordinate,
  p2: Coordinate
): Coordinate {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const px = len > 0 ? -dy / len : 0
  const py = len > 0 ? dx / len : 0
  const offset = len * 0.15
  return {
    x: (p1.x + p2.x) / 2 + px * offset,
    y: (p1.y + p2.y) / 2 + py * offset
  }
}

// ═══════════════════════════════════════
// Rotated rectangle / parallelogram corners
// ═══════════════════════════════════════

/**
 * The four corners of the rotated rectangle (TradingView
 * LineToolRotatedRectangle): `p1`→`p2` is the quad's CENTERLINE — the
 * rectangle expands symmetrically by the unsigned perpendicular
 * distance of `p3` to the p1p2 line on BOTH sides (full width =
 * 2·distance). `n` is TV's right normal Point(edge.y, -edge.x)·dist.
 * Order: [p1+n, p2+n, p2−n, p1−n].
 */
export function rotatedRectCorners (
  p1: Coordinate,
  p2: Coordinate,
  p3: Coordinate
): [Coordinate, Coordinate, Coordinate, Coordinate] {
  const ex = p2.x - p1.x
  const ey = p2.y - p1.y
  const len = Math.sqrt(ex * ex + ey * ey)
  if (len === 0) {
    return [p1, p1, p1, p1]
  }
  const nx = ey / len
  const ny = -ex / len
  const half = Math.abs((p3.x - p1.x) * nx + (p3.y - p1.y) * ny)
  const ox = nx * half
  const oy = ny * half
  return [
    { x: p1.x + ox, y: p1.y + oy },
    { x: p2.x + ox, y: p2.y + oy },
    { x: p2.x - ox, y: p2.y - oy },
    { x: p1.x - ox, y: p1.y - oy }
  ]
}

// ═══════════════════════════════════════
// Chord-frame geometry (TV ellipse / arc)
// ═══════════════════════════════════════

/** Unit edge direction + left-hand normal of segment `a`→`b`. */
export interface EdgeFrame {
  /** Unit vector along a→b. */
  ux: number
  uy: number
  /** Unit left normal — TradingView's `Point(-edge.y, edge.x).normalized()`. */
  nx: number
  ny: number
  /** Segment length in px. */
  len: number
}

/** Frame for segment `a`→`b`; null when the edge is degenerate (<1e-9 px). */
export function edgeFrameOf (a: Coordinate, b: Coordinate): EdgeFrame | null {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-9) {
    return null
  }
  return { ux: dx / len, uy: dy / len, nx: -dy / len, ny: dx / len, len }
}

/**
 * Signed perpendicular distance from `p` to the infinite line `a`→`b` in
 * left-normal units. `Math.abs()` reproduces TradingView's unsigned
 * `distanceToLine().distance`; the sign reports which side `p` sits on
 * (positive = the Point(-dy, dx) side). Degenerate edges → 0.
 */
export function signedLineDistance (
  a: Coordinate,
  b: Coordinate,
  p: Coordinate
): number {
  const frame = edgeFrameOf(a, b)
  if (frame === null) {
    return 0
  }
  return (p.x - a.x) * frame.nx + (p.y - a.y) * frame.ny
}

/**
 * N-sample perimeter of a rotated ellipse: semi-axis `a` along `angle`
 * (radians), semi-axis `b` perpendicular — the TradingView
 * translate/rotate/scale ellipse, rendered as a polygon so it also
 * serves as the point-in-polygon hit target.
 */
export function sampleRotatedEllipsePolygon (
  cx: number,
  cy: number,
  a: number,
  b: number,
  angle: number,
  n = 64
): Coordinate[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const steps = Math.max(3, Math.floor(n))
  const pts: Coordinate[] = []
  for (let i = 0; i < steps; i++) {
    const t = (2 * Math.PI * i) / steps
    const u = a * Math.cos(t)
    const v = b * Math.sin(t)
    pts.push({ x: cx + u * cos - v * sin, y: cy + u * sin + v * cos })
  }
  return pts
}

/**
 * TradingView LineToolArc curve. TV draws a 60° circular arc — radius
 * `u` (the chord length) centered on the chord's perpendicular bisector
 * at ∓(√3/2)·u — then scales it perpendicular to the chord so the apex
 * lands at signed distance `d`, i.e. an affine-stretched (elliptical)
 * arc through p1, apex = mid + n̂·d, p2. `d` is `p3`'s signed
 * left-normal distance; |d| < 1 or a degenerate chord renders as the
 * bare chord (TV's `distance < 1 → line` fallback).
 */
export function sampleTVArc (
  p1: Coordinate,
  p2: Coordinate,
  p3: Coordinate,
  segments: number
): Coordinate[] {
  const frame = edgeFrameOf(p1, p2)
  if (frame === null) {
    return [p1, p2]
  }
  const d = signedLineDistance(p1, p2, p3)
  if (Math.abs(d) < 1) {
    return [p1, p2]
  }
  const u = frame.len
  const k = d / (u * (1 - Math.sqrt(3) / 2))
  const steps = Math.max(2, Math.floor(segments))
  const pts: Coordinate[] = []
  for (let i = 0; i <= steps; i++) {
    const theta = (2 * Math.PI) / 3 - (i / steps) * (Math.PI / 3)
    const xl = u / 2 + u * Math.cos(theta)
    const yl = (u * Math.sin(theta) - (u * Math.sqrt(3)) / 2) * k
    pts.push({
      x: p1.x + xl * frame.ux + yl * frame.nx,
      y: p1.y + xl * frame.uy + yl * frame.ny
    })
  }
  return pts
}

// ═══════════════════════════════════════
// Unlimited-step restore settle
// ═══════════════════════════════════════

/**
 * Overlays armed through `onDrawStart` — i.e. created empty for a live
 * draw. Restored overlays never fire onDrawStart (`override` advances
 * `currentStep` past START before createOverlay reaches the hook), so the
 * set distinguishes "user is drawing right now" from "deserialized into a
 * drawing state" — a distinction persisted data alone cannot express.
 */
const ARMED_DRAWS = new WeakSet<Overlay>()

/** Mark an overlay as a live draw — call from the template's `onDrawStart`. */
export function markDrawArmed (overlay: Overlay): void {
  ARMED_DRAWS.add(overlay)
}

interface ChartStoreProgress {
  getProgressOverlayInfo: () => { overlay: Overlay } | null
  progressOverlayComplete: () => void
}

/**
 * Kernel gap workaround for `totalStep: MAX_SAFE_INTEGER` tools: a
 * restored overlay lands in the drawing-progress slot (`override` can
 * never satisfy `points.length >= totalStep - 1`), eats the user's next
 * click, and is skipped by the serializer. When such an overlay owns the
 * slot and is NOT a live draw (never armed through onDrawStart), finish it
 * and hand it to the committed overlay list.
 *
 * Called from createPointFigures — the earliest hook that runs after
 * restore, with a live `chart`. Degenerate restores (< 2 points) are left
 * in place rather than removed mid-render.
 */
export function settleRestoredUnlimited (
  overlay: Overlay,
  chart: Chart
): void {
  if (!overlay.isDrawing() || overlay.isStart() || ARMED_DRAWS.has(overlay)) {
    return
  }
  if (overlay.points.length < 2) {
    return
  }
  const store = (chart as unknown as { getChartStore: () => ChartStoreProgress }).getChartStore()
  if (store.getProgressOverlayInfo()?.overlay !== overlay) {
    return
  }
  overlay.forceComplete()
  store.progressOverlayComplete()
}

/** Minimum rendered radius for the circle tool (kernel constant). */
export const MIN_RADIUS_PX = 5
