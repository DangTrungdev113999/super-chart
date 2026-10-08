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

import { ELLIOTT_TRIPLE_COMBO_LABELS, elliottWaveFigures } from './elliottCommon'
import { TV_ELLIOTT_GREEN } from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * 'elliottTripleCombo' — "Elliott triple combo wave (WXYZ)" — 7 points
 * per the catalog (TradingView's own tool uses 6). Zigzag polyline with
 * alternating labels 0·W·X·Y·X·Z·X at the default Intermediate degree.
 */
const elliottTripleCombo: OverlayTemplate<PatternExtendData> = {
  name: 'elliottTripleCombo',
  totalStep: 8,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(params =>
    elliottWaveFigures(ELLIOTT_TRIPLE_COMBO_LABELS, params, TV_ELLIOTT_GREEN)
  )
}

export default elliottTripleCombo
