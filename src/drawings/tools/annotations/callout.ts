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
 * 'callout' — TradingView Callout: two anchors. Point 0 is the annotated
 * target, point 1 is the text box. A connector line runs from the box edge
 * to the target, finished with a small arrowhead. The box itself is the
 * draggable second anchor; the editor opens on placement + double-click.
 */

export interface CalloutExtendData {
  text?: string
  /** Fixed wrap width (px) — presence enables word wrapping. */
  wordWrapWidth?: number
}

export interface CalloutStyle extends AnnotationTextStyle {
  /** Connector + arrowhead color — defaults to borderColor. */
  connectorColor?: string
  /** Connector line width px (default 2). */
  connectorWidth?: number
  /** Arrowhead size px (default 8). */
  arrowSize?: number
}

const STYLE_KEY = 'callout'
const TARGET_DOT_RADIUS = 3
const ARROW_ANGLE = Math.PI / 6

function getCalloutStyles (overlay: Overlay<CalloutExtendData>): CalloutStyle {
  return ((overlay.styles?.[STYLE_KEY] ?? {}) as CalloutStyle)
}

function getText (overlay: Overlay<CalloutExtendData>): string {
  const extendData = overlay.extendData as CalloutExtendData | string | undefined
  if (isString(extendData)) {
    return extendData
  }
  return extendData?.text ?? ''
}

function getBoxData (overlay: Overlay<CalloutExtendData>): TextBoxData {
  const extendData = (overlay.extendData as CalloutExtendData | undefined) ?? {}
  const styles = getCalloutStyles(overlay)
  return {
    ...baseTextBoxData(getText(overlay), styles),
    wordWrapWidth: extendData.wordWrapWidth,
    horzAlign: 'center',
    vertAlign: 'middle',
    horzTextAlign: 'center'
  }
}

function openEditor (chart: Chart, overlay: Overlay<CalloutExtendData>): void {
  const data = getBoxData(overlay)
  const wordWrapEnabled = data.wordWrapWidth !== undefined
  openAnnotationEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    // The box lives at point 1 — the editor must anchor there, not point 0.
    anchor: () => pointToCoordinate(chart, overlay.paneId, overlay.points[1] ?? {}),
    wordWrapEnabled,
    forbidLineBreaks: !wordWrapEnabled,
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const callout: OverlayTemplate<CalloutExtendData> = {
  name: 'callout',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    callout: {
      color: '#FFFFFF',
      backgroundColor: 'rgba(42, 46, 57, 0.95)',
      borderColor: '#2962FF',
      borderWidth: 1,
      backgroundRoundRect: 8,
      fontSize: 12,
      boxPaddingHorz: 10,
      boxPaddingVert: 8,
      connectorColor: '#2962FF',
      connectorWidth: 2,
      arrowSize: 8
    }
  },
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered }) => {
    if (coordinates.length === 0) {
      return []
    }
    const styles = getCalloutStyles(overlay)
    const data = getBoxData(overlay)
    const connectorColor = styles.connectorColor ?? styles.borderColor
    const connectorWidth = styles.connectorWidth ?? 2
    const arrowSize = styles.arrowSize ?? 8
    const figures: OverlayFigure[] = []

    const target = coordinates[0]
    // Target marker — always visible; doubles as the point-0 drag figure.
    figures.push({
      key: 'target',
      type: 'circle',
      attrs: { x: target.x, y: target.y, r: TARGET_DOT_RADIUS },
      styles: { style: 'fill', color: connectorColor },
      pointIndex: 0
    })

    if (coordinates.length > 1) {
      const boxCenter = coordinates[1]
      const attrs: RichTextAttrs = { x: boxCenter.x, y: boxCenter.y, ...data }
      const layout = getRichTextLayout(attrs)

      // Connector start — the point where the box→target ray exits the box
      // edge (choose the facing side, clamp to the box corner extents).
      const dx = target.x - boxCenter.x
      const dy = target.y - boxCenter.y
      const halfW = layout.boxWidth / 2
      const halfH = layout.boxHeight / 2
      let startX = boxCenter.x
      let startY = boxCenter.y
      if (dx !== 0 || dy !== 0) {
        const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Number.MAX_SAFE_INTEGER
        const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Number.MAX_SAFE_INTEGER
        const scale = Math.min(scaleX, scaleY, 1)
        startX = boxCenter.x + dx * scale
        startY = boxCenter.y + dy * scale
      }

      // Connector line — behind the box so it reads as attached.
      figures.push({
        key: 'connector',
        type: 'line',
        attrs: {
          coordinates: [
            { x: startX, y: startY },
            { x: target.x, y: target.y }
          ]
        },
        styles: { color: connectorColor, size: connectorWidth },
        ignoreEvent: true
      })

      // Arrowhead at the target — filled triangle along the ray direction.
      const angle = Math.atan2(target.y - startY, target.x - startX)
      figures.push({
        key: 'arrowHead',
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: target.x, y: target.y },
            {
              x: target.x - arrowSize * Math.cos(angle - ARROW_ANGLE),
              y: target.y - arrowSize * Math.sin(angle - ARROW_ANGLE)
            },
            {
              x: target.x - arrowSize * Math.cos(angle + ARROW_ANGLE),
              y: target.y - arrowSize * Math.sin(angle + ARROW_ANGLE)
            }
          ]
        },
        styles: { style: 'fill', color: connectorColor },
        ignoreEvent: true
      })

      // The text box IS the second anchor — dragging it moves point 1.
      figures.push({
        key: 'textBox',
        type: 'richText',
        attrs,
        styles: richTextFigureStyle(styles),
        pointIndex: 1,
        bounds: {
          x: layout.boxLeft,
          y: layout.boxTop,
          width: layout.boxWidth,
          height: layout.boxHeight
        }
      })
    }

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

export default callout
