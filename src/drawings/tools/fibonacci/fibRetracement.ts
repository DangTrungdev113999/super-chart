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
  FIB_RETRACEMENT_LEVELS,
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
  fibAlphaColor
} from './fibCommon'

/**
 * 'fibonacciLine' — Fib Retracement rebuild (keeps the kernel overlay name so
 * persisted drawings/hosts resolve to this template). Two anchors P1→P2 span
 * the retracement; each level draws a horizontal line over P1.x→P2.x (or to
 * the pane edges via extendData.extendLeft/extendRight), a `coeff (price)`
 * label, and optional fillBetween polygons between adjacent levels.
 *
 * Levels contract: `extendData.fib.levels` (whole-array {visible, coeff,
 * color, label?}); `fib.fillBetween` and top-level `showTrend`/`extendLeft`/
 * `extendRight` round out the flags.
 */
export interface FibRetracementExtendData extends FibExtendData {}

const fibRetracement: OverlayTemplate<FibRetracementExtendData> = {
  name: 'fibonacciLine',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered }) => {
    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      return figures
    }

    const extendData = (overlay.extendData as FibRetracementExtendData | undefined) ?? {}
    const levels = sortedVisibleLevels(getFibLevels(extendData, FIB_RETRACEMENT_LEVELS))
    const precision = getPricePrecision(chart, overlay, yAxis)
    const lineSize = overlay.styles?.line?.size ?? 1
    const labelSize = overlay.styles?.text?.size ?? FIB_LABEL_SIZE

    const c1 = coordinates[0]
    const c2 = coordinates[1]
    const leftX = extendData.extendLeft === true ? 0 : Math.min(c1.x, c2.x)
    const rightX = extendData.extendRight === true ? bounding.width : Math.max(c1.x, c2.x)

    const v1 = overlay.points[0]?.value
    const v2 = overlay.points[1]?.value
    // Value-space level math keeps prices correct on log axes; pixel-space
    // interpolation is the fallback when values are absent (mid-drag).
    const useValue = isNumber(v1) && isNumber(v2)
    const vBase = v2 ?? 0
    const vDif = (v1 ?? 0) - (v2 ?? 0)
    const levelValue = (coeff: number): number => vBase + vDif * coeff
    const levelY = (coeff: number): number => {
      if (useValue && yAxis !== null) {
        return yAxis.convertToPixel(levelValue(coeff))
      }
      return c2.y + (c1.y - c2.y) * coeff
    }

    const levelYs = levels.map(level => levelY(level.coeff))

    // Fills between adjacent visible levels (sorted by coeff → adjacent in y).
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

    // Dashed trend line P1→P2.
    if (extendData.showTrend !== false) {
      figures.push({
        key: 'trend',
        type: 'line',
        attrs: { coordinates: [c1, c2] },
        styles: { style: 'dashed', color: FIB_TREND_COLOR, size: lineSize, dashedValue: FIB_TREND_DASH }
      })
    }

    // Level lines + labels.
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
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      keyPrefix: 'anchor_',
      midPoint: true
    }))
    return figures
  }
}

export default fibRetracement
