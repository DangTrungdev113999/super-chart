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

import { registerFigure } from '../extension/figure/index'
import richTextFigure from './figures/richText'

// The 'richText' figure registers at barrel import — tools referencing it
// always resolve after `import 'super-chart'`.
registerFigure(richTextFigure)

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

// ─── DOM layer (DP-1) ────────────────────────────────────────────────────────
export { getPaneDomLayer } from './dom/domLayer'
export type { PaneDomLayer, DomLayerMountOptions } from './dom/domLayer'

// ─── Text engine (DP-2) ──────────────────────────────────────────────────────
export { createTextWidthCache, measureText, getMinTextMetrics } from './text/measure'
export type { TextWidthCache, MinTextMetrics } from './text/measure'
export { wordWrap } from './text/wordWrap'
export type { WrappedLine } from './text/wordWrap'
export { getCaretPosition, getSelectionRects } from './text/textLayout'
export type {
  CaretPosition,
  SelectionRect,
  SelectionRectsOptions,
  TextAlignOption,
  TextLayoutOptions
} from './text/textLayout'

// ─── Text editor (DP-3) ──────────────────────────────────────────────────────
export { createTextEditorSession } from './editor/textEditor'
export type {
  TextEditorSession,
  TextEditorSessionOptions,
  TextEditorCloseReason,
  TextEditorInfo,
  TextEditorLayout
} from './editor/textEditor'
export { getEditorLetterSpacing, normalizedDevicePixelRatio } from './editor/letterSpacing'
export { openOverlayTextEditor } from './editor/overlayTextEditor'
export type { OverlayTextEditorOptions } from './editor/overlayTextEditor'

// ─── Text box layout + richText figure ───────────────────────────────────────
export {
  computeTextBoxLayout,
  textBoxFont,
  textBoxDataEqual,
  CHART_FONT_FAMILY
} from './text/textBox'
export type {
  TextBoxData,
  TextBoxLayout,
  TextBoxLinesInfo,
  TextBoxHorzAlign,
  TextBoxVertAlign
} from './text/textBox'
export { createCachedWordWrap } from './text/wordWrapCached'
export type { WordWrapFn } from './text/wordWrapCached'
export { getRichTextLayout, drawRichText, checkCoordinateOnRichText } from './figures/richText'
export type { RichTextAttrs, RichTextStyle } from './figures/richText'

// ─── Tool templates ──────────────────────────────────────────────────────────
export { default as textNoteTool } from './tools/text'
export type { TextToolExtendData, TextToolStyle } from './tools/text'
