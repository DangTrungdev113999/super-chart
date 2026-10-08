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

import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'

import { computeResizeCursor, createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import { buildXAxisPill, buildYAxisPill, formatDate, pricePrecisionOf } from '../lines/lineCommon'

import {
  FIB_COLORS,
  TRENDLINE_COLOR,
  defaultGannEighthLevels,
  gannBoxGridFigures,
  readLevels
} from './fibGeoCommon'
import type { FibLevelData } from './fibGeoCommon'

/**
 * 'gannSquare' — the classic two-point Gann square: a box whose interior
 * carries the 1/8-division grid, the two corner-to-corner diagonals and
 * the four-corner fans to each division on the opposite edges (the shared
 * `gannBoxGridFigures` renderer — the same fan math TradingView's Gann box
 * draws when its fans are enabled). Levels are the editable
 * `extendData.levels` rows (default eighths 1/8…7/8); each level's color
 * drives both its grid cross and its fan rays.
 */

export interface GannSquareExtendData {
  levels?: FibLevelData[]
  /** Interior 1/8 grid crosses (default true). */
  showGrid?: boolean
  /** The two corner-to-corner diagonals (default true). */
  showDiagonals?: boolean
  /** 4-corner fans to every level division (default true). */
  showFans?: boolean
}

const gannSquare: OverlayTemplate<GannSquareExtendData> = {
  name: 'gannSquare',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'solid' },
    text: { color: FIB_COLORS.gray, size: 11 }
  },
  extendData: {
    levels: defaultGannEighthLevels(),
    showGrid: true,
    showDiagonals: true,
    showFans: true
  },
  createPointFigures: withPerfPipeline(({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    const ext: GannSquareExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [c0, c1] = coordinates
      const minX = Math.min(c0.x, c1.x)
      const maxX = Math.max(c0.x, c1.x)
      const minY = Math.min(c0.y, c1.y)
      const maxY = Math.max(c0.y, c1.y)
      if (maxX > minX && maxY > minY) {
        figures.push(...gannBoxGridFigures({
          minX,
          minY,
          maxX,
          maxY,
          levels: readLevels(ext, defaultGannEighthLevels()),
          lineColor: overlay.styles?.line?.color ?? TRENDLINE_COLOR,
          lineSize: overlay.styles?.line?.size ?? 1,
          keyPrefix: 'gs',
          showGrid: ext.showGrid ?? true,
          showDiagonals: ext.showDiagonals ?? true,
          showFans: ext.showFans ?? true
        }))
      }
    }
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isTouch,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_',
      midPoint: true,
      cursors: coordinates.length >= 2
        ? [computeResizeCursor(coordinates[1], coordinates[0]), computeResizeCursor(coordinates[0], coordinates[1])]
        : undefined
    }))
    return figures
  }),

  createXAxisFigures: ({ overlay, coordinates }) => {
    if (coordinates.length < 1) {
      return []
    }
    const lineColor = overlay.styles?.line?.color ?? TRENDLINE_COLOR
    const figures: OverlayFigure[] = []
    const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const d0 = formatDate(p0.timestamp)
    if (d0 !== '') {
      figures.push(buildXAxisPill(coordinates[0].x, d0, lineColor, 'gs_x0'))
    }
    if (coordinates.length >= 2) {
      const p1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
      const d1 = formatDate(p1.timestamp)
      if (d1 !== '') {
        figures.push(buildXAxisPill(coordinates[1].x, d1, lineColor, 'gs_x1'))
      }
    }
    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) {
      return []
    }
    const lineColor = overlay.styles?.line?.color ?? TRENDLINE_COLOR
    const precision = pricePrecisionOf(chart, overlay, yAxis)
    const figures: OverlayFigure[] = []
    const pt0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const p0 = buildYAxisPill(coordinates[0].y, pt0.value, lineColor, precision, bounding, yAxis ?? undefined, 'gs_y0')
    if (p0 !== null) {
      figures.push(p0)
    }
    if (coordinates.length >= 2) {
      const pt1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
      const p1 = buildYAxisPill(coordinates[1].y, pt1.value, lineColor, precision, bounding, yAxis ?? undefined, 'gs_y1')
      if (p1 !== null) {
        figures.push(p1)
      }
    }
    return figures
  }
}

export default gannSquare
