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
import { UpdateLevel } from '../../common/Updater'

import { computeTextBoxLayout, type TextBoxData } from '../text/textBox'
import { createTextEditorSession, type TextEditorLayout, type TextEditorSession } from './textEditor'

/**
 * Bridge between an overlay's text payload and the in-place editor. The
 * editor's layout() re-runs computeTextBoxLayout for the live value with
 * the SAME data the figure paints from — the invisible textarea therefore
 * always lands exactly over the rendered text.
 *
 * Live buffer: while a session is open its current value is kept in
 * `liveText` (keyed on the overlay instance) and the overlay is
 * re-rendered on every keystroke, so the canvas shows the typed text —
 * not the last committed value. Figure callbacks should read
 * `liveTextOf(overlay) ?? extendData.text`.
 *
 * Session lifecycle: every session registers here; it closes itself when
 * its overlay is removed (any path — delete, undo, remote sync, scope
 * switch — all funnel through the onOverlayChange 'remove' action), and
 * `closeTextEditorSessions(chart)` covers chart-level teardown.
 */

const liveText = new WeakMap<object, string>()
const sessions = new WeakMap<Chart, Map<string, TextEditorSession>>()

/** The in-flight edit value for an overlay, or undefined when not editing. */
export function liveTextOf (overlay: object): string | undefined {
  return liveText.get(overlay)
}

/** End every open editor on a chart — call on drawing-manager teardown. */
export function closeTextEditorSessions (chart: Chart): void {
  const chartSessions = sessions.get(chart)
  chartSessions?.forEach(session => {
    session.close('external')
  })
  sessions.delete(chart)
}

/** Whether any text-editor session is live on this chart. */
export function hasOpenTextEditorSession (chart: Chart): boolean {
  return (sessions.get(chart)?.size ?? 0) > 0
}

interface ChartWithUpdatePane {
  updatePane?: (level: UpdateLevel, paneId?: string) => void
}

function repaint (chart: Chart, paneId: string): void {
  (chart as ChartWithUpdatePane).updatePane?.(UpdateLevel.Overlay, paneId)
}

interface OverlayChangeEvent {
  type?: string
  overlay?: { id?: string }
}

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
  /** Insert '\t' on Tab — TSV-style editors (the table tool). */
  allowTab?: boolean
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

  // One editor per overlay — a second open replaces (and closes) the first.
  let chartSessions = sessions.get(chart)
  if (chartSessions === undefined) {
    chartSessions = new Map()
    sessions.set(chart, chartSessions)
  }
  chartSessions.get(overlay.id)?.close('external')

  // The listeners below close over a box — the session const only exists
  // after createTextEditorSession returns, but handlers can fire any time
  // after subscription.
  const sessionBox: { current: TextEditorSession | null } = { current: null }
  const onChartChange = (event?: unknown): void => {
    const change = event as OverlayChangeEvent | undefined
    if (change?.type === 'remove' && change.overlay?.id === overlay.id) {
      sessionBox.current?.close('external')
    }
  }
  // Scroll/zoom/resize move the rendered text while the session is open —
  // re-anchor the DOM editor or the textarea drifts off the glyphs.
  const onViewChange = (): void => {
    sessionBox.current?.relayout()
  }

  const session = createTextEditorSession({
    chart,
    paneId,
    value: options.data().text,
    maxLength: options.maxLength,
    forbidLineBreaks: options.forbidLineBreaks,
    allowTab: options.allowTab,
    wordWrapEnabled: options.wordWrapEnabled,
    selectionColor: options.selectionColor,
    caretColor: options.caretColor,
    onInput: (value: string): void => {
      liveText.set(overlay, value)
      overlay.invalidateFigures()
      repaint(chart, paneId)
    },
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
      liveText.delete(overlay)
      chartSessions.delete(overlay.id)
      chart.unsubscribeAction('onOverlayChange', onChartChange)
      chart.unsubscribeAction('onScroll', onViewChange)
      chart.unsubscribeAction('onZoom', onViewChange)
      chart.unsubscribeAction('onVisibleRangeChange', onViewChange)
      overlay.invalidateFigures()
      repaint(chart, paneId)
      if (finalValue.trim().length === 0) {
        if (options.onEmpty !== undefined) {
          options.onEmpty()
        } else {
          // Live paneId — the overlay may have migrated panes mid-edit.
          chart.removeOverlay({ id: overlay.id, paneId: overlay.paneId })
        }
      } else {
        options.onCommit(finalValue)
      }
    }
  })

  sessionBox.current = session

  // Subscribe AFTER the session exists — a throwing constructor must not
  // leak listeners that re-throw on every subsequent event.
  chart.subscribeAction('onOverlayChange', onChartChange)
  chart.subscribeAction('onScroll', onViewChange)
  chart.subscribeAction('onZoom', onViewChange)
  chart.subscribeAction('onVisibleRangeChange', onViewChange)

  chartSessions.set(overlay.id, session)
  // Seed the live buffer so the first paint shows the editor's value.
  liveText.set(overlay, session.value)
  overlay.invalidateFigures()
  repaint(chart, paneId)
  return session
}
