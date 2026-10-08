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

import { ELLIOTT_DOUBLE_COMBO_LABELS, elliottWaveFigures } from './elliottCommon'
import { TV_ELLIOTT_GREEN } from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * 'elliottDoubleCombo' — "Elliott double combo wave (WXY)" — 6 points per
 * the catalog (TradingView's own tool uses 4; the extra vertices keep the
 * combo lettering: 0·W·X·Y·X·Z). Zigzag polyline with alternating labels
 * at the default Intermediate degree.
 */
const elliottDoubleCombo: OverlayTemplate<PatternExtendData> = {
  name: 'elliottDoubleCombo',
  totalStep: 7,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(params =>
    elliottWaveFigures(ELLIOTT_DOUBLE_COMBO_LABELS, params, TV_ELLIOTT_GREEN)
  )
}

export default elliottDoubleCombo
