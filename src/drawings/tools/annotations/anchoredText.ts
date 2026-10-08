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
import type Coordinate from '../../../common/Coordinate'
import type Point from '../../../common/Point'

import { isValid } from '../../../common/utils/typeChecks'

import { createAnchorFigures } from '../../interaction/anchors'
import type { RichTextAttrs } from '../../figures/richText'
import { getRichTextLayout } from '../../figures/richText'
import type { TextToolStyle, TextToolExtendData } from '../text'
import type { TextBoxData } from '../../text/textBox'

import {
  baseTextBoxData,
  commitText,
  openAnnotationEditor,
  resolvedHorzTextAlign,
  resolvedTextStyles,
  richTextFigureStyle,
  liveTextOf,
  textEditorHooks
} from './common'

/**
 * 'anchoredText' — TradingView Anchored Text: the same multi-line rich text
 * box as 'text', but pinned to a screen-relative position. Scrolling,
 * zooming, or switching timeframes leaves the box where it was placed;
 * dragging the box re-anchors it at the new screen position.
 *
 * Screen fixation is stored in extendData (JSON-safe): `anchorXPercent` /
 * `anchorYPercent` are the box origin as a fraction of the pane rect, and
 * `anchor*` snapshot fields record the data point they were captured from.
 * When the underlying point changes (user drag), the fraction is recaptured
 * from the live coordinate; while the point is untouched the fraction is
 * authoritative — the coordinate may move off-screen with scroll.
 */

export interface AnchoredTextExtendData extends TextToolExtendData {
  /** Marker flag — always true for this tool. */
  anchored?: boolean
  /** Box origin as a fraction of the pane rect (0..1). */
  anchorXPercent?: number
  anchorYPercent?: number
  /** Data-point snapshot the fraction was captured from. */
  anchorTimestamp?: number
  anchorDataIndex?: number
  anchorValue?: number
}

function getStyles (overlay: Overlay<AnchoredTextExtendData>): TextToolStyle {
  // anchoredText shares the text tool's style shape; resolvedTextStyles
  // merges styles.textNote + styles.anchoredText + the generic text.* writes.
  return resolvedTextStyles(overlay, 'anchoredText') as TextToolStyle
}

function getBoxData (overlay: Overlay<AnchoredTextExtendData>): TextBoxData {
  const extendData = (overlay.extendData as AnchoredTextExtendData | undefined) ?? {}
  const styles = getStyles(overlay)
  return {
    ...baseTextBoxData(liveTextOf(overlay) ?? extendData.text, styles),
    wordWrapWidth: extendData.wordWrapWidth,
    maxHeight: extendData.maxHeight,
    horzAlign: extendData.horzAlign ?? 'left',
    vertAlign: extendData.vertAlign ?? 'top',
    horzTextAlign: resolvedHorzTextAlign(overlay, 'left'),
    angle: extendData.angle,
    boxWidth: extendData.boxWidth,
    boxHeight: extendData.boxHeight,
    rtl: extendData.rtl
  }
}

function clamp01 (value: number): number {
  return Math.max(0, Math.min(1, value))
}

function pointSnapshotEquals (point: Partial<Point>, data: AnchoredTextExtendData): boolean {
  return point.timestamp === data.anchorTimestamp &&
    point.dataIndex === data.anchorDataIndex &&
    point.value === data.anchorValue
}

/**
 * Resolve the box origin in WIDGET-LOCAL pixels — figure coordinates are
 * 0-based inside the main-widget canvas, so the stored fraction applies
 * to bounding.width/height directly (bounding.left/top are the widget's
 * pane-space offset and do NOT belong in canvas math). When the data
 * point moved since the last capture (a drag in flight) the box follows
 * the live coordinate; onPressedMoveEnd re-captures the fraction.
 */
function resolveScreenPosition (
  overlay: Overlay<AnchoredTextExtendData>,
  coordinate: Coordinate,
  bounding: { width: number, height: number }
): Coordinate {
  const data = (overlay.extendData as AnchoredTextExtendData | undefined) ?? {}
  const point = overlay.points[0] ?? {}
  const haveFraction = data.anchorXPercent !== undefined && data.anchorYPercent !== undefined
  if (haveFraction && pointSnapshotEquals(point, data)) {
    return {
      x: bounding.width * (data.anchorXPercent ?? 0),
      y: bounding.height * (data.anchorYPercent ?? 0)
    }
  }
  return { x: coordinate.x, y: coordinate.y }
}

