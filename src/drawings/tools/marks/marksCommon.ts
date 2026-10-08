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
