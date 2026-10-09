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

import { patternStrokeOf, TV_LINE_WIDTH, TV_TIME_COLOR } from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * 'sineLine' — TradingView "Sine line" (2 points).
 *
 * Repeating cosine wave through both anchors: half-period `a = |x1−x0|`
 * px and signed swing `s = y1−y0`, so a full cycle spans `2a` and the wave
 * passes exactly through both anchors (`y(x0)=y0`, `y(x0±a)=y1`):
 *   y(x) = y0 + s/2 · (1 − cos(π·(x−p)/a))
 * where `p` is the anchor x normalized into (−2a, 0] — the wave then runs
 * left-to-right across the pane (same tiling as the reference renderer).
 */
const sineLine: OverlayTemplate<PatternExtendData> = {
  name: 'sineLine',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, bounding, overlay, isSelected, isHovered, isTouch }) => {
    const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = patternStrokeOf(overlay, chart, ext, TV_TIME_COLOR, TV_LINE_WIDTH)

    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const [c0, c1] = coordinates
      const a = Math.abs(c1.x - c0.x)
      const swing = c1.y - c0.y

      // TV guards: same-index anchors → no wave; wave fully above/below
      // the pane (plus linewidth slack) → culled.
      const offTop = c0.y < -stroke.size && c1.y < -stroke.size
      const offBottom = c0.y > bounding.height + stroke.size && c1.y > bounding.height + stroke.size
      if (a >= 1e-9 && !offTop && !offBottom) {
        const cycle = 2 * a
        const startX = c0.x > 0
          ? c0.x - Math.ceil(c0.x / cycle) * cycle
          : c0.x + Math.floor(-c0.x / cycle) * cycle
        const step = Math.max(1, a / 30)
        const span = bounding.width - startX + step
        const wave: Coordinate[] = []
        for (let e = 0; e <= span; e += step) {
          wave.push({
            x: startX + e,
            y: c0.y + (swing / 2) * (1 - Math.cos(Math.PI * e / a))
          })
        }
        figures.push({
          key: 'sine_wave',
          type: 'line',
          attrs: { coordinates: wave },
          styles: {
            style: stroke.style,
            color: stroke.color,
            size: stroke.size,
            dashedValue: stroke.dashedValue
          }
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

export default sineLine
