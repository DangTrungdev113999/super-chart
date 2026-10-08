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
 * 'xabcd' — TradingView "XABCD pattern" (5 points: X·A·B·C·D).
 *
 * Polyline through the vertices, shaded [X,A,B] and [B,C,D] triangles,
 * dotted aux lines X–B/A–C/B–D/X–D carrying ratio pills, and vertex pills:
 *   ab = |B−A|/|A−X|  on X–B      bc = |C−B|/|B−A| on A–C
 *   cd = |D−C|/|C−B|  on B–D      xd = |D−A|/|A−X| on X–D
 */
const xabcd: OverlayTemplate<PatternExtendData> = {
  name: 'xabcd',
  totalStep: 6,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(params =>
    fivePointPatternFigures(params, points => ({
      ab: priceRatio(points, 2, 1, 1, 0),
      bc: priceRatio(points, 3, 2, 2, 1),
      cd: priceRatio(points, 4, 3, 3, 2),
      xd: priceRatio(points, 4, 1, 1, 0)
    }))
  )
}

export default xabcd
