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
import type Bounding from '../../../common/Bounding'
import type Coordinate from '../../../common/Coordinate'
import type Point from '../../../common/Point'
import { hexToRgb } from '../../../common/utils/color'
import { isNumber, isObject, isString, isValid } from '../../../common/utils/typeChecks'
import type { Overlay, OverlayFigure, OverlayPerformEventParams } from '../../../component/Overlay'

import { openOverlayTextEditor } from '../../editor/overlayTextEditor'
import { computeTextBoxLayout, type TextBoxData } from '../../text/textBox'
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

// ═══════════════════════════════════════════════════════════════════
// Annotation context registry
// ═══════════════════════════════════════════════════════════════════

/**
 * The perform- and event hooks receive no `chart`/`bounding` — the line and
 * shape groups solve this with a per-overlay WeakMap written from inside
 * createPointFigures. Same pattern here; bounding is refreshed every frame
 * so size math always uses the live pane rect.
 */
interface AnnotationContext {
  chart: Chart
  bounding: Bounding
}
const annotationContexts = new WeakMap<Overlay, AnnotationContext>()

export function rememberAnnotationContext (overlay: Overlay, chart: Chart, bounding: Bounding): void {
  annotationContexts.set(overlay, { chart, bounding })
}

export function annotationChartOf (overlay: Overlay): Chart | undefined {
  return annotationContexts.get(overlay)?.chart
}

export function annotationBoundingOf (overlay: Overlay): Bounding | undefined {
  return annotationContexts.get(overlay)?.bounding
}

/**
 * Dark-theme detection via the y-axis tick text color luminance — the same
 * heuristic OverlayView uses (a light tick color implies a dark chart).
 * TradingView reads model.dark() directly; no such flag is exposed here.
 */
export function paneIsDark (chart: Chart): boolean {
  const hex = String(chart.getStyles().yAxis.tickText.color)
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex)
  if (match === null) {
    return false
  }
  const luminance = (parseInt(match[1], 16) * 299 + parseInt(match[2], 16) * 587 + parseInt(match[3], 16) * 114) / 1000
  return luminance > 128
}

// ═══════════════════════════════════════════════════════════════════
// Anchored position (TradingView `anchored` property → fixedPoint)
// ═══════════════════════════════════════════════════════════════════

/**
 * extendData fields for anchorable note tools: `anchored` pins the drawing
 * to a screen position (TradingView `isFixed()`), `fx`/`fy` are that
 * position as pane fractions (0..1 — resolution-independent).
 */
export interface AnchoredNoteFields {
  anchored?: boolean
  fx?: number
  fy?: number
}

/** Whether the overlay renders at its fixed fraction point vs data point. */
export function isAnchoredNote (overlay: Overlay, defaultAnchored: boolean): boolean {
  const anchored = (overlay.extendData as AnchoredNoteFields | undefined)?.anchored
  return anchored ?? defaultAnchored
}

/**
 * The pane-px position the note pins to: `fx`/`fy` fractions of the pane
 * when anchored and both were captured, else the converted data point.
 */
export function notePxPoint (
  overlay: Overlay,
  bounding: Bounding,
  dataPx: Coordinate,
  defaultAnchored: boolean
): Coordinate {
  if (!isAnchoredNote(overlay, defaultAnchored)) {
    return dataPx
  }
  const ed = overlay.extendData as AnchoredNoteFields | undefined
  if (isNumber(ed?.fx) && isNumber(ed.fy)) {
    return { x: ed.fx * bounding.width, y: ed.fy * bounding.height }
  }
  return dataPx
}

/**
 * Record `px` as the overlay's fixed fractions. Writes extendData in place —
 * the gesture path already bumped figuresRev, and reassigning through
 * override() mid-drag would replay performEventPressedMove re-entrantly.
 */
export function writeAnchoredFractions (overlay: Overlay, px: Coordinate, bounding: Bounding): void {
  const current = overlay.extendData
  const next: AnchoredNoteFields = { ...(isObject(current) ? current : {}) }
  next.fx = px.x / bounding.width
  next.fy = px.y / bounding.height
  overlay.extendData = next as typeof overlay.extendData
}

/**
 * Anchored notes keep the fixed fraction point and the data point separate
 * (TradingView stores `fixedPoint` apart from `points()`): a point drag
 * must not disturb the stored data anchor while the pin is fixed. The
 * kernel already wrote the cursor into `points[i]` — restore it, then the
 * caller writes fx/fy from the raw event pixel.
 */
