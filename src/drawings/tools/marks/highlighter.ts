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
import { withPerfPipeline } from '../../interaction/perf'

import {
  alphaColor,
  markDrawArmed,
  settleRestoredUnlimited
} from '../shapes/shapeCommon'
import { BRUSH_DEFAULT_SMOOTH, smoothStrokeCoordinates, strokeEndMarkers } from './marksCommon'

/**
 * 'highlighter' — TradingView Highlighter: a wide, translucent freehand
 * stroke (TV default: ripe-red at 80% transparency, 20px). Same
 * collection mechanics as brush (`freehand` + unlimited `totalStep`,
 * persistent) with the same densify + box-blur smoothing and endpoint
 * selection markers.
 */
export interface HighlighterExtendData {
  /** Stroke color (default TV ripe red). */
  color?: string
  /** Stroke width in px (default 20). */
  lineWidth?: number
  /** Stroke opacity 0..1 (default 0.2 — TV 80% transparency). */
  opacity?: number
  /** Box-blur smoothing radius in px (TV fixed 5). */
  smooth?: number
}

const DEFAULT_COLOR = '#F23645'
const DEFAULT_WIDTH = 20
const DEFAULT_OPACITY = 0.2

const highlighter: OverlayTemplate<HighlighterExtendData> = {
  name: 'highlighter',
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
    const ext: HighlighterExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const color = ext.color ?? DEFAULT_COLOR
    const width = isNumber(ext.lineWidth) && ext.lineWidth > 0 ? ext.lineWidth : DEFAULT_WIDTH
    const opacity = isNumber(ext.opacity) ? Math.min(1, Math.max(0, ext.opacity)) : DEFAULT_OPACITY
    const rendered = smoothStrokeCoordinates(
      coordinates,
      isNumber(ext.smooth) && ext.smooth >= 0 ? ext.smooth : BRUSH_DEFAULT_SMOOTH
    )
    const figures: OverlayFigure[] = [{
      key: 'hl_stroke',
      type: 'line',
      attrs: { coordinates: rendered },
      styles: {
        style: 'solid',
        color: alphaColor(color, opacity),
        size: width
      },
      cursor: 'move'
    }]
    figures.push(...strokeEndMarkers('hl', rendered, {
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

export default highlighter
