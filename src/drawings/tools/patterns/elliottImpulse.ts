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

import type { OverlayTemplate } from '../../../component/Overlay'

import { withPerfPipeline } from '../../interaction/perf'

import { ELLIOTT_IMPULSE_LABELS, elliottWaveFigures } from './elliottCommon'
import { TV_ELLIOTT_BLUE } from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * 'elliottImpulse' — TradingView "Elliott impulse wave (12345)" — 6 points.
 * Zigzag polyline with alternating degree-aware labels (0)–(5) at the
 * default Intermediate degree; `degree`/`showWave` via extendData.
 */
const elliottImpulse: OverlayTemplate<PatternExtendData> = {
  name: 'elliottImpulse',
  totalStep: 7,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(params =>
    elliottWaveFigures(ELLIOTT_IMPULSE_LABELS, params, TV_ELLIOTT_BLUE)
  )
}

export default elliottImpulse
