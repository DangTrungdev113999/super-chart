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

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { withPerfPipeline } from '../../interaction/perf'

import {
  lineStyleOverrides,
  markDrawArmed,
  settleRestoredUnlimited
} from '../shapes/shapeCommon'
import { BRUSH_DEFAULT_SMOOTH, smoothStrokeCoordinates, strokeEndMarkers } from './marksCommon'

/**
 * 'brush' — TradingView Brush: a freehand stroke collected for the whole
 * drag (`freehand` + unlimited `totalStep`). The rendered polyline is
 * densified + box-blurred at radius `extendData.smooth` (default 5, TV
 * parity) and finished strokes show first/last endpoint selection
 * markers. Unlike the measure/ ruler it is PERSISTENT, so
 * {@link settleRestoredUnlimited} rescues restored overlays out of the
 * drawing-progress slot. The stroke itself is the drag surface.
 */
export interface BrushExtendData {
  /** Stroke color (kernel/consumer spelling). */
  color?: string
  lineColor?: string
  lineWidth?: number
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  /** Box-blur smoothing radius in px (TV `smooth`, default 5; 0 = raw). */
  smooth?: number
}

const brush: OverlayTemplate<BrushExtendData> = {
  name: 'brush',
  totalStep: Number.MAX_SAFE_INTEGER,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  freehand: true,
  freehandMinDistance: 2,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    settleRestoredUnlimited(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: BrushExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = lineStyleOverrides(overlay, chart, {
      lineColor: ext.color ?? ext.lineColor,
      lineWidth: ext.lineWidth,
      lineStyle: ext.lineStyle
    })
    const rendered = smoothStrokeCoordinates(
      coordinates,
      isNumber(ext.smooth) && ext.smooth >= 0 ? ext.smooth : BRUSH_DEFAULT_SMOOTH
    )
    const figures: OverlayFigure[] = [{
      key: 'brush_stroke',
      type: 'line',
      attrs: { coordinates: rendered },
      styles: {
        style: stroke.style,
        color: stroke.color,
        size: stroke.size,
        dashedValue: stroke.dashedValue
      },
      cursor: 'move'
    }]
    figures.push(...strokeEndMarkers('brush', rendered, {
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch
    }))
    return figures
  }),

  onDrawStart: ({ overlay }) => {
    markDrawArmed(overlay)
  }
}

export default brush
