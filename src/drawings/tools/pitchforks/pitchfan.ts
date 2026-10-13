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

import { isArray, isNumber, isValid } from '../../../common/utils/typeChecks'

import { createAnchorFigures } from '../../interaction/anchors'
import { withFigureCache } from '../../interaction/perf'

import {
  addScaled,
  applyTransparency,
  clipPolygonByEdge,
  clipRayToPane,
  EPSILON,
  len,
  mid,
  PITCHFORK_MEDIAN_DEFAULT_COLOR,
  pushLine,
  resolveStroke,
  sub,
  type PitchforkExtendData,
  type PitchforkLevel
} from './pitchforkCommon'

/**
 * 'pitchfan' — TradingView Pitchfan (3 anchors).
 *
 * Geometry mirrors TradingView's line-tool-pitchfan pane view:
 *
 *   M    = mid(P2, P3)            — median end + fan spread origin
 *   d    = (P3 − P2) · 0.5        — half-spread vector
 *
 * The median is a P1→M ray (extendright). Every visible level draws TWO
 * rays from P1 through M ± coeff·d — fanning symmetrically around the
 * median instead of running parallel like a pitchfork's tines. Band fills
 * are the wedges between successive level rays (TV ChannelRenderer quads
 * {P1, curEnd, P1, prevEnd}), on both sides of the median.
 */

/**
 * Level color fallbacks — TradingView's pitchfan defaults:
 * level0 TanOrange300, level1 IguanaGreen300, level2 SkyBlue500,
 * level3 MintyGreen500, level4 SkyBlue500, level5 TvBlue500,
 * level6 GrapesPurple500, level7 BerryPink500, level8 RipeRed300.
 */
const PITCHFAN_FALLBACK_COLORS = [
  '#FF9800', '#4CAF50', '#00BCD4', '#089981', '#00BCD4',
  '#2962FF', '#9C27B0', '#E91E63', '#F7525F'
]

/**
 * TradingView `pitchLevelDefaults` — nine coefficients; only 0.5 and 1.0
 * ship visible.
 */
export const PITCHFAN_DEFAULT_LEVELS: PitchforkLevel[] = [
  { coeff: 0.25, visible: false, color: PITCHFAN_FALLBACK_COLORS[0] },
  { coeff: 0.382, visible: false, color: PITCHFAN_FALLBACK_COLORS[1] },
  { coeff: 0.5, visible: true, color: PITCHFAN_FALLBACK_COLORS[2] },
  { coeff: 0.618, visible: false, color: PITCHFAN_FALLBACK_COLORS[3] },
  { coeff: 0.75, visible: false, color: PITCHFAN_FALLBACK_COLORS[4] },
  { coeff: 1, visible: true, color: PITCHFAN_FALLBACK_COLORS[5] },
  { coeff: 1.5, visible: false, color: PITCHFAN_FALLBACK_COLORS[6] },
  { coeff: 1.75, visible: false, color: PITCHFAN_FALLBACK_COLORS[7] },
  { coeff: 2, visible: false, color: PITCHFAN_FALLBACK_COLORS[8] }
]

/**
 * Wedge between two fan rays sharing the apex P1 — the pane clipped by
 * both ray lines, keeping the sector that contains the opposite ray's
 * endpoint (TV's degenerate ChannelRenderer quad where p1 === p3).
 */
function fanWedge (origin: Coordinate, endA: Coordinate, endB: Coordinate, bounding: { width: number, height: number }): Coordinate[] {
  let poly: Coordinate[] = [
    { x: 0, y: 0 },
    { x: bounding.width, y: 0 },
    { x: bounding.width, y: bounding.height },
    { x: 0, y: bounding.height }
  ]
  poly = clipPolygonByEdge(poly, origin, endA, [endB])
  poly = clipPolygonByEdge(poly, origin, endB, [endA])
  return poly
}

