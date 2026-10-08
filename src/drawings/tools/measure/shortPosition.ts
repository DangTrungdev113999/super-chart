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

import type { OverlayTemplate } from '../../../component/Overlay'

import { createAnchorFigures } from '../../interaction/anchors'

import type { PositionToolExtendData } from './positionCommon'
import { buildPositionFigures, buildPositionYAxisFigures } from './positionCommon'

/**
 * 'shortPosition' — TradingView Short Position. Mirror of longPosition:
 * profit zone extends below the entry, stop zone above.
 */
const shortPosition: OverlayTemplate<PositionToolExtendData> = {
  name: 'shortPosition',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: (params) => [
    ...buildPositionFigures(params, 'short'),
    ...createAnchorFigures({
      coordinates: params.coordinates,
      isSelected: params.isSelected,
      isHovered: params.isHovered,
      lock: params.overlay.lock,
      isDrawing: params.overlay.isDrawing(),
      isTouch: params.isTouch,
      pointIndexes: [0]
    })
  ],

  createYAxisFigures: (params) => buildPositionYAxisFigures(params, 'short')
}

export default shortPosition
