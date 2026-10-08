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
import type {
  Overlay,
  OverlayCreateFiguresCallbackParams,
  OverlayFigure
} from '../../../component/Overlay'

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'

import {
  alphaColor,
  formatNum,
  lineStyleOverrides
} from '../lines/lineCommon'
import type { LineExtendData } from '../lines/lineCommon'

// ── TradingView palette defaults (colorTokens) ──

/** colorTvBlue500 — XABCD / cypher / ABCD-family default. */
export const TV_BLUE = '#2962FF'
/** colorMintyGreen500 — ABCD / head-and-shoulders default. */
export const TV_MINTY_GREEN = '#089981'
/** colorDeepBlue500 — three-drives / triangle-pattern default. */
export const TV_DEEP_BLUE = '#673AB7'
/** Elliott impulse / correction default. */
export const TV_ELLIOTT_BLUE = '#3d85c6'
/** Elliott double / triple combo default. */
export const TV_ELLIOTT_GREEN = '#6aa84f'
/** colorTanOrange500 — Elliott triangle default. */
export const TV_TAN_ORANGE = '#FF9800'
/** Cyclic lines default. */
export const TV_CYCLIC_COLOR = '#80ccdb'
/** Time cycles / sine line default. */
export const TV_TIME_COLOR = '#159980'
/** TV dashed connector between the two cycle anchors. */
export const TV_CONNECTOR_COLOR = '#808080'

/** TradingView `DEFAULT_LINE_TOOL_LINE_WIDTH` — every pattern tool is 2px. */
export const TV_LINE_WIDTH = 2

/**
 * Shared `extendData` vocabulary for the pattern/cycle family. Extends the
 * consumer line channel with TradingView's `color`/`textcolor`/`fontsize`/
 * `backgroundColor`/`fillBackground`/`transparency` spellings (kernel
 * property names from the TV sources). Always read defensively:
 * `isValid(overlay.extendData) ? overlay.extendData : {}`.
 */
export interface PatternExtendData extends LineExtendData {
  // `LineExtendData` already carries the TV/consumer color channel:
  // `lineColor` plus the legacy `color` alias — `lineStyleOverrides`
  // resolves both.
  /** TV label pill text color (kernel `textcolor`, consumer `textColor`). */
  textcolor?: string
  /** TV vertex label font size (kernel `fontsize`, consumer `textSize`). */
  fontsize?: number
  /** TV fill color for shaded regions (defaults to the line color). */
  backgroundColor?: string
  /** TV flag — shade pattern regions (default true where TV does). */
  fillBackground?: boolean
  /** TV 0–100 transparency for shaded regions (default 85 → alpha 0.15). */
  transparency?: number
  /** Elliott tools — draw the zigzag polyline (default true). */
  showWave?: boolean
  /** Elliott tools — wave degree 0–14 (TV default Intermediate = 7). */
  degree?: number
  /** Vertex label visibility (default true). */
  showLabels?: boolean
}

/**
 * Effective pattern stroke — `overlay.styles.line` > extendData color
 * channel > `fallbackColor` (the tool's TradingView default) > theme.
 */
export function patternStrokeOf (
  overlay: Overlay,
  chart: Chart,
  ext: PatternExtendData,
  fallbackColor?: string,
  fallbackSize?: number
): { color: string, size: number, style: 'solid' | 'dashed', dashedValue: number[] } {
  const stroke = lineStyleOverrides(overlay, chart, ext)
  if (
    isValid(fallbackColor) &&
    !isValid(overlay.styles?.line?.color) &&
    !isValid(ext.lineColor) &&
    !isValid(ext.color)
  ) {
    stroke.color = fallbackColor
  }
  if (
    isValid(fallbackSize) &&
    !isValid(overlay.styles?.line?.size) &&
    !isValid(ext.lineWidth)
  ) {
    stroke.size = fallbackSize
  }
  return stroke
}

/** Effective fill color — TV `backgroundColor` else the line color at the
 *  TV transparency default (85 → alpha 0.15). */
