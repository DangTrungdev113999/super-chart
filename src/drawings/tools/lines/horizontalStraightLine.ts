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
 * 'horizontalStraightLine' — TradingView Horizontal Line (catalog id
 * 'horizontalLine'). One anchor; full-width line at its price level with
 * a y-axis pill, optional text label and stats.
 */

export interface HorizStraightLineExtendData extends LineExtendData {}

const horizontalStraightLine: OverlayTemplate<HorizStraightLineExtendData> = {
  name: 'horizontalStraightLine',
  totalStep: 2,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 1) return []

    const [c1] = coordinates
    const ext: HorizStraightLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // ─── Full-width horizontal line ───
    figures.push({
      key: 'hsl_line',
      type: 'line',
      attrs: { coordinates: [{ x: 0, y: c1.y }, { x: bounding.width, y: c1.y }] }
    })

    // ─── Price label at the anchor ───
    const p1Value = points[0]?.value
    if ((ext.showPriceLabels === true || ext.showPriceLabel === true) && p1Value != null) {
      figures.push({
        key: 'hsl_price0',
        type: 'text',
        attrs: {
          x: c1.x,
          y: c1.y - 6,
          text: formatNum(p1Value, precision),
          align: 'left' as CanvasTextAlign,
          baseline: 'bottom' as CanvasTextBaseline
        },
        styles: { color: lineColor, size: 11, weight: 'normal', backgroundColor: 'transparent' },
        ignoreEvent: true
      })
    }

    // ─── Text label (flat over the full pane width) ───
    const spec = labelSpecOf(ext)
    if (spec !== null) {
      pushFlatLabel(figures, 'hsl_label', spec, 0, bounding.width, c1.y, lineColor, lineWidth)
    }

    // ─── Stats ───
    const showStats = ext.alwaysShowStats === true || isActive
    if (showStats && ext.showDistance === true) {
      const statsPos = typeof ext.statsPosition === 'number' ? ext.statsPosition : 2
      let sx = bounding.width * 0.75
      let sy = c1.y - 12
      let sAlign: CanvasTextAlign = 'center'
      let sBaseline: CanvasTextBaseline = 'bottom'
      if (statsPos === 0) {
        sx = 4
        sAlign = 'left'
      } else if (statsPos === 3) {
        sy = c1.y + 12
        sBaseline = 'top'
      }
      figures.push({
        key: 'hsl_stats',
        type: 'text',
        attrs: { x: sx, y: sy, text: `Dist: ${formatNum(bounding.width, 1)}px`, align: sAlign, baseline: sBaseline },
        styles: { color: lineColor, size: 11, weight: 'normal', backgroundColor: 'transparent' },
        ignoreEvent: true
      })
    }

    // ─── Anchor (x is decorative for a full-width line → vertical drag) ───
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
    const ext: HorizStraightLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const pill = buildYAxisPill(coordinates[0].y, overlay.points[0]?.value, lineColor, precision, bounding, yAxis ?? undefined, 'hsl_y0')
    return pill != null ? [pill] : []
  }
}

export default horizontalStraightLine
