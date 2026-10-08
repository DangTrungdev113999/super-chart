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

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures, computeResizeCursor } from '../../interaction/anchors'

import {
  applySnap45,
  pricePrecisionOf,
  pushSidePriceLabel,
  rememberLineChart
} from '../lines/lineCommon'

import {
  type ChannelExtendData,
  channelBandPolygon,
  channelFillColor,
  channelFillEnabled,
  channelHandleFigure,
  channelStrokeOf,
  pushChannelXAxisPills,
  pushChannelYAxisPills
} from './channelCommon'

/**
 * 'priceChannelLine' — two-point price channel with TradingView
 * Flat Top/Bottom fill semantics: BOTH edges are horizontal, each at its
 * own anchor's price level, spanning the anchors' x-range. P0 and P1 are
 * diagonal corners of the band (the flat top and the flat bottom).
 *
 * Handles:
 *   anchor_0 / anchor_1 — the two diagonal corners (free drag, Shift =
 *                         45° snap on the second corner)
 *   pcl_ne / pcl_sw     — the other two corners: horizontal drag moves
 *                         the matching side's index, vertical drag moves
 *                         the opposite anchor's price
 *
 * Fill = TV ParallelChannelRenderer band over the quad
 * [P0, (P1.x,P0.y), P1, (P0.x,P1.y)], clipped to the anchor slab unless
 * extendLeft/extendRight is set.
 *
 * extendData: extendLeft/extendRight, fillBackground/showBackground,
 * transparency (0-100), background {enabled,color,opacity},
 * backgroundColor, showPrices, plus the line channel
 * (lineColor/borderColor/color, lineWidth/borderWidth, lineStyle).
 */
export interface PriceChannelLineExtendData extends ChannelExtendData {}

const priceChannelLine: OverlayTemplate<PriceChannelLineExtendData> = {
  name: 'priceChannelLine',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  extendData: {
    fillBackground: true,
    transparency: 80
  },

  createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      return figures
    }

    const ext: PriceChannelLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = channelStrokeOf(overlay, chart, ext)
    const extendLeft = ext.extendLeft === true
    const extendRight = ext.extendRight === true
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    const [c0, c1] = coordinates
    const minX = Math.min(c0.x, c1.x)
    const maxX = Math.max(c0.x, c1.x)

    // Flat edges at each anchor's own level, rendered over the anchor
    // x-slab (extended to the pane edges when enabled).
    const leftX = extendLeft ? 0 : minX
    const rightX = extendRight ? bounding.width : maxX
    const s1: Coordinate = { x: leftX, y: c0.y }
    const e1: Coordinate = { x: rightX, y: c0.y }
    const s2: Coordinate = { x: leftX, y: c1.y }
    const e2: Coordinate = { x: rightX, y: c1.y }

    // Fill — TV band polygon over the anchor quad (unextended anchors;
    // the clip sequence applies the extension flags itself).
    if (channelFillEnabled(ext) && Math.abs(c1.y - c0.y) > 1e-10) {
      const band = channelBandPolygon(
        { x: c0.x, y: c0.y },
        { x: c1.x, y: c0.y },
        { x: c0.x, y: c1.y },
        { x: c1.x, y: c1.y },
        extendLeft,
        extendRight,
        bounding
      )
      if (band.length >= 3) {
        figures.push({
          key: 'pcl_fill',
          type: 'polygon',
          attrs: { coordinates: band },
          styles: { style: 'fill', color: channelFillColor(ext, stroke.color) },
          ignoreEvent: true
        })
      }
    }

    figures.push({
      key: 'pcl_line1',
      type: 'line',
      attrs: { coordinates: [s1, e1] },
      styles: stroke
    })
    figures.push({
      key: 'pcl_line2',
      type: 'line',
      attrs: { coordinates: [s2, e2] },
      styles: stroke
    })

    // Price labels at the two levels (TradingView `showPrices` parity).
    if (ext.showPrices === true || ext.showPriceLabels === true || ext.showPriceLabel === true) {
      const points = overlay.points
      const p0 = isValid(points[0]) ? points[0] : {}
      const p1 = isValid(points[1]) ? points[1] : {}
      pushSidePriceLabel(figures, 'pcl_price0', c0, p0.value, c0.x <= c1.x ? 'left' : 'right', stroke.color, precision)
      pushSidePriceLabel(figures, 'pcl_price1', c1, p1.value, c1.x > c0.x ? 'right' : 'left', stroke.color, precision)
    }

    const diagonalCursor = computeResizeCursor(c0, c1)
    const antiCursor = computeResizeCursor(
      { x: c0.x, y: c1.y },
      { x: c1.x, y: c0.y }
    )
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      cursors: [diagonalCursor, diagonalCursor]
    }))

    // The other two corners — each drags its side's index plus the
    // opposite anchor's price (Flat Top/Bottom corner-pin behavior).
    const interactive = !overlay.lock && !overlay.isDrawing() &&
      ((isSelected ?? false) || (isHovered ?? false))
    if (interactive && Math.abs(c1.y - c0.y) > 1e-10 && Math.abs(c1.x - c0.x) > 1e-10) {
      figures.push(channelHandleFigure('pcl_ne', { x: c1.x, y: c0.y }, {
        pointIndex: 1,
        cursor: antiCursor,
        isTouch
      }))
      figures.push(channelHandleFigure('pcl_sw', { x: c0.x, y: c1.y }, {
        pointIndex: 0,
        cursor: antiCursor,
        isTouch
      }))
    }

    return figures
  },

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: PriceChannelLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    pushChannelXAxisPills(figures, 'pcl', coordinates, overlay.points, channelStrokeOf(overlay, chart, ext).color)
    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: PriceChannelLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    pushChannelYAxisPills(
      figures,
      'pcl',
      coordinates,
      overlay.points,
      channelStrokeOf(overlay, chart, ext).color,
      pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision),
      bounding,
      yAxis
    )
    return figures
  },

  performEventPressedMove: function (this: Overlay<PriceChannelLineExtendData>, params) {
    const points = params.points
    const index = params.performPointIndex
    const key = params.figureKey

    if (key === 'pcl_ne' || key === 'pcl_sw') {
      // Off-diagonal corner — kernel wrote the dragged index's point =
      // cursor; restore its price and push the dragged level into the
      // OPPOSITE anchor (each corner carries the other edge's level).
      const dragged = points[index]
      const otherIndex = 1 - index
      const other = points[otherIndex]
      const prev = isValid(params.prevPoints[index]) ? params.prevPoints[index] : {}
      if (isValid(dragged) && isValid(other) && isNumber(dragged.value)) {
        other.value = dragged.value
        if (isNumber(prev.value)) {
          dragged.value = prev.value
        }
      }
      return
    }

    if (index === 1) {
      applySnap45(this, params, 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<PriceChannelLineExtendData>, params) {
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  }
}

export default priceChannelLine
