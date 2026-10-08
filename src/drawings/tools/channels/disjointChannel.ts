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
 * 'disjointChannel' — TradingView Disjoint Channel.
 *
 * 3 stored points: P0→P1 is the first edge, P2 carries the second edge's
 * price level at the right corner — its time slot is pinned to P1 on write
 * replay. The second edge is the first MIRRORED through P2's level:
 *   P = (P1.x, P2.y)                       (right corner)
 *   A = (P0.x, P.y + (P1.y - P0.y))        (left corner)
 * so A→P has the opposite slope of P0→P1 — the two edges converge or
 * diverge (wedge) instead of running parallel.
 *
 * Handles (TV LineAnchorRenderer parity — 4 anchors for 3 points):
 *   anchor_0 — first-edge left end (free drag; the mirror re-derives)
 *   anchor_1 — first-edge right end (Shift = 45° snap; the channel center
 *              stays fixed: P2's price mirrors around the gesture-start
 *              midpoint of P1/P2 — TradingView setPoint case 1)
 *   anchor_2 — second-edge right corner, VERTICAL-ONLY drag (TradingView
 *              PaneCursorType.VerticalResize): changes the mirror height
 *   dc_left  — second-edge left corner (free drag; writes back into P0:
 *              `p0.index = t.index`, `p0.price = p1.price - (t - p2)`)
 *
 * Fill = TV DisjointChannelRenderer over the quad [P0, P1, P, A] — one
 * polygon when parallel, two wedges when the edges cross.
 *
 * extendData: extendLeft/extendRight, leftEnd/rightEnd (arrow caps),
 * fillBackground/showBackground, transparency (0-100), background
 * {enabled,color,opacity}, backgroundColor, showPrices, plus the line
 * channel (lineColor/borderColor/color, lineWidth/borderWidth, lineStyle).
 */
export interface DisjointChannelExtendData extends ChannelExtendData {}

