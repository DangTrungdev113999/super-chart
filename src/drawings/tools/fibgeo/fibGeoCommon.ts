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
import type { LineStyle } from '../../../common/Styles'
import { isArray, isNumber, isString, isValid } from '../../../common/utils/typeChecks'

import type { Chart } from '../../../Chart'
import type { OverlayFigure, OverlayFigureMoveDirection } from '../../../component/Overlay'
import { alphaColor } from '../../../extension/overlay/lineCommon'
import type { LineAttrs } from '../../../extension/figure/line'
import type { TextAttrs } from '../../../extension/figure/text'

import { ANCHOR_HALF_MOUSE, ANCHOR_HALF_TOUCH } from '../../interaction/anchors'

/**
 * Shared plumbing for the fibgeo tool group (Fibonacci geometry + Gann).
 * The `levels` contract is the settings-dialog binding: `extendData.levels`
 * is a whole array of `{ coeff, color, visible, label? }` rows committed
 * verbatim — never per-index merged.
 */

/** Levels-row shape the settings dialog binds verbatim. */
export interface FibLevelData {
  /** Ratio/fraction the level renders at — exact meaning is per-tool. */
  coeff: number
  color: string
  visible: boolean
  /** Display label (e.g. '1/8' for gann fans) — falls back to the coeff. */
  label?: string
}

export const TRENDLINE_COLOR = '#787b86'
export const TRENDLINE_DASH = [4, 4]
export const GRID_DASH = [2, 4]
export const FAN_DASH = [4, 4]

/** Shared TradingView-ish level palette. */
export const FIB_COLORS = {
  red: '#f23645',
  orange: '#ff9800',
  green: '#4caf50',
  teal: '#089981',
  cyan: '#00bcd4',
  blue: '#2962ff',
  purple: '#9c27b0',
  pink: '#e91e63',
  gray: '#787b86'
} as const

export function fibLevel (coeff: number, color: string, visible = true, label?: string): FibLevelData {
  const level: FibLevelData = { coeff, color, visible }
  if (label !== undefined) {
    level.label = label
  }
  return level
}

/**
 * Whole-array levels read: validates every row, keeps the user's ordering,
 * falls back to `defaults` when the overlay carries no usable array.
 */
export function readLevels (extendData: { levels?: unknown } | undefined, defaults: FibLevelData[]): FibLevelData[] {
  const levels = extendData?.levels
  if (!isArray(levels) || levels.length === 0) {
    return defaults
  }
  const result: FibLevelData[] = []
  for (const raw of levels) {
    if (raw === null || typeof raw !== 'object') {
      continue
    }
    const level = raw as Partial<FibLevelData>
    if (!isNumber(level.coeff)) {
      continue
    }
    result.push({
      coeff: level.coeff,
      color: isString(level.color) ? level.color : FIB_COLORS.gray,
      visible: level.visible !== false,
      label: isString(level.label) ? level.label : undefined
    })
  }
  return result
}

export function formatLevelLabel (level: FibLevelData): string {
  if (isString(level.label)) {
    return level.label
  }
  // Compact coeff printing: 0.5 → '0.5', 1/3 → '0.333'
  return `${Math.round(level.coeff * 1000) / 1000}`
}

export function distance (a: Coordinate, b: Coordinate): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return Math.sqrt(dx * dx + dy * dy)
}

