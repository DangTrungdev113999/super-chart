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
import { measureText } from '../../text/measure'
import { textBoxFont } from '../../text/textBox'
import type { TextBoxData } from '../../text/textBox'

import {
  baseTextBoxData,
  commitText,
  liveTextOf,
  openAnnotationEditor,
  pointToCoordinate,
  resolvedHorzTextAlign,
  resolvedTextStyles,
  textEditorHooks,
  type AnnotationTextStyle
} from './common'

/**
 * 'signpost' — a flag pole planted at the anchor with a text-bearing sign
 * board at its far end. extendData.direction ('up' | 'down', default 'up')
 * controls whether the pole rises above the point or drops below it; the
 * sign board is a flat pentagon pointing right. Editor opens on placement
 * and double-click.
 */

export interface SignpostExtendData {
  text?: string
  direction?: 'up' | 'down'
}

export interface SignpostStyle extends AnnotationTextStyle {
  /** Sign board fill (default '#2962FF'). */
  signColor?: string
  /** Pole + base dot color (default '#787B86'). */
  poleColor?: string
  /** Pole height px (default 40). */
  poleHeight?: number
  /** Sign board height px (default 24). */
  signHeight?: number
  /** Minimum sign board width px (default 56). */
  minSignWidth?: number
}

const STYLE_KEY = 'signpost'
const POLE_WIDTH = 3
const ARROW_TIP = 8
const SIGN_PADDING_HORZ = 8
const BASE_RADIUS = 4

function getSignpostStyles (overlay: Overlay<SignpostExtendData>): SignpostStyle {
  return resolvedTextStyles(overlay, STYLE_KEY) as SignpostStyle
}

function getText (overlay: Overlay<SignpostExtendData>): string {
  const extendData = overlay.extendData as SignpostExtendData | string | undefined
  if (isString(extendData)) {
    return extendData
  }
  return liveTextOf(overlay) ?? extendData?.text ?? ''
}

function getDirection (overlay: Overlay<SignpostExtendData>): 'up' | 'down' {
  const extendData = overlay.extendData as SignpostExtendData | undefined
  return extendData?.direction === 'down' ? 'down' : 'up'
}

function getBoxData (overlay: Overlay<SignpostExtendData>): TextBoxData {
  const styles = getSignpostStyles(overlay)
  return {
    ...baseTextBoxData(getText(overlay), styles),
    bold: styles.bold ?? true,
    horzAlign: 'center',
    vertAlign: 'middle',
    horzTextAlign: resolvedHorzTextAlign(overlay, 'center')
  }
}

function openEditor (chart: Chart, overlay: Overlay<SignpostExtendData>): void {
  const styles = getSignpostStyles(overlay)
  const poleHeight = styles.poleHeight ?? 40
  const direction = getDirection(overlay)
  openAnnotationEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    // Text sits in the sign board at the far end of the pole.
    anchor: () => {
      const coordinate = pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {})
      return { x: coordinate.x - ARROW_TIP / 2, y: coordinate.y + (direction === 'up' ? -poleHeight : poleHeight) }
    },
    forbidLineBreaks: true,
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const signpost: OverlayTemplate<SignpostExtendData> = {
  name: 'signpost',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    signpost: {
      color: '#FFFFFF',
      signColor: '#2962FF',
      poleColor: '#787B86',
      fontSize: 11,
      bold: true,
      poleHeight: 40,
      signHeight: 24,
      minSignWidth: 56
    }
  },
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const point = coordinates[0]
    const styles = getSignpostStyles(overlay)
    const data = getBoxData(overlay)
    const direction = getDirection(overlay)
    const isUp = direction === 'up'

    const poleHeight = styles.poleHeight ?? 40
    const signHeight = styles.signHeight ?? 24
    const minSignWidth = styles.minSignWidth ?? 56
    const signColor = styles.signColor ?? '#2962FF'
    const poleColor = styles.poleColor ?? '#787B86'

    const headCenterY = point.y + (isUp ? -poleHeight : poleHeight)
    const textWidth = measureText(data.text, textBoxFont(data)).width
    const headWidth = Math.max(textWidth + 2 * SIGN_PADDING_HORZ + ARROW_TIP, minSignWidth)

    const figures: OverlayFigure[] = [
      // Pole
      {
        key: 'pole',
        type: 'rect',
        attrs: {
          x: point.x - POLE_WIDTH / 2,
          y: isUp ? headCenterY : point.y,
          width: POLE_WIDTH,
          height: poleHeight
        },
        styles: { style: 'fill', color: poleColor },
        ignoreEvent: true
      },
      // Sign board — flat pentagon with an arrow tip on the right edge.
      {
        key: 'signBoard',
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: point.x - headWidth / 2, y: headCenterY - signHeight / 2 },
            { x: point.x + headWidth / 2 - ARROW_TIP, y: headCenterY - signHeight / 2 },
            { x: point.x + headWidth / 2, y: headCenterY },
            { x: point.x + headWidth / 2 - ARROW_TIP, y: headCenterY + signHeight / 2 },
            { x: point.x - headWidth / 2, y: headCenterY + signHeight / 2 }
          ]
        },
        styles: { style: 'fill', color: signColor }
      },
      // Board text — centered on the flat (non-arrow) part of the board.
      {
        key: 'signText',
        type: 'richText',
        attrs: {
          x: point.x - ARROW_TIP / 2,
          y: headCenterY,
          ...data
        },
        styles: { color: styles.color },
        ignoreEvent: true
      },
      // Base dot at the anchor.
      {
        key: 'base',
        type: 'circle',
        attrs: { x: point.x, y: point.y, r: BASE_RADIUS },
        styles: { style: 'fill', color: poleColor },
        ignoreEvent: true
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
  ...textEditorHooks(openEditor)
}

export default signpost
