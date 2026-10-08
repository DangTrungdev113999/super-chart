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

import type Bounding from '../../../common/Bounding'
import type Coordinate from '../../../common/Coordinate'
import type Point from '../../../common/Point'
import type { Chart } from '../../../Chart'
import type { YAxis } from '../../../component/YAxis'
import type {
  Overlay,
  OverlayFigure,
  OverlayFigureMoveDirection
} from '../../../component/Overlay'

import { isArray, isNumber, isString, isValid } from '../../../common/utils/typeChecks'
import { alphaRgba } from '../../../extension/overlay/regressionTrend/math'

import {
  ANCHOR_HALF_MOUSE,
  ANCHOR_HALF_TOUCH
} from '../../interaction/anchors'

import {
  type LineExtendData,
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  lineStyleOverrides
} from '../lines/lineCommon'

/**
 * Shared `extendData` vocabulary for the channel family. Union of the
 * TradingView property names (`fillBackground`, `transparency`,
 * `background.color/opacity`) and the consumer (`contents_pro`) settings
 * panel names (`borderColor`, `borderWidth`, `backgroundColor`,
 * `showBackground`, `showMedianLine`). Everything optional and JSON-safe —
 * `extendData` may be absent at runtime, always read via
 * `isValid(overlay.extendData) ? overlay.extendData : {}`.
 */
export interface ChannelExtendData extends LineExtendData {
  /** Consumer panels write the line color as `borderColor`. */
  borderColor?: string
  /** Consumer panels write the line width as `borderWidth`. */
  borderWidth?: number
  /** Consumer disjoint/flat fill config: { enabled, color, opacity(0-100) }. */
  background?: { enabled?: boolean, color?: string, opacity?: number }
  /** Consumer parallel panel writes a ready `rgba(...)` fill string. */
  backgroundColor?: string
  /** TradingView fill flag (default true). */
  fillBackground?: boolean
  /** Consumer parallel panel fill flag (default true). */
  showBackground?: boolean
  /**
   * TradingView transparency — percent scale 0-100 (default 80 meaning a
   * 0.2 alpha fill); a 0-1 fraction is tolerated as the same fraction.
   */
  transparency?: number
  /** Parallel-channel median (coeff 0.5) line — dashed by default in TV. */
  showMedianLine?: boolean
  medianLineColor?: string
  medianLineWidth?: number
  medianLineStyle?: 'solid' | 'dashed' | 'dotted'
  /** TradingView `showPrices` — price labels at the rendered corners. */
  showPrices?: boolean
}

export interface ChannelStroke {
  color: string
  size: number
  style: 'solid' | 'dashed'
  dashedValue: number[]
}

/**
 * Effective edge stroke: `styles.line` (kernel settings channel) wins, then
 * the extendData color channel (`lineColor`/`borderColor`/`color`), then the
 * chart theme default.
 */
export function channelStrokeOf (
  overlay: Overlay,
  chart: Chart,
  ext: ChannelExtendData
): ChannelStroke {
  return lineStyleOverrides(overlay, chart, {
    lineColor: ext.lineColor ?? ext.borderColor ?? ext.color,
    lineWidth: ext.lineWidth ?? ext.borderWidth,
    lineStyle: ext.lineStyle
  })
}

/** Fill visibility — consumer `background.enabled` wins, then the flags. */
export function channelFillEnabled (ext: ChannelExtendData): boolean {
  const bg = ext.background
  if (isValid(bg) && isValid(bg.enabled)) {
    return bg.enabled
  }
  return ext.fillBackground ?? ext.showBackground ?? true
}

/**
 * TradingView transparency is a percent scale (80 → alpha 0.2); tolerate a
 * 0-1 fraction as the same fraction.
 */
export function applyTransparency (color: string, transparency: number): string {
  const percent = transparency <= 1 ? transparency * 100 : transparency
  const alpha = Math.max(0, Math.min(1, (100 - percent) / 100))
  return alphaRgba(color, alpha)
}