export function patternFillColorOf (
  ext: PatternExtendData,
  strokeColor: string
): string {
  const base = ext.backgroundColor ?? strokeColor
  const transparency = isNumber(ext.transparency) ? ext.transparency : 85
  const alpha = Math.max(0, Math.min(100, 100 - transparency)) / 100
  return alphaColor(base, alpha)
}

/** Vertex label font spec honoring kernel + consumer field casing. */
export function patternFontOf (ext: PatternExtendData): { size: number, bold: boolean, italic: boolean } {
  return {
    size: ext.fontsize ?? ext.textSize ?? 12,
    bold: ext.bold ?? ext.textBold ?? false,
    italic: ext.italic ?? ext.textItalic ?? false
  }
}

/** Pill label colors — TV draws white text on the line color. */
export function patternPillColorsOf (ext: PatternExtendData, strokeColor: string): { background: string, text: string } {
  return {
    background: strokeColor,
    text: ext.textcolor ?? ext.textColor ?? '#ffffff'
  }
}

/**
 * TradingView vertex-label side rule (xabcd/abcd/trianglePattern/H&S):
 * the label sits on the side away from the pattern — above the vertex when
 * it is a local peak relative to its reference neighbor (the previous
 * vertex, or the next one for index 0).
 */
export function vertexLabelAbove (coordinates: Coordinate[], index: number): boolean {
  const current = coordinates[index]
  const ref = coordinates[index === 0 ? 1 : index - 1]
  if (!isValid(current) || !isValid(ref)) {
    return false
  }
  return current.y < ref.y
}

/**
 * CSS font-shorthand `weight` slot — the text figure builds
 * `${weight} ${size}px ${family}`, so italic is folded in here.
 */
export function pillFontWeight (font: { bold: boolean, italic: boolean }): string {
  if (font.bold && font.italic) {
    return 'italic bold'
  }
  if (font.italic) {
    return 'italic'
  }
  return font.bold ? 'bold' : 'normal'
}

/**
 * TradingView vertex pill — text centered on the vertex (`vertAlign Middle`
 * + `horzAlign Center` + `backgroundRoundRect 4` in the sources), nudged
 * 5px above/below per {@link vertexLabelAbove}. Decorative — `ignoreEvent`.
 */
export function vertexPillFigure (
  key: string,
  coordinate: Coordinate,
  text: string,
  above: boolean,
  colors: { background: string, text: string },
  font: { size: number, bold: boolean, italic: boolean }
): OverlayFigure {
  return {
    key,
    type: 'text',
    attrs: {
      x: coordinate.x,
      y: above ? coordinate.y - 5 : coordinate.y + 5,
      text,
      align: 'center',
      baseline: above ? 'bottom' : 'top'
    },
    styles: {
      color: colors.text,
      size: font.size,
      weight: pillFontWeight(font),
      backgroundColor: colors.background,
      paddingLeft: 4,
      paddingRight: 4,
      paddingTop: 2,
      paddingBottom: 2,
      borderRadius: 4
    },
    ignoreEvent: true
  }
}

/**
 * TradingView ratio pill — same pill styling, centered on a segment
 * midpoint (`vertAlign Middle`, offsetY 0 in the sources).
 */
export function ratioPillFigure (
  key: string,
  coordinate: Coordinate,
  text: string,
  colors: { background: string, text: string },
  font: { size: number, bold: boolean, italic: boolean }
): OverlayFigure {
  return {
    key,
    type: 'text',
    attrs: {
      x: coordinate.x,
      y: coordinate.y,
      text,
      align: 'center',
      baseline: 'middle'
    },
    styles: {
      color: colors.text,
      size: font.size,
      weight: pillFontWeight(font),
      backgroundColor: colors.background,
      paddingLeft: 4,
      paddingRight: 4,
      paddingTop: 2,
      paddingBottom: 2,
      borderRadius: 4
    },
    ignoreEvent: true
  }
}

