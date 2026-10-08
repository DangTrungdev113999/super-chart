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

import type Coordinate from '../../../common/Coordinate'
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  lineStyleOverrides,
  markDrawArmed,
  rememberShapeChart,
  settleRestoredUnlimited
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'path' — TradingView Path: an unlimited-point open polyline (click to
 * append, double-click to finish — the kernel's dblclick path
 * force-completes and cancels degenerate < 2-point strokes). The reference
 * consumer split drawing vs. completed overlays into two templates and
 * finished via a DOM event; here the kernel handles both natively and
 * {@link settleRestoredUnlimited} rescues restored overlays out of the
 * drawing-progress slot.
 *
 * `extendData.endArrow` (default true, reference parity) draws a filled
 * arrowhead at the last point, scaled with the line width.
 */

/** Filled triangle arrowhead at `tip`, sized from the stroke width. */
function pathArrow (from: Coordinate, tip: Coordinate, lineWidth: number): Coordinate[] | null {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) {
    return null
  }
  const ux = dx / len
  const uy = dy / len
  // Consumer reference proportions: length 10 + 2·w, half-spread 5 + w.
  const arrowLength = 10 + lineWidth * 2
  const arrowWidth = 5 + lineWidth
  const bx = tip.x - ux * arrowLength
  const by = tip.y - uy * arrowLength
  return [
    { x: bx - uy * arrowWidth, y: by + ux * arrowWidth },
    tip,
    { x: bx + uy * arrowWidth, y: by - ux * arrowWidth }
  ]
}

const path: OverlayTemplate<ShapeExtendData> = {
  name: 'path',
  totalStep: Number.MAX_SAFE_INTEGER,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    rememberShapeChart(overlay, chart)
    settleRestoredUnlimited(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = lineStyleOverrides(overlay, chart, {
      lineColor: ext.color ?? ext.lineColor,
      lineWidth: ext.lineWidth,
      lineStyle: ext.lineStyle
    })

    const figures: OverlayFigure[] = [{
      key: 'path_line',
      type: 'line',
      attrs: { coordinates },
      styles: {
        style: stroke.style,
        color: stroke.color,
        size: stroke.size,
        dashedValue: stroke.dashedValue
      }
    }]

    if (ext.endArrow !== false) {
      const arrow = pathArrow(coordinates[coordinates.length - 2], coordinates[coordinates.length - 1], stroke.size)
      if (arrow !== null) {
        figures.push({
          key: 'path_arrow',
          type: 'polygon',
          attrs: { coordinates: arrow },
          styles: { style: 'fill', color: stroke.color },
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
  }),

  // Marks the overlay as a live draw so a restored overlay sharing the
  // same name is still recognized as settleable (see shapeCommon).
  onDrawStart: ({ overlay }) => {
    markDrawArmed(overlay)
  }
}

export default path