const pitchfan: OverlayTemplate<PitchforkExtendData> = {
  name: 'pitchfan',
  totalStep: 4,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  extendData: {
    levels: PITCHFAN_DEFAULT_LEVELS,
    fillBackground: true,
    transparency: 80
  },
  createPointFigures: withFigureCache(({ overlay, coordinates, bounding, isSelected = false, isHovered = false, isTouch = false }) => {
    const figures: OverlayFigure[] = []
    const count = coordinates.length
    if (count === 0) {
      return figures
    }

    const extendData: PitchforkExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const levels = isArray(extendData.levels) ? extendData.levels : PITCHFAN_DEFAULT_LEVELS
    const fillBackground = extendData.fillBackground !== false
    const transparency = isNumber(extendData.transparency) ? extendData.transparency : 80
    const line = overlay.styles?.line
    const medianStroke = resolveStroke(extendData.median, line, PITCHFORK_MEDIAN_DEFAULT_COLOR)

    const p1 = coordinates[0]
    // TradingView `_medianPoint`: mid(P2,P3) at 3 points, P2 at 2 points.
    const medianEnd = count >= 3 ? mid(coordinates[1], coordinates[2]) : (count === 2 ? coordinates[1] : p1)
    const medianDir = sub(medianEnd, p1)

    const medianVisible = extendData.median?.visible !== false
    if (medianVisible && count >= 2 && len(medianDir) > EPSILON) {
      const seg = clipRayToPane(p1, medianDir, bounding, false)
      if (seg !== null) {
        pushLine(figures, 'median', [seg], medianStroke)
      }
    }

    if (count < 3) {
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

    const p2 = coordinates[1]
    const p3 = coordinates[2]
    // Side segment P2→P3 in the median's stroke (TV `_sideRenderer`).
    pushLine(figures, 'side', [[p2, p3]], medianStroke)
    const half = sub(p3, p2)
    const d = { x: half.x * 0.5, y: half.y * 0.5 }
    if (len(d) <= EPSILON || len(medianDir) <= EPSILON) {
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

    let prevCoeff = 0
    levels.forEach((level, index) => {
      const coeff = level.coeff
      if (level.visible === false || !isNumber(coeff)) {
        return
      }
      const stroke = resolveStroke(level, line, PITCHFAN_FALLBACK_COLORS[index % PITCHFAN_FALLBACK_COLORS.length])
      const upEnd = addScaled(medianEnd, d, coeff)
      const dnEnd = addScaled(medianEnd, d, -coeff)

      if (fillBackground && Math.abs(coeff - prevCoeff) > EPSILON) {
        const upPrev = addScaled(medianEnd, d, prevCoeff)
        const dnPrev = addScaled(medianEnd, d, -prevCoeff)
        const bands: Coordinate[][] = []
        const upBand = fanWedge(p1, upEnd, upPrev, bounding)
        const dnBand = fanWedge(p1, dnEnd, dnPrev, bounding)
        if (upBand.length >= 3) {
          bands.push(upBand)
        }
        if (dnBand.length >= 3) {
          bands.push(dnBand)
        }
        if (bands.length > 0) {
          figures.push({
            key: `pfan_fill_${index}`,
            type: 'polygon',
            attrs: bands.map(bandCoordinates => ({ coordinates: bandCoordinates })),
            styles: { style: 'fill', color: applyTransparency(stroke.color, transparency) }
          })
        }
      }

      const segs: Coordinate[][] = []
      const upSeg = clipRayToPane(p1, sub(upEnd, p1), bounding, false)
      const dnSeg = clipRayToPane(p1, sub(dnEnd, p1), bounding, false)
      if (upSeg !== null) {
        segs.push(upSeg)
      }
      if (dnSeg !== null) {
        segs.push(dnSeg)
      }
      pushLine(figures, `pfan_ray_${index}`, segs, stroke)
      prevCoeff = coeff
    })

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
  })
}

export default pitchfan
