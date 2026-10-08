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

import { createAnchorFigures } from '../../interaction/anchors'

/**
 * 'flagMark' — TradingView Flag Mark: a small swallowtail flag planted at
 * the anchor. One point, no text — pure marker. The flag silhouette is a
 * polygon (themeable, not an emoji glyph): pole from the point upward and a
 * notched pennant at the top.
 */

// No text payload — the tool is a pure marker. Reserved for future use.
export type FlagMarkExtendData = object

export interface FlagMarkStyle {
  /** Pennant fill (default '#2962FF'). */
  flagColor?: string
  /** Pole stroke color (default '#787B86'). */
  poleColor?: string
  /** Pole height px (default 20). */
  poleHeight?: number
  /** Pole stroke width px (default 2). */
  poleWidth?: number
  /** Pennant width px (default 17). */
  flagWidth?: number
  /** Pennant height px (default 10). */
  flagHeight?: number
}

const STYLE_KEY = 'flagMark'

function getFlagStyles (overlay: Overlay<FlagMarkExtendData>): FlagMarkStyle {
  return ((overlay.styles?.[STYLE_KEY] ?? {}) as FlagMarkStyle)
}

const flagMark: OverlayTemplate<FlagMarkExtendData> = {
  name: 'flagMark',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    flagMark: {
      flagColor: '#2962FF',
      poleColor: '#787B86',
      poleHeight: 20,
      poleWidth: 2,
      flagWidth: 17,
      flagHeight: 10
    }
  },
  createPointFigures: ({ overlay, coordinates, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const point = coordinates[0]
    const styles = getFlagStyles(overlay)
    const poleHeight = styles.poleHeight ?? 20
    const poleWidth = styles.poleWidth ?? 2
    const flagWidth = styles.flagWidth ?? 17
    const flagHeight = styles.flagHeight ?? 10
    const flagColor = styles.flagColor ?? '#2962FF'
    const poleColor = styles.poleColor ?? '#787B86'

    const poleTop = point.y - poleHeight
    const flagX = point.x + poleWidth
    // Swallowtail: the right edge cuts in ~18% of the width at mid-height.
    const notchX = flagX + flagWidth * 0.82
    const notchY = poleTop + flagHeight / 2

    const figures: OverlayFigure[] = [
      // Pole — thin rect from the anchor up to the pennant.
      {
        key: 'pole',
        type: 'rect',
        attrs: {
          x: point.x,
          y: poleTop,
          width: poleWidth,
          height: poleHeight
        },
        styles: { style: 'fill', color: poleColor },
        ignoreEvent: true
      },
      // Pennant — rectangle with a V notch in the right edge (swallowtail).
      {
        key: 'flag',
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: flagX, y: poleTop },
            { x: flagX + flagWidth, y: poleTop },
            { x: notchX, y: notchY },
            { x: flagX + flagWidth, y: poleTop + flagHeight },
            { x: flagX, y: poleTop + flagHeight }
          ]
        },
        styles: { style: 'fill', color: flagColor },
        bounds: {
          x: flagX,
          y: poleTop,
          width: flagWidth,
          height: flagHeight
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
  }
}

export default flagMark