const disjointChannel: OverlayTemplate<DisjointChannelExtendData> = {
  name: 'disjointChannel',
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

    const ext: DisjointChannelExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = channelStrokeOf(overlay, chart, ext)
    const extendLeft = ext.extendLeft === true
    const extendRight = ext.extendRight === true
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    const [b, t] = coordinates
    const [s1, e1] = getExtendedCoordinates(b, t, bounding.width, bounding.height, extendLeft, extendRight)

    // Mirrored edge — TradingView `P = point(T.x, p2.y)`,
    // `A = point(b.x, P.y + (T.y - b.y))`.
    const hasMirror = coordinates.length >= 3
    const cornerP: Coordinate = { x: t.x, y: hasMirror ? coordinates[2].y : 0 }
    const cornerA: Coordinate = { x: b.x, y: cornerP.y + (t.y - b.y) }
    const [s2, e2] = getExtendedCoordinates(cornerA, cornerP, bounding.width, bounding.height, extendLeft, extendRight)

    // Fill — TradingView DisjointChannelRenderer quad [b, t, P, A].
    if (hasMirror && channelFillEnabled(ext)) {
      const fill = channelFillColor(ext, stroke.color)
      disjointChannelFill(b, t, cornerA, cornerP, extendLeft, extendRight, bounding).forEach((poly, index) => {
        figures.push({
          key: `dc_fill_${index}`,
          type: 'polygon',
          attrs: { coordinates: poly },
          styles: { style: 'fill', color: fill },
          ignoreEvent: true
        })
      })
    }

    figures.push({
      key: 'dc_line1',
      type: 'line',
      attrs: { coordinates: [s1, e1] },
      styles: stroke
    })
    if (hasMirror) {
      figures.push({
        key: 'dc_line2',
        type: 'line',
        attrs: { coordinates: [s2, e2] },
        styles: stroke
      })
    }

    // Arrow end caps — TradingView leftEnd/rightEnd apply to both edges.
    const leftEnd = ext.leftEnd ?? 0
    const rightEnd = ext.rightEnd ?? 0
    if (leftEnd === 1) {
      const c1 = getArrowCoordinates(extendRight ? e1 : t, extendLeft ? s1 : b)
      if (c1.length === 3) {
        figures.push({
          key: 'dc_arrow_l1',
          type: 'polygon',
          attrs: { coordinates: c1 },
          styles: { style: 'fill', color: stroke.color },
          ignoreEvent: true
        })
      }
      if (hasMirror) {
        const c2 = getArrowCoordinates(extendRight ? e2 : cornerP, extendLeft ? s2 : cornerA)
        if (c2.length === 3) {
          figures.push({
            key: 'dc_arrow_l2',
            type: 'polygon',
            attrs: { coordinates: c2 },
            styles: { style: 'fill', color: stroke.color },
            ignoreEvent: true
          })
        }
      }
    }
    if (rightEnd === 1) {
      const c1 = getArrowCoordinates(extendLeft ? s1 : b, extendRight ? e1 : t)
      if (c1.length === 3) {
        figures.push({
          key: 'dc_arrow_r1',
          type: 'polygon',
          attrs: { coordinates: c1 },
          styles: { style: 'fill', color: stroke.color },
          ignoreEvent: true
        })
      }
      if (hasMirror) {
        const c2 = getArrowCoordinates(extendLeft ? s2 : cornerA, extendRight ? e2 : cornerP)
        if (c2.length === 3) {
          figures.push({
            key: 'dc_arrow_r2',
            type: 'polygon',
            attrs: { coordinates: c2 },
            styles: { style: 'fill', color: stroke.color },
            ignoreEvent: true
          })
        }
      }
    }

    // Price labels at all four corners (TradingView `showPrices`). The
    // mirrored left corner's price is `p2 + (p1 - p0)` — same arithmetic
    // the TV pane view uses (`u = formatPrice(s.price + e)`).
    if (ext.showPrices === true || ext.showPriceLabels === true || ext.showPriceLabel === true) {
      const points = overlay.points
      const p0 = isValid(points[0]) ? points[0] : {}
      const p1 = isValid(points[1]) ? points[1] : {}
      const p2 = isValid(points[2]) ? points[2] : {}
      pushSidePriceLabel(figures, 'dc_price0', b, p0.value, b.x <= t.x ? 'left' : 'right', stroke.color, precision)
      pushSidePriceLabel(figures, 'dc_price1', t, p1.value, t.x > b.x ? 'right' : 'left', stroke.color, precision)
      if (hasMirror) {
        pushSidePriceLabel(figures, 'dc_price2', cornerP, p2.value, t.x > b.x ? 'right' : 'left', stroke.color, precision)
        const aValue = isNumber(p0.value) && isNumber(p1.value) && isNumber(p2.value)
          ? p2.value + p1.value - p0.value
          : undefined
        pushSidePriceLabel(figures, 'dc_price3', cornerA, aValue, b.x <= t.x ? 'left' : 'right', stroke.color, precision)
      }
    }

    // Anchors: stored points — the level anchor renders on the mirrored
    // edge's right corner P = (t.x, p2.y), dragged vertically only
    // (TradingView PaneCursorType.VerticalResize).
    const anchorCoords = hasMirror ? [b, t, cornerP] : coordinates
    const resizeCursor = computeResizeCursor(b, t)
    figures.push(...createAnchorFigures({
      coordinates: anchorCoords,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      cursors: [resizeCursor, resizeCursor, 'ns-resize'],
      moveDirections: [undefined, undefined, 'vert']
    }))

    // Synthetic left corner of the mirrored edge (TradingView anchor
    // index 3 — a free drag that writes back into P0).
    const interactive = !overlay.lock && !overlay.isDrawing() &&
      ((isSelected ?? false) || (isHovered ?? false))
    if (interactive && hasMirror) {
      figures.push(channelHandleFigure('dc_left', cornerA, {
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
    const ext: DisjointChannelExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    pushChannelXAxisPills(figures, 'dc', coordinates, overlay.points, channelStrokeOf(overlay, chart, ext).color)
    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) {
      return []
    }
    const ext: DisjointChannelExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const figures: OverlayFigure[] = []
    pushChannelYAxisPills(
      figures,
      'dc',
      coordinates,
      overlay.points,
      channelStrokeOf(overlay, chart, ext).color,
      pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision),
      bounding,
      yAxis
    )
    return figures
  },

  performEventPressedMove: function (this: Overlay<DisjointChannelExtendData>, params) {
    const points = params.points
    const index = params.performPointIndex
    const key = params.figureKey

    if (key === 'dc_left') {
      // Mirrored edge's left corner — kernel wrote P0 = cursor; keep the
      // index and re-derive P0's price from the mirror identity
      // `p0 = p1 - (t - p2)` (TradingView setPoint case 3).
      const p0 = points[0]
      const p1 = points[1]
      const p2 = points[2]
      if (
        isValid(p0) && isValid(p1) && isValid(p2) &&
        isNumber(p0.value) && isNumber(p1.value) && isNumber(p2.value)
      ) {
        p0.value = p1.value - (p0.value - p2.value)
      }
      return
    }

    if (index === 1) {
      applySnap45(this, params, 0)
      // Mirror fix — keep the channel center at the gesture-start midpoint
      // of P1/P2: `p2.price = 2r - p1.price` (TradingView setPoint case 1).
      const p1 = points[1]
      const p2 = points[2]
      const prev1 = isValid(params.prevPoints[1]) ? params.prevPoints[1] : {}
      const prev2 = isValid(params.prevPoints[2]) ? params.prevPoints[2] : {}
      if (
        isValid(p2) && isNumber(p1.value) &&
        isNumber(prev1.value) && isNumber(prev2.value)
      ) {
        p2.value = prev1.value + prev2.value - p1.value
      }
      return
    }

    if (index === 2 && key === undefined) {
      // Draw-complete replay / API-driven write — pin the level point's
      // index to P1 (only its price participates in rendering).
      pinPointIndex(points, 2, 1)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<DisjointChannelExtendData>, params) {
    // TradingView snaps only the THIRD point while drawing (45° ray from
    // P0) — the second point is placed free.
    if (params.performPointIndex === 2) {
      applySnap45(this, params, 0)
    }
  }
}

export default disjointChannel
