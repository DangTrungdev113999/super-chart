/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import {
  applySnap45,
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  getArrowCoordinates,
  lineColorOf,
  lineSizeOf,
  pricePrecisionOf,
  rememberLineChart
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'arrowLine' — TradingView Arrow. Two anchors; a segment pointing to
 * anchor-1 with a filled arrowhead at the tip.
 * `extendData.leftEnd === 1` adds a second arrowhead at anchor-0.
 */

export interface ArrowLineExtendData extends LineExtendData {}

const arrowLine: OverlayTemplate<ArrowLineExtendData> = {
  name: 'arrowLine',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) return []

    rememberLineChart(overlay, chart)

    const [c1, c2] = coordinates
    const ext: ArrowLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)

    const figures: OverlayFigure[] = [
      {
        key: 'al_line',
        type: 'line',
        attrs: { coordinates: [c1, c2] },
        styles: { style: 'solid', color: lineColor, size: lineWidth }
      }
    ]

    // Arrowhead at p2 (the point direction) — always present.
    const tip = getArrowCoordinates(c1, c2)
    if (tip.length === 3) {
      figures.push({
        key: 'al_head',
        type: 'polygon',
        attrs: { coordinates: tip },
        styles: { style: 'fill', color: lineColor },
        ignoreEvent: true
      })
    }
    if (ext.leftEnd === 1) {
      const tail = getArrowCoordinates(c2, c1)
      if (tail.length === 3) {
        figures.push({
          key: 'al_head0',
          type: 'polygon',
          attrs: { coordinates: tail },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
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
  },

  performEventMoveForDrawing: function (this: Overlay<ArrowLineExtendData>, params) {
    // Placing the tip: Shift/align-45 snaps to 45° rays from the tail.
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  },

  performEventPressedMove: function (this: Overlay<ArrowLineExtendData>, params) {
    // Tip drag snaps to 45° rays from the tail anchor.
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  },

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) return []
    const ext: ArrowLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const d0 = formatDate(overlay.points[0]?.timestamp)
    if (d0 === '') return []
    return [buildXAxisPill(coordinates[0].x, d0, lineColor, 'al_x0')]
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: ArrowLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const pill = buildYAxisPill(coordinates[0].y, overlay.points[0]?.value, lineColor, precision, bounding, yAxis ?? undefined, 'al_y0')
    return pill != null ? [pill] : []
  }
}

export default arrowLine
