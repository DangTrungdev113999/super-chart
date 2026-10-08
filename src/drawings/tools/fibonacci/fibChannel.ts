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

import { isNumber } from '../../../common/utils/typeChecks'
import type Coordinate from '../../../common/Coordinate'

import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { getLinearYFromCoordinates } from '../../../extension/figure/line'

import { createAnchorFigures } from '../../interaction/anchors'

import {
  type FibExtendData,
  type FibLevel,
  FIB_EXTENSION_LEVELS,
  FIB_TREND_COLOR,
  FIB_TREND_DASH,
  FIB_FILL_ALPHA,
  FIB_LABEL_SIZE,
  getFibLevels,
  getFillBetween,
  sortedVisibleLevels,
  getPricePrecision,
  formatFibPrice,
  fibLevelText,
  fibAlphaColor
} from './fibCommon'

/**
 * 'fibChannel' — 3 anchors: P1→P2 is the baseline, P3 sets the channel
 * width. Level k draws a line parallel to the baseline, offset by
 * k × channel width. Offsets are computed in value space when point
 * values/indices exist (log-axis safe); otherwise as a constant vertical
 * pixel offset at P3 — which is exactly parallel for linear axes.
 *
 * Levels contract: `extendData.fib.levels` (whole-array {visible, coeff,
 * color, label?}); flags: `fib.fillBetween`, `showTrend`, `extendLeft`,
 * `extendRight`.
 */
export interface FibChannelExtendData extends FibExtendData {}

/** Extend a segment's ends to the pane edges along its own direction. */
function extendSegment (start: Coordinate, end: Coordinate, extendLeft: boolean, extendRight: boolean, width: number): [Coordinate, Coordinate] {
  let s = start
  let e = end
  if (start.x === end.x) {
    return [s, e]
  }
  if (extendLeft) {
    const x = start.x < end.x ? 0 : width
    s = { x, y: getLinearYFromCoordinates(start, end, { x, y: start.y }) }
  }
  if (extendRight) {
    const x = start.x < end.x ? width : 0
    e = { x, y: getLinearYFromCoordinates(start, end, { x, y: end.y }) }
  }
  return [s, e]
}

const fibChannel: OverlayTemplate<FibChannelExtendData> = {
  name: 'fibChannel',
  totalStep: 4,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered }) => {
    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      return figures
    }

    const extendData = (overlay.extendData as FibChannelExtendData | undefined) ?? {}
    const levels = sortedVisibleLevels(getFibLevels(extendData, FIB_EXTENSION_LEVELS))
    const precision = getPricePrecision(chart, overlay, yAxis)
    const lineSize = overlay.styles?.line?.size ?? 1
    const labelSize = overlay.styles?.text?.size ?? FIB_LABEL_SIZE

    const c1 = coordinates[0]
    const c2 = coordinates[1]
    const c3 = coordinates[2]
    const extendLeft = extendData.extendLeft === true
    const extendRight = extendData.extendRight === true

    // Dashed baseline P1→P2 (extended with the channel when enabled).
    if (extendData.showTrend !== false) {
      const [bs, be] = extendSegment(c1, c2, extendLeft, extendRight, bounding.width)
      figures.push({
        key: 'trend',
        type: 'line',
        attrs: { coordinates: [bs, be] },
        styles: { style: 'dashed', color: FIB_TREND_COLOR, size: lineSize, dashedValue: FIB_TREND_DASH }
      })
    }

    if (coordinates.length < 3) {
      figures.push(...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isDrawing: overlay.isDrawing(),
        lock: overlay.lock,
        keyPrefix: 'anchor_'
      }))
      return figures
    }

    // Channel width in value space: signed distance between P3's value and
    // the baseline value at P3's index.
    const i1 = overlay.points[0]?.dataIndex
    const i2 = overlay.points[1]?.dataIndex
    const i3 = overlay.points[2]?.dataIndex
    const v1 = overlay.points[0]?.value
    const v2 = overlay.points[1]?.value
    const v3 = overlay.points[2]?.value
    const hasValues =
      isNumber(i1) && isNumber(i2) && isNumber(i3) && i2 !== i1 &&
      isNumber(v1) && isNumber(v2) && isNumber(v3)
    const useValue = hasValues && yAxis !== null

    // Fallback: vertical pixel offset of P3 above/below the baseline.
    const offPx = c2.x !== c1.x
      ? c3.y - getLinearYFromCoordinates(c1, c2, { x: c3.x, y: c3.y })
      : c3.y - c1.y

    const deltaV = hasValues
      ? v3 - (v1 + (v2 - v1) * ((i3 - i1) / (i2 - i1)))
      : 0

    interface LevelLine { level: FibLevel, start: Coordinate, end: Coordinate, endValue?: number }
    const levelLines: LevelLine[] = levels.map(level => {
      const start: Coordinate = useValue
        ? { x: c1.x, y: yAxis.convertToPixel(v1 + level.coeff * deltaV) }
        : { x: c1.x, y: c1.y + level.coeff * offPx }
      const end: Coordinate = useValue
        ? { x: c2.x, y: yAxis.convertToPixel(v2 + level.coeff * deltaV) }
        : { x: c2.x, y: c2.y + level.coeff * offPx }
      const [s, e] = extendSegment(start, end, extendLeft, extendRight, bounding.width)
      return {
        level,
        start: s,
        end: e,
        endValue: useValue ? v2 + level.coeff * deltaV : undefined
      }
    })

    // Fill parallelograms between adjacent level lines.
    if (getFillBetween(extendData)) {
      for (let i = 0; i < levelLines.length - 1; i++) {
        const a = levelLines[i]
        const b = levelLines[i + 1]
        figures.push({
          key: `fill_${i}`,
          type: 'polygon',
          attrs: {
            coordinates: [a.start, a.end, b.end, b.start]
          },
          styles: { style: 'fill', color: fibAlphaColor(levels[i].color, FIB_FILL_ALPHA) },
          ignoreEvent: true
        })
      }
    }

    // Level lines + labels at the right end of each line.
    levelLines.forEach((line, index) => {
      figures.push({
        key: `level_${index}`,
        type: 'line',
        attrs: { coordinates: [line.start, line.end] },
        styles: { color: line.level.color, size: lineSize }
      })

      const priceText = line.endValue !== undefined
        ? formatFibPrice(chart, line.endValue, precision)
        : undefined
      figures.push({
        key: `levelLabel_${index}`,
        type: 'text',
        attrs: {
          x: line.end.x - 4,
          y: line.end.y,
          text: fibLevelText(line.level, priceText),
          align: 'right',
          baseline: 'bottom'
        },
        styles: { color: line.level.color, size: labelSize, backgroundColor: 'transparent' },
        ignoreEvent: true
      })
    })

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_'
    }))
    return figures
  }
}

export default fibChannel