export function revertAnchoredPointWrite (
  overlay: Overlay,
  params: OverlayPerformEventParams,
  px: Coordinate,
  bounding: Bounding | undefined
): void {
  const prev = params.prevPoints
  for (let i = 0; i < params.points.length; i++) {
    const prevPoint = prev[i]
    const point = params.points[i]
    if (isValid(prevPoint)) {
      if (isNumber(prevPoint.timestamp)) point.timestamp = prevPoint.timestamp
      if (isNumber(prevPoint.dataIndex)) point.dataIndex = prevPoint.dataIndex
      if (isNumber(prevPoint.value)) point.value = prevPoint.value
    }
  }
  if (bounding !== undefined) {
    writeAnchoredFractions(overlay, px, bounding)
  }
}

/**
 * Same for whole-body drags (`performEventBodyMove`): the kernel shifted
 * every stored point — undo and move the fixed point by the pixel delta.
 */
export function revertAnchoredBodyMove (
  overlay: Overlay,
  chart: Chart,
  params: Omit<OverlayPerformEventParams, 'performPointIndex' | 'performPoint'>
): void {
  const bounding = annotationBoundingOf(overlay)
  const ed = overlay.extendData as AnchoredNoteFields | undefined
  if (bounding === undefined || !isNumber(ed?.fx) || !isNumber(ed.fy)) {
    return
  }
  const before = pointToCoordinate(chart, overlay.paneId, params.prevPoints[0] ?? {})
  const after = pointToCoordinate(chart, overlay.paneId, params.points[0] ?? {})
  const dx = after.x - before.x
  const dy = after.y - before.y
  params.points.forEach((point, i) => {
    const prevPoint = params.prevPoints[i]
    if (isValid(prevPoint)) {
      if (isNumber(prevPoint.timestamp)) point.timestamp = prevPoint.timestamp
      if (isNumber(prevPoint.dataIndex)) point.dataIndex = prevPoint.dataIndex
      if (isNumber(prevPoint.value)) point.value = prevPoint.value
    }
  })
  writeAnchoredFractions(overlay, { x: ed.fx * bounding.width + dx, y: ed.fy * bounding.height + dy }, bounding)
}

// ═══════════════════════════════════════════════════════════════════
// Note pin + hover tooltip (TradingView line-tool-note module 259461)
// ═══════════════════════════════════════════════════════════════════

/** TV marker viewBox — a 24×30 teardrop pin, tip at bottom-center. */
export const NOTE_PIN_WIDTH = 24
export const NOTE_PIN_HEIGHT = 30
/** Tooltip is always ~236px wide (capped by pane width). */
export const NOTE_TOOLTIP_WIDTH = 236
export const NOTE_TOOLTIP_HORZ_PADDING = 12
export const NOTE_TOOLTIP_VERT_PADDING = 12
export const NOTE_TOOLTIP_LINE_SPACING = 5
/** Vertical gap between pin top and tooltip bottom edge. */
export const NOTE_TOOLTIP_VERT_MARGIN = 13
export const NOTE_CARET_WIDTH = 12
export const NOTE_CARET_HEIGHT = 10
/** Caret is suppressed when the pin sits within 24px of a pane edge. */
export const NOTE_NO_CARET_EDGE = 24
/** Tooltip never sits closer than 10px to the pane top/left/right edges. */
export const NOTE_CORRECT_DISTANCE = 10

/**
 * The 24×30 teardrop outline sampled from TradingView's pin SVG path
 * (viewBox "0 0 24 30", the `m12 30 ...` curve set) — 30 points are enough
 * to keep the cubic silhouette smooth at 1× size. Expressed as offsets
 * from the pin's top-left corner.
 */
export const NOTE_PIN_OUTLINE: Coordinate[] = [
  { x: 12.0, y: 30.0 }, { x: 12.9, y: 29.2 }, { x: 15.8, y: 26.5 }, { x: 18.3, y: 23.9 },
  { x: 20.4, y: 21.3 }, { x: 21.9, y: 18.9 }, { x: 23.1, y: 16.5 }, { x: 23.8, y: 14.3 },
  { x: 24.0, y: 12.1 }, { x: 23.7, y: 9.2 }, { x: 22.8, y: 6.6 }, { x: 21.3, y: 4.4 },
  { x: 19.5, y: 2.5 }, { x: 17.2, y: 1.2 }, { x: 14.7, y: 0.3 }, { x: 12.0, y: 0.0 },
  { x: 9.3, y: 0.3 }, { x: 6.8, y: 1.2 }, { x: 4.5, y: 2.5 }, { x: 2.7, y: 4.4 },
  { x: 1.2, y: 6.6 }, { x: 0.3, y: 9.2 }, { x: 0.0, y: 12.1 }, { x: 0.2, y: 14.3 },
  { x: 0.9, y: 16.5 }, { x: 2.1, y: 18.9 }, { x: 3.6, y: 21.3 }, { x: 5.7, y: 23.9 },
  { x: 8.2, y: 26.5 }, { x: 11.1, y: 29.2 }
]

