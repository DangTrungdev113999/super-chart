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

import type Point from '../../../common/Point'
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import {
  buildXAxisPill,
  formatDate,
  labelSpecOf,
  lineColorOf,
  lineSizeOf,
  pushVertLabel
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'verticalRayLine' — vertical ray: at anchor-0's x, starts at its price
 * and extends in anchor-1's direction to the pane edge.
 */

export interface VertRayExtendData extends LineExtendData {}

const verticalRayLine: OverlayTemplate<VertRayExtendData> = {
  name: 'verticalRayLine',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: VertRayExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)

    const figures: OverlayFigure[] = []

    // Ray: from c1.y toward c2's direction, to the pane edge.
    const endY = c2.y >= c1.y ? bounding.height : 0
    figures.push({
      key: 'vr_line',
      type: 'line',
      attrs: { coordinates: [{ x: c1.x, y: c1.y }, { x: c1.x, y: endY }] },
      styles: { style: 'solid', color: lineColor, size: lineWidth }
    })

    const spec = labelSpecOf(ext)
    if (spec !== null) {
      pushVertLabel(figures, 'vr_label', spec, c1.x, Math.min(c1.y, endY), Math.max(c1.y, endY), lineColor, lineWidth)
    }

    // Anchor 0 draggable both ways; anchor 1 only flips direction → vert-only.
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      moveDirections: ['both', 'vert']
    }))

    return figures
  },

  /**
   * Same shared-x contract as verticalSegment.
   */
  performEventPressedMove: ({ points, performPointIndex, performPoint }) => {
    const other = (performPointIndex === 0 ? points[1] : points[0]) as Partial<Point> | undefined
    if (performPoint.timestamp !== undefined && other !== undefined) {
      other.timestamp = performPoint.timestamp
      other.dataIndex = performPoint.dataIndex
    }
  },

  performEventMoveForDrawing: ({ points, currentStep, performPoint }) => {
    if (currentStep === 2) {
      const p0 = points[0] as Partial<Point> | undefined
      if (p0?.timestamp !== undefined) {
        performPoint.timestamp = p0.timestamp
        performPoint.dataIndex = p0.dataIndex
      }
    }
  },

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) return []
    const ext: VertRayExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const d0 = formatDate(overlay.points[0]?.timestamp)
    if (d0 === '') return []
    return [buildXAxisPill(coordinates[0].x, d0, lineColor, 'vr_x0')]
  }
}

export default verticalRayLine
