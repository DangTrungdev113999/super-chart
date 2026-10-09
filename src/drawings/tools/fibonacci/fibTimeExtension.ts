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
  FIB_TIME_EXTENSION_LEVELS,
  FIB_TREND_COLOR,
  FIB_TREND_DASH,
  FIB_FILL_ALPHA,
  FIB_LABEL_SIZE,
  FIB_TIME_CULL,
  getFibLevels,
  getFillBetween,
  sortedVisibleLevels,
  fibAlphaColor
} from './fibCommon'

/**
 * 'fibTimeExtension' — trend-based fib time, 3 anchors: P1→P2 defines the
 * base time span, P3 the projection origin. Each visible level draws a
 * full-height vertical line at x = P3.x + coeff × (P2.x − P1.x).
 *
 * Levels contract: `extendData.fib.levels` (whole-array {visible, coeff,
 * color, label?}); flags: `fib.fillBetween`, `showTrend`, `showLabels`.
 */
export interface FibTimeExtensionExtendData extends FibExtendData {}

const fibTimeExtension: OverlayTemplate<FibTimeExtensionExtendData> = {
  name: 'fibTimeExtension',
  totalStep: 4,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding, isSelected, isHovered, isTouch }) => {
    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      // Anchors before the arity return — a 1-point restored overlay must
      // stay selectable/resumable instead of rendering nothing.
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

    const extendData = (overlay.extendData as FibTimeExtensionExtendData | undefined) ?? {}
    const levels = sortedVisibleLevels(getFibLevels(extendData, FIB_TIME_EXTENSION_LEVELS))
    const lineSize = overlay.styles?.line?.size ?? 1
    const labelSize = overlay.styles?.text?.size ?? FIB_LABEL_SIZE
    const showLabels = extendData.showLabels !== false

    const c1 = coordinates[0]
    const c2 = coordinates[1]
    const unit = c2.x - c1.x

    // Dashed trend lines P1→P2 and P2→P3 (foreground, TV order).
    const trendFigures: OverlayFigure[] = []
    if (extendData.showTrend !== false) {
      trendFigures.push({
        key: 'trend_12',
        type: 'line',
        attrs: { coordinates: [c1, c2] },
        styles: { style: 'dashed', color: FIB_TREND_COLOR, size: lineSize, dashedValue: FIB_TREND_DASH }
      })
    }

    if (coordinates.length < 3) {
      figures.push(...trendFigures)
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

    const c3 = coordinates[2]
    if (extendData.showTrend !== false) {
      trendFigures.push({
        key: 'trend_23',
        type: 'line',
        attrs: { coordinates: [c2, c3] },
        styles: { style: 'dashed', color: FIB_TREND_COLOR, size: lineSize, dashedValue: FIB_TREND_DASH }
      })
    }

    // Line x positions sorted left→right for adjacent-band fills.
    const positions = levels
      .map(level => ({ level, x: c3.x + level.coeff * unit }))
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

    figures.push(...trendFigures)

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

export default fibTimeExtension
