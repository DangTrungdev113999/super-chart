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

import type { Chart } from '../../../Chart'
import type Coordinate from '../../../common/Coordinate'
import type Point from '../../../common/Point'
import { isNumber, isObject, isString } from '../../../common/utils/typeChecks'
import type { Overlay } from '../../../component/Overlay'

import { openOverlayTextEditor } from '../../editor/overlayTextEditor'
import type { TextBoxData } from '../../text/textBox'
import type { RichTextStyle } from '../../figures/richText'
import type { TextToolExtendData } from '../text'

/**
 * Shared helpers for the annotations tool group — every tool is text-bearing
 * (except flagMark), renders through the 'richText' figure, and edits through
 * the in-place overlay text editor opened on placement + double-click.
 */

/**
 * The floating toolbar and settings dialog write a GENERIC
 * `styles.text.{color,size,weight,style,align}` namespace, while tools keep
 * their own flat style bag (`styles.<toolKey>`) and the text tool family
 * shares `styles.textNote`. Precedence: the generic `styles.text.*`
 * user-override layer WINS (that's where toolbar/schema writes land),
 * then the tool bag, then `textNote` defaults — bags are template defaults
 * a user write must be able to override. It translates text.* to the flat
 * names readers actually consume:
 * size→fontSize, weight→bold, style→italic. `text.style` never lands on a
 * figure (where it would alias the fill/stroke mode field).
 */
export function resolvedTextStyles (overlay: Overlay, styleKey: string): AnnotationTextStyle {
  const styles = overlay.styles as Record<string, Record<string, unknown> | undefined> | undefined
  const generic = styles?.text
  const resolved: AnnotationTextStyle = {
    ...(styles?.textNote as AnnotationTextStyle | undefined),
    ...(styles?.[styleKey] as AnnotationTextStyle | undefined)
  }
  if (generic !== undefined) {
    if (isString(generic.color)) resolved.color = generic.color
    if (isNumber(generic.size)) resolved.fontSize = generic.size
    if (generic.weight === 'bold' || generic.weight === 'normal') resolved.bold = generic.weight === 'bold'
    if (generic.style === 'italic' || generic.style === 'normal') resolved.italic = generic.style === 'italic'
    if (isString(generic.family)) resolved.fontFamily = generic.family
    if (isString(generic.backgroundColor)) resolved.backgroundColor = generic.backgroundColor
  }
  return resolved
}

/**
 * Horizontal text alignment — extendData.horzTextAlign (per-drawing) wins
 * over the generic styles.text.align write.
 */
export function resolvedHorzTextAlign (
  overlay: Overlay,
  fallback: 'left' | 'center' | 'right'
): 'left' | 'center' | 'right' {
  const ed = (overlay.extendData as { horzTextAlign?: unknown } | undefined)?.horzTextAlign
  const generic = (overlay.styles as Record<string, Record<string, unknown> | undefined> | undefined)?.text?.align
  const v = ed ?? generic
  return v === 'left' || v === 'center' || v === 'right' ? v : fallback
}

/** Per-tool style bag read from `overlay.styles.<toolKey>`. */
export interface AnnotationTextStyle extends RichTextStyle {
  fontSize?: number
  bold?: boolean
  italic?: boolean
  fontFamily?: string
  boxPadding?: number
  boxPaddingVert?: number
  boxPaddingHorz?: number
  lineSpacing?: number
}

/**
 * TextBoxData populated from the shared style fields + a text payload —
 * the per-tool callers add their own alignment/geometry fields.
 */
export function baseTextBoxData (text: string | undefined, styles: AnnotationTextStyle): TextBoxData {
  return {
    text: text ?? '',
    fontSize: styles.fontSize ?? 12,
    bold: styles.bold,
    italic: styles.italic,
    fontFamily: styles.fontFamily,
    boxPadding: styles.boxPadding,
    boxPaddingVert: styles.boxPaddingVert,
    boxPaddingHorz: styles.boxPaddingHorz,
    lineSpacing: styles.lineSpacing
  }
}

