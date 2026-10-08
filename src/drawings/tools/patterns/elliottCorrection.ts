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

import { ELLIOTT_CORRECTION_LABELS, elliottWaveFigures } from './elliottCommon'
import { TV_ELLIOTT_BLUE } from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * 'elliottCorrection' — TradingView "Elliott correction wave (ABC)" —
 * 4 points. Zigzag polyline with alternating (0)·(A)·(B)·(C) labels at
 * the default Intermediate degree.
 */
const elliottCorrection: OverlayTemplate<PatternExtendData> = {
  name: 'elliottCorrection',
  totalStep: 5,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(params =>
    elliottWaveFigures(ELLIOTT_CORRECTION_LABELS, params, TV_ELLIOTT_BLUE)
  )
}

export default elliottCorrection
