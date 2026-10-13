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

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'
import type { Chart } from '../../../Chart'
import { isFunction, isObject, isString, isValid } from '../../../common/utils/typeChecks'
import type Bounding from '../../../common/Bounding'
import type Coordinate from '../../../common/Coordinate'

import { createAnchorFigures } from '../../interaction/anchors'
import type { TextBoxData } from '../../text/textBox'

import {
  annotationBoundingOf,
  annotationChartOf,
  baseTextBoxData,
  commitText,
  createPinNoteFigures,
  captureAnchoredPressStart,
  isAnchoredNote,
  liveTextOf,
  NOTE_TOOLTIP_HORZ_PADDING,
  NOTE_TOOLTIP_LINE_SPACING,
  NOTE_TOOLTIP_VERT_PADDING,
  notePxPoint,
  noteTooltipLayout,
  openAnnotationEditor,
  paneIsDark,
  rememberAnnotationContext,
  resolvedTextStyles,
  revertAnchoredBodyMove,
  revertAnchoredPointWrite,
  writeAnchoredFractions,
  type AnchoredNoteFields,
  type NotePinStyle,
  type TextToolExtendData
} from './common'

/**
 * 'simpleTag' — catalog 'note'. REBUILDS the kernel simpleTag into the
 * TradingView Note: a 24×30 teardrop PIN at the anchor point whose text
 * only shows in a hover/selected tooltip (caret + rounded ~236px box).
 * One anchor; text lives in extendData.text (legacy string extendData is
 * still read as the label). `anchored`/`fx`/`fy` extendData fields pin the
 * note to a fixed pane position (TradingView `anchored` + `fixedPoint`).
 */

export interface NoteExtendData extends TextToolExtendData, AnchoredNoteFields {}

const STYLE_KEY = 'note'
const DEFAULT_ANCHORED = false

function getNoteStyles (overlay: Overlay<NoteExtendData>): NotePinStyle {
  return resolvedTextStyles(overlay, STYLE_KEY) as NotePinStyle
}

function getText (overlay: Overlay<NoteExtendData>): string {
  // Kernel simpleTag stored the label as the raw extendData string, or a
  // function evaluated against the overlay (simpleTag.ts parity).
  const extendData = overlay.extendData as NoteExtendData | string | ((o: Overlay) => string) | undefined
  if (isString(extendData)) {
    return extendData
  }
  if (isFunction(extendData)) {
    return String(extendData(overlay))
  }
  return liveTextOf(overlay) ?? extendData?.text ?? ''
}

/** Live pane-px pin position — fx/fy fractions when anchored. */
function notePoint (overlay: Overlay<NoteExtendData>, chart: Chart, bounding: Bounding | undefined): Coordinate {
  const converted = chart.convertToPixel(overlay.points[0] ?? {}, { paneId: overlay.paneId }) as Partial<Coordinate>
  const dataPx: Coordinate = { x: converted.x ?? 0, y: converted.y ?? 0 }
  const bound = bounding ?? annotationBoundingOf(overlay)
  if (bound === undefined) {
    return dataPx
  }
  return notePxPoint(overlay, bound, dataPx, DEFAULT_ANCHORED)
}

/**
 * Editor box mirroring the rendered tooltip: same fixed width, same wrap
 * and padding — the invisible textarea lands exactly over the box glyphs.
 */
function noteEditorData (overlay: Overlay<NoteExtendData>, chart: Chart): TextBoxData {
  const styles = getNoteStyles(overlay)
  const bound = annotationBoundingOf(overlay) ?? { width: Number.MAX_SAFE_INTEGER, height: 0, left: 0, top: 0, right: 0, bottom: 0 }
  const layout = noteTooltipLayout(
    { ...baseTextBoxData(getText(overlay), styles), text: getText(overlay) },
    notePoint(overlay, chart, bound),
    bound
  )
  return {
    ...baseTextBoxData(getText(overlay), styles),
    wordWrapWidth: layout.textWidth,
    boxWidth: layout.width,
    boxHeight: layout.height,
    boxPaddingHorz: NOTE_TOOLTIP_HORZ_PADDING,
    boxPaddingVert: NOTE_TOOLTIP_VERT_PADDING,
    lineSpacing: NOTE_TOOLTIP_LINE_SPACING,
    horzAlign: 'left',
    vertAlign: 'top',
    horzTextAlign: 'left'
  }
}

/** Editor anchor = the tooltip's top-left corner in pane pixels. */
function noteEditorAnchor (overlay: Overlay<NoteExtendData>, chart: Chart): Coordinate {
  const bound = annotationBoundingOf(overlay) ?? { width: Number.MAX_SAFE_INTEGER, height: 0, left: 0, top: 0, right: 0, bottom: 0 }
  const layout = noteTooltipLayout(
    { ...baseTextBoxData(getText(overlay), getNoteStyles(overlay)), text: getText(overlay) },
    notePoint(overlay, chart, bound),
    bound
  )
  return { x: layout.left, y: layout.top }
}