export function midpoint (a: Coordinate, b: Coordinate): Coordinate {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Ray exit point: the ray from `from` through `through` clipped at the pane
 * bounding rect. Falls back to `through` for degenerate directions or an
 * origin that lies outside the rect and moves away from it.
 */
export function rayToBoundingEdge (from: Coordinate, through: Coordinate, bounding: Bounding): Coordinate {
  const dx = through.x - from.x
  const dy = through.y - from.y
  let t = Number.POSITIVE_INFINITY
  if (dx > 0) {
    t = Math.min(t, (bounding.width - from.x) / dx)
  } else if (dx < 0) {
    t = Math.min(t, -from.x / dx)
  }
  if (dy > 0) {
    t = Math.min(t, (bounding.height - from.y) / dy)
  } else if (dy < 0) {
    t = Math.min(t, -from.y / dy)
  }
  if (!Number.isFinite(t) || t <= 0) {
    return through
  }
  return { x: from.x + dx * t, y: from.y + dy * t }
}

export function lineFigure (key: string, segments: Coordinate[][], styles: Partial<LineStyle>, ignoreEvent = false): OverlayFigure {
  const attrs: LineAttrs[] = segments.map(coordinates => ({ coordinates }))
  const figure: OverlayFigure = { key, type: 'line', attrs, styles }
  if (ignoreEvent) {
    figure.ignoreEvent = true
  }
  return figure
}

export function labelFigure (key: string, x: number, y: number, text: string, color: string, align: CanvasTextAlign = 'center', baseline: CanvasTextBaseline = 'middle'): OverlayFigure {
  const attrs: TextAttrs = { x, y, text, align, baseline }
  return {
    key,
    type: 'text',
    attrs,
    styles: {
      color,
      size: 11,
      weight: 'normal',
      backgroundColor: 'transparent',
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0
    },
    ignoreEvent: true
  }
}

/** The 1/8-division levels shared by the gann box family. */
export function defaultGannEighthLevels (): FibLevelData[] {
  return [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]
    .map(coeff => fibLevel(coeff, FIB_COLORS.gray))
}

export interface GannBoxGridParams {
  minX: number
  minY: number
  maxX: number
  maxY: number
  levels: FibLevelData[]
  lineColor: string
  lineSize: number
  keyPrefix: string
  showGrid: boolean
  showDiagonals: boolean
  showFans: boolean
}

/**
 * Gann square/box interior shared by gannBox / gannSquare / gannFixed /
 * gannComplex: border + per-level 1/8 dividers + the two diagonals +
 * (optionally) the TradingView gann-square corner fans — each corner rayed
 * to the division points on the two opposite edges.
 */
export function gannBoxGridFigures (params: GannBoxGridParams): OverlayFigure[] {
  const { minX, minY, maxX, maxY, levels, lineColor, lineSize, keyPrefix, showGrid, showDiagonals, showFans } = params
  const figures: OverlayFigure[] = []
  const width = maxX - minX
  const height = maxY - minY
  if (width <= 0 || height <= 0) {
    return figures
  }
  figures.push({
    key: `${keyPrefix}_border`,
    type: 'rect',
    attrs: { x: minX, y: minY, width, height },
    styles: { style: 'stroke', borderColor: lineColor, borderSize: lineSize }
  })
  levels.forEach((level, index) => {
    if (!level.visible || level.coeff <= 0 || level.coeff >= 1) {
      return
    }
    const x = minX + width * level.coeff
    const y = minY + height * level.coeff
    if (showGrid) {
      figures.push(lineFigure(`${keyPrefix}_grid_${index}`, [
        [{ x, y: minY }, { x, y: maxY }],
        [{ x: minX, y }, { x: maxX, y }]
      ], { style: 'dashed', size: 1, color: level.color, dashedValue: GRID_DASH }))
    }
    if (showFans) {
      // TradingView gann-square fans: 4 corners × 2 opposite-edge division
      // points = 8 rays per division level. Decorative — not hit targets.
      figures.push(lineFigure(`${keyPrefix}_fan_${index}`, [
        [{ x: minX, y: maxY }, { x, y: minY }],
        [{ x: maxX, y: maxY }, { x, y: minY }],
        [{ x: minX, y: minY }, { x, y: maxY }],
        [{ x: maxX, y: minY }, { x, y: maxY }],
        [{ x: minX, y: maxY }, { x: maxX, y }],
        [{ x: maxX, y: maxY }, { x: minX, y }],
        [{ x: minX, y: minY }, { x: maxX, y }],
        [{ x: maxX, y: minY }, { x: minX, y }]
      ], { style: 'dashed', size: 1, color: level.color, dashedValue: FAN_DASH }, true))
    }
  })
  if (showDiagonals) {
    figures.push(lineFigure(`${keyPrefix}_diags`, [
      [{ x: minX, y: minY }, { x: maxX, y: maxY }],
      [{ x: minX, y: maxY }, { x: maxX, y: minY }]
    ], { style: 'solid', size: lineSize, color: lineColor }))
  }
  return figures
}

// ═══════════════════════════════════════
// Gann square family — TradingView
// linetoolganncomplex / linetoolgannfixed parity
// ═══════════════════════════════════════

/** Fanline row — {x, y} is the TradingView x×y ratio pair (2×1 → x:2, y:1). */
export interface GannFanLineData {
  x: number
  y: number
  color: string
  visible: boolean
}

/** Arc row — {x, y} scale pair; ellipse radius is √(x²+y²)/5 of the box span. */
export interface GannArcData {
  x: number
  y: number
  color: string
  visible: boolean
}

/**
 * TradingView `gannLevelsDefaults`: six fifth-divisions of the box including
 * both edges (fractions 0, 0.2 … 1.0 — level 0 and 5 draw the border).
 */
export function defaultGannSquareLevels (): FibLevelData[] {
  return [
    fibLevel(0, FIB_COLORS.gray),
    fibLevel(0.2, FIB_COLORS.orange),
    fibLevel(0.4, FIB_COLORS.cyan),
    fibLevel(0.6, FIB_COLORS.teal),
    fibLevel(0.8, FIB_COLORS.green),
    fibLevel(1, FIB_COLORS.gray)
  ]
}

/**
 * TradingView `gannFanlinesDefaults`: 11 fan ratios radiating from the
 * square's start vertex — only 2×1, 1×1 and 1×2 are visible by default.
 */
export function defaultGannFanLines (): GannFanLineData[] {
  const row = (x: number, y: number, color: string, visible: boolean): GannFanLineData => ({ x, y, color, visible })
  return [
    row(8, 1, '#b2b5be', false),
    row(5, 1, FIB_COLORS.red, false),
    row(4, 1, FIB_COLORS.gray, false),
    row(3, 1, FIB_COLORS.orange, false),
    row(2, 1, FIB_COLORS.cyan, true),
    row(1, 1, FIB_COLORS.teal, true),
    row(1, 2, FIB_COLORS.green, true),
    row(1, 3, FIB_COLORS.green, false),
    row(1, 4, FIB_COLORS.blue, false),
    row(1, 5, '#8c9eff', false),
    row(1, 8, '#b2b5be', false)
  ]
}

/** TradingView `gannArcsDefaults`: 11 quarter-ellipse scales, all visible. */
export function defaultGannArcs (): GannArcData[] {
  const row = (x: number, y: number, color: string): GannArcData => ({ x, y, color, visible: true })
  return [
    row(1, 0, FIB_COLORS.orange),
    row(1, 1, FIB_COLORS.orange),
    row(1.5, 0, FIB_COLORS.orange),
    row(2, 0, FIB_COLORS.cyan),
    row(2, 1, FIB_COLORS.cyan),
    row(3, 0, FIB_COLORS.teal),
    row(3, 1, FIB_COLORS.teal),
    row(4, 0, FIB_COLORS.green),
    row(4, 1, FIB_COLORS.green),
    row(5, 0, FIB_COLORS.blue),
    row(5, 1, FIB_COLORS.blue)
  ]
}

/** Whole-array fanlines read (same contract as {@link readLevels}). */
export function readFanLines (extendData: { fanlines?: unknown } | undefined, defaults: GannFanLineData[]): GannFanLineData[] {
  const fanlines = extendData?.fanlines
  if (!isArray(fanlines) || fanlines.length === 0) {
    return defaults
  }
  const result: GannFanLineData[] = []
  for (const raw of fanlines) {
    if (raw === null || typeof raw !== 'object') {
      continue
    }
    const line = raw as Partial<GannFanLineData>
    if (!isNumber(line.x) || !isNumber(line.y)) {
      continue
    }
    result.push({
      x: line.x,
      y: line.y,
      color: isString(line.color) ? line.color : FIB_COLORS.gray,
      visible: line.visible !== false
    })
  }
  return result
}

/** Whole-array arcs read (same contract as {@link readLevels}). */
export function readArcs (extendData: { arcs?: unknown } | undefined, defaults: GannArcData[]): GannArcData[] {
  const arcs = extendData?.arcs
  if (!isArray(arcs) || arcs.length === 0) {
    return defaults
  }
  const result: GannArcData[] = []
  for (const raw of arcs) {
    if (raw === null || typeof raw !== 'object') {
      continue
    }
    const arc = raw as Partial<GannArcData>
    if (!isNumber(arc.x) || !isNumber(arc.y)) {
      continue
    }
    result.push({
      x: arc.x,
      y: arc.y,
      color: isString(arc.color) ? arc.color : FIB_COLORS.gray,
      visible: arc.visible !== false
    })
  }
  return result
}

/**
 * TradingView transparency is a percent scale (80 → alpha 0.2); a 0-1
 * fraction is tolerated as the same fraction (channelCommon precedent).
 */
export function gannTransparencyAlpha (transparency: number | undefined): number {
  const percent = transparency === undefined ? 80 : transparency <= 1 ? transparency * 100 : transparency
  return Math.max(0, Math.min(1, (100 - percent) / 100))
}

/**
 * The TradingView gann-box fan: from all four corners to the (divX, divY)
 * division point on the two OPPOSITE edges — 8 rays per division.
 */
export function gannBoxFanSegments (minX: number, minY: number, maxX: number, maxY: number, divX: number, divY: number): Coordinate[][] {
  return [
    [{ x: minX, y: maxY }, { x: divX, y: minY }],
    [{ x: maxX, y: maxY }, { x: divX, y: minY }],
    [{ x: minX, y: minY }, { x: divX, y: maxY }],
    [{ x: maxX, y: minY }, { x: divX, y: maxY }],
    [{ x: minX, y: maxY }, { x: maxX, y: divY }],
    [{ x: maxX, y: maxY }, { x: minX, y: divY }],
    [{ x: minX, y: minY }, { x: maxX, y: divY }],
    [{ x: maxX, y: minY }, { x: minX, y: divY }]
  ]
}

/**
 * TradingView `_prepareLevels`: a vertical + a horizontal divider per level
 * at `coeff` fractions of the start→end span. Level fractions 0 and 1 land
 * on the edges and act as the box border (drawn in the level's color).
 */
export function gannLevelLineFigures (start: Coordinate, end: Coordinate, levels: FibLevelData[], lineSize: number, keyPrefix: string): OverlayFigure[] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const figures: OverlayFigure[] = []
  levels.forEach((level, index) => {
    if (!level.visible) {
      return
    }
    const x = start.x + dx * level.coeff
    const y = start.y + dy * level.coeff
    figures.push(lineFigure(`${keyPrefix}_lvl_${index}`, [
      [{ x, y: start.y }, { x, y: end.y }],
      [{ x: start.x, y }, { x: end.x, y }]
    ], { style: 'solid', size: lineSize, color: level.color }))
  })
  return figures
}

