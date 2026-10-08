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

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  patternStrokeOf,
  TV_CONNECTOR_COLOR,
  TV_CYCLIC_COLOR,
  TV_LINE_WIDTH
} from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/** Safety cap on generated cycle lines (a near-zero period could loop far). */
const MAX_CYCLE_LINES = 512

/**
 * 'cyclicLines' — TradingView "Cyclic lines" (2 points).
 *
 * Period = `points[1].dataIndex − points[0].dataIndex`; vertical lines are
 * emitted from the FIRST anchor's index marching in the direction of that
 * difference across the visible range (a negative period repeats into the
 * past). A dashed gray connector joins the two anchors, exactly like the
 * reference's `#808080` LINESTYLE_DASHED trend line. Falls back to a pixel
 * period when `dataIndex` is unavailable on a restored point.
 */
const cyclicLines: OverlayTemplate<PatternExtendData> = {
  name: 'cyclicLines',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, bounding, xAxis, overlay, isSelected, isHovered, isTouch }) => {
    const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = patternStrokeOf(overlay, chart, ext, TV_CYCLIC_COLOR, TV_LINE_WIDTH)

    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const first = coordinates[0]
      const second = coordinates[1]
      const points = overlay.points
      const p0 = isValid(points[0]) ? points[0] : {}
      const p1 = isValid(points[1]) ? points[1] : {}

      // Dashed connector between the anchors (fixed gray in TV).
      figures.push({
        key: 'cl_link',
        type: 'line',
        attrs: { coordinates: [first, second] },
        styles: {
          style: 'dashed',
          color: TV_CONNECTOR_COLOR,
          size: 1,
          dashedValue: [6, 6]
        },
        ignoreEvent: true
      })

      const pad = 4
      const xs: number[] = []
      if (isNumber(p0.dataIndex) && isNumber(p1.dataIndex) && isValid(xAxis)) {
        const step = p1.dataIndex - p0.dataIndex
        if (step !== 0) {
          const range = chart.getVisibleRange()
          const to = isValid(range) ? range.to : Number.MAX_SAFE_INTEGER
          const from = isValid(range) ? range.from : 0
          for (
            let index = p0.dataIndex;
            step > 0 ? index <= to : index >= from;
            index += step
          ) {
            if (xs.length >= MAX_CYCLE_LINES) {
              break
            }
            const x = xAxis.convertToPixel(index)
            if (x >= -pad && x <= bounding.width + pad) {
              xs.push(x)
            } else if (step > 0 ? x > bounding.width + pad : x < -pad) {
              break
            }
          }
        }
      } else {
        // Pixel-space fallback — same march, using the anchor x distance.
        const dx = second.x - first.x
        if (Math.abs(dx) > 1e-9) {
          for (
            let x = first.x;
            dx > 0 ? x <= bounding.width + pad : x >= -pad;
            x += dx
          ) {
            if (xs.length >= MAX_CYCLE_LINES) {
              break
            }
            xs.push(x)
          }
        }
      }

      if (xs.length > 0) {
        figures.push({
          key: 'cl_lines',
          type: 'line',
          attrs: xs.map(x => ({ coordinates: [{ x, y: 0 }, { x, y: bounding.height }] })),
          styles: {
            style: stroke.style,
            color: stroke.color,
            size: stroke.size,
            dashedValue: stroke.dashedValue
          },
          ignoreEvent: true
        })
      }
    }

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch
    }))
    return figures
  })
}

export default cyclicLines