/**
 * TradingView retracement line — TV draws the XABCD/ABCD/three-drives aux
 * segments dotted at the tool linewidth (XABCD uses a fixed 1px).
 */
export function ratioTrendFigure (
  key: string,
  a: Coordinate,
  b: Coordinate,
  color: string,
  size = 1
): OverlayFigure {
  return {
    key,
    type: 'line',
    attrs: { coordinates: [a, b] },
    styles: {
      style: 'dashed',
      color,
      size,
      // TV LINESTYLE_DOTTED — a tight 2px dash.
      dashedValue: [2, 2]
    },
    ignoreEvent: true
  }
}

/** Midpoint of two pane-space coordinates. */
export function midpointOf (a: Coordinate, b: Coordinate): Coordinate {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * TradingView numeric formatting — ratio pills are rounded to 3 decimals
 * and rendered through the numeric formatter (trailing zeros stripped).
 */
export function formatRatio (value: number): string {
  return formatNum(Math.round(value * 1000) / 1000, 3)
}

/** `points[i].value` — returns undefined when the slot is absent/invalid. */
export function pointValue (points: Array<Partial<Point>>, index: number): number | undefined {
  const point = points[index]
  if (!isValid(point) || !isNumber(point.value)) {
    return undefined
  }
  return point.value
}

/**
 * |a − b| / |c − d| guarded — undefined when any leg is missing or the
 * denominator collapses (TradingView shows nothing then either).
 */
export function priceRatio (
  points: Array<Partial<Point>>,
  numeratorA: number,
  numeratorB: number,
  denominatorA: number,
  denominatorB: number
): number | undefined {
  const a = pointValue(points, numeratorA)
  const b = pointValue(points, numeratorB)
  const c = pointValue(points, denominatorA)
  const d = pointValue(points, denominatorB)
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return undefined
  }
  const denominator = Math.abs(c - d)
  if (denominator < 1e-12) {
    return undefined
  }
  return Math.abs(a - b) / denominator
}

/**
 * TradingView `intersectLineSegments(a1, a2, b1, b2)` — returns the point on
 * the INFINITE line a1→a2 where it crosses, but only when that intersection
 * lies within segment b1→b2 (u ∈ [0,1] on b). Used for the H&S neckline.
 */
export function lineSegIntersection (
  a1: Coordinate,
  a2: Coordinate,
  b1: Coordinate,
  b2: Coordinate
): Coordinate | null {
  const avx = a2.x - a1.x
  const avy = a2.y - a1.y
  const bvx = b2.x - b1.x
  const bvy = b2.y - b1.y
  const determinant = avx * bvy - avy * bvx
  if (Math.abs(determinant) < 1e-6) {
    return null
  }
  // Parameter on line b (u) must stay inside segment b1→b2; t on line a is
  // unrestricted (the TV geometry returns the intersection even beyond a2).
  const ox = a1.x - b1.x
  const oy = a1.y - b1.y
  const u = (ox * avy - oy * avx) / -determinant
  if (u < 0 || u > 1) {
    return null
  }
  const t = (bvy * ox - bvx * oy) / -determinant
  return { x: a1.x + avx * t, y: a1.y + avy * t }
}

// ═══════════════════════════════════════
// Shared 5-point pattern renderer (xabcd / cypher)
// ═══════════════════════════════════════

/**
 * The four ratio pills TV draws on a 5-point pattern. All are
 * `|Δprice| / |Δprice|` — see the tool files for the exact leg pairs
 * (XABCD and cypher differ on `bc`/`xd`).
 */
export interface FivePointRatios {
  /** pill on the X–B dotted line. */
  ab?: number
  /** pill on the A–C dotted line. */
  bc?: number
  /** pill on the B–D dotted line. */
  cd?: number
  /** pill on the X–D dotted line. */
  xd?: number
}

const FIVE_POINT_VERTEX_LABELS = ['X', 'A', 'B', 'C', 'D']