/**
 * TradingView `_prepareFanLines`: each {x, y} ratio produces one ray from
 * the start vertex `p1`. x > y lands the endpoint on the far-x edge at
 * `start.y + (y/x)·height`; otherwise on the far-y edge at
 * `start.x + (x/y)·width`.
 */
export function gannP1FanFigures (p1: Coordinate, start: Coordinate, end: Coordinate, fanlines: GannFanLineData[], lineSize: number, keyPrefix: string): OverlayFigure[] {
  const barsRange = end.x - start.x
  const priceRange = end.y - start.y
  const figures: OverlayFigure[] = []
  fanlines.forEach((line, index) => {
    if (!line.visible || line.x <= 0 || line.y <= 0) {
      return
    }
    const { d, u } = line.x > line.y
      ? { d: end.x, u: start.y + (line.y / line.x) * priceRange }
      : { d: start.x + (line.x / line.y) * barsRange, u: end.y }
    figures.push(lineFigure(
      `${keyPrefix}_fan_${index}`,
      [[p1, { x: d, y: u }]],
      { style: 'solid', size: lineSize, color: line.color }
    ))
  })
  return figures
}

function round2 (value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * TradingView `_prepareArcs` + `GannArcRenderer`: each {x, y} scale draws a
 * quarter-ellipse centred on the start vertex inside the start→end box,
 * with radii rx = width·√(x²+y²)/5, ry = height·√(x²+y²)/5 (the ellipse is
 * a scaled copy of the box). `GannArcRenderer` clips the arc to the box
 * when a radius exceeds the span — mirrored here by clamping the arc's
 * parametric range instead of emitting an out-of-box path.
 *
 * `fillBack` (TradingView `arcsBackground.fillBackground`, transparency 80
 * default) shades the ring sector between each visible arc and the
 * previous visible one; the first arc's sector is filled from the vertex.
 */
export function gannArcFigures (start: Coordinate, end: Coordinate, arcs: GannArcData[], fillBack: boolean, transparency: number | undefined, lineSize: number, keyPrefix: string): OverlayFigure[] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const w = Math.abs(dx)
  const h = Math.abs(dy)
  const figures: OverlayFigure[] = []
  if (w <= 0 || h <= 0) {
    return figures
  }
  const sx = dx >= 0 ? 1 : -1
  const sy = dy >= 0 ? 1 : -1
  // SVG arc sweep direction — established by parametrisation in the
  // (dx, dy) quadrant: same-sign directions sweep clockwise on screen.
  const sweep = sx === sy ? 1 : 0
  const pointAt = (rx: number, ry: number, t: number): string =>
    `${round2(start.x + sx * rx * Math.cos(t))} ${round2(start.y + sy * ry * Math.sin(t))}`
  const alpha = gannTransparencyAlpha(transparency)
  let prevRx = 0
  let prevRy = 0
  arcs.forEach((arc, index) => {
    if (!arc.visible || arc.x < 0 || arc.y < 0) {
      return
    }
    const k = Math.sqrt(arc.x * arc.x + arc.y * arc.y) / 5
    const rx = w * k
    const ry = h * k
    if (rx <= 0 || ry <= 0) {
      return
    }
    // Visible param range of the quarter arc clipped to the box edges.
    const t0 = rx > w ? Math.acos(w / rx) : 0
    const t1 = ry > h ? Math.asin(h / ry) : Math.PI / 2
    if (t1 <= t0) {
      return
    }
    if (fillBack) {
      let path = `M${pointAt(rx, ry, t0)} A${round2(rx)} ${round2(ry)} 0 0 ${sweep} ${pointAt(rx, ry, t1)}`
      if (prevRx > 0 && prevRy > 0) {
        path += ` L${pointAt(prevRx, prevRy, t1)} A${round2(prevRx)} ${round2(prevRy)} 0 0 ${1 - sweep} ${pointAt(prevRx, prevRy, t0)} Z`
      } else {
        path += ` L${round2(start.x)} ${round2(start.y)} Z`
      }
      figures.push({
        key: `${keyPrefix}_arcfill_${index}`,
        type: 'path',
        attrs: { x: 0, y: 0, width: 0, height: 0, path },
        styles: { style: 'fill', color: alphaColor(arc.color, alpha) },
        ignoreEvent: true
      })
    }
    figures.push({
      key: `${keyPrefix}_arc_${index}`,
      type: 'path',
      attrs: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        path: `M${pointAt(rx, ry, t0)} A${round2(rx)} ${round2(ry)} 0 0 ${sweep} ${pointAt(rx, ry, t1)}`
      },
      styles: { style: 'stroke', color: arc.color, lineWidth: lineSize },
      ignoreEvent: true
    })
    prevRx = rx
    prevRy = ry
  })
  return figures
}

