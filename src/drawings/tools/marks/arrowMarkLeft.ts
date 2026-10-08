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

import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import { arrowMarkFigure } from './marksCommon'
import type { ArrowMarkExtendData } from './marksCommon'

/**
 * 'arrowMarkLeft' — TradingView Arrow Mark Left: a 1-point filled arrow
 * silhouette whose tip sits on the anchor, body trailing to the right.
 * Single click placement (totalStep 2). Default TV blue.
 */
const arrowMarkLeft: OverlayTemplate<ArrowMarkExtendData> = {
  name: 'arrowMarkLeft',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ coordinates, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 1) {
      return []
    }
    const figures: OverlayFigure[] = [
      arrowMarkFigure('arrow_mark', coordinates[0], 'left', overlay.extendData, '#2962FF')
    ]
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

export default arrowMarkLeft
