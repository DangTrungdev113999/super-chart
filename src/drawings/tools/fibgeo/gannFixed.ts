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

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isNumber, isValid } from '../../../common/utils/typeChecks'

import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  lineChartOf,
  pricePrecisionOf,
  rememberLineChart
} from '../lines/lineCommon'

import {
  FIB_COLORS,
  TRENDLINE_COLOR,
  coordinateToPoint,
  defaultGannArcs,
  defaultGannFanLines,
  defaultGannSquareLevels,
  gannArcFigures,
  gannLevelLineFigures,
  gannP1FanFigures,
  pointToCoordinate,
  readArcs,
  readFanLines,
  readLevels,
  squareHandleFigure
} from './fibGeoCommon'
import type { FibLevelData, GannArcData, GannFanLineData } from './fibGeoCommon'

/**
 * 'gannFixed' — TradingView Gann Square Fixed (`linetoolgannfixed`,
 * display name "Gann square fixed"). One anchor — the start vertex; the
 * square is fixed-size in screen pixels via `extendData.size` and grows
 * into `extendData.direction`'s quadrant (TradingView derives the same
 * geometry from its second, direction-only point: side = 5×drag).
 *
 * Interior is the shared gann-square family render (identical to
 * linetoolganncomplex minus its labels): six fifth-division level lines
 * (0 and 1 are the borders), the {x, y} fanline ratios radiating from the
 * vertex, and the {x, y} quarter-ellipse arc scales with ring-sector
 * fill (TV `arcsBackground`, fill on at transparency 80).
 *
 * A far-corner `squareHandleFigure` ('gf_size') resizes the square on
 * drag: its pull is written back to `extendData.size`/`direction` and the
 * dragged point restored — the slot write is a carrier, not geometry.
 */

export interface GannFixedExtendData {
  /** Square side in screen pixels (default 160). */
  size?: number
  /** Quadrant the square grows into from the vertex (default 'br'). */
  direction?: 'br' | 'bl' | 'tr' | 'tl'
  levels?: FibLevelData[]
  fanlines?: GannFanLineData[]
  arcs?: GannArcData[]
  /** TV `arcsBackground.fillBackground` (default true). */
  fillArcsBackground?: boolean
  /** TV `arcsBackground.transparency` percent, 80 → 0.2 alpha. */
  arcsTransparency?: number
}

const DEFAULT_SIZE = 160

function directionSigns (direction: GannFixedExtendData['direction']): { dx: number, dy: number } {
  switch (direction) {
    case 'bl': return { dx: -1, dy: 1 }
    case 'tr': return { dx: 1, dy: -1 }
    case 'tl': return { dx: -1, dy: -1 }
    default: return { dx: 1, dy: 1 }
  }
}

