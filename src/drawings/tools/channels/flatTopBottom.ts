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
  getArrowCoordinates,
  getExtendedCoordinates,
  pricePrecisionOf,
  pushSidePriceLabel,
  rememberLineChart
} from '../lines/lineCommon'

import {
  type ChannelExtendData,
  channelFillColor,
  channelFillEnabled,
  channelHandleFigure,
  channelStrokeOf,
  disjointChannelFill,
  pinPointIndex,
  pushChannelXAxisPills,
  pushChannelYAxisPills
} from './channelCommon'

/**
 * 'flatTopBottom' — TradingView Flat Top/Bottom.
 *
 * 3 stored points: P0→P1 is the first edge (free angle — usually drawn as
 * the flat top/bottom), P2 carries only the second edge's price level —
 * its time slot is pinned to P1 on write replay. The rendered second edge
 * is ALWAYS horizontal at P2's y, spanning P0.x→P1.x
 * (`c = point(h.x, p2.y)`, `p = point(d.x, c.y)` in the TV source).
 *
 * Handles (TV LineAnchorRenderer parity — 4 anchors for 3 points):
 *   anchor_0 / anchor_1 — edge-1 endpoints (free drag, Shift = 45° snap)
 *   anchor_2            — flat edge's right corner: horizontal drag moves
 *                         P1's index (right edge), vertical drag sets the
 *                         flat level (P2's price)
 *   ft_left             — flat edge's left corner: horizontal drag moves
 *                         P0's index (left edge), vertical drag sets P2's
 *                         price
 *
 * Fill = TV DisjointChannelRenderer over the quad [P0, P1, c, p] — one
 * polygon when the edges don't cross, two wedges when they do.
 *
 * extendData: extendLeft/extendRight, leftEnd/rightEnd (arrow caps),
 * fillBackground/showBackground, transparency (0-100), background
 * {enabled,color,opacity}, backgroundColor, showPrices, plus the line
 * channel (lineColor/borderColor/color, lineWidth/borderWidth, lineStyle).
 */
export interface FlatTopBottomExtendData extends ChannelExtendData {}

