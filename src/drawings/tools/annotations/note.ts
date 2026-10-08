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
  richTextFigureStyle,
  textEditorHooks,
  type AnnotationTextStyle
} from './common'

/**
 * 'simpleTag' — catalog 'note'. REBUILDS the kernel simpleTag as a
 * one-anchor short-label note: a background pill centered on the clicked
 * point. Text lives in extendData.text (legacy string extendData is read
 * as the label for backward compatibility) and is edited in place — the
 * editor opens on placement and on double-click.
 */

export interface NoteExtendData {
  text?: string
}

const STYLE_KEY = 'note'

function getNoteStyles (overlay: Overlay<NoteExtendData>): AnnotationTextStyle {
  return ((overlay.styles?.[STYLE_KEY] ?? {}) as AnnotationTextStyle)
}

function getText (overlay: Overlay<NoteExtendData>): string {
  // Kernel simpleTag stored the label as the raw extendData string.
  const extendData = overlay.extendData as NoteExtendData | string | undefined
  if (isString(extendData)) {
    return extendData
  }
  return extendData?.text ?? ''
}

function getBoxData (overlay: Overlay<NoteExtendData>): TextBoxData {
  const styles = getNoteStyles(overlay)
  return {
    ...baseTextBoxData(getText(overlay), styles),
    horzAlign: 'center',
    vertAlign: 'middle',
    horzTextAlign: 'center'
  }
}

function openEditor (chart: Chart, overlay: Overlay<NoteExtendData>): void {
  openAnnotationEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    forbidLineBreaks: true,
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const simpleTag: OverlayTemplate<NoteExtendData> = {
  name: 'simpleTag',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    note: {
      color: '#FFFFFF',
      backgroundColor: '#2962FF',
      borderColor: '#2962FF',
      borderWidth: 1,
      backgroundRoundRect: 4,
      fontSize: 12,
      boxPaddingHorz: 8,
      boxPaddingVert: 4
    }
  },
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
    const layout = getRichTextLayout(attrs)
    const figures: OverlayFigure[] = [
      {
        key: 'notePill',
        type: 'richText',
        attrs,
        styles: richTextFigureStyle(getNoteStyles(overlay)),
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

export default simpleTag
