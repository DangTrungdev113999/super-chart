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

import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { createAnchorFigures } from '../../interaction/anchors'

import {
  type FibExtendData,
  FIB_TIME_ZONE_LEVELS,
  FIB_FILL_ALPHA,
  FIB_LABEL_SIZE,
  FIB_TIME_CULL,
  getFibLevels,
  getFillBetween,
  sortedVisibleLevels,
  fibAlphaColor
} from './fibCommon'

/**
 * 'fibTimeZone' — 2 anchors: the P1→P2 distance is one fibonacci unit on
 * the TIME axis. Each visible level draws a full-height vertical line at
 * x = P1.x + coeff × (P2.x − P1.x), where `coeff` is the fib number itself
 * (0, 1, 2, 3, 5, 8, ...). Pixel-space interpolation is exact here because
 * the x axis is affine in dataIndex.
 *
 * Levels contract: `extendData.fib.levels` (whole-array {visible, coeff,
 * color, label?}); flags: `fib.fillBetween`, `showLabels`.
 */
export interface FibTimeZoneExtendData extends FibExtendData {}

const fibTimeZone: OverlayTemplate<FibTimeZoneExtendData> = {
  name: 'fibTimeZone',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding, isSelected, isHovered }) => {
    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      return figures
    }

    const extendData = (overlay.extendData as FibTimeZoneExtendData | undefined) ?? {}
    const levels = sortedVisibleLevels(getFibLevels(extendData, FIB_TIME_ZONE_LEVELS))
    const lineSize = overlay.styles?.line?.size ?? 1
    const labelSize = overlay.styles?.text?.size ?? FIB_LABEL_SIZE
    const showLabels = extendData.showLabels !== false

    const c1 = coordinates[0]
    const unit = coordinates[1].x - c1.x

    // Line x positions sorted left→right for adjacent-band fills.
    const positions = levels
      .map(level => ({ level, x: c1.x + level.coeff * unit }))
      .sort((a, b) => a.x - b.x)

    if (getFillBetween(extendData)) {
      for (let i = 0; i < positions.length - 1; i++) {
        const xA = positions[i].x
        const xB = positions[i + 1].x
        if (xB < -FIB_TIME_CULL || xA > bounding.width + FIB_TIME_CULL) {
          continue
        }
        figures.push({
          key: `fill_${i}`,
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: xA, y: 0 },
              { x: xB, y: 0 },
              { x: xB, y: bounding.height },
              { x: xA, y: bounding.height }
            ]
          },
          styles: { style: 'fill', color: fibAlphaColor(positions[i].level.color, FIB_FILL_ALPHA) },
          ignoreEvent: true
        })
      }
    }

    positions.forEach(({ level, x }, index) => {
      if (x < -FIB_TIME_CULL || x > bounding.width + FIB_TIME_CULL) {
        return
      }
      figures.push({
        key: `level_${index}`,
        type: 'line',
        attrs: { coordinates: [{ x, y: 0 }, { x, y: bounding.height }] },
        styles: { color: level.color, size: lineSize }
      })
      if (showLabels) {
        figures.push({
          key: `levelLabel_${index}`,
          type: 'text',
          attrs: {
            x: x + 4,
            y: bounding.height - 4,
            text: level.label ?? String(level.coeff),
            align: 'left',
            baseline: 'bottom'
          },
          styles: { color: level.color, size: labelSize, backgroundColor: 'transparent' },
          ignoreEvent: true
        })
      }
    })

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_',
      midPoint: true
    }))
    return figures
  }
}

export default fibTimeZone
