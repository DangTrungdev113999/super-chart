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
import type { LineType, SmoothLineStyle } from '../../../common/Styles'
import { hexToRgb } from '../../../common/utils/color'
import { isArray, isNumber, isValid } from '../../../common/utils/typeChecks'

import type {
  OverlayFigure,
  OverlayTemplate,
  OverlayCreateFiguresCallbackParams
} from '../../../component/Overlay'

import { createAnchorFigures } from '../../interaction/anchors'
import { withFigureCache } from '../../interaction/perf'
import type { DrawingCommonState } from '../../types'

/**
 * Shared parametric implementation for the four 3-anchor pitchfork tools.
 * Geometry mirrors TradingView's line-tool-pitchfork pane views:
 *
 *   M    = mid(P2, P3)              — tine anchor + (most variants) median end
 *   half = (P3 − P2) · 0.5          — tine spread vector
 *   dir  = medianEnd − medianBase   — direction every ray/tine is drawn in
 *
 * Each visible level draws TWO tines anchored at M ± coeff·half; the band
 * between a level and the previous visible level is a screen-clipped
 * parallelogram (TradingView ChannelRenderer semantics).
 */

export type PitchforkVariant = 'original' | 'schiff' | 'modifiedSchiff' | 'inside'

/** Line-style tokens, aligned with the settings dialog's LINE_STYLE_OPTIONS. */
export type PitchforkLineStyle = 'solid' | 'dashed' | 'dotted'

export interface PitchforkLevel {
  visible?: boolean
  coeff?: number
  color?: string
  width?: number
  style?: PitchforkLineStyle
  /** Custom dash pattern — overrides the canonical pattern of `style`. */
  dashed?: number[]
}

export interface PitchforkMedian {
  visible?: boolean
  color?: string
  width?: number
  style?: PitchforkLineStyle
  dashed?: number[]
}

export interface PitchforkExtendData {
  /**
   * Tine rows — the settings dialog's levels editor binds this array
   * verbatim (whole-array replacement, never per-index merge).
   */
  levels?: PitchforkLevel[]
  /**
   * Median line styling — TradingView also applies it to the back/side/
   * center construction segments.
   */
  median?: PitchforkMedian
  /** Fill the bands between adjacent visible tines (default true). */
  fillBackground?: boolean
  /**
   * Fill transparency — TradingView percent scale 0–100 (default 80);
   * a 0–1 fraction is accepted as the same fraction of transparency.
   */
  transparency?: number
  /**
   * Extend every ray backward through its anchor to the opposite pane
   * edge (TradingView `extendleft`). Rays always extend forward.
   */
  extendLines?: boolean
  common?: DrawingCommonState
}

export const PITCHFORK_MEDIAN_DEFAULT_COLOR = '#F23645'

/**
 * Level color fallbacks — TradingView's level palette mapped onto the
 * coefficient ladder; the ±1 prongs keep tv-blue (#2962FF).
 */
const LEVEL_FALLBACK_COLORS = [
  '#FFB74D', '#81C784', '#089981', '#089981', '#00BCD4',
  '#00BCD4', '#2962FF', '#9C27B0', '#E91E63'
]

/**
 * Default tine rows — TradingView's nine pitchfork coefficients; 0.5 and 1
 * ship visible (matching the consumer default's enabled subset).
 */
export const PITCHFORK_DEFAULT_LEVELS: PitchforkLevel[] = [
  { coeff: 0, visible: false, color: LEVEL_FALLBACK_COLORS[0] },
  { coeff: 0.236, visible: false, color: LEVEL_FALLBACK_COLORS[1] },
  { coeff: 0.382, visible: false, color: LEVEL_FALLBACK_COLORS[2] },
  { coeff: 0.5, visible: true, color: LEVEL_FALLBACK_COLORS[3] },
  { coeff: 0.618, visible: false, color: LEVEL_FALLBACK_COLORS[4] },
  { coeff: 0.786, visible: false, color: LEVEL_FALLBACK_COLORS[5] },
  { coeff: 1, visible: true, color: LEVEL_FALLBACK_COLORS[6] },
  { coeff: 1.618, visible: false, color: LEVEL_FALLBACK_COLORS[7] },
  { coeff: 2.618, visible: false, color: LEVEL_FALLBACK_COLORS[8] }
]

const EPSILON = 1e-10

// ── vector helpers ──────────────────────────────────────────────────────

