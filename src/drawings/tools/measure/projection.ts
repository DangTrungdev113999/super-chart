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
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'
import type { ArcAttrs } from '../../../extension/figure/arc'

import { isValid, isNumber } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import { alpha } from './measureCommon'
import { TRENDLINE_COLOR, distance, lineFigure } from '../fibgeo/fibGeoCommon'

/**
 * 'projection' — TradingView Projection (LineToolProjection, a FibWedge
 * variant with a single level at coefficient 1).
 *
 * Three anchors: P1 is the apex, the base ray runs P1→P2, and the edge ray
 * runs P1→P3 projected onto its own direction at radius |P1→P2| so both
 * edges close on the same sector arc. The enclosed sector is filled with
 * a wedge gradient sweeping color1→color2 (default TV blue → grapes purple
 * at 80% transparency), stroked by the boundary rays and a closing arc.
 *
 * Registered as a 3-click tool (totalStep 4) — TV anchor parity.
 */
export interface ProjectionExtendData {
  /** Boundary-ray line color (default cold-gray). */
  lineColor?: string
  lineWidth?: number
  /** Sector gradient start color (at the base ray, default TV blue). */
  color1?: string
  /** Sector gradient end color (at the edge ray, default TV grapes purple). */
  color2?: string
  /** Sector fill opacity 0..1 (default 0.2 — TV transparency 80). */
  fillOpacity?: number
  /** Toggle the sector fill (default true). */
  fillEnabled?: boolean
}

const DEFAULT_COLOR_1 = '#2962FF'
const DEFAULT_COLOR_2 = '#9C27B0'
const DEFAULT_FILL_OPACITY = 0.2

/** Sector slices approximating TV's angular gradient fill. */
const SECTOR_SLICES = 16

/** Signed smallest rotation from a1 to a2 in (−π, π] — span the small sector. */
function signedSectorAngle (a1: number, a2: number): number {
  let da = a2 - a1
  while (da > Math.PI) {
    da -= Math.PI * 2
  }
  while (da <= -Math.PI) {
    da += Math.PI * 2
  }
  return da
}

function parseHex (hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m !== null ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

/** Interpolate two hex colors → `rgb(r,g,b)` (falls back to c1 if unparsable). */
function lerpHex (c1: string, c2: string, t: number): string {
  const a = parseHex(c1)
  const b = parseHex(c2)
  if (a === null || b === null) {
    return c1
  }
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

const projection: OverlayTemplate<ProjectionExtendData> = {
  name: 'projection',
  totalStep: 4,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    const ext: ProjectionExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 3) {
      const [p1, p2, p3] = coordinates
      const radius = distance(p1, p2)
      const spread = distance(p1, p3)
      if (radius > 0 && spread > 0) {
        const a1 = Math.atan2(p2.y - p1.y, p2.x - p1.x)
        const a2 = Math.atan2(p3.y - p1.y, p3.x - p1.x)
        const da = signedSectorAngle(a1, a2)
        const lineColor = ext.lineColor ?? overlay.styles?.line?.color ?? TRENDLINE_COLOR
        const lineSize = isNumber(ext.lineWidth) && ext.lineWidth > 0
          ? ext.lineWidth
          : overlay.styles?.line?.size ?? 1
        const color1 = ext.color1 ?? DEFAULT_COLOR_1
        const color2 = ext.color2 ?? DEFAULT_COLOR_2
        const fillOpacity = isNumber(ext.fillOpacity)
          ? Math.min(1, Math.max(0, ext.fillOpacity))
          : DEFAULT_FILL_OPACITY
        const fillEnabled = ext.fillEnabled ?? true
        // Edge ray endpoint: P3 projected onto its own ray at the wedge radius.
        const p3Edge: Coordinate = { x: p1.x + Math.cos(a2) * radius, y: p1.y + Math.sin(a2) * radius }

        // Boundary rays — P1→P2 exact, P1→P3′ projected at the radius.
        figures.push(lineFigure('proj_edge', [
          [p1, p2],
          [p1, p3Edge]
        ], { style: 'solid', size: lineSize, color: lineColor }))

        // Sector fill — sliced wedge sweeping color1→color2 (TV renders an
        // angular gradient; canvas polygons can't, so adjacent slices lerp).
        if (fillEnabled && da !== 0) {
          for (let i = 0; i < SECTOR_SLICES; i++) {
            const t0 = i / SECTOR_SLICES
            const t1 = (i + 1) / SECTOR_SLICES
            const g0 = a1 + da * t0
            const g1 = a1 + da * t1
            figures.push({
              key: `proj_sector_${i}`,
              type: 'polygon',
              attrs: {
                coordinates: [
                  p1,
                  { x: p1.x + Math.cos(g0) * radius, y: p1.y + Math.sin(g0) * radius },
                  { x: p1.x + Math.cos(g1) * radius, y: p1.y + Math.sin(g1) * radius }
                ]
              },
              styles: {
                style: 'fill',
                color: alpha(lerpHex(color1, color2, t0), fillOpacity)
              },
              cursor: 'move',
              bounds: {
                x: p1.x - radius,
                y: p1.y - radius,
                width: radius * 2,
                height: radius * 2
              }
            })
          }
        }

        // Closing sector arc at the wedge radius.
        if (da !== 0) {
          const attrs: ArcAttrs = {
            x: p1.x,
            y: p1.y,
            r: radius,
            startAngle: da > 0 ? a1 : a1 + da,
            endAngle: da > 0 ? a1 + da : a1
          }
          figures.push({
            key: 'proj_arc',
            type: 'arc',
            attrs,
            styles: { style: 'solid', size: lineSize, color: lineColor },
            cursor: 'move',
            bounds: { x: p1.x - radius, y: p1.y - radius, width: radius * 2, height: radius * 2 }
          })
        }
      }
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
  })
}

export default projection
