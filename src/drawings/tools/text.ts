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

import { createAnchorFigures } from '../interaction/anchors'
import { openOverlayTextEditor } from '../editor/overlayTextEditor'
import type { TextBoxData } from '../text/textBox'
import type { RichTextAttrs, RichTextStyle } from '../figures/richText'

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
  const styles = (overlay.styles?.textNote ?? overlay.styles ?? {}) as TextToolStyle
  return {
    text: extendData.text ?? '',
    fontSize: styles.fontSize ?? 12,
    bold: styles.bold,
    italic: styles.italic,
    fontFamily: styles.fontFamily,
    wordWrapWidth: extendData.wordWrapWidth,
    maxHeight: extendData.maxHeight,
    horzAlign: extendData.horzAlign ?? 'left',
    vertAlign: extendData.vertAlign ?? 'top',
    horzTextAlign: extendData.horzTextAlign,
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
  const styles = (overlay.styles?.textNote ?? overlay.styles ?? {}) as TextToolStyle
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
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered }) => {
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
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_'
    }))
    return figures
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
