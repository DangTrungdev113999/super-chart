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

// ─── Shared drawing state ────────────────────────────────────────────────────
export type { DrawingCommonState, DrawingExtendData } from './types'
export { getCommonState, isVisibleOnInterval } from './types'

// ─── Interaction contract ────────────────────────────────────────────────────
export {
  ANCHOR_KEY_PREFIX,
  ANCHOR_MID_KEY,
  ANCHOR_HALF_MOUSE,
  ANCHOR_HALF_TOUCH,
  createAnchorFigures,
  createSelectionOutlineFigures,
  computeResizeCursor
} from './interaction/anchors'
export type { AnchorFiguresParams, AnchorFigureStyle } from './interaction/anchors'

export {
  getDrawingInteractionState,
  setAlign45Enabled,
  isAlign45Enabled,
  isSnap45Active,
  snap45Coordinate
} from './interaction/snap45'
export type { DrawingInteractionState } from './interaction/snap45'

export { bindDrawingKeyboard } from './interaction/keyboard'
export type { DrawingKeyboardHandlers, DrawingKeyboardOptions } from './interaction/keyboard'

export {
  withFigureCache,
  withViewportCull,
  withPerfPipeline
} from './interaction/perf'
export type { FigureCacheOptions, ViewportCullOptions } from './interaction/perf'
