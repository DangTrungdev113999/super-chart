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

import type { Chart } from '../../Chart'
import type Coordinate from '../../common/Coordinate'
import type { Overlay } from '../../component/Overlay'

import { computeTextBoxLayout, type TextBoxData } from '../text/textBox'
import { createTextEditorSession, type TextEditorLayout, type TextEditorSession } from './textEditor'

/**
 * Bridge between an overlay's text payload and the in-place editor. The
 * editor's layout() re-runs computeTextBoxLayout for the live value with
 * the SAME data the figure paints from — the invisible textarea therefore
 * always lands exactly over the rendered text.
 */

export interface OverlayTextEditorOptions {
  chart: Chart
  overlay: Overlay
  /**
   * Text + box geometry for the CURRENT overlay value. Called on every
   * keystroke — read fresh extendData/styles each time.
   */
  data: () => TextBoxData
  /**
   * Pane-local anchor point. Defaults to convertToPixel(points[0]).
   */
  anchor?: () => Coordinate
  paneId?: string
  wordWrapEnabled?: boolean
  forbidLineBreaks?: boolean
  maxLength?: number
  selectionColor?: string
  caretColor?: string
  /** Commit a non-empty final value (e.g. override extendData.text). */
  onCommit: (value: string) => void
  /** Final value trimmed empty — default removes the overlay. */
  onEmpty?: () => void
}

export function openOverlayTextEditor (options: OverlayTextEditorOptions): TextEditorSession {
  const { chart, overlay } = options
  const paneId = options.paneId ?? overlay.paneId
  const anchor = options.anchor ?? (() => {
    const coordinate = chart.convertToPixel(overlay.points[0] ?? {}, { paneId }) as Partial<Coordinate>
    return { x: coordinate.x ?? 0, y: coordinate.y ?? 0 }
  })

  return createTextEditorSession({
    chart,
    paneId,
    value: options.data().text,
    maxLength: options.maxLength,
    forbidLineBreaks: options.forbidLineBreaks,
    wordWrapEnabled: options.wordWrapEnabled,
    selectionColor: options.selectionColor,
    caretColor: options.caretColor,
    layout: (value: string): TextEditorLayout => {
      const box = computeTextBoxLayout(
        { ...options.data(), text: value },
        anchor()
      )
      return {
        info: {
          font: box.font,
          fontSize: box.fontSize,
          textLeft: box.textLeft,
          textTop: box.textTop,
          textRight: box.textRight,
          textBottom: box.textBottom,
          textAlign: box.textAlign,
          lineSpacing: box.lineSpacing,
          centerRotation: box.centerTextRotation,
          rtl: options.data().rtl
        },
        lines: box.linesInfo.linesIncludingHidden
      }
    },
    onClose: (_reason, finalValue) => {
      if (finalValue.trim().length === 0) {
        if (options.onEmpty !== undefined) {
          options.onEmpty()
        } else {
          chart.removeOverlay({ id: overlay.id, paneId })
        }
      } else {
        options.onCommit(finalValue)
      }
    }
  })
}
