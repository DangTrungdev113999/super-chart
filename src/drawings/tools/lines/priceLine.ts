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
  buildYAxisPill,
  formatNum,
  labelSpecOf,
  lineColorOf,
  lineSizeOf,
  pricePrecisionOf,
  pushFlatLabel
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'priceLine' — TradingView Price Line. One anchor; a horizontal line
 * from the anchor to the right edge with its price ALWAYS rendered
 * inline near the edge (`extendData.showPrice === false` hides it).
 */

export interface PriceLineExtendData extends LineExtendData {}

const priceLine: OverlayTemplate<PriceLineExtendData> = {
  name: 'priceLine',
  totalStep: 2,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 1) return []

    const [c1] = coordinates
    const ext: PriceLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)

    const figures: OverlayFigure[] = []

    // ─── Line: anchor → right edge ───
    figures.push({
      key: 'pl_line',
      type: 'line',
      attrs: { coordinates: [c1, { x: bounding.width, y: c1.y }] },
      styles: { style: 'solid', color: lineColor, size: lineWidth }
    })

    // ─── Always-on price readout near the right edge (default true) ───
    const p1Value = overlay.points[0]?.value
    if (ext.showPrice !== false && p1Value != null) {
      figures.push({
        key: 'pl_price',
        type: 'text',
        attrs: {
          x: bounding.width - 8,
          y: c1.y - lineWidth / 2 - 4,
          text: formatNum(p1Value, precision),
          align: 'right' as CanvasTextAlign,
          baseline: 'bottom' as CanvasTextBaseline
        },
        styles: {
          color: '#ffffff',
          size: 11,
          weight: 'normal',
          backgroundColor: lineColor,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
          borderRadius: 3
        },
        ignoreEvent: true
      })
    }

    // ─── Optional text label across the span ───
    const spec = labelSpecOf(ext)
    if (spec !== null) {
      pushFlatLabel(figures, 'pl_label', spec, c1.x, bounding.width, c1.y, lineColor, lineWidth)
    }

    // ─── Anchor — vertical drag moves the price level ───
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      moveDirections: ['vert']
    }))

    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: PriceLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const pill = buildYAxisPill(coordinates[0].y, overlay.points[0]?.value, lineColor, precision, bounding, yAxis ?? undefined, 'pl_y0')
    return pill != null ? [pill] : []
  }
}

export default priceLine