function openEditor (chart: Chart, overlay: Overlay<NoteExtendData>): void {
  openAnnotationEditor({
    chart,
    overlay,
    data: () => noteEditorData(overlay, chart),
    anchor: () => noteEditorAnchor(overlay, chart),
    wordWrapEnabled: true,
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

/** Persist the pane fraction for an anchored note that hasn't one yet. */
function ensureAnchoredFractions (chart: Chart, overlay: Overlay<NoteExtendData>): void {
  if (!isAnchoredNote(overlay, DEFAULT_ANCHORED)) {
    return
  }
  const ed = overlay.extendData as AnchoredNoteFields | undefined
  const bounding = annotationBoundingOf(overlay)
  if (bounding === undefined || (typeof ed?.fx === 'number' && typeof ed.fy === 'number')) {
    return
  }
  writeAnchoredFractions(overlay, notePoint(overlay, chart, bounding), bounding)
}

const simpleTag: OverlayTemplate<NoteExtendData> = {
  name: 'simpleTag',
  totalStep: 2,
  // The pin + tooltip escape the anchor hull and are fixed-pixel sized —
  // hull-based viewport culling would clip them.
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    note: {
      // TradingView note defaults: white text on the marker-blue tooltip,
      // background drawn, border off, 4px corners.
      color: '#FFFFFF',
      backgroundColor: '#2962FF',
      borderColor: '#2962FF',
      borderWidth: 1,
      backgroundRoundRect: 4,
      fontSize: 14,
      markerColor: '#2962FF',
      drawBackground: true,
      drawBorder: false
    }
  },
  createPointFigures: ({ overlay, coordinates, bounding, chart, isSelected, isHovered, isTouch }) => {
    rememberAnnotationContext(overlay, chart, bounding)
    if (coordinates.length === 0) {
      return []
    }
    const px = notePxPoint(overlay, bounding, coordinates[0], DEFAULT_ANCHORED)
    // Lazily pin: anchored with no fractions yet (API-created, legacy
    // payload, or `anchored` flipped on through settings) — fix the pin at
    // the spot it currently renders instead of silently tracking data.
    if (!overlay.isDrawing() && isAnchoredNote(overlay, DEFAULT_ANCHORED)) {
      const ed = overlay.extendData as AnchoredNoteFields | undefined
      if (!(typeof ed?.fx === 'number' && typeof ed.fy === 'number')) {
        writeAnchoredFractions(overlay, px, bounding)
      }
    }
    const showTooltip = !overlay.isDrawing() &&
      (isSelected === true || isHovered === true || liveTextOf(overlay) !== undefined)
    const figures: OverlayFigure[] = createPinNoteFigures({
      point: px,
      text: getText(overlay),
      styles: getNoteStyles(overlay),
      bounding,
      dark: paneIsDark(chart),
      showTooltip
    })
    figures.push(...createAnchorFigures({
      coordinates: [px],
      isSelected,
      isHovered,
      isTouch,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_'
    }))
    return figures
  },
  // `this` is the overlay — the perform params carry none.
  performEventPressedMove: function (this: Overlay<NoteExtendData>, params) {
    // Anchored pins drag the FIXED point — the stored data anchor is the
    // restore target (TV keeps `fixedPoint` separate from `points()`).
    if (params.event !== undefined && isAnchoredNote(this, DEFAULT_ANCHORED)) {
      const px = { x: params.event.x ?? 0, y: params.event.y ?? 0 }
      revertAnchoredPointWrite(this, params, px, annotationBoundingOf(this))
    }
  },
  performEventBodyMove: function (this: Overlay<NoteExtendData>, params) {
    const chart = annotationChartOf(this)
    if (params.event !== undefined && chart !== undefined && isAnchoredNote(this, DEFAULT_ANCHORED)) {
      revertAnchoredBodyMove(this, chart, params)
    }
  },
  // fx/fy are snapshotted at press start — body-move deltas are totals
  // from press, so each tick applies them against this fixed baseline.
  onPressedMoveStart: ({ overlay }) => {
    captureAnchoredPressStart(overlay)
  },
  onDrawEnd: ({ overlay, chart }) => {
    const ed = overlay.extendData
    if (isValid(ed) && !isObject(ed)) {
      // Legacy string extendData — normalize so anchored/fx/fy fields can
      // merge alongside the text without string-index spread corruption.
      overlay.extendData = { text: getText(overlay) }
    }
    ensureAnchoredFractions(chart, overlay)
    if (!overlay.isDrawing()) {
      openEditor(chart, overlay)
    }
  },
  onDoubleClick: ({ overlay, chart }) => {
    openEditor(chart, overlay)
  }
}

export default simpleTag