/**
 * Tooltip geometry — a direct port of the pane view's `_updateImpl`:
 * fixed ~236px width, text wrapped at width-24, height from the wrapped
 * line count, centered over the pin with a 13px gap, clamped 10px off the
 * pane edges, flipped below the pin when the top would clip, caret dropped
 * when the pin hugs a pane edge.
 */
export interface NoteTooltipLayout {
  left: number
  top: number
  width: number
  height: number
  /** Text wrap width — width minus horizontal padding. */
  textWidth: number
  /** Which box edge the caret sits on ('bottom' → tooltip above the pin). */
  caretSide: 'top' | 'bottom' | null
  caretApex: Coordinate
  caretBaseLeft: number
  caretBaseRight: number
  caretBaseY: number
}

export function noteTooltipLayout (data: TextBoxData, point: Coordinate, bounding: Bounding): NoteTooltipLayout {
  const width = Math.min(NOTE_TOOLTIP_WIDTH, bounding.width)
  const textWidth = width - 2 * NOTE_TOOLTIP_HORZ_PADDING
  // Line count through the shared box layout — identical wrap/spacing math
  // as the figure and editor (never measured twice).
  const probe = computeTextBoxLayout({
    ...data,
    wordWrapWidth: textWidth,
    boxPaddingHorz: NOTE_TOOLTIP_HORZ_PADDING,
    boxPaddingVert: NOTE_TOOLTIP_VERT_PADDING,
    lineSpacing: NOTE_TOOLTIP_LINE_SPACING
  }, { x: 0, y: 0 })
  const height = probe.boxHeight
  let left = Math.round(point.x - width / 2)
  let top = Math.round(point.y - NOTE_PIN_HEIGHT - height - NOTE_TOOLTIP_VERT_MARGIN)
  const noCaret = point.x < NOTE_NO_CARET_EDGE || point.x + NOTE_NO_CARET_EDGE > bounding.width
  let caretSide: NoteTooltipLayout['caretSide'] = noCaret ? null : 'top'
  if (top < NOTE_CORRECT_DISTANCE) {
    top = Math.round(point.y + NOTE_TOOLTIP_VERT_MARGIN)
  } else if (!noCaret) {
    caretSide = 'bottom'
  }
  if (left < NOTE_CORRECT_DISTANCE) {
    left = NOTE_CORRECT_DISTANCE
  } else if (left + width + NOTE_CORRECT_DISTANCE > bounding.width) {
    left = bounding.width - width - NOTE_CORRECT_DISTANCE
  }
  const caretBaseY = caretSide === 'top' ? top : top + height
  const caretApex: Coordinate = caretSide === 'top'
    ? { x: point.x, y: top - NOTE_CARET_HEIGHT }
    : { x: point.x, y: top + height + NOTE_CARET_HEIGHT }
  return {
    left,
    top,
    width,
    height,
    textWidth,
    caretSide,
    caretApex,
    caretBaseLeft: point.x - NOTE_CARET_WIDTH / 2,
    caretBaseRight: point.x + NOTE_CARET_WIDTH / 2,
    caretBaseY
  }
}

/** Style bag for pin-note tools — the text bag plus TV's marker fields. */
export interface NotePinStyle extends AnnotationTextStyle {
  /** Teardrop pin fill (TV `markerColor`, default '#2962FF'). */
  markerColor?: string
  /** Paint the tooltip background (TV `drawBackground`, default true). */
  drawBackground?: boolean
  /** Stroke the tooltip edge (TV `drawBorder`, default false). */
  drawBorder?: boolean
  /**
   * Tooltip background transparency 0-100 (TV `backgroundTransparency`,
   * default 0 — a hex color with this alpha is applied).
   */
  backgroundTransparency?: number
}

/**
 * Pin + hover tooltip + caret figures shared by the note and anchored-note
 * tools. `point` is the resolved pane-px position (fx/fy or data point).
 * The tooltip shows while hovered or selected — `editing` forces it while
 * an editor session is live so the invisible textarea never floats over an
 * invisible box (TradingView keeps the tooltip up in edit mode).
 */
