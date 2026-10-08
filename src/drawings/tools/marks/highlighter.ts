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

/**
 * 'highlighter' — TradingView Highlighter: a wide, translucent freehand
 * stroke. Same collection mechanics as brush (`freehand` + unlimited
 * `totalStep`, persistent) with a thicker alpha-blended stroke and no
 * smoothing so the highlight tracks the drag tightly.
 */
export interface HighlighterExtendData {
  /** Stroke color (default TV highlight yellow). */
  color?: string
  /** Stroke width in px (default 9). */
  lineWidth?: number
  /** Stroke opacity 0..1 (default 0.4). */
  opacity?: number
}

const DEFAULT_COLOR = '#FFE600'
const DEFAULT_WIDTH = 9
const DEFAULT_OPACITY = 0.4

const highlighter: OverlayTemplate<HighlighterExtendData> = {
  name: 'highlighter',
  totalStep: Number.MAX_SAFE_INTEGER,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  freehand: true,
  freehandMinDistance: 3,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay }) => {
    settleRestoredUnlimited(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: HighlighterExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const color = ext.color ?? DEFAULT_COLOR
    const width = isNumber(ext.lineWidth) && ext.lineWidth > 0 ? ext.lineWidth : DEFAULT_WIDTH
    const opacity = isNumber(ext.opacity) ? Math.min(1, Math.max(0, ext.opacity)) : DEFAULT_OPACITY
    const figures: OverlayFigure[] = [{
      key: 'hl_stroke',
      type: 'line',
      attrs: { coordinates },
      styles: {
        style: 'solid',
        color: alphaColor(color, opacity),
        size: width
      },
      cursor: 'move'
    }]
    return figures
  }),

  onDrawStart: ({ overlay }) => {
    markDrawArmed(overlay)
  }
}

export default highlighter
