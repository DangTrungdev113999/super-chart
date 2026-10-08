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
  buildXAxisPill,
  formatDate,
  formatNum,
  labelSpecOf,
  lineColorOf,
  lineSizeOf,
  pushVertLabel
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'verticalStraightLine' — TradingView Vertical Line (catalog id
 * 'verticalLine'). One anchor; full-height line at its x position with a
 * date pill, optional rotated text label and a pixel-position readout.
 */

export interface VertStraightLineExtendData extends LineExtendData {}

const verticalStraightLine: OverlayTemplate<VertStraightLineExtendData> = {
  name: 'verticalStraightLine',
  totalStep: 2,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 1) return []

    const [c1] = coordinates
    const ext: VertStraightLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // ─── Full-height vertical line ───
    figures.push({
      key: 'vsl_line',
      type: 'line',
      attrs: { coordinates: [{ x: c1.x, y: 0 }, { x: c1.x, y: bounding.height }] }
    })

    // ─── Text label (rotated along the line) ───
    const spec = labelSpecOf(ext)
    if (spec !== null) {
      pushVertLabel(figures, 'vsl_label', spec, c1.x, 0, bounding.height, lineColor, lineWidth)
    }

    // ─── Stats (pixel position of the line) ───
    const showStats = ext.alwaysShowStats === true || isActive
    if (showStats) {
      figures.push({
        key: 'vsl_stats',
        type: 'text',
        attrs: {
          x: c1.x + 6,
          y: 12,
          text: `X: ${formatNum(c1.x, 0)}px`,
          align: 'left' as CanvasTextAlign,
          baseline: 'top' as CanvasTextBaseline
        },
        styles: { color: lineColor, size: 10, weight: 'normal', backgroundColor: 'transparent' },
        ignoreEvent: true
      })
    }

    // ─── Anchor (y is decorative for a full-height line → horizontal drag) ───
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      moveDirections: ['horz']
    }))

    return figures
  },

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) return []
    const ext: VertStraightLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const d0 = formatDate(overlay.points[0]?.timestamp)
    if (d0 === '') return []
    return [buildXAxisPill(coordinates[0].x, d0, lineColor, 'vsl_x0')]
  }
}

export default verticalStraightLine
