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
  liveTextOf,
  openAnnotationEditor,
  pointToCoordinate,
  resolvedHorzTextAlign,
  resolvedTextStyles,
  richTextFigureStyle,
  textEditorHooks,
  type AnnotationTextStyle
} from './common'

/**
 * 'comment' — a chat-bubble comment pinned at the anchor: a rounded capsule
 * floating above the point with a small tail triangle pointing down at it.
 * Multi-line text is supported (line breaks grow the capsule). The editor
 * opens on placement and double-click.
 */

export interface CommentExtendData {
  text?: string
}

export interface CommentStyle extends AnnotationTextStyle {
  /** Tail height px between capsule bottom and the anchor (default 10). */
  tailHeight?: number
  /** Tail half-width px (default 6). */
  tailWidth?: number
}

const STYLE_KEY = 'comment'
const DEFAULT_TAIL_HEIGHT = 10
const DEFAULT_TAIL_WIDTH = 6

function getCommentStyles (overlay: Overlay<CommentExtendData>): CommentStyle {
  return resolvedTextStyles(overlay, STYLE_KEY) as CommentStyle
}

function getText (overlay: Overlay<CommentExtendData>): string {
  const extendData = overlay.extendData as CommentExtendData | string | undefined
  if (isString(extendData)) {
    return extendData
  }
  return liveTextOf(overlay) ?? extendData?.text ?? ''
}

function getBoxData (overlay: Overlay<CommentExtendData>): TextBoxData {
  const styles = getCommentStyles(overlay)
  return {
    ...baseTextBoxData(getText(overlay), styles),
    horzAlign: 'center',
    vertAlign: 'bottom',
    horzTextAlign: resolvedHorzTextAlign(overlay, 'center'),
    offsetY: styles.tailHeight ?? DEFAULT_TAIL_HEIGHT
  }
}

function openEditor (chart: Chart, overlay: Overlay<CommentExtendData>): void {
  openAnnotationEditor({
    chart,
    overlay,
    data: () => getBoxData(overlay),
    anchor: () => pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {}),
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const comment: OverlayTemplate<CommentExtendData> = {
  name: 'comment',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    comment: {
      color: '#D1D4DC',
      backgroundColor: 'rgba(42, 46, 57, 0.95)',
      borderColor: '#4A4E5C',
      borderWidth: 1,
      fontSize: 12,
      boxPaddingHorz: 12,
      boxPaddingVert: 8
    }
  },
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const point = coordinates[0]
    const styles = getCommentStyles(overlay)
    const data = getBoxData(overlay)
    const attrs: RichTextAttrs = { x: point.x, y: point.y, ...data }
    // Capsule = fully rounded rect: radius is half the laid-out height.
    const layout = getRichTextLayout(attrs)
    const capsule = richTextFigureStyle(styles)
    capsule.backgroundRoundRect = layout.boxHeight / 2
    const boxBottom = layout.boxTop + layout.boxHeight
    const tailHalf = styles.tailWidth ?? DEFAULT_TAIL_WIDTH
    const figures: OverlayFigure[] = [
      {
        key: 'bubble',
        type: 'richText',
        attrs,
        styles: capsule,
        bounds: {
          x: layout.boxLeft,
          y: layout.boxTop,
          width: layout.boxWidth,
          height: layout.boxHeight + (styles.tailHeight ?? DEFAULT_TAIL_HEIGHT)
        }
      },
      // Tail — filled triangle joining the capsule to the anchor point.
      {
        key: 'tail',
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: point.x - tailHalf, y: boxBottom - 1 },
            { x: point.x, y: point.y },
            { x: point.x + tailHalf, y: boxBottom - 1 }
          ]
        },
        styles: { style: 'fill', color: styles.backgroundColor },
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

export default comment
