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

import { fivePointPatternFigures, priceRatio } from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * 'cypher' — TradingView "Cypher pattern" (5 points: X·A·B·C·D).
 *
 * Identical geometry to the XABCD renderer — the cypher variant only
 * redefines two of the four ratio pills:
 *   ab = |B−A|/|A−X|  on X–B      bc = |C−X|/|A−X| on A–C
 *   cd = |D−C|/|C−B|  on B–D      xd = |D−C|/|X−C| on X–D
 */
const cypher: OverlayTemplate<PatternExtendData> = {
  name: 'cypher',
  totalStep: 6,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(params =>
    fivePointPatternFigures(params, points => ({
      ab: priceRatio(points, 2, 1, 1, 0),
      bc: priceRatio(points, 3, 0, 1, 0),
      cd: priceRatio(points, 4, 3, 3, 2),
      xd: priceRatio(points, 4, 3, 0, 3)
    }))
  )
}

export default cypher