export function createPinNoteFigures (params: {
  point: Coordinate
  text: string
  styles: NotePinStyle
  bounding: Bounding
  dark: boolean
  showTooltip: boolean
}): OverlayFigure[] {
  const { point, text, styles, bounding, dark, showTooltip } = params
  const pinLeft = point.x - NOTE_PIN_WIDTH / 2
  const pinTop = point.y - NOTE_PIN_HEIGHT
  const markerColor = styles.markerColor ?? '#2962FF'
  const figures: OverlayFigure[] = [
    {
      key: 'pin',
      type: 'polygon',
      attrs: {
        coordinates: NOTE_PIN_OUTLINE.map(p => ({ x: p.x + pinLeft, y: p.y + pinTop }))
      },
      styles: { style: 'fill', color: markerColor },
      pointIndex: 0,
      cursor: 'move',
      bounds: { x: pinLeft, y: pinTop, width: NOTE_PIN_WIDTH, height: NOTE_PIN_HEIGHT }
    },
    // The punched hole of the SVG pin — approximated by an opaque disc in
    // the pane-background tone (canvas figures cannot fill evenodd).
    {
      key: 'pinHole',
      type: 'circle',
      attrs: { x: point.x, y: pinTop + 12, r: 5 },
      styles: { style: 'fill', color: dark ? '#131722' : '#FFFFFF' },
      pointIndex: 0,
      cursor: 'move'
    }
  ]
  if (!showTooltip) {
    return figures
  }
  const drawBackground = styles.drawBackground ?? true
  const drawBorder = styles.drawBorder ?? false
  const backgroundColor = drawBackground
    ? (isNumber(styles.backgroundTransparency) && styles.backgroundTransparency > 0 && isString(styles.backgroundColor)
        ? hexToRgb(styles.backgroundColor, 1 - styles.backgroundTransparency / 100)
        : styles.backgroundColor)
    : undefined
  const layout = noteTooltipLayout({ ...baseTextBoxData(text, styles), text }, point, bounding)
  const attrs = {
    x: layout.left,
    y: layout.top,
    text,
    fontSize: styles.fontSize ?? 14,
    bold: styles.bold,
    italic: styles.italic,
    fontFamily: styles.fontFamily,
    wordWrapWidth: layout.textWidth,
    boxWidth: layout.width,
    boxPaddingHorz: NOTE_TOOLTIP_HORZ_PADDING,
    boxPaddingVert: NOTE_TOOLTIP_VERT_PADDING,
    lineSpacing: NOTE_TOOLTIP_LINE_SPACING,
    horzAlign: 'left' as const,
    vertAlign: 'top' as const,
    horzTextAlign: 'left' as const
  }
  if (layout.caretSide !== null) {
    figures.push({
      key: 'caret',
      type: 'polygon',
      attrs: {
        coordinates: [
          { x: layout.caretBaseLeft, y: layout.caretBaseY },
          layout.caretApex,
          { x: layout.caretBaseRight, y: layout.caretBaseY }
        ]
      },
      styles: { style: 'fill', color: backgroundColor ?? 'transparent' }
    })
  }
  // Tolerance strip between pin and tooltip keeps the overlay hovered while
  // crossing the gap (TV hit-tests the same strip — the module's
  // SpaceBetweenMarkerAndTooltipTolerance = 8).
  const tooltipNearY = layout.top <= pinTop ? layout.top + layout.height : layout.top
  const pinNearY = layout.top <= pinTop ? pinTop : point.y
  figures.push({
    key: 'gapStrip',
    type: 'rect',
    attrs: {
      x: point.x - NOTE_PIN_WIDTH / 2,
      y: Math.min(tooltipNearY, pinNearY),
      width: NOTE_PIN_WIDTH,
      height: Math.max(0, Math.abs(pinNearY - tooltipNearY))
    },
    styles: { style: 'fill', color: 'transparent' },
    cursor: 'move'
  })
  figures.push({
    key: 'noteTooltip',
    type: 'richText',
    attrs,
    styles: {
      color: styles.color,
      backgroundColor,
      borderColor: drawBorder ? styles.borderColor : 'transparent',
      borderWidth: drawBorder ? (styles.borderWidth ?? 1) : 0,
      backgroundRoundRect: styles.backgroundRoundRect ?? 4,
      boxShadow: drawBackground
        ? { color: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)', blur: 4, offsetX: 0, offsetY: 2 }
        : undefined
    },
    bounds: { x: layout.left, y: layout.top, width: layout.width, height: layout.height },
    cursor: 'text'
  })
  return figures
}
