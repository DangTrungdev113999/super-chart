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

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../component/Overlay'
import type { Chart } from '../../Chart'

import { isArray, isNumber, isObject, isValid } from '../../common/utils/typeChecks'

import { createAnchorFigures } from '../interaction/anchors'
import { shapeHandleFigure, pointToCoordinate } from './shapes/shapeCommon'
import { lineChartOf } from './lines/lineCommon'
import { openOverlayTextEditor } from '../editor/overlayTextEditor'
import { computeTextBoxLayout, type TextBoxData } from '../text/textBox'
import type { RichTextAttrs, RichTextStyle } from '../figures/richText'
import { resolvedHorzTextAlign, resolvedTextStyles, liveTextOf } from './annotations/common'

/**
 * 'text' — the TradingView Text tool: click to place, type immediately
 * (the editor opens on drawEnd), double-click to re-edit. Escape and blur
 * both COMMIT the text; empty text removes the overlay. The box auto-grows
 * with content unless extendData.wordWrapWidth fixes it.
 */

export interface TextToolExtendData {
  text?: string
  /** Fixed wrap width (px) — presence enables word wrapping. */
  wordWrapWidth?: number
  /** Box anchor alignment. */
  horzAlign?: 'left' | 'center' | 'right'
  vertAlign?: 'top' | 'middle' | 'bottom'
  horzTextAlign?: 'left' | 'center' | 'right'
  angle?: number
  boxWidth?: number
  boxHeight?: number
  maxHeight?: number
  rtl?: boolean
}

export interface TextToolStyle extends RichTextStyle {
  fontSize?: number
  bold?: boolean
  italic?: boolean
  fontFamily?: string
  boxPadding?: number
  boxPaddingVert?: number
  boxPaddingHorz?: number
  lineSpacing?: number
}

function getBoxData (overlay: Overlay<TextToolExtendData>): TextBoxData {
  // extendData may be absent at runtime when the overlay was created
  // without a payload — treat as empty rather than crash the figure path.
  const extendData = (overlay.extendData as TextToolExtendData | undefined) ?? {}
  const styles = resolvedTextStyles(overlay, 'textNote') as TextToolStyle
  return {
    text: liveTextOf(overlay) ?? extendData.text ?? '',
    fontSize: styles.fontSize ?? 12,
    bold: styles.bold,
    italic: styles.italic,
    fontFamily: styles.fontFamily,
    wordWrapWidth: extendData.wordWrapWidth,
    maxHeight: extendData.maxHeight,
    horzAlign: extendData.horzAlign ?? 'left',
    vertAlign: extendData.vertAlign ?? 'top',
    horzTextAlign: resolvedHorzTextAlign(overlay, extendData.horzTextAlign ?? 'left'),
    angle: extendData.angle,
    boxWidth: extendData.boxWidth,
    boxHeight: extendData.boxHeight,
    boxPadding: styles.boxPadding,
    boxPaddingVert: styles.boxPaddingVert,
    boxPaddingHorz: styles.boxPaddingHorz,
    lineSpacing: styles.lineSpacing,
    rtl: extendData.rtl
  }
}

function getFigureStyle (overlay: Overlay<TextToolExtendData>): RichTextStyle {
  const styles = resolvedTextStyles(overlay, 'textNote') as TextToolStyle
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

const TEXT_WRAP_HANDLE_KEY = 'text_wrap_handle'
/** Smallest wrap width the handle can leave — keeps the box grabbable. */
const MIN_WRAP_WIDTH_PX = 60

/** Bar index → pane-pixel X, or null when the axis can't convert. */
function indexToPaneX (chart: Chart, paneId: string, dataIndex: number): number | null {
  try {
    const converted = chart.convertToPixel({ dataIndex }, { paneId })
    const c = isArray(converted) ? converted[0] : converted
    return isValid(c) && isNumber(c.x) ? c.x : null
  } catch {
    return null
  }
}

/**
 * Merge a patch into `extendData` in place — the prescribed mutation path
 * for perform* callbacks (positionCommon's writePositionExt pattern).
 */
function writeTextExt (overlay: Overlay<TextToolExtendData>, patch: Partial<TextToolExtendData>): void {
  const base = isObject(overlay.extendData) ? overlay.extendData : {}
  overlay.extendData = { ...base, ...patch }
  overlay.invalidateFigures()
}

function openEditor (chart: Chart, overlay: Overlay<TextToolExtendData>): void {
  // Mirror/ghost/locked overlays never open an editor — editing happens on
  // the owning chart and propagates through the sync layer.
  if (overlay.ghost || overlay.synced || overlay.lock) {
    return
  }
  const wordWrapEnabled = getBoxData(overlay).wordWrapWidth !== undefined
  openOverlayTextEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    wordWrapEnabled,
    forbidLineBreaks: !wordWrapEnabled,
    onCommit: (value) => {
      chart.overrideOverlay({
        id: overlay.id,
        paneId: overlay.paneId,
        extendData: { ...overlay.extendData, text: value }
      })
    }
  })
}

