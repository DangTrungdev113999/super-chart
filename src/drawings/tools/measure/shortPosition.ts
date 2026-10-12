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
 * 'shortPosition' — TradingView Short Position. Mirror of longPosition:
 * profit zone extends below the entry, stop zone above. Same four
 * TradingView-parity selection handles (entry re-anchor, right-edge width,
 * stop/target level handles on the left edge).
 */
const shortPosition: OverlayTemplate<PositionToolExtendData> = {
  name: 'shortPosition',
  totalStep: 2,
  cullable: false,
  figureCacheDataRev: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: (params) => [
    ...buildPositionFigures(params, 'short'),
    ...buildPositionAnchorFigures(params, 'short')
  ],

  createYAxisFigures: (params) => buildPositionYAxisFigures(params, 'short'),

  performEventPressedMove: function (this: Overlay<PositionToolExtendData>, params) {
    performPositionPressedMove(this, params, 'short')
  }
}

export default shortPosition
