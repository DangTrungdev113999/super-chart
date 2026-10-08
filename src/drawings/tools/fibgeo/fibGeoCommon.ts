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
import type { LineStyle } from '../../../common/Styles'
import { isArray, isNumber, isString } from '../../../common/utils/typeChecks'

import type { OverlayFigure } from '../../../component/Overlay'
import type { LineAttrs } from '../../../extension/figure/line'
import type { TextAttrs } from '../../../extension/figure/text'

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