function mid (a: Coordinate, b: Coordinate): Coordinate {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function sub (a: Coordinate, b: Coordinate): Coordinate {
  return { x: a.x - b.x, y: a.y - b.y }
}

function addScaled (a: Coordinate, v: Coordinate, k: number): Coordinate {
  return { x: a.x + v.x * k, y: a.y + v.y * k }
}

function add (a: Coordinate, b: Coordinate): Coordinate {
  return { x: a.x + b.x, y: a.y + b.y }
}

function len (v: Coordinate): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

// ── geometry ────────────────────────────────────────────────────────────

interface ForkGeometry {
  /** Median line — `ray: false` draws the plain segment (inside pitchfork). */
  median?: { from: Coordinate, to: Coordinate, ray: boolean }
  /** P1→P2 back segment (schiff / modifiedSchiff / inside). */
  back?: [Coordinate, Coordinate]
  /** P2→P3 side segment. */
  side?: [Coordinate, Coordinate]
  /** Inside pitchfork center ray from mid(P2,P3) along the median direction. */
  center?: { from: Coordinate, dir: Coordinate }
  /** Tine anchor — mid(P2,P3). */
  tineOrigin?: Coordinate
  /** Shared tine/median direction vector. */
  dir?: Coordinate
  /** Tine spread vector — (P3−P2)·0.5. */
  half?: Coordinate
}

/**
 * Resolve the per-variant geometry. `p3` is absent while the third anchor
 * is still being drawn — each variant renders the same in-progress partial
 * shape TradingView does.
 */
function computeGeometry (variant: PitchforkVariant, p1: Coordinate, p2: Coordinate, p3?: Coordinate): ForkGeometry {
  const back: [Coordinate, Coordinate] = [p1, p2]
  if (p3 === undefined) {
    switch (variant) {
      case 'original':
        // In-progress median: P1 → P2 (TradingView medianPoint = p2 at 2 points).
        return { median: { from: p1, to: p2, ray: true } }
      case 'schiff':
        return { back, median: { from: mid(p1, p2), to: p2, ray: true } }
      case 'modifiedSchiff':
      case 'inside':
        return { back }
    }
  }
  const m = mid(p2, p3)
  const half = { x: (p3.x - p2.x) * 0.5, y: (p3.y - p2.y) * 0.5 }
  switch (variant) {
    case 'original':
      return {
        median: { from: p1, to: m, ray: true },
        side: [p2, p3],
        tineOrigin: m,
        dir: sub(m, p1),
        half
      }
    case 'schiff':
    case 'modifiedSchiff': {
      const base = variant === 'schiff'
        ? mid(p1, p2)
        : { x: p1.x, y: (p1.y + p2.y) / 2 }
      return {
        back,
        median: { from: base, to: m, ray: true },
        side: [p2, p3],
        tineOrigin: m,
        dir: sub(m, base),
        half
      }
    }
    case 'inside': {
      const base = mid(p1, p2)
      const dir = sub(p3, base)
      return {
        back,
        median: { from: base, to: p3, ray: false },
        side: [p2, p3],
        center: { from: m, dir },
        tineOrigin: m,
        dir,
        half
      }
    }
  }
}

// ── clipping ────────────────────────────────────────────────────────────

/**
 * Intersect the infinite line through `origin` along `dir` with the pane
 * rect and return the drawn segment. The ray always extends forward
 * (TradingView `extendright`); `extendBack` additionally extends through
 * the origin to the opposite edge (TradingView `extendleft` ⇔ extendLines).
 */
function clipRayToPane (origin: Coordinate, dir: Coordinate, bounding: Bounding, extendBack: boolean): [Coordinate, Coordinate] | null {
  if (len(dir) < EPSILON) {
    return null
  }
  // Parametric slab clip: origin + t·dir against [0,w]×[0,h].
  let tNear = -Infinity
  let tFar = Infinity
  const axes: Array<[number, number, number]> = [
    [origin.x, dir.x, bounding.width],
    [origin.y, dir.y, bounding.height]
  ]
  for (const [pos, d, hi] of axes) {
    if (Math.abs(d) < EPSILON) {
      if (pos < 0 || pos > hi) {
        return null
      }
    } else {
      let tA = -pos / d
      let tB = (hi - pos) / d
      if (tA > tB) {
        const t = tA
        tA = tB
        tB = t
      }
      tNear = Math.max(tNear, tA)
      tFar = Math.min(tFar, tB)
      if (tNear > tFar) {
        return null
      }
    }
  }
  const tStart = extendBack ? tNear : Math.max(0, tNear)
  if (!(tFar > tStart)) {
    return null
  }
  return [
    { x: origin.x + dir.x * tStart, y: origin.y + dir.y * tStart },
    { x: origin.x + dir.x * tFar, y: origin.y + dir.y * tFar }
  ]
}

/**
 * Sutherland–Hodgman clip of `poly` by the half-plane of the line through
 * e1→e2 that contains `keep` — the TradingView clipPolygonByEdge primitive
 * ChannelRenderer builds its band fills from.
 */
function clipPolygonByEdge (poly: Coordinate[], e1: Coordinate, e2: Coordinate, keep: Coordinate[]): Coordinate[] {
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
  // Every keep point lies on the edge — coincident tines produce no band.
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
 * Band between two adjacent tines, TradingView ChannelRenderer semantics:
 * the screen rect clipped by both tine lines, and — unless `extendLines` —
 * by the chord through the two tine anchors.
 */
function fillBand (currAnchor: Coordinate, prevAnchor: Coordinate, dir: Coordinate, bounding: Bounding, extendLeft: boolean): Coordinate[] {
  const { width, height } = bounding
  let poly: Coordinate[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ]
  poly = clipPolygonByEdge(poly, currAnchor, add(currAnchor, dir), [add(prevAnchor, dir), prevAnchor])
  poly = clipPolygonByEdge(poly, add(prevAnchor, dir), prevAnchor, [currAnchor, add(currAnchor, dir)])
  if (!extendLeft && len(sub(currAnchor, prevAnchor)) > EPSILON) {
    poly = clipPolygonByEdge(poly, prevAnchor, currAnchor, [add(currAnchor, dir), add(prevAnchor, dir)])
  }
  return poly
}

// ── styles ──────────────────────────────────────────────────────────────

interface ResolvedStroke {
  color: string
  size: number
  style: LineType
  dashedValue: number[]
}

interface StrokeEntry {
  color?: string
  width?: number
  style?: PitchforkLineStyle
  dashed?: number[]
}

/**
 * Resolve a level/median stroke: the entry's own props win, then the
 * generic `styles.line` (what the floating toolbar + settings dialog
 * write), then the per-element fallback color.
 */
function resolveStroke (entry: StrokeEntry | undefined, line: Partial<SmoothLineStyle> | undefined, fallbackColor: string): ResolvedStroke {
  const style: PitchforkLineStyle = entry?.style ?? (line?.style as PitchforkLineStyle | undefined) ?? 'solid'
  const dashed = entry?.dashed ?? (entry?.style === undefined ? line?.dashedValue : undefined)
  return {
    color: entry?.color ?? line?.color ?? fallbackColor,
    size: entry?.width ?? line?.size ?? 1,
    style: style === 'solid' ? 'solid' : 'dashed',
    dashedValue: dashed ?? (style === 'dotted' ? [2, 4] : [6, 6])
  }
}

function applyTransparency (color: string, transparency: number): string {
  // TradingView transparency is percent scale; tolerate a 0–1 fraction.
  const percent = transparency <= 1 ? transparency * 100 : transparency
  const alpha = Math.max(0, Math.min(1, (100 - percent) / 100))
  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return hexToRgb(color, alpha)
  }
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const r = parseInt(color[1] + color[1], 16)
    const g = parseInt(color[2] + color[2], 16)
    const b = parseInt(color[3] + color[3], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  // Non-hex colors are drawn as-is — no safe channel decomposition.
  return color
}

// ── figure construction ─────────────────────────────────────────────────

function pushLine (figures: OverlayFigure[], key: string, coordinates: Coordinate[][], stroke: ResolvedStroke): void {
  if (coordinates.length > 0) {
    figures.push({
      key,
      type: 'line',
      attrs: coordinates.map(segment => ({ coordinates: segment })),
      styles: { color: stroke.color, size: stroke.size, style: stroke.style, dashedValue: stroke.dashedValue }
    })
  }
}

function buildPointFigures (variant: PitchforkVariant, params: OverlayCreateFiguresCallbackParams<PitchforkExtendData>): OverlayFigure[] {
  const { overlay, coordinates, bounding, isSelected = false, isHovered = false, isTouch = false } = params
  const figures: OverlayFigure[] = []
  const count = coordinates.length
  if (count === 0) {
    return figures
  }

  const extendData: PitchforkExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
  const levels = isArray(extendData.levels) ? extendData.levels : PITCHFORK_DEFAULT_LEVELS
  const extendLines = extendData.extendLines === true
  const fillBackground = extendData.fillBackground !== false
  const transparency = isNumber(extendData.transparency) ? extendData.transparency : 80
  const line = overlay.styles?.line
  const medianStroke = resolveStroke(extendData.median, line, PITCHFORK_MEDIAN_DEFAULT_COLOR)

  const geom = count > 1
    ? computeGeometry(variant, coordinates[0], coordinates[1], coordinates[2])
    : {}

  const medianVisible = extendData.median?.visible !== false

  // Figure order mirrors the TradingView pane views — construction and
  // median lines sit below the tine bands.
  if (variant === 'original') {
    if (medianVisible && geom.median !== undefined) {
      const { from, to } = geom.median
      const seg = clipRayToPane(from, sub(to, from), bounding, extendLines)
      if (seg !== null) {
        pushLine(figures, 'median', [seg], medianStroke)
      }
    }
    if (geom.side !== undefined) {
      pushLine(figures, 'side', [geom.side], medianStroke)
    }
  } else if (variant === 'inside') {
    if (medianVisible && geom.median !== undefined) {
      pushLine(figures, 'median', [[geom.median.from, geom.median.to]], medianStroke)
    }
    if (geom.back !== undefined) {
      pushLine(figures, 'back', [geom.back], medianStroke)
    }
    if (geom.side !== undefined) {
      pushLine(figures, 'side', [geom.side], medianStroke)
    }
    if (geom.center !== undefined) {
      const seg = clipRayToPane(geom.center.from, geom.center.dir, bounding, extendLines)
      if (seg !== null) {
        pushLine(figures, 'center', [seg], medianStroke)
      }
    }
  } else {
    // schiff / modifiedSchiff
    if (geom.back !== undefined) {
      pushLine(figures, 'back', [geom.back], medianStroke)
    }
    if (medianVisible && geom.median !== undefined) {
      const { from, to } = geom.median
      const seg = clipRayToPane(from, sub(to, from), bounding, extendLines)
      if (seg !== null) {
        pushLine(figures, 'median', [seg], medianStroke)
      }
    }
    if (geom.side !== undefined) {
      pushLine(figures, 'side', [geom.side], medianStroke)
    }
  }

  // Tines + band fills.
  const { tineOrigin, dir, half } = geom
  if (tineOrigin !== undefined && dir !== undefined && half !== undefined && len(dir) > EPSILON) {
    let prevCoeff = 0
    levels.forEach((level, index) => {
      const coeff = level.coeff
      if (level.visible === false || !isNumber(coeff)) {
        return
      }
      const stroke = resolveStroke(level, line, LEVEL_FALLBACK_COLORS[index % LEVEL_FALLBACK_COLORS.length])
      const upOrigin = addScaled(tineOrigin, half, coeff)
      const dnOrigin = addScaled(tineOrigin, half, -coeff)

      if (fillBackground && Math.abs(coeff - prevCoeff) > EPSILON && len(half) > EPSILON) {
        const bands: Coordinate[][] = []
        const upBand = fillBand(addScaled(tineOrigin, half, prevCoeff), upOrigin, dir, bounding, extendLines)
        const dnBand = fillBand(addScaled(tineOrigin, half, -prevCoeff), dnOrigin, dir, bounding, extendLines)
        if (upBand.length >= 3) {
          bands.push(upBand)
        }
        if (dnBand.length >= 3) {
          bands.push(dnBand)
        }
        if (bands.length > 0) {
          figures.push({
            key: `fill_${index}`,
            type: 'polygon',
            attrs: bands.map(bandCoordinates => ({ coordinates: bandCoordinates })),
            styles: { style: 'fill', color: applyTransparency(stroke.color, transparency) },
            ignoreEvent: true
          })
        }
      }

      const tineSegs: Coordinate[][] = []
      const upSeg = clipRayToPane(upOrigin, dir, bounding, extendLines)
      const dnSeg = clipRayToPane(dnOrigin, dir, bounding, extendLines)
      if (upSeg !== null) {
        tineSegs.push(upSeg)
      }
      if (dnSeg !== null) {
        tineSegs.push(dnSeg)
      }
      pushLine(figures, `tine_${index}`, tineSegs, stroke)

      prevCoeff = coeff
    })
  }

  figures.push(...createAnchorFigures({
    coordinates,
    isSelected,
    isHovered,
    isTouch,
    isDrawing: overlay.isDrawing(),
    lock: overlay.lock,
    keyPrefix: 'anchor_'
  }))
  return figures
}

/**
 * Build a 3-anchor pitchfork template. `name` must equal the catalog
 * `overlayName`; `variant` selects the TradingView pane-view geometry.
 */
export function createPitchforkTemplate (name: string, variant: PitchforkVariant): OverlayTemplate<PitchforkExtendData> {
  return {
    name,
    totalStep: 4,
    cullable: false,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    extendData: {
      levels: PITCHFORK_DEFAULT_LEVELS,
      fillBackground: true,
      transparency: 80,
      extendLines: false
    },
    createPointFigures: withFigureCache((params) => buildPointFigures(variant, params))
  }
}
