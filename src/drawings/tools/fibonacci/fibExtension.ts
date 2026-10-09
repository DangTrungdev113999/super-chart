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

import { isNumber } from '../../../common/utils/typeChecks'

import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { createAnchorFigures } from '../../interaction/anchors'

import {
  type FibExtendData,
  FIB_EXTENSION_LEVELS,
  FIB_TREND_COLOR,
  FIB_TREND_DASH,
  FIB_FILL_ALPHA,
  FIB_LABEL_SIZE,
  getFibLevels,
  getFillBetween,
  sortedVisibleLevels,
  getPricePrecision,
  formatFibPrice,
  fibLevelText,
  fibRealSpace,
  fibAlphaColor
} from './fibCommon'

/**
 * 'fibExtension' — trend-based fib extension, 3 anchors: P1→P2 is the
 * base move, P3 the retracement end. Level k draws a horizontal ray right
 * of P3 at price = v3 + (v2 − v1) × coeff. Dashed trend lines P1→P2 and
 * P2→P3 are drawn while `showTrend` is on.
 *
 * Levels contract: `extendData.fib.levels` (whole-array {visible, coeff,
 * color, label?}); flags: `fib.fillBetween`, `showTrend`.
 */
export interface FibExtensionExtendData extends FibExtendData {}

const fibExtension: OverlayTemplate<FibExtensionExtendData> = {
  name: 'fibExtension',
  totalStep: 4,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  extendData: { fib: { levels: FIB_EXTENSION_LEVELS } },
  createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered, isTouch }) => {
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

    const extendData = (overlay.extendData as FibExtensionExtendData | undefined) ?? {}
    const levels = sortedVisibleLevels(getFibLevels(extendData, FIB_EXTENSION_LEVELS))
    const precision = getPricePrecision(chart, overlay, yAxis)
    const lineSize = overlay.styles?.line?.size ?? 1
    const labelSize = overlay.styles?.text?.size ?? FIB_LABEL_SIZE

    const c1 = coordinates[0]
    const c2 = coordinates[1]

    // Dashed trend line P1→P2 always drawable at 2+ coords; P2→P3 joins at 3.
    if (extendData.showTrend !== false) {
      figures.push({
        key: 'trend_12',
        type: 'line',
        attrs: { coordinates: [c1, c2] },
        styles: { style: 'dashed', color: FIB_TREND_COLOR, size: lineSize, dashedValue: FIB_TREND_DASH }
      })
    }

    if (coordinates.length < 3) {
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
      figures.push({
        key: 'trend_23',
        type: 'line',
        attrs: { coordinates: [c2, c3] },
        styles: { style: 'dashed', color: FIB_TREND_COLOR, size: lineSize, dashedValue: FIB_TREND_DASH }
      })
    }

    const v1 = overlay.points[0]?.value
    const v2 = overlay.points[1]?.value
    const v3 = overlay.points[2]?.value
    const useValue = isNumber(v1) && isNumber(v2) && isNumber(v3)
    const rs = fibRealSpace(yAxis)
    const vDif = (v2 ?? 0) - (v1 ?? 0)
    // v3 + (v2−v1)·coeff — extrapolation, in real space under non-linear axes.
    const levelValue = (coeff: number): number => rs.linear || !useValue
      ? (v3 ?? 0) + vDif * coeff
      : rs.fromReal(rs.toReal(v3) + (rs.toReal(v2) - rs.toReal(v1)) * coeff)
    const levelY = (coeff: number): number => {
      if (useValue && yAxis !== null) {
        const y = yAxis.convertToPixel(levelValue(coeff))
        return Number.isFinite(y) ? y : c3.y + (c2.y - c1.y) * coeff
      }
      return c3.y + (c2.y - c1.y) * coeff
    }

    const leftX = c3.x
    const rightX = bounding.width
    const levelYs = levels.map(level => levelY(level.coeff))

    // Fills between adjacent visible levels, spanning the ray region.
    if (getFillBetween(extendData)) {
      for (let i = 0; i < levels.length - 1; i++) {
        const yA = levelYs[i]
        const yB = levelYs[i + 1]
        figures.push({
          key: `fill_${i}`,
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: leftX, y: yA },
              { x: rightX, y: yA },
              { x: rightX, y: yB },
              { x: leftX, y: yB }
            ]
          },
          styles: { style: 'fill', color: fibAlphaColor(levels[i].color, FIB_FILL_ALPHA) },
          ignoreEvent: true
        })
      }
    }

    levels.forEach((level, index) => {
      const y = levelYs[index]
      figures.push({
        key: `level_${index}`,
        type: 'line',
        attrs: { coordinates: [{ x: leftX, y }, { x: rightX, y }] },
        styles: { color: level.color, size: lineSize }
      })

      const priceText = useValue ? formatFibPrice(chart, levelValue(level.coeff), precision) : undefined
      figures.push({
        key: `levelLabel_${index}`,
        type: 'text',
        attrs: {
          x: leftX + 4,
          y,
          text: fibLevelText(level, priceText),
          align: 'left',
          baseline: 'bottom'
        },
        styles: { color: level.color, size: labelSize, backgroundColor: 'transparent' },
        ignoreEvent: true
      })
    })

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

export default fibExtension