const flatTopBottom: OverlayTemplate<FlatTopBottomExtendData> = {
  name: 'flatTopBottom',
  totalStep: 4,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  extendData: {
    fillBackground: true,
    transparency: 20
  },

  createPointFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    const figures: OverlayFigure[] = []
    if (coordinates.length < 2) {
      return figures
    }

    const ext: FlatTopBottomExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = channelStrokeOf(overlay, chart, ext)
    const extendLeft = ext.extendLeft === true
    const extendRight = ext.extendRight === true
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    const [d, h] = coordinates
    const [s1, e1] = getExtendedCoordinates(d, h, bounding.width, bounding.height, extendLeft, extendRight)

    // Flat edge at P2's level, spanning the first edge's x-range.
    const hasLevel = coordinates.length >= 3
    const levelY = hasLevel ? coordinates[2].y : 0
    const p: Coordinate = { x: d.x, y: levelY }
    const c: Coordinate = { x: h.x, y: levelY }
    const [s2, e2] = getExtendedCoordinates(p, c, bounding.width, bounding.height, extendLeft, extendRight)

    // Fill — TradingView DisjointChannelRenderer quad [d, h, c, p].
    if (hasLevel && channelFillEnabled(ext)) {
      const fill = channelFillColor(ext, stroke.color)
      disjointChannelFill(d, h, p, c, extendLeft, extendRight, bounding).forEach((poly, index) => {
        figures.push({
          key: `ft_fill_${index}`,
          type: 'polygon',
          attrs: { coordinates: poly },
          styles: { style: 'fill', color: fill },
          ignoreEvent: true
        })
      })
    }

    figures.push({
      key: 'ft_line1',
      type: 'line',
      attrs: { coordinates: [s1, e1] },
      styles: stroke
    })
    if (hasLevel) {
      figures.push({
        key: 'ft_line2',
        type: 'line',
        attrs: { coordinates: [s2, e2] },
        styles: stroke
      })
    }

    // Arrow end caps — TradingView leftEnd/rightEnd apply to both edges.
    const leftEnd = ext.leftEnd ?? 0
    const rightEnd = ext.rightEnd ?? 0
    if (leftEnd === 1) {
      const c1 = getArrowCoordinates(extendRight ? e1 : h, extendLeft ? s1 : d)
      if (c1.length === 3) {
        figures.push({
          key: 'ft_arrow_l1',
          type: 'polygon',
          attrs: { coordinates: c1 },
          styles: { style: 'fill', color: stroke.color },
          ignoreEvent: true
        })
      }
      if (hasLevel) {
        const c2 = getArrowCoordinates(extendRight ? e2 : c, extendLeft ? s2 : p)
        if (c2.length === 3) {
          figures.push({
            key: 'ft_arrow_l2',
            type: 'polygon',
            attrs: { coordinates: c2 },
            styles: { style: 'fill', color: stroke.color },
            ignoreEvent: true
          })
        }
      }
    }
    if (rightEnd === 1) {
      const c1 = getArrowCoordinates(extendLeft ? s1 : d, extendRight ? e1 : h)
      if (c1.length === 3) {
        figures.push({
          key: 'ft_arrow_r1',
          type: 'polygon',
          attrs: { coordinates: c1 },
          styles: { style: 'fill', color: stroke.color },
          ignoreEvent: true
        })
      }
      if (hasLevel) {
        const c2 = getArrowCoordinates(extendLeft ? s2 : p, extendRight ? e2 : c)
        if (c2.length === 3) {
          figures.push({
            key: 'ft_arrow_r2',
            type: 'polygon',
            attrs: { coordinates: c2 },
            styles: { style: 'fill', color: stroke.color },
            ignoreEvent: true
          })
        }
      }
    }

    // Price labels at all four corners (TradingView `showPrices`).
    if (ext.showPrices === true || ext.showPriceLabels === true || ext.showPriceLabel === true) {
      const points = overlay.points
      const p0 = isValid(points[0]) ? points[0] : {}
      const p1 = isValid(points[1]) ? points[1] : {}
      const p2 = isValid(points[2]) ? points[2] : {}
      pushSidePriceLabel(figures, 'ft_price0', d, p0.value, d.x <= h.x ? 'left' : 'right', stroke.color, precision)
      pushSidePriceLabel(figures, 'ft_price1', h, p1.value, h.x > d.x ? 'right' : 'left', stroke.color, precision)
      if (hasLevel) {
        pushSidePriceLabel(figures, 'ft_price2', c, p2.value, h.x > d.x ? 'right' : 'left', stroke.color, precision)
        pushSidePriceLabel(figures, 'ft_price3', p, p2.value, d.x <= h.x ? 'left' : 'right', stroke.color, precision)
      }
    }

    // Anchors: stored points — the level anchor renders on the flat edge's
    // right corner c = (h.x, p2.y).
    const anchorCoords = hasLevel ? [d, h, c] : coordinates
    const resizeCursor = computeResizeCursor(d, h)
    figures.push(...createAnchorFigures({
      coordinates: anchorCoords,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      cursors: [resizeCursor, resizeCursor, 'pointer']
    }))

    // Synthetic left corner of the flat edge (TradingView anchor index 3 —
    // drags P0's index horizontally and P2's price vertically).
    const interactive = !overlay.lock && !overlay.isDrawing() &&
      ((isSelected ?? false) || (isHovered ?? false))
    if (interactive && hasLevel) {
      figures.push(channelHandleFigure('ft_left', p, {
        pointIndex: 0,
        cursor: 'pointer',
        isTouch
      }))
    }

    return figures
  },

  createXAxisFigures: ({ chart, overlay, coordinates }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: FlatTopBottomExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    pushChannelXAxisPills(figures, 'ft', coordinates, overlay.points, channelStrokeOf(overlay, chart, ext).color)
    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: FlatTopBottomExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    pushChannelYAxisPills(
      figures,
      'ft',
      coordinates,
      overlay.points,
      channelStrokeOf(overlay, chart, ext).color,
      pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision),
      bounding,
      yAxis
    )
    return figures
  },

  performEventPressedMove: function (this: Overlay<FlatTopBottomExtendData>, params) {
    const points = params.points
    const index = params.performPointIndex
    const key = params.figureKey

    if (key === 'ft_left') {
      // Flat edge's left corner — kernel wrote P0 = cursor; keep the index
      // (left edge follows the drag) but restore P0's price and push the
      // dragged level into P2 (TradingView setPoint case 3).
      const p0 = points[0]
      const p2 = points[2]
      const prev0 = isValid(params.prevPoints[0]) ? params.prevPoints[0] : {}
      if (isValid(p0) && isValid(p2) && isNumber(p0.value)) {
        p2.value = p0.value
        if (isNumber(prev0.value)) {
          p0.value = prev0.value
        }
      }
      return
    }

    if (index === 2) {
      if (key === 'anchor_2') {
        // Flat edge's right corner — kernel wrote P2 = cursor; its price is
        // the flat level, its index moves the first edge's right end
        // (TradingView setPoint case 2: `points[1].index = t.index`).
        const p1 = points[1]
        const p2 = points[2]
        if (isValid(p1) && isValid(p2)) {
          p1.dataIndex = p2.dataIndex
          p1.timestamp = p2.timestamp
        }
      } else {
        // Draw-complete replay / API-driven write — pin the level point's
        // index to P1 (only its price participates in rendering).
        pinPointIndex(points, 2, 1)
      }
      return
    }

    if (index === 1) {
      applySnap45(this, params, 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<FlatTopBottomExtendData>, params) {
    // TradingView snaps only the THIRD point while drawing (45° ray from
    // P0) — the second point is placed free.
    if (params.performPointIndex === 2) {
      applySnap45(this, params, 0)
    }
  }
}

export default flatTopBottom
