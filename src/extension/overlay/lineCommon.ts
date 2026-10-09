/**
 * Shared helpers and constants for line-family overlays.
 *
 * Used by:
 *   - segment (Duong Xu huong, reference)
 *   - rayLine (Tia)
 *   - straightLine (Duong Mo rong)
 *   - priceLine (Duong Gia)
 *   - horizontalStraightLine / horizontalRayLine / horizontalSegment
 *   - verticalStraightLine / verticalRayLine / verticalSegment
 *   - infoLine (surface-side Duong Thong tin)
 *   - trendAngle (surface-side Goc Xu huong)
 *   - crossLine (surface-side Duong giao nhau)
 */

import type Coordinate from '../../common/Coordinate'
import type { EventOverlayInfo } from '../../Store'
import type { OverlayFigure } from '../../component/Overlay'

import { getLinearYFromCoordinates } from '../figure/line'
import { formatPrecision } from '../../common/utils/format'

// ===========================================
// CHART STORE ACCESSOR (for selection/hover detection)
// ===========================================

export interface ChartInternal {
  getChartStore: () => {
    getClickOverlayInfo: () => EventOverlayInfo
    getHoverOverlayInfo: () => EventOverlayInfo
  }
}

// ===========================================
// CONTROL POINT CONSTANTS
// ===========================================

export const CP_COLOR = '#1592E6'
export const CP_RADIUS = 5
export const CP_CIRCLE_BORDER = 1.5

// ===========================================
// ARROW CONSTANTS
// ===========================================

export const ARROW_LENGTH = 14
export const ARROW_WIDTH = 6

// ===========================================
// HELPERS
// ===========================================

/**
 * Luminance check for adaptive CP background (dark vs light theme).
 */
export function isLightColor (hex: string): boolean {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex)
  if (match == null) return false
  const r = parseInt(match[1], 16)
  const g = parseInt(match[2], 16)
  const b = parseInt(match[3], 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

/**
 * Compute arrowhead polygon coordinates at `tip` pointing away from `from`.
 * Returns 3 points forming a closed triangle, or [] if from === tip.
 */
export function getArrowCoordinates (from: Coordinate, tip: Coordinate): Coordinate[] {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return []

  const ux = dx / len
  const uy = dy / len
  const px = -uy
  const py = ux

  const bx = tip.x - ux * ARROW_LENGTH
  const by = tip.y - uy * ARROW_LENGTH

  return [
    { x: tip.x, y: tip.y },
    { x: bx + px * ARROW_WIDTH, y: by + py * ARROW_WIDTH },
    { x: bx - px * ARROW_WIDTH, y: by - py * ARROW_WIDTH }
  ]
}

/**
 * Extend a line segment from c1 to c2 to bounding edges.
 * Handles both the vertical (c1.x === c2.x) and general cases.
 */
export function getExtendedCoordinates (
  c1: Coordinate, c2: Coordinate,
  boundingWidth: number, boundingHeight: number,
  extendLeft: boolean, extendRight: boolean
): [Coordinate, Coordinate] {
  let start: Coordinate = { x: c1.x, y: c1.y }
  let end: Coordinate = { x: c2.x, y: c2.y }

  const isVertical = c1.x === c2.x

  if (isVertical) {
    if (extendLeft) {
      start = c1.y <= c2.y
        ? { x: c1.x, y: 0 }
        : { x: c1.x, y: boundingHeight }
    }
    if (extendRight) {
      end = c1.y <= c2.y
        ? { x: c2.x, y: boundingHeight }
        : { x: c2.x, y: 0 }
    }
    return [start, end]
  }

  if (extendLeft) {
    const direction = c1.x < c2.x ? 0 : boundingWidth
    start = {
      x: direction,
      y: getLinearYFromCoordinates(c1, c2, { x: direction, y: c1.y })
    }
  }

  if (extendRight) {
    const direction = c1.x < c2.x ? boundingWidth : 0
    end = {
      x: direction,
      y: getLinearYFromCoordinates(c1, c2, { x: direction, y: c2.y })
    }
  }

  return [start, end]
}

/**
 * Format a number for display, trimming trailing zeros.
 */
export function formatNum (val: number, precision?: number): string {
  const p = precision ?? 2
  const s = val.toFixed(p)
  // Only strip when a decimal point exists — '100' at precision 0 would
  // otherwise collapse to '1'.
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/**
 * Format a timestamp as YYYY-MM-DD, returns '' if undefined.
 */
export function formatDate (timestamp: number | undefined): string {
  if (timestamp == null) return ''
  const d = new Date(timestamp)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Build a Y-axis pill figure (colored background, white text).
 * Returns null if value is null/undefined.
 */
export function buildYAxisPill (
  y: number,
  value: number | null | undefined,
  color: string,
  precision: number,
  bounding: { width: number },
  yAxis: { isFromZero: () => boolean } | undefined,
  key: string
): OverlayFigure | null {
  if (value == null) return null
  const isFromZero = yAxis?.isFromZero() ?? false
  const textAlign: CanvasTextAlign = isFromZero ? 'left' : 'right'
  const x = isFromZero ? 0 : bounding.width
  const text = formatPrecision(value, precision)
  return {
    key,
    type: 'text',
    attrs: { x, y, text, align: textAlign, baseline: 'middle' as CanvasTextBaseline },
    styles: {
      color: '#ffffff',
      size: 11,
      backgroundColor: color,
      paddingLeft: 4,
      paddingRight: 4,
      paddingTop: 2,
      paddingBottom: 2,
      borderRadius: 2
    },
    ignoreEvent: true
  }
}

/**
 * Convert #rrggbb + opacity (0–1) to rgba() string.
 */
export function alphaColor (hex: string, a: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (m == null) return hex
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`
}

/**
 * Build an X-axis date pill figure.
 */
export function buildXAxisPill (
  x: number,
  dateText: string,
  color: string,
  key: string
): OverlayFigure {
  return {
    key,
    type: 'text',
    attrs: { x, y: 0, text: dateText, align: 'center' as CanvasTextAlign, baseline: 'top' as CanvasTextBaseline },
    styles: {
      color: '#ffffff',
      size: 11,
      backgroundColor: color,
      paddingLeft: 6,
      paddingRight: 6,
      paddingTop: 3,
      paddingBottom: 3,
      borderRadius: 3
    },
    ignoreEvent: true
  }
}
