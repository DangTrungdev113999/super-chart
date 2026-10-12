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
import type { OverlayFigure } from '../../../component/Overlay'

import { isValid, isNumber } from '../../../common/utils/typeChecks'

/**
 * Shared geometry for the marks/ group: the TradingView 1-point arrow-mark
 * silhouette (7 vertices, tip ON the anchor) and the 2-point ArrowMarker
 * profile polygon (6 vertices, head at the second anchor).
 */

// TV raw/line-tool-arrow-mark: head half-span 9.75, head length 12,
// stem half-width 5, stem length 10 — total extent 22px behind the tip.
const HEAD_HALF = 9.75
const HEAD_LEN = 12
const STEM_HALF = 5
const STEM_LEN = 10

export type ArrowMarkDirection = 'up' | 'down' | 'left' | 'right'

export interface ArrowMarkExtendData {
  /** Silhouette fill color (per-direction default applied by each tool). */
  color?: string
  /** Uniform size multiplier. */
  size?: number
  /** Optional label text (TV `text`). */
  text?: string
  /** Label visibility toggle (TV `showLabel`, default true). */
  showLabel?: boolean
  /** Label color (TV `color` — falls back to the silhouette color). */
  textColor?: string
  /** Label font size in px (TV `fontsize`, default 14). */
  fontSize?: number
  bold?: boolean
  italic?: boolean
}

function markBounds (coordinates: Coordinate[]): { x: number, y: number, width: number, height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of coordinates) {
    minX = Math.min(minX, c.x)
    minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x)
    maxY = Math.max(maxY, c.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * The 7-vertex silhouette for a directional arrow mark. Authored pointing
 * "up" with the tip on the anchor, then rotated for the direction so the
 * tip always lands on the anchor point.
 */
export function arrowMarkCoordinates (
  point: Coordinate,
  direction: ArrowMarkDirection,
  size: number
): Coordinate[] {
  const hw = HEAD_HALF * size
  const hl = HEAD_LEN * size
  const sw = STEM_HALF * size
  const sl = STEM_LEN * size
  const silhouette: Coordinate[] = [
    { x: 0, y: 0 },
    { x: hw, y: hl },
    { x: sw, y: hl },
    { x: sw, y: hl + sl },
    { x: -sw, y: hl + sl },
    { x: -sw, y: hl },
    { x: -hw, y: hl }
  ]
  const angle = direction === 'up'
    ? 0
    : direction === 'right'
      ? Math.PI / 2
      : direction === 'down'
        ? Math.PI
        : -Math.PI / 2
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return silhouette.map(c => ({
    x: point.x + c.x * cos - c.y * sin,
    y: point.y + c.x * sin + c.y * cos
  }))
}

export function arrowMarkFigure (
  key: string,
  point: Coordinate,
  direction: ArrowMarkDirection,
  extendData: unknown,
  defaultColor: string
): OverlayFigure {
  const ext = isValid(extendData) ? extendData as ArrowMarkExtendData : {}
  const size = isNumber(ext.size) && ext.size > 0 ? ext.size : 1
  const color = ext.color ?? defaultColor
  const coordinates = arrowMarkCoordinates(point, direction, size)
  return {
    key,
    type: 'polygon',
    attrs: { coordinates },
    styles: { style: 'fill', color },
    cursor: 'move',
    bounds: markBounds(coordinates)
  }
}

/**
 * Label figure for a directional arrow mark — TradingView places the text
 * on the TAIL side of the silhouette (below an up-arrow, above a down,
 * left of a right, right of a left), centered on the anchor's axis.
 */
export function arrowMarkLabelFigure (
  key: string,
  point: Coordinate,
  direction: ArrowMarkDirection,
  extendData: unknown,
  defaultColor: string
): OverlayFigure | null {
  const ext = isValid(extendData) ? extendData as ArrowMarkExtendData : {}
  if (ext.text === undefined || ext.text === '' || ext.showLabel === false) {
    return null
  }
  const size = isNumber(ext.size) && ext.size > 0 ? ext.size : 1
  const color = ext.color ?? defaultColor
  const fontSize = isNumber(ext.fontSize) && ext.fontSize > 0 ? ext.fontSize : 14
  const tail = (HEAD_LEN + STEM_LEN) * size + 6
  const offset: Coordinate = direction === 'up'
    ? { x: 0, y: tail }
    : direction === 'down'
      ? { x: 0, y: -tail }
      : direction === 'right'
        ? { x: -tail, y: 0 }
        : { x: tail, y: 0 }
  return {
    key,
    type: 'text',
    attrs: {
      x: point.x + offset.x,
      y: point.y + offset.y,
      text: ext.text,
      align: 'center',
      baseline: 'middle'
    },
    styles: {
      color: ext.textColor ?? color,
      size: fontSize,
      weight: ext.bold === true ? 'bold' : 'normal',
      fontStyle: ext.italic === true ? 'italic' : 'normal'
    },
    ignoreEvent: true
  }
}

// TV raw/line-tool-arrow-marker: head length is G(len) — 18 for short arrows,
// 0.25·len clamped to [18, 106] and at most 0.9·len for long ones. The shaft
// is extended so the arrow never renders shorter than 22px; the tip is `end`.
export const ARROW_MARKER_MIN_LEN = 22
export const ARROW_MARKER_CIRCLE_RADIUS = 9

export function arrowMarkerHeadLength (len: number): number {
  if (len < 92) {
    return 18
  }
  let headLen = 0.25 * len
  headLen = Math.min(headLen, 106)
  headLen = Math.max(headLen, 18)
  headLen = Math.min(headLen, 0.9 * len)
  return headLen
}

export function arrowMarkerStrokeWidth (len: number): number {
  const w = Math.round(0.02 * len)
  return Math.max(2, Math.min(5, w))
}

/**
 * The 6-vertex ArrowMarker polygon whose tip sits at `end`. Returns null when
 * the anchors coincide — callers render the degenerate circle instead
 * (TV draws a dot when the two anchors are identical).
 */
export function arrowMarkerCoordinates (start: Coordinate, end: Coordinate): Coordinate[] | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  let len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.5) {
    return null
  }
  const ux = dx / len
  const uy = dy / len
  let tail = start
  if (len < ARROW_MARKER_MIN_LEN) {
    tail = { x: end.x - ux * ARROW_MARKER_MIN_LEN, y: end.y - uy * ARROW_MARKER_MIN_LEN }
    len = ARROW_MARKER_MIN_LEN
  }
  const headLen = arrowMarkerHeadLength(len)
  const bodyEnd = len - headLen + (len >= 35 ? headLen * 0.1 : 0)
  const bodyHalf = 1.22 * headLen / 4
  const headHalf = 1.22 * headLen / 2
  const nx = -uy
  const ny = ux
  const at = (d: number, off: number): Coordinate => ({
    x: tail.x + ux * d + nx * off,
    y: tail.y + uy * d + ny * off
  })
  return [
    tail,
    at(bodyEnd, bodyHalf),
    at(len - headLen, headHalf),
    end,
    at(len - headLen, -headHalf),
    at(bodyEnd, -bodyHalf)
  ]
}

