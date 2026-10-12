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

import type { Overlay, OverlayTemplate } from '../../../component/Overlay'

import type { PositionToolExtendData } from './positionCommon'
import {
  buildPositionAnchorFigures,
  buildPositionFigures,
  buildPositionYAxisFigures,
  performPositionPressedMove
} from './positionCommon'

/**
 * 'longPosition' — TradingView Long Position. One stored entry point; the
 * take-profit/stop-loss zone geometry lives in extendData
 * (profitHeight/stopHeight/zoneWidth), so the tool works standalone
 * without the kernel's host-side P2/P3/P4 injection. Selected: four
 * TradingView-parity handles — entry re-anchor (left edge), width handle
 * (right edge at entry level), stop + target level handles (left edge).
 */
const longPosition: OverlayTemplate<PositionToolExtendData> = {
  name: 'longPosition',
  totalStep: 2,
  cullable: false,
  figureCacheDataRev: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: (params) => [
    ...buildPositionFigures(params, 'long'),
    ...buildPositionAnchorFigures(params, 'long')
  ],

  createYAxisFigures: (params) => buildPositionYAxisFigures(params, 'long'),

  performEventPressedMove: function (this: Overlay<PositionToolExtendData>, params) {
    performPositionPressedMove(this, params, 'long')
  }
}

export default longPosition