const textNote: OverlayTemplate<TextToolExtendData> = {
  name: 'text',
  totalStep: 2,
  // geometry escapes the anchor hull (control points / fixed-size box)
  // or user-widened boxes — must not be view-culled
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const data = getBoxData(overlay)
    const attrs: RichTextAttrs = {
      x: coordinates[0].x,
      y: coordinates[0].y,
      ...data
    }
    const figures: OverlayFigure[] = [
      {
        key: 'textBox',
        type: 'richText',
        attrs,
        styles: getFigureStyle(overlay)
      }
    ]
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isTouch,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_'
    }))
    // TradingView's wrap-width handle: a square on the box's right edge,
    // shown only when word wrapping is enabled (wordWrapWidth set) —
    // dragging it resizes the wrap width, not the anchor.
    const interactive = !overlay.lock && !overlay.isDrawing() &&
      ((isSelected ?? false) || (isHovered ?? false))
    if (interactive && data.wordWrapWidth !== undefined) {
      const box = computeTextBoxLayout(data, coordinates[0])
      figures.push(shapeHandleFigure(
        TEXT_WRAP_HANDLE_KEY,
        { x: box.boxLeft + box.boxWidth, y: box.boxTop + box.boxHeight / 2 },
        { pointIndex: 0, moveDirection: 'horz', cursor: 'ew-resize', isTouch }
      ))
    }
    return figures
  },
  // Wrap-handle drags claim pointIndex 0 with 'horz' constraint: the kernel
  // writes the cursor's dataIndex into points[0]. Restore the anchor and
  // store the pointer's px distance from the box's left edge instead —
  // the positionCommon `pos_width_handle` pattern.
  performEventPressedMove: function (this: Overlay<TextToolExtendData>, params) {
    if (params.figureKey !== TEXT_WRAP_HANDLE_KEY) {
      return
    }
    const chart = lineChartOf(this)
    const ext = (this.extendData as TextToolExtendData | undefined) ?? {}
    const moved = params.points[0]
    const prev = params.prevPoints[0]
    if (chart === undefined || ext.wordWrapWidth === undefined) {
      return
    }
    const cursorIndex = isValid(moved) ? moved.dataIndex : undefined
    if (isValid(moved) && isValid(prev)) {
      moved.timestamp = prev.timestamp
      moved.dataIndex = prev.dataIndex
      moved.value = prev.value
    }
    const prevPx = isValid(prev) ? pointToCoordinate(chart, this.paneId, prev) : null
    const cursorX = isNumber(cursorIndex) ? indexToPaneX(chart, this.paneId, cursorIndex) : null
    if (prevPx === null || cursorX === null) {
      return
    }
    const box = computeTextBoxLayout(getBoxData(this), prevPx)
    writeTextExt(this, {
      wordWrapWidth: Math.max(cursorX - box.boxLeft, MIN_WRAP_WIDTH_PX)
    })
  },
  onDrawEnd: ({ overlay, chart }) => {
    // Placing a text tool drops straight into editing (TV parity) — but
    // only for locally drawn, completed overlays.
    if (!overlay.isDrawing()) {
      openEditor(chart, overlay)
    }
  },
  onDoubleClick: ({ overlay, chart }) => {
    openEditor(chart, overlay)
  }
}

export default textNote