// ═══════════════════════════════════════
// Freehand strokes (brush / highlighter)
// ═══════════════════════════════════════

/** TV default smoothing radius (properties.smooth, default 5). */
export const BRUSH_DEFAULT_SMOOTH = 5

/**
 * TradingView BrushBasePaneView smoothing: densify consecutive points so
 * no segment exceeds ~`smooth` px (max 5 subdivisions per segment), then
 * box-blur with radius `smooth` — each output point is the mean of its
 * ±smooth neighbors — and re-append the exact final point so the stroke
 * keeps its true end.
 */
export function smoothStrokeCoordinates (coordinates: Coordinate[], smooth: number): Coordinate[] {
  if (coordinates.length < 2 || smooth <= 0) {
    return coordinates
  }
  const dense: Coordinate[] = [coordinates[0]]
  for (let i = 1; i < coordinates.length; i++) {
    const prev = coordinates[i - 1]
    const cur = coordinates[i]
    const dx = cur.x - prev.x
    const dy = cur.y - prev.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const sub = Math.min(5, Math.floor(len / smooth))
    for (let s = 1; s < sub; s++) {
      dense.push({ x: prev.x + (dx * s) / sub, y: prev.y + (dy * s) / sub })
    }
    dense.push(cur)
  }
  if (dense.length < 2) {
    return dense
  }
  const blurred: Coordinate[] = []
  for (let i = 0; i < dense.length; i++) {
    let sx = 0
    let sy = 0
    for (let k = 0; k < smooth; k++) {
      sx += dense[Math.max(i - k, 0)].x + dense[Math.min(i + k, dense.length - 1)].x
      sy += dense[Math.max(i - k, 0)].y + dense[Math.min(i + k, dense.length - 1)].y
    }
    blurred.push({ x: (sx * 0.5) / smooth, y: (sy * 0.5) / smooth })
  }
  blurred.push(dense[dense.length - 1])
  return blurred
}

/**
 * TV SelectionRenderer-equivalent: round selection markers at the first
 * and last rendered point, shown once the stroke is finished and its
 * anchors are visible (selected or hovered-unlocked).
 */
export function strokeEndMarkers (
  keyPrefix: string,
  rendered: Coordinate[],
  opts: { isSelected?: boolean, isHovered?: boolean, isDrawing?: boolean, lock?: boolean, isTouch?: boolean }
): OverlayFigure[] {
  if (
    opts.isDrawing === true ||
    opts.lock === true ||
    !((opts.isSelected ?? false) || (opts.isHovered ?? false)) ||
    rendered.length === 0
  ) {
    return []
  }
  const half = opts.isTouch === true ? 13 : 6
  const ends = rendered.length === 1 ? [rendered[0]] : [rendered[0], rendered[rendered.length - 1]]
  return ends.map((p, i) => ({
    key: `${keyPrefix}_end${i}`,
    type: 'circle',
    attrs: { x: Math.round(p.x) - 0.5, y: Math.round(p.y) - 0.5, r: half },
    styles: {
      style: 'stroke_fill',
      color: '#ffffff',
      borderColor: '#1592E6',
      borderSize: 1.5
    },
    cursor: 'move'
  }))
}
