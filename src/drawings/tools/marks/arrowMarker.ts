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

import { isValid, isNumber } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  ARROW_MARKER_CIRCLE_RADIUS,
  arrowMarkerCoordinates,
  arrowMarkerStrokeWidth
} from './marksCommon'

/**
 * 'arrowMarker' — TradingView Arrow Marker: a 2-point filled arrow drawn
 * from the first anchor to the second (the head tip lands on the drop
 * point). The head length, shaft width and outline all scale with arrow
 * length per the TV profile (head len = 18 under 92px, else 0.25·len
 * clamped to [18, 106] and ≤0.9·len; shaft half-width = 1.22·len/4 of the
 * head). Coincident anchors render a 9px dot — same as TV.
 */
export interface ArrowMarkerExtendData {
  /** Fill/outline color (default TV blue-600). */
  color?: string
  /** Extra uniform scale multiplier applied on top of the TV sizing. */
  size?: number
}

const DEFAULT_COLOR = '#1E53E5'

const arrowMarker: OverlayTemplate<ArrowMarkerExtendData> = {
  name: 'arrowMarker',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ coordinates, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) {
      return []
    }
    const ext: ArrowMarkerExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const color = ext.color ?? DEFAULT_COLOR
    const [start, end] = coordinates

    const figures: OverlayFigure[] = []
    const len = Math.hypot(end.x - start.x, end.y - start.y)
    if (len < 0.5) {
      // Degenerate arrow — TV draws a filled dot.
      figures.push({
        key: 'am_dot',
        type: 'circle',
        attrs: { x: start.x, y: start.y, r: ARROW_MARKER_CIRCLE_RADIUS },
        styles: { style: 'fill', color },
        cursor: 'move'
      })
    } else {
      const scale = isNumber(ext.size) && ext.size > 0 ? ext.size : 1
      const polygon = arrowMarkerCoordinates(start, end)
      if (isValid(polygon)) {
        figures.push({
          key: 'am_polygon',
          type: 'polygon',
          attrs: { coordinates: polygon },
          styles: {
            style: 'stroke_fill',
            color,
            borderColor: color,
            borderSize: arrowMarkerStrokeWidth(len) * scale
          },
          cursor: 'move'
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
  })
}

export default arrowMarker
