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

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures, computeResizeCursor } from '../../interaction/anchors'
import {
  applySnap45,
  buildXAxisBandFigures,
  buildYAxisBandFigures,
  diagonalLabelAnchor,
  getArrowCoordinates,
  getExtendedCoordinates,
  inlineStatsLines,
  layoutDiagonalLabel,
  lineColorOf,
  lineLabelAnchorFn,
  lineLabelEditorHooks,
  lineSizeOf,
  liveLabelSpecOf,
  pricePrecisionOf,
  pushAnchorPriceLabel,
  pushInlineStats,
  pushLineWithGap,
  rememberLineChart
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'arrowLine' — TradingView Arrow: a Trend Line whose right end defaults
 * to an arrowhead. Full trend feature set: extend toggles, end caps
 * (rightEnd defaults to Arrow, leftEnd opt-in), midpoint handle, price
 * labels, rotated text label, stats box and 45° snap.
 */

export interface ArrowLineExtendData extends LineExtendData {}

/** Editor anchor: same rendered span as createPointFigures (optional
 *  edge extension), so the DOM box lands on the painted label. */
const alLabelAnchor = lineLabelAnchorFn((coordinates, bounding, ext, style, lineWidth) => {
  if (coordinates.length < 2) {
    return null
  }
  const [c1, c2] = coordinates
  const extendLeft = ext.extendLeft === true
  const extendRight = ext.extendRight === true
  let lineStart = c1
  let lineEnd = c2
  if (extendLeft || extendRight) {
    const [s, e] = getExtendedCoordinates(c1, c2, bounding.width, bounding.height, extendLeft, extendRight)
    lineStart = s
    lineEnd = e
  }
  return diagonalLabelAnchor(style, lineStart, lineEnd, lineWidth)
})

const arrowLine: OverlayTemplate<ArrowLineExtendData> = {
  name: 'arrowLine',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: ArrowLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineWidth = lineSizeOf(overlay, chart, ext.lineWidth)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // ─── Rendered endpoints (extension to bounding edges when enabled) ───
    const extendLeft = ext.extendLeft === true
    const extendRight = ext.extendRight === true
    let lineStart = c1
    let lineEnd = c2
    if (extendLeft || extendRight) {
      const [s, e] = getExtendedCoordinates(c1, c2, bounding.width, bounding.height, extendLeft, extendRight)
      lineStart = s
      lineEnd = e
    }

    // ─── Text label layout first — it can request a gap in the line ───
    const spec = liveLabelSpecOf(overlay, ext)
    const labelLayout = spec !== null
      ? layoutDiagonalLabel('al_label', spec, lineStart, lineEnd, lineColor, lineWidth)
      : null

    pushLineWithGap(figures, 'al', lineStart, lineEnd, labelLayout?.gap)

    // ─── End caps — Arrow's right end defaults to Arrow; left Normal ───
    const leftEnd = ext.leftEnd ?? 0
    const rightEnd = ext.rightEnd ?? 1
    if (leftEnd === 1) {
      const coords = getArrowCoordinates(c2, extendLeft ? lineStart : c1)
      if (coords.length === 3) {
        figures.push({
          key: 'al_arrow_left',
          type: 'polygon',
          attrs: { coordinates: coords },
          styles: { style: 'fill', color: lineColor }
        })
      }
    }
    if (rightEnd === 1) {
      const coords = getArrowCoordinates(c1, extendRight ? lineEnd : c2)
      if (coords.length === 3) {
        figures.push({
          key: 'al_arrow_right',
          type: 'polygon',
          attrs: { coordinates: coords },
          styles: { style: 'fill', color: lineColor }
        })
      }
    }

    // ─── Price labels at the anchors ───
    if (ext.showPriceLabels === true || ext.showPriceLabel === true) {
      pushAnchorPriceLabel(figures, 'al_price0', c1, points[0]?.value, lineColor, precision)
      pushAnchorPriceLabel(figures, 'al_price1', c2, points[1]?.value, lineColor, precision)
    }

    if (labelLayout !== null) {
      figures.push(labelLayout.figure)
    }

    // ─── Stats ───
    const statLines = inlineStatsLines({
      ext,
      points,
      anchorA: c1,
      anchorB: c2,
      spanA: lineStart,
      spanB: lineEnd,
      precision,
      isActive
    })
    pushInlineStats(figures, 'al_stats', statLines, ext.statsPosition, c1, c2, lineColor)

    // ─── Anchors + optional midpoint handle ───
    const resizeCursor = computeResizeCursor(c1, c2)
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      midPoint: ext.showMiddlePoint === true || ext.showMidpoint === true,
      cursors: [resizeCursor, resizeCursor]
    }))

    return figures
  },

  performEventPressedMove: function (this: Overlay<ArrowLineExtendData>, params) {
    if (params.performPointIndex === 0 || params.performPointIndex === 1) {
      applySnap45(this, params, params.performPointIndex === 0 ? 1 : 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<ArrowLineExtendData>, params) {
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  },

  // ─── In-place label editing (TradingView parity) ───
  ...lineLabelEditorHooks('al_label', alLabelAnchor),

  createXAxisFigures: ({ chart, overlay, coordinates, bounding, isSelected }) => {
    if (coordinates.length < 1) return []
    const ext: ArrowLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildXAxisBandFigures('al', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color),
      isSelected
    })
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected }) => {
    if (coordinates.length < 1) return []
    const ext: ArrowLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildYAxisBandFigures('al', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color),
      precision: pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision),
      yAxis: yAxis ?? undefined,
      isSelected
    })
  }
}

export default arrowLine