// ═══════════════════════════════════════
// Control handles + point↔pixel conversion
// ═══════════════════════════════════════

export interface SquareHandleOptions {
  pointIndex: number
  moveDirection?: OverlayFigureMoveDirection
  cursor?: string
  isTouch?: boolean
}

/**
 * Square drag handle at an arbitrary pixel position — for computed
 * corners/size handles whose location differs from `points[i]`
 * (`createAnchorFigures` only anchors at stored coordinates).
 */
export function squareHandleFigure (key: string, coordinate: Coordinate, options: SquareHandleOptions): OverlayFigure {
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

/** Point → pane-local pixel; null when the conversion can't resolve. */
export function pointToCoordinate (chart: Chart, paneId: string, point: Partial<Point>): Coordinate | null {
  const converted = chart.convertToPixel(point, { paneId })
  const c = isArray(converted) ? converted[0] : converted
  if (isValid(c) && isNumber(c.x) && isNumber(c.y)) {
    return { x: c.x, y: c.y }
  }
  return null
}

/** Pane-local pixel → Point; null when the conversion can't resolve. */
export function coordinateToPoint (chart: Chart, paneId: string, coordinate: Coordinate): Partial<Point> | null {
  const converted = chart.convertFromPixel([coordinate], { paneId })
  const point = isArray(converted) ? converted[0] : converted
  return isValid(point) ? point : null
}
