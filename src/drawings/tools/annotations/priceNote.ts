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

import { createAnchorFigures } from '../../interaction/anchors'
import type { TextBoxData } from '../../text/textBox'

import {
  baseTextBoxData,
  commitText,
  liveTextOf,
  openAnnotationEditor,
  pointToCoordinate,
  resolvedTextStyles,
  textEditorHooks,
  type AnnotationTextStyle
} from './common'

/**
 * 'simpleAnnotation' — catalog 'priceNote'. REBUILDS the kernel
 * simpleAnnotation (stem + arrow + text above the point) with real event
 * targets: the kernel version marks every figure ignoreEvent so placed notes
 * can never be selected or dragged, and stores extendData as a raw string —
 * which crashes merge() when a settings patch writes extendData fields.
 * Legacy string/function extendData is still read as the label.
 */
export interface PriceNoteExtendData {
  text?: string
}

const STYLE_KEY = 'textNote'

const STEM_HEIGHT = 50
const ARROW_HALF_WIDTH = 4
const ARROW_HEIGHT = 5

function getNoteStyles (overlay: Overlay<PriceNoteExtendData>): AnnotationTextStyle {
  return resolvedTextStyles(overlay, STYLE_KEY)
}

function getText (overlay: Overlay<PriceNoteExtendData>): string {
  const extendData = overlay.extendData as PriceNoteExtendData | string | ((o: Overlay) => string) | undefined
  if (isString(extendData)) {
    return extendData
  }
  if (isFunction(extendData)) {
    return extendData(overlay)
  }
  return liveTextOf(overlay) ?? extendData?.text ?? ''
}

function getBoxData (overlay: Overlay<PriceNoteExtendData>): TextBoxData {
  const styles = getNoteStyles(overlay)
  return {
    ...baseTextBoxData(getText(overlay), styles),
    horzAlign: 'center',
    vertAlign: 'bottom',
    horzTextAlign: 'center'
  }
}

function openEditor (chart: Chart, overlay: Overlay<PriceNoteExtendData>): void {
  openAnnotationEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    // The label renders at the arrow TIP (pt.y - 63 with baseline 'bottom'),
    // not at the anchor point — without the raised anchor the editor box
    // covers the stem while the caret blinks 60px below the glyphs.
    anchor: () => {
      const c = pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {})
      return { x: c.x, y: c.y - (STEM_HEIGHT + ARROW_HEIGHT + 8) }
    },
    forbidLineBreaks: true,
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const simpleAnnotation: OverlayTemplate<PriceNoteExtendData> = {
  name: 'simpleAnnotation',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    textNote: {
      color: '#FFFFFF',
      fontSize: 12,
      bold: false
    },
    line: {
      color: '#2962FF',
      size: 1,
      style: 'solid'
    },
    polygon: {
      color: '#2962FF',
      style: 'fill'
    }
  },
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const { x, y } = coordinates[0]
    const stemTop = y - 6
    const stemBottom = stemTop - STEM_HEIGHT
    const arrowTip = stemBottom - ARROW_HEIGHT
    const styles = overlay.styles
    const figures: OverlayFigure[] = [
      {
        key: 'stem',
        type: 'line',
        attrs: { coordinates: [{ x, y: stemTop }, { x, y: stemBottom }] },
        styles: styles?.line
      },
      {
        key: 'arrow',
        type: 'polygon',
        attrs: {
          coordinates: [
            { x, y: stemBottom },
            { x: x - ARROW_HALF_WIDTH, y: arrowTip },
            { x: x + ARROW_HALF_WIDTH, y: arrowTip }
          ]
        },
        styles: styles?.polygon
      },
      {
        key: 'label',
        type: 'text',
        attrs: {
          x,
          y: arrowTip - 2,
          text: getText(overlay),
          align: 'center',
          baseline: 'bottom'
        },
        styles: {
          color: getNoteStyles(overlay).color,
          size: getNoteStyles(overlay).fontSize,
          family: getNoteStyles(overlay).fontFamily,
          weight: getNoteStyles(overlay).bold === true ? 'bold' : 'normal',
          style: 'fill'
        },
        bounds: {
          x: x - 40,
          y: arrowTip - 24,
          width: 80,
          height: 26
        }
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
    return figures
  },
  onDrawEnd: ({ overlay, chart }) => {
    const ed = overlay.extendData
    if (isValid(ed) && !isObject(ed)) {
      // Legacy string/function extendData — normalize to the object form so
      // settings commits merge cleanly. Object payloads keep their keys.
      overlay.extendData = { text: getText(overlay) }
      overlay.invalidateFigures()
    }
    openEditor(chart, overlay)
  },
  onDoubleClick: textEditorHooks(openEditor).onDoubleClick
}

export default simpleAnnotation
