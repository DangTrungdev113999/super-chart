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
  getArrowCoordinates,
  labelSpecOf,
  lineColorOf,
  lineSizeOf,
  pushVertLabel
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'verticalSegment' — vertical line segment: both anchors share the
 * anchor-0 x (time), and the segment spans between their price levels.
 * `extendData.leftEnd`/`rightEnd` (0|1) add arrowheads at top/bottom.
 */

export interface VertSegmentExtendData extends LineExtendData {}

const verticalSegment: OverlayTemplate<VertSegmentExtendData> = {
  name: 'verticalSegment',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: VertSegmentExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)

    const figures: OverlayFigure[] = []
    const top = Math.min(c1.y, c2.y)
    const bottom = Math.max(c1.y, c2.y)

    figures.push({
      key: 'vs_line',
      type: 'line',
      attrs: { coordinates: [{ x: c1.x, y: top }, { x: c1.x, y: bottom }] },
      styles: { style: 'solid', color: lineColor, size: lineWidth }
    })

    // Arrowheads: leftEnd → top, rightEnd → bottom (kernel vocabulary).
    if (ext.leftEnd === 1) {
      const tip = getArrowCoordinates({ x: c1.x, y: bottom }, { x: c1.x, y: top })
      if (tip.length === 3) {
        figures.push({
          key: 'vs_arrow_top',
          type: 'polygon',
          attrs: { coordinates: tip },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
      }
    }
    if (ext.rightEnd === 1) {
      const tip = getArrowCoordinates({ x: c1.x, y: top }, { x: c1.x, y: bottom })
      if (tip.length === 3) {
        figures.push({
          key: 'vs_arrow_bottom',
          type: 'polygon',
          attrs: { coordinates: tip },
          styles: { style: 'fill', color: lineColor },
          ignoreEvent: true
        })
      }
    }

    // Rotated text label along the segment.
    const spec = labelSpecOf(ext)
    if (spec !== null) {
      pushVertLabel(figures, 'vs_label', spec, c1.x, top, bottom, lineColor, lineWidth)
    }

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      moveDirections: ['vert', 'vert'],
      midPoint: ext.showMiddlePoint === true || ext.showMidpoint === true
    }))

    return figures
  },

  /**
   * Anchor 0 owns the shared x — dragging either anchor's x must keep
   * both timestamps identical so the segment stays vertical.
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
    const ext: VertSegmentExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const d0 = formatDate(overlay.points[0]?.timestamp)
    if (d0 === '') return []
    return [buildXAxisPill(coordinates[0].x, d0, lineColor, 'vs_x0')]
  }
}

export default verticalSegment