/**
 * Resolved channel fill color: consumer `background {color, opacity}` wins,
 * then `backgroundColor` (rgba strings pass through verbatim, hex gets the
 * transparency applied), then the line color at `transparency`.
 */
export function channelFillColor (ext: ChannelExtendData, strokeColor: string): string {
  const bg = ext.background
  if (isValid(bg) && isString(bg.color)) {
    const opacity = isNumber(bg.opacity) ? bg.opacity : 20
    return alphaRgba(bg.color, opacity <= 1 ? opacity : opacity / 100)
  }
  if (isString(ext.backgroundColor)) {
    return ext.backgroundColor.startsWith('#')
      ? applyTransparency(ext.backgroundColor, isNumber(ext.transparency) ? ext.transparency : 80)
      : ext.backgroundColor
  }
  return applyTransparency(strokeColor, isNumber(ext.transparency) ? ext.transparency : 80)
}

// ═══════════════════════════════════════
// Polygon clipping — TradingView clipPolygonByEdge primitive
// (same math as tools/pitchforks/pitchforkCommon.ts)
// ═══════════════════════════════════════

const EPSILON = 1e-10

/** Full-pane polygon in pane-local pixels. */
export function paneRect (bounding: { width: number, height: number }): Coordinate[] {
  const { width, height } = bounding
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ]
}

/**
 * Sutherland–Hodgman clip of `poly` by the half-plane of the line through
 * e1→e2 that contains the first `keep` point not lying on the edge. This is
 * the primitive TradingView's ChannelRenderer/DisjointChannelRenderer build
 * all channel fills from.
 */