/**
 * TradingView `Pattern5pointsPaneView` — polyline through X·A·B·C·D, two
 * shaded triangles ([X,A,B] and [B,C,D]) under `fillBackground`, dotted
 * 1px aux lines X–B / A–C / X–D / B–D with ratio pills at their midpoints,
 * and vertex pills on the outer side of each vertex.
 */
export function fivePointPatternFigures (
  params: OverlayCreateFiguresCallbackParams<PatternExtendData>,
  ratiosOf: (points: Array<Partial<Point>>) => FivePointRatios,
  fallbackColor: string = TV_BLUE
): OverlayFigure[] {
  const { chart, coordinates, overlay, isSelected, isHovered, isTouch } = params
  const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
  const stroke = patternStrokeOf(overlay, chart, ext, fallbackColor, TV_LINE_WIDTH)
  const font = patternFontOf(ext)
  const pillColors = patternPillColorsOf(ext, stroke.color)
  const fillEnabled = ext.fillBackground ?? true
  const showLabels = ext.showLabels ?? true

  const figures: OverlayFigure[] = []
  if (coordinates.length < 2) {
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch
    }))
    return figures
  }

  const [x, a, b, c, d] = coordinates

  // Shaded triangles — invisible 1px-transparent border in TV (fill only).
  if (fillEnabled && coordinates.length >= 3) {
    const fill = patternFillColorOf(ext, stroke.color)
    figures.push({
      key: 'ptn_tri_xab',
      type: 'polygon',
      attrs: { coordinates: [x, a, b] },
      styles: { style: 'fill', color: fill },
      ignoreEvent: true
    })
    if (coordinates.length >= 5) {
      figures.push({
        key: 'ptn_tri_bcd',
        type: 'polygon',
        attrs: { coordinates: [b, c, d] },
        styles: { style: 'fill', color: fill },
        ignoreEvent: true
      })
    }
  }

  // Zigzag polyline through every vertex (follows the in-progress point).
  figures.push({
    key: 'ptn_wave',
    type: 'line',
    attrs: { coordinates },
    styles: {
      style: stroke.style,
      color: stroke.color,
      size: stroke.size,
      dashedValue: stroke.dashedValue
    },
    ignoreEvent: true
  })

  const ratios = ratiosOf(overlay.points)
  if (coordinates.length >= 3 && isNumber(ratios.ab)) {
    figures.push(ratioTrendFigure('ptn_aux_xb', x, b, stroke.color))
    figures.push(ratioPillFigure('ptn_ratio_xb', midpointOf(x, b), formatRatio(ratios.ab), pillColors, font))
  }
  if (coordinates.length >= 4 && isNumber(ratios.bc)) {
    figures.push(ratioTrendFigure('ptn_aux_ac', a, c, stroke.color))
    figures.push(ratioPillFigure('ptn_ratio_ac', midpointOf(a, c), formatRatio(ratios.bc), pillColors, font))
  }
  if (coordinates.length >= 5) {
    if (isNumber(ratios.cd)) {
      figures.push(ratioTrendFigure('ptn_aux_bd', b, d, stroke.color))
      figures.push(ratioPillFigure('ptn_ratio_bd', midpointOf(b, d), formatRatio(ratios.cd), pillColors, font))
    }
    if (isNumber(ratios.xd)) {
      figures.push(ratioTrendFigure('ptn_aux_xd', x, d, stroke.color))
      figures.push(ratioPillFigure('ptn_ratio_xd', midpointOf(x, d), formatRatio(ratios.xd), pillColors, font))
    }
  }

  if (showLabels) {
    coordinates.forEach((coordinate, index) => {
      const label = FIVE_POINT_VERTEX_LABELS[index]
      if (isValid(label)) {
        figures.push(vertexPillFigure(
          `ptn_vertex_${index}`,
          coordinate,
          label,
          vertexLabelAbove(coordinates, index),
          pillColors,
          font
        ))
      }
    })
  }

  figures.push(...createAnchorFigures({
    coordinates,
    isSelected,
    isHovered,
    isDrawing: overlay.isDrawing(),
    lock: overlay.lock,
    isTouch
  }))
  return figures
}
