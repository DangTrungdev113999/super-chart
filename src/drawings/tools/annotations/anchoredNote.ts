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
import { isString } from '../../../common/utils/typeChecks'

import { createAnchorFigures } from '../../interaction/anchors'
import type { RichTextAttrs } from '../../figures/richText'
import { getRichTextLayout } from '../../figures/richText'
import type { TextBoxData } from '../../text/textBox'

import {
  baseTextBoxData,
  commitText,
  openAnnotationEditor,
  pointToCoordinate,
  richTextFigureStyle,
  textEditorHooks,
  type AnnotationTextStyle
} from './common'

/**
 * 'anchoredNote' — like 'simpleTag' (note pill) but the tag floats above the
 * anchor with a small stem + dot marking the exact point — the pin look of
 * TradingView's Note marker. One anchor, editor on placement + double-click.
 */

export interface AnchoredNoteExtendData {
  text?: string
}

export interface AnchoredNoteStyle extends AnnotationTextStyle {
  /** Dot + stem color — defaults to the pill background color. */
  markerColor?: string
  /** Dot radius px (default 3). */
  markerRadius?: number
  /** Stem gap between pill bottom and the anchor dot px (default 10). */
  stemGap?: number
}

const STYLE_KEY = 'anchoredNote'
const DEFAULT_STEM_GAP = 10
const DEFAULT_MARKER_RADIUS = 3

function getNoteStyles (overlay: Overlay<AnchoredNoteExtendData>): AnchoredNoteStyle {
  return ((overlay.styles?.[STYLE_KEY] ?? {}) as AnchoredNoteStyle)
}

function getText (overlay: Overlay<AnchoredNoteExtendData>): string {
  const extendData = overlay.extendData as AnchoredNoteExtendData | string | undefined
  if (isString(extendData)) {
    return extendData
  }
  return extendData?.text ?? ''
}

function getBoxData (overlay: Overlay<AnchoredNoteExtendData>): TextBoxData {
  const styles = getNoteStyles(overlay)
  return {
    ...baseTextBoxData(getText(overlay), styles),
    horzAlign: 'center',
    vertAlign: 'bottom',
    horzTextAlign: 'center',
    offsetY: styles.stemGap ?? DEFAULT_STEM_GAP
  }
}

function openEditor (chart: Chart, overlay: Overlay<AnchoredNoteExtendData>): void {
  openAnnotationEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    anchor: () => pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {}),
    forbidLineBreaks: true,
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const anchoredNote: OverlayTemplate<AnchoredNoteExtendData> = {
  name: 'anchoredNote',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    anchoredNote: {
      color: '#FFFFFF',
      backgroundColor: '#2962FF',
      borderColor: '#2962FF',
      borderWidth: 1,
      backgroundRoundRect: 4,
      fontSize: 12,
      boxPaddingHorz: 8,
      boxPaddingVert: 4,
      markerColor: '#2962FF',
      markerRadius: DEFAULT_MARKER_RADIUS,
      stemGap: DEFAULT_STEM_GAP
    }
  },
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered }) => {
    if (coordinates.length === 0) {
      return []
    }
    const point = coordinates[0]
    const styles = getNoteStyles(overlay)
    const data = getBoxData(overlay)
    const attrs: RichTextAttrs = { x: point.x, y: point.y, ...data }
    const layout = getRichTextLayout(attrs)
    const markerColor = styles.markerColor ?? styles.backgroundColor
    const markerRadius = styles.markerRadius ?? DEFAULT_MARKER_RADIUS
    const boxBottom = layout.boxTop + layout.boxHeight
    const figures: OverlayFigure[] = [
      // Stem from pill bottom down to the anchor dot.
      {
        key: 'stem',
        type: 'line',
        attrs: {
          coordinates: [
            { x: point.x, y: boxBottom },
            { x: point.x, y: point.y - markerRadius }
          ]
        },
        styles: { color: markerColor, size: 2 },
        ignoreEvent: true
      },
      // Anchor dot at the exact point.
      {
        key: 'marker',
        type: 'circle',
        attrs: { x: point.x, y: point.y, r: markerRadius },
        styles: { style: 'fill', color: markerColor },
        ignoreEvent: true
      },
      {
        key: 'notePill',
        type: 'richText',
        attrs,
        styles: richTextFigureStyle(styles),
        bounds: {
          x: layout.boxLeft,
          y: layout.boxTop,
          width: layout.boxWidth,
          height: layout.boxHeight
        }
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
  ...textEditorHooks(openEditor)
}

export default anchoredNote