/**
 * Persist the screen fraction + point snapshot through overrideOverlay —
 * this is what actually lands in serialization (in-place extendData
 * writes inside the figure callback never reach persistence). Called on
 * drawEnd and whenever a point/body drag ends.
 */
function captureScreenFraction (chart: Chart, overlay: Overlay<AnchoredTextExtendData>): void {
  const size = chart.getSize(overlay.paneId, 'main')
  if (size === null || size.width <= 0 || size.height <= 0) {
    return
  }
  const point = overlay.points[0] ?? {}
  const coordinate = chart.convertToPixel(point, { paneId: overlay.paneId }) as Partial<Coordinate>
  const ext: AnchoredTextExtendData = isValid(overlay.extendData) && typeof overlay.extendData === 'object'
    ? { ...overlay.extendData }
    : {}
  ext.anchored = true
  ext.anchorXPercent = clamp01((coordinate.x ?? 0) / size.width)
  ext.anchorYPercent = clamp01((coordinate.y ?? 0) / size.height)
  ext.anchorTimestamp = point.timestamp
  ext.anchorDataIndex = point.dataIndex
  ext.anchorValue = point.value
  chart.overrideOverlay({ id: overlay.id, paneId: overlay.paneId, extendData: ext })
}

function openEditor (chart: Chart, overlay: Overlay<AnchoredTextExtendData>): void {
  const data = getBoxData(overlay)
  const wordWrapEnabled = data.wordWrapWidth !== undefined
  openAnnotationEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    // The editor must cover the RENDERED box (screen-fraction position),
    // not the data point — they diverge once the chart scrolls. The DOM
    // layer lives inside the main-widget host, so fractions apply to the
    // widget size directly (no left/top offset).
    anchor: () => {
      const size = chart.getSize(overlay.paneId, 'main')
      const extendData = (overlay.extendData as AnchoredTextExtendData | undefined) ?? {}
      if (
        size !== null &&
        extendData.anchorXPercent !== undefined &&
        extendData.anchorYPercent !== undefined
      ) {
        return {
          x: size.width * extendData.anchorXPercent,
          y: size.height * extendData.anchorYPercent
        }
      }
      const coordinate = chart.convertToPixel(overlay.points[0] ?? {}, { paneId: overlay.paneId }) as Partial<Coordinate>
      return { x: coordinate.x ?? 0, y: coordinate.y ?? 0 }
    },
    wordWrapEnabled,
    forbidLineBreaks: !wordWrapEnabled,
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const anchoredText: OverlayTemplate<AnchoredTextExtendData> = {
  name: 'anchoredText',
  totalStep: 2,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const position = resolveScreenPosition(overlay, coordinates[0], bounding)
    const data = getBoxData(overlay)
    const attrs: RichTextAttrs = { x: position.x, y: position.y, ...data }
    const layout = getRichTextLayout(attrs)
    const figures: OverlayFigure[] = [
      {
        key: 'textBox',
        type: 'richText',
        attrs,
        styles: richTextFigureStyle(getStyles(overlay)),
        bounds: {
          x: layout.boxLeft,
          y: layout.boxTop,
          width: layout.boxWidth,
          height: layout.boxHeight
        }
      }
    ]
    // The draggable handle sits on the RENDERED box (bottom-center), not on
    // the raw data coordinate — scrolling leaves the data point behind.
    const handle: Coordinate = {
      x: layout.boxLeft + layout.boxWidth / 2,
      y: layout.boxTop + layout.boxHeight
    }
    figures.push(...createAnchorFigures({
      coordinates: [handle],
      isSelected,
      isHovered,
      isTouch,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      shape: 'circle',
      cursors: ['move'],
      keyPrefix: 'anchor_'
    }))
    return figures
  },
  onDrawEnd: (e) => {
    captureScreenFraction(e.chart, e.overlay)
    textEditorHooks(openEditor).onDrawEnd(e)
  },
  onDoubleClick: textEditorHooks(openEditor).onDoubleClick,
  onPressedMoveEnd: (e) => {
    captureScreenFraction(e.chart, e.overlay)
  }
}

export default anchoredText
