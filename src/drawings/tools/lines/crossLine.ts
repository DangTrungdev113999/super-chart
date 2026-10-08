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

import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import {
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  lineColorOf,
  lineSizeOf,
  pricePrecisionOf
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'crossLine' — TradingView Cross Line. One anchor; a full-height
 * vertical + full-width horizontal cross through the anchor with date
 * and price pills on both axes.
 */

export interface CrossLineExtendData extends LineExtendData {}

const crossLine: OverlayTemplate<CrossLineExtendData> = {
  name: 'crossLine',
  totalStep: 2,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 1) return []

    const [c1] = coordinates
    const ext: CrossLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)

    const figures: OverlayFigure[] = [
      {
        key: 'cl_v',
        type: 'line',
        attrs: { coordinates: [{ x: c1.x, y: 0 }, { x: c1.x, y: bounding.height }] },
        styles: { style: 'solid', color: lineColor, size: lineWidth }
      },
      {
        key: 'cl_h',
        type: 'line',
        attrs: { coordinates: [{ x: 0, y: c1.y }, { x: bounding.width, y: c1.y }] },
        styles: { style: 'solid', color: lineColor, size: lineWidth }
      }
    ]

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

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) return []
    const ext: CrossLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const d0 = formatDate(overlay.points[0]?.timestamp)
    if (d0 === '') return []
    return [buildXAxisPill(coordinates[0].x, d0, lineColor, 'cl_x0')]
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: CrossLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const pill = buildYAxisPill(coordinates[0].y, overlay.points[0]?.value, lineColor, precision, bounding, yAxis ?? undefined, 'cl_y0')
    return pill != null ? [pill] : []
  }
}

export default crossLine
