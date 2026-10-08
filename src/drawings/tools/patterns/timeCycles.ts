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

import type Coordinate from '../../../common/Coordinate'
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  patternFillColorOf,
  patternStrokeOf,
  TV_LINE_WIDTH,
  TV_TIME_COLOR
} from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/** Semicircle approximation for the filled dome (the arc figure is
 *  stroke-only; `path` cannot chain multiple arcs). */
const DOME_FILL_SEGMENTS = 24
const MAX_CYCLE_DOMES = 512

/**
 * 'timeCycles' — TradingView "Time cycles" (2 points on a shared baseline).
 *
 * Period = |x1 − x0| in pixels; a semicircular dome is drawn on each
 * period boundary — tiling outward from the nearer anchor in both
 * directions while in view (the span between the anchors is one dome).
 * Domes are filled under `fillBackground` (default on, transparency 85).
 *
 * TradingView pins both anchors to one price (`setPoint` syncs `value`),
 * mirrored via the perform* hooks so the baseline stays level.
 */
const timeCycles: OverlayTemplate<PatternExtendData> = {
  name: 'timeCycles',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, bounding, overlay, isSelected, isHovered, isTouch }) => {
    const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = patternStrokeOf(overlay, chart, ext, TV_TIME_COLOR, TV_LINE_WIDTH)
    const fillEnabled = ext.fillBackground ?? true

    const figures: OverlayFigure[] = []
    if (coordinates.length >= 2) {
      const baselineY = coordinates[0].y
      const period = Math.abs(coordinates[1].x - coordinates[0].x)
      if (period >= 1) {
        const minX = Math.min(coordinates[0].x, coordinates[1].x)
        const maxX = Math.max(coordinates[0].x, coordinates[1].x)

        const boundaries: number[] = []
        for (let x = minX; x > -period && boundaries.length < MAX_CYCLE_DOMES; x -= period) {
          boundaries.push(x)
        }
        for (let x = maxX; x < bounding.width && boundaries.length < MAX_CYCLE_DOMES; x += period) {
          boundaries.push(x)
        }

        const r = period / 2
        figures.push({
          key: 'tc_domes',
          type: 'arc',
          attrs: boundaries.map(x => ({
            x: x + r,
            y: baselineY,
            r,
            startAngle: Math.PI,
            endAngle: 2 * Math.PI
          })),
          styles: {
            style: stroke.style,
            color: stroke.color,
            size: stroke.size,
            dashedValue: stroke.dashedValue
          },
          ignoreEvent: true
        })

        if (fillEnabled) {
          const domeRings = boundaries.map<Coordinate[]>(x => {
            const ring: Coordinate[] = []
            for (let i = 0; i <= DOME_FILL_SEGMENTS; i++) {
              const angle = Math.PI + (i / DOME_FILL_SEGMENTS) * Math.PI
              ring.push({
                x: x + r + r * Math.cos(angle),
                y: baselineY + r * Math.sin(angle)
              })
            }
            return ring
          })
          figures.push({
            key: 'tc_dome_fill',
            type: 'polygon',
            attrs: domeRings.map(coordinates => ({ coordinates })),
            styles: { style: 'fill', color: patternFillColorOf(ext, stroke.color) },
            ignoreEvent: true
          })
        }
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
  }),

  // TradingView `addPoint`/`setPoint`: both anchors share one baseline
  // price. While DRAWING, point[0] owns the baseline — placing point[1]
  // snaps it onto point[0]'s level (never drags the baseline down to
  // wherever the second click lands). Post-draw drags keep whichever
  // anchor moved as the source.
  performEventPressedMove: ({ points, performPointIndex }) => {
    const moved = points[performPointIndex]
    const other = points[1 - performPointIndex]
    if (isValid(moved) && isValid(other) && isNumber(moved.value)) {
      other.value = moved.value
    }
  },

  performEventMoveForDrawing: ({ points, performPointIndex }) => {
    if (performPointIndex === 0) {
      return
    }
    const baseline = points[0]
    const moved = points[performPointIndex]
    if (isValid(baseline) && isValid(moved) && isNumber(baseline.value)) {
      moved.value = baseline.value
    }
  }
}

export default timeCycles