/** RichTextStyle fields for the figure (bg pill / border / shadow / outline). */
export function richTextFigureStyle (styles: AnnotationTextStyle): RichTextStyle {
  return {
    color: styles.color,
    backgroundColor: styles.backgroundColor,
    borderColor: styles.borderColor,
    borderWidth: styles.borderWidth,
    backgroundRoundRect: styles.backgroundRoundRect,
    boxShadow: styles.boxShadow,
    outlineBorder: styles.outlineBorder
  }
}

/** Convert a stored data point to the pane-local pixel the figure space uses. */
export function pointToCoordinate (chart: Chart, paneId: string, point: Partial<Point>): Coordinate {
  const coordinate = chart.convertToPixel(point, { paneId }) as Partial<Coordinate>
  return { x: coordinate.x ?? 0, y: coordinate.y ?? 0 }
}

/**
 * Commit an edited text payload — merges into extendData so other fields
 * (alignment, direction, cells…) survive. Empty text never reaches here:
 * openOverlayTextEditor removes the overlay itself unless onEmpty overrides.
 */
export function commitText<E extends object> (
  chart: Chart,
  overlay: Overlay<E>,
  value: string,
  patch?: Partial<E>
): void {
  chart.overrideOverlay({
    id: overlay.id,
    paneId: overlay.paneId,
    // Legacy payloads arrive as raw strings/functions — spreading a string
    // would write char-index keys ({'0':'h','1':'i',...}) into extendData.
    extendData: {
      ...(isObject(overlay.extendData) ? overlay.extendData : {}),
      ...patch,
      text: value
    }
  })
}

export interface OpenAnnotationEditorOptions<E extends object> {
  chart: Chart
  overlay: Overlay<E>
  /** Current-value layout data — re-read on every keystroke by the editor. */
  data: () => TextBoxData
  /** Editor anchor in pane pixels — defaults to convertToPixel(points[0]). */
  anchor?: () => Coordinate
  wordWrapEnabled?: boolean
  forbidLineBreaks?: boolean
  allowTab?: boolean
  onCommit: (value: string) => void
  onEmpty?: () => void
}

/**
 * Open the in-place text editor for a text-bearing annotation. Mirrors the
 * text.ts guard: mirror/ghost/locked overlays never open editors — edits
 * happen on the owning chart and propagate through the sync layer.
 */
export function openAnnotationEditor<E extends object> (options: OpenAnnotationEditorOptions<E>): void {
  const { chart, overlay } = options
  if (overlay.ghost || overlay.synced || overlay.lock) {
    return
  }
  openOverlayTextEditor({
    chart,
    overlay,
    data: options.data,
    anchor: options.anchor,
    wordWrapEnabled: options.wordWrapEnabled,
    forbidLineBreaks: options.forbidLineBreaks,
    allowTab: options.allowTab,
    onCommit: options.onCommit,
    onEmpty: options.onEmpty
  })
}

export interface TextEditorHooks<E extends object> {
  onDrawEnd: ({ overlay, chart }: { overlay: Overlay<E>, chart: Chart }) => void
  onDoubleClick: ({ overlay, chart }: { overlay: Overlay<E>, chart: Chart }) => void
}

/**
 * The two template hooks every text tool shares: the editor opens when the
 * placement draw completes (TV parity) and on double-click. onDrawEnd guards
 * on `!isDrawing()` so API-created overlays don't pop the editor.
 */
export function textEditorHooks<E extends object> (
  open: (chart: Chart, overlay: Overlay<E>) => void
): TextEditorHooks<E> {
  return {
    onDrawEnd: ({ overlay, chart }) => {
      if (!overlay.isDrawing()) {
        open(chart, overlay)
      }
    },
    onDoubleClick: ({ overlay, chart }) => {
      open(chart, overlay)
    }
  }
}

/** Re-export so group tools can type their extendData against text.ts. */
export type { TextToolExtendData }
export { liveTextOf } from '../../editor/overlayTextEditor'