export function clipPolygonByEdge (
  poly: Coordinate[],
  e1: Coordinate,
  e2: Coordinate,
  keep: Coordinate[]
): Coordinate[] {
  const ex = e2.x - e1.x
  const ey = e2.y - e1.y
  const side = (p: Coordinate): number => ex * (p.y - e1.y) - ey * (p.x - e1.x)
  let ref = 0
  for (const k of keep) {
    const s = side(k)
    if (Math.abs(s) > EPSILON) {
      ref = s
      break
    }
  }
  // Every keep point lies on the edge — degenerate clip yields nothing.
  if (ref === 0) {
    return []
  }
  const inside = (s: number): boolean => ref > 0 ? s > -EPSILON : s < EPSILON
  const out: Coordinate[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const sa = side(a)
    const sb = side(b)
    const aIn = inside(sa)
    if (aIn) {
      out.push(a)
    }
    if (aIn !== inside(sb)) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

/**
 * Vertical half-plane clip: keep the side of `x = atX` that contains
 * `x = keepX`. Skipped (returns `poly`) when the boundary is degenerate.
 */
export function clipPolygonVertical (
  poly: Coordinate[],
  atX: number,
  keepX: number
): Coordinate[] {
  if (Math.abs(atX - keepX) < EPSILON) {
    return poly
  }
  return clipPolygonByEdge(poly, { x: atX, y: 0 }, { x: atX, y: 1 }, [{ x: keepX, y: 0 }])
}

/**
 * Infinite-line intersection of (a1,a2) × (b1,b2); null when (near-)
 * parallel — the TradingView disjoint-channel wedge test.
 */
export function intersectLines (
  a1: Coordinate,
  a2: Coordinate,
  b1: Coordinate,
  b2: Coordinate
): Coordinate | null {
  const dxA = a2.x - a1.x
  const dyA = a2.y - a1.y
  const dxB = b2.x - b1.x
  const dyB = b2.y - b1.y
  const denom = dxA * dyB - dyA * dxB
  if (Math.abs(denom) < EPSILON * Math.max(1, Math.abs(dxA * dyB), Math.abs(dyA * dxB))) {
    return null
  }
  const t = ((b1.x - a1.x) * dyB - (b1.y - a1.y) * dxB) / denom
  return { x: a1.x + dxA * t, y: a1.y + dyA * t }
}

/**
 * TradingView ParallelChannelRenderer band fill: the pane rect clipped by
 * the line1 half-plane (keeping the side containing line2), the line2
 * half-plane (keeping line1), and — when an end is not extended — the chord
 * joining the two line ends on that side. Ordering matches the renderer's
 * clip sequence so coincident/overlapping edges degrade the same way.
 */
export function channelBandPolygon (
  l1s: Coordinate,
  l1e: Coordinate,
  l2s: Coordinate,
  l2e: Coordinate,
  extendLeft: boolean,
  extendRight: boolean,
  bounding: Bounding
): Coordinate[] {
  let poly = paneRect(bounding)
  poly = clipPolygonByEdge(poly, l1s, l1e, [l2e])
  if (!extendRight) {
    poly = clipPolygonByEdge(poly, l1e, l2e, [l2s])
  }
  poly = clipPolygonByEdge(poly, l2e, l2s, [l1s])
  if (!extendLeft) {
    poly = clipPolygonByEdge(poly, l2s, l1s, [l1e])
  }
  return poly
}

/**
 * TradingView DisjointChannelIntersectionRenderer fill. The two channel
 * lines need not be parallel: when they intersect, the fill is the bowtie
 * (two wedges from the intersection, clipped to the anchor x-slab unless
 * extended); when parallel, it falls back to the band fill.
 *
 * `l1s/l1e` = first line endpoints, `l2s/l2e` = second line endpoints —
 * matching the renderer's `[b, T, P, A]` quad order where the quad is
 * [l1s, l1e, l2e, l2s].
 */
export function disjointChannelFill (
  l1s: Coordinate,
  l1e: Coordinate,
  l2s: Coordinate,
  l2e: Coordinate,
  extendLeft: boolean,
  extendRight: boolean,
  bounding: Bounding
): Coordinate[][] {
  const hit = intersectLines(l1s, l1e, l2s, l2e)
  if (hit === null) {
    const band = channelBandPolygon(l1s, l1e, l2s, l2e, extendLeft, extendRight, bounding)
    return band.length >= 3 ? [band] : []
  }
  const wedge = (dirA: Coordinate, dirB: Coordinate): Coordinate[] => {
    const iP: Coordinate = { x: hit.x + dirA.x, y: hit.y + dirA.y }
    const lP: Coordinate = { x: hit.x + dirB.x, y: hit.y + dirB.y }
    let poly = paneRect(bounding)
    poly = clipPolygonByEdge(poly, hit, iP, [lP])
    if (!extendLeft) {
      poly = clipPolygonVertical(poly, l1s.x, l1e.x)
    }
    if (!extendRight) {
      poly = clipPolygonVertical(poly, l1e.x, l1s.x)
    }
    poly = clipPolygonByEdge(poly, lP, hit, [iP])
    return poly
  }
  const dirL1: Coordinate = { x: l1s.x - l1e.x, y: l1s.y - l1e.y }
  const dirL2: Coordinate = { x: l2s.x - l2e.x, y: l2s.y - l2e.y }
  const w1 = wedge(dirL1, dirL2)
  const w2 = wedge({ x: -dirL1.x, y: -dirL1.y }, { x: -dirL2.x, y: -dirL2.y })
  const polys: Coordinate[][] = []
  if (w1.length >= 3) {
    polys.push(w1)
  }
  if (w2.length >= 3) {
    polys.push(w2)
  }
  return polys
}

// ═══════════════════════════════════════
// Handles + point plumbing
// ═══════════════════════════════════════

export interface ChannelHandleOptions {
  /** Point slot written by the kernel when this handle is dragged. */
  pointIndex: number
  moveDirection?: OverlayFigureMoveDirection
  cursor?: string
  isTouch?: boolean
}

/**
 * Anchor-styled auxiliary handle (channel corners, edge midpoints) — the
 * same 6px/13px square the anchor factory emits, carrying a custom
 * `figureKey` so `performEventPressedMove` can route its drag semantics.
 * These are NOT point anchors (the factory owns those); they sit at
 * computed positions like the TradingView corner/mid handles.
 */
export function channelHandleFigure (
  key: string,
  coordinate: Coordinate,
  options: ChannelHandleOptions
): OverlayFigure {
  const half = options.isTouch === true ? ANCHOR_HALF_TOUCH : ANCHOR_HALF_MOUSE
  const cx = Math.round(coordinate.x) - 0.5
  const cy = Math.round(coordinate.y) - 0.5
  return {
    key,
    type: 'rect',
    attrs: { x: cx - half, y: cy - half, width: half * 2, height: half * 2 },
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

/**
 * Pin `points[dst]`'s time slot (dataIndex + timestamp) to `points[src]` —
 * the TradingView corner-pin (`e[2] = {...e[0], price: e[2].price}`).
 * Value is left untouched.
 */
export function pinPointIndex (
  points: Array<Partial<Point>>,
  dstIndex: number,
  srcIndex: number
): void {
  const src = points[srcIndex]
  const dst = points[dstIndex]
  if (isValid(src) && isValid(dst)) {
    dst.dataIndex = src.dataIndex
    dst.timestamp = src.timestamp
  }
}

/** Guarded single-point → pixel conversion (conversion unions). */
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

/** Guarded pixel → point conversion (conversion unions). */
export function coordinateToPoint (
  chart: Chart,
  paneId: string,
  coordinate: Coordinate
): Partial<Point> | null {
  const converted = chart.convertFromPixel([coordinate], { paneId })
  const p = isArray(converted) ? converted[0] : converted
  return isValid(p) ? p : null
}

/**
 * Resolve the current bar index for a stored point: `timestamp` is the
 * stable identifier (dataIndex drifts when history lazy-loads); fall back
 * to the stored dataIndex when the timestamp lookup misses. Same contract
 * as the kernel regression overlay.
 */
export function resolveBarIndex (
  dataList: ReadonlyArray<{ timestamp: number }>,
  timestamp: number | undefined,
  fallback: number | undefined
): number {
  if (isNumber(timestamp)) {
    for (let i = 0; i < dataList.length; i++) {
      if (dataList[i].timestamp === timestamp) {
        return i
      }
    }
  }
  return isNumber(fallback) ? fallback : -1
}

// ═══════════════════════════════════════
// Axis pills — one pill per stored anchor (kernel parity)
// ═══════════════════════════════════════

/**
 * Y-axis pills: one per anchor at its coordinate y / stored value. Anchors
 * that collapse to the same pixel row (pinned corners) emit a single pill.
 */
export function pushChannelYAxisPills (
  figures: OverlayFigure[],
  prefix: string,
  coordinates: Coordinate[],
  points: Array<Partial<Point>>,
  color: string,
  precision: number,
  bounding: { width: number },
  yAxis: YAxis | null | undefined
): void {
  const seen: number[] = []
  for (let i = 0; i < coordinates.length; i++) {
    const point = isValid(points[i]) ? points[i] : {}
    const value = point.value
    if (!isNumber(value)) {
      continue
    }
    const y = coordinates[i].y
    let dup = false
    for (const seenY of seen) {
      if (Math.abs(seenY - y) < 1) {
        dup = true
        break
      }
    }
    if (dup) {
      continue
    }
    seen.push(y)
    const pill = buildYAxisPill(y, value, color, precision, bounding, yAxis ?? undefined, `${prefix}_y${i}`)
    if (pill !== null) {
      figures.push(pill)
    }
  }
}

/** X-axis pills: one per anchor at its coordinate x / stored timestamp. */
export function pushChannelXAxisPills (
  figures: OverlayFigure[],
  prefix: string,
  coordinates: Coordinate[],
  points: Array<Partial<Point>>,
  color: string
): void {
  const seen: number[] = []
  for (let i = 0; i < coordinates.length; i++) {
    const point = isValid(points[i]) ? points[i] : {}
    const text = formatDate(point.timestamp)
    if (text === '') {
      continue
    }
    const x = coordinates[i].x
    let dup = false
    for (const seenX of seen) {
      if (Math.abs(seenX - x) < 1) {
        dup = true
        break
      }
    }
    if (dup) {
      continue
    }
    seen.push(x)
    figures.push(buildXAxisPill(x, text, color, `${prefix}_x${i}`))
  }
}
