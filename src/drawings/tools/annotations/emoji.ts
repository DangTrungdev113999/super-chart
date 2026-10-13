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

import type { OverlayTemplate } from '../../../component/Overlay'
import { isString } from '../../../common/utils/typeChecks'

import { createAnchorFigures } from '../../interaction/anchors'

/**
 * 'emoji' — the font-icons group pick. A single-point marker that renders
 * the chosen emoji glyph centered on the anchor (TV's sticker placement).
 * The glyph lives in extendData.emoji; a raw string payload is also read.
 */

export interface EmojiExtendData {
  emoji?: string
}

const emoji: OverlayTemplate<EmojiExtendData | string> = {
  name: 'emoji',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const extendData = overlay.extendData
    const glyph = isString(extendData) ? extendData : (extendData as EmojiExtendData | undefined)?.emoji ?? ''
    const p = coordinates[0]
    return [
      {
        key: 'emoji',
        type: 'text',
        attrs: {
          x: p.x,
          y: p.y,
          text: glyph,
          align: 'center',
          baseline: 'middle'
        },
        styles: { size: 32, family: 'sans-serif', color: '#FFFFFF' }
      },
      ...createAnchorFigures({
        coordinates,
        isSelected,
        isHovered,
        isTouch,
        isDrawing: overlay.isDrawing(),
        lock: overlay.lock,
        keyPrefix: 'anchor_'
      })
    ]
  }
}

export default emoji