const gannFixed: OverlayTemplate<GannFixedExtendData> = {
  name: 'gannFixed',
  totalStep: 2,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    line: { color: TRENDLINE_COLOR, size: 1, style: 'solid' },
    text: { color: FIB_COLORS.gray, size: 11 }
  },
  extendData: {
    size: DEFAULT_SIZE,
    direction: 'br',
    levels: defaultGannSquareLevels(),
    fanlines: defaultGannFanLines(),
    arcs: defaultGannArcs(),
    fillArcsBackground: true,
    arcsTransparency: 80
  },
  createPointFigures: withPerfPipeline(({ chart, overlay, coordinates, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    const ext: GannFixedExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    if (coordinates.length >= 1) {
      const start = coordinates[0]
      const size = isNumber(ext.size) ? Math.max(4, ext.size) : DEFAULT_SIZE
      const { dx, dy } = directionSigns(ext.direction)
      const end = { x: start.x + dx * size, y: start.y + dy * size }
      const lineSize = overlay.styles?.line?.size ?? 1
      figures.push(...gannLevelLineFigures(start, end, readLevels(ext, defaultGannSquareLevels()), lineSize, 'gf'))
      figures.push(...gannP1FanFigures(start, start, end, readFanLines(ext, defaultGannFanLines()), lineSize, 'gf'))
      figures.push(...gannArcFigures(
        start,
        end,
        readArcs(ext, defaultGannArcs()),
        ext.fillArcsBackground ?? true,
        ext.arcsTransparency,
        lineSize,
        'gf'
      ))
      // Far-corner resize handle (TV shows a second anchor on the square's
      // drag ray; ours rewrites extendData.size/direction instead).
      if (
        !overlay.isDrawing() && !overlay.lock &&
        ((isSelected ?? false) || (isHovered ?? false))
      ) {
        figures.push(squareHandleFigure('gf_size', end, {
          pointIndex: 0,
          cursor: dx === dy ? 'nwse-resize' : 'nesw-resize',
          isTouch
        }))
      }
    }
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      keyPrefix: 'anchor_'
    }))
    return figures
  }),

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: GannFixedExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = overlay.styles?.line?.color ?? TRENDLINE_COLOR
    const figures: OverlayFigure[] = []
    const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const d0 = formatDate(p0.timestamp)
    if (d0 !== '') {
      figures.push(buildXAxisPill(coordinates[0].x, d0, lineColor, 'gf_x0'))
    }
    // TV axisPoints(): the vertex plus the near point at 1/5 of the side
    // along the square's diagonal direction.
    const size = isNumber(ext.size) ? Math.max(4, ext.size) : DEFAULT_SIZE
    const { dx, dy } = directionSigns(ext.direction)
    const near = coordinateToPoint(chart, overlay.paneId, {
      x: coordinates[0].x + (dx * size) / (5 * Math.SQRT2),
      y: coordinates[0].y + (dy * size) / (5 * Math.SQRT2)
    })
    if (near !== null && isNumber(near.timestamp)) {
      const d1 = formatDate(near.timestamp)
      if (d1 !== '') {
        figures.push(buildXAxisPill(
          coordinates[0].x + (dx * size) / (5 * Math.SQRT2),
          d1,
          lineColor,
          'gf_x1'
        ))
      }
    }
    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: GannFixedExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = overlay.styles?.line?.color ?? TRENDLINE_COLOR
    const precision = pricePrecisionOf(chart, overlay, yAxis)
    const figures: OverlayFigure[] = []
    const pt0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const p0 = buildYAxisPill(coordinates[0].y, pt0.value, lineColor, precision, bounding, yAxis ?? undefined, 'gf_y0')
    if (p0 !== null) {
      figures.push(p0)
    }
    const size = isNumber(ext.size) ? Math.max(4, ext.size) : DEFAULT_SIZE
    const { dx, dy } = directionSigns(ext.direction)
    const nearY = coordinates[0].y + (dy * size) / (5 * Math.SQRT2)
    const near = coordinateToPoint(chart, overlay.paneId, {
      x: coordinates[0].x + (dx * size) / (5 * Math.SQRT2),
      y: nearY
    })
    if (near !== null && isNumber(near.value)) {
      const p1 = buildYAxisPill(nearY, near.value, lineColor, precision, bounding, yAxis ?? undefined, 'gf_y1')
      if (p1 !== null) {
        figures.push(p1)
      }
    }
    return figures
  },

  performEventPressedMove: function (this: Overlay<GannFixedExtendData>, params) {
    // 'gf_size' corner drag → resize the fixed square. The kernel wrote the
    // cursor into the vertex slot — restore it and carry the pull into
    // extendData.size/direction instead.
    if (params.figureKey !== 'gf_size') {
      return
    }
    const prev = params.prevPoints[0]
    const moved = params.points[0]
    if (isValid(moved) && isValid(prev)) {
      moved.timestamp = prev.timestamp
      moved.dataIndex = prev.dataIndex
      moved.value = prev.value
    }
    const event = params.event
    const chart = lineChartOf(this)
    if (event === undefined || chart === undefined || !isValid(prev) || !isNumber(event.x) || !isNumber(event.y)) {
      return
    }
    const vertex = pointToCoordinate(chart, this.paneId, prev)
    if (vertex === null) {
      return
    }
    const ext: GannFixedExtendData = isValid(this.extendData) ? this.extendData : {}
    const sx = event.x - vertex.x
    const sy = event.y - vertex.y
    const side = Math.max(Math.abs(sx), Math.abs(sy))
    if (side >= 4) {
      ext.size = side
    }
    if (sx !== 0 && sy !== 0) {
      ext.direction = sx > 0
        ? (sy > 0 ? 'br' : 'tr')
        : (sy > 0 ? 'bl' : 'tl')
    }
    this.extendData = ext
    this.invalidateFigures()
  }
}

export default gannFixed
