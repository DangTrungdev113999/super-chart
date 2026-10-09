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
import type Bounding from '../../../common/Bounding'

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
  channelStrokeOf,
  pushChannelXAxisPills,
  pushChannelYAxisPills
} from './channelCommon'

/**
 * 'priceChannelLine' — three-point slanted channel (upstream klinecharts
 * `getParallelLines(coordinates, bounding, 1)` semantics):
 *
 *   P0–P1 — the middle line's slope+intercept (k, b)
 *   P2    — fixes the FIRST parallel edge: same slope, intercept
 *           b1 = P2.y - k·P2.x
 *   MIRROR— a third line mirrored across the middle: intercept 2b - b1
 *           (upstream's extendParallelLineCount = 1)
 *
 * Degenerate P0.x === P1.x collapses to verticals at x0 (middle), x2
 * (edge), and x0 + (x0 - x2) (mirror).
 *
 * Upstream always renders the lines across the FULL pane width, so
 * extendLeft/extendRight default TRUE — serialized records from the
 * legacy tool (3 points, no extendData) render identically. Clearing a
 * flag clips the edges to the outermost anchor x on that side.
 *
 * Fill = band between the two OUTER edges (P2-parallel ↔ mirror) —
 * channelBandPolygon clipped by each edge's half-plane toward the other.
 *
 * Handles: anchor_0/1/2 free drag (Shift on index 1 = 45° snap).
 *
 * extendData: extendLeft/extendRight, fillBackground/showBackground,
 * transparency (0-100), background {enabled,color,opacity},
 * backgroundColor, showPrices, plus the line channel
 * (lineColor/borderColor/color, lineWidth/borderWidth, lineStyle).
 */
export interface PriceChannelLineExtendData extends ChannelExtendData {}

/** The three rendered edges, in upstream order: middle, P2-side, mirror. */
interface ChannelEdges {
  middle: [Coordinate, Coordinate]
  edge: [Coordinate, Coordinate]
  mirror: [Coordinate, Coordinate]
}

function computeEdges (coordinates: Coordinate[], bounding: Bounding, extendLeft: boolean, extendRight: boolean): ChannelEdges | null {
  if (coordinates.length < 2) {
    return null
  }
  const c0 = coordinates[0]
  const c1 = coordinates[1]
  const c2 = coordinates[2]
  const xs = coordinates.map(c => c.x)
  const leftX = extendLeft ? 0 : Math.min(...xs)
  const rightX = extendRight ? bounding.width : Math.max(...xs)

  if (Math.abs(c1.x - c0.x) < 1e-10) {
    // Degenerate vertical middle — parallel edges are verticals offset by
    // the same x-distance as P2 is from the middle.
    const middle: [Coordinate, Coordinate] = [{ x: c0.x, y: 0 }, { x: c0.x, y: bounding.height }]
    if (!isValid(c2)) {
      return { middle, edge: middle, mirror: middle }
    }
    const distance = c0.x - c2.x
    return {
      middle,
      edge: [{ x: c2.x, y: 0 }, { x: c2.x, y: bounding.height }],
      mirror: [{ x: c0.x + distance, y: 0 }, { x: c0.x + distance, y: bounding.height }]
    }
  }

  const k = (c1.y - c0.y) / (c1.x - c0.x)
  const b = c0.y - k * c0.x
  const middle: [Coordinate, Coordinate] = [
    { x: leftX, y: leftX * k + b },
    { x: rightX, y: rightX * k + b }
  ]
  if (!isValid(c2)) {
    return { middle, edge: middle, mirror: middle }
  }
  const b1 = c2.y - k * c2.x
  const bm = 2 * b - b1
  return {
    middle,
    edge: [
      { x: leftX, y: leftX * k + b1 },
      { x: rightX, y: rightX * k + b1 }
    ],
    mirror: [
      { x: leftX, y: leftX * k + bm },
      { x: rightX, y: rightX * k + bm }
    ]
  }
}

const priceChannelLine: OverlayTemplate<PriceChannelLineExtendData> = {
  name: 'priceChannelLine',
  totalStep: 4,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  extendData: {
    // Upstream renders the edges across the whole pane — default both
    // extensions on so legacy records (no extendData) match pixel-for-pixel.
    extendLeft: true,
    extendRight: true,
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
    const extendLeft = ext.extendLeft !== false
    const extendRight = ext.extendRight !== false
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    const edges = computeEdges(coordinates, bounding, extendLeft, extendRight)
    if (edges === null) {
      return figures
    }
    const hasEdge = isValid(coordinates[2]) &&
      (Math.abs(edges.edge[0].x - edges.middle[0].x) > 1e-10 ||
       Math.abs(edges.edge[0].y - edges.middle[0].y) > 1e-10)

    // Fill — the full channel region sits between the two OUTER edges
    // (P2-parallel on one side of the middle, the mirror on the other).
    if (hasEdge && channelFillEnabled(ext)) {
      const band = channelBandPolygon(
        edges.edge[0], edges.edge[1],
        edges.mirror[0], edges.mirror[1],
        extendLeft, extendRight, bounding
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
      key: 'pcl_middle',
      type: 'line',
      attrs: { coordinates: edges.middle },
      styles: stroke
    })
    if (hasEdge) {
      figures.push({
        key: 'pcl_edge',
        type: 'line',
        attrs: { coordinates: edges.edge },
        styles: stroke
      })
      figures.push({
        key: 'pcl_mirror',
        type: 'line',
        attrs: { coordinates: edges.mirror },
        styles: stroke
      })
    }

    // Price labels at each edge's right-end level (TradingView
    // `showPrices` parity — the edge levels, not raw anchor values).
    if (ext.showPrices === true || ext.showPriceLabels === true || ext.showPriceLabel === true) {
      const rightEnd = (edge: [Coordinate, Coordinate]): Coordinate => edge[1].x >= edge[0].x ? edge[1] : edge[0]
      const edgeValue = (y: number): number | undefined => {
        if (yAxis === null) {
          return undefined
        }
        const v = yAxis.convertFromPixel(y)
        return isNumber(v) ? v : undefined
      }
      const cMid = rightEnd(edges.middle)
      pushSidePriceLabel(figures, 'pcl_price_mid', cMid, edgeValue(cMid.y), 'right', stroke.color, precision)
      if (hasEdge) {
        const cEdge = rightEnd(edges.edge)
        const cMirror = rightEnd(edges.mirror)
        pushSidePriceLabel(figures, 'pcl_price_edge', cEdge, edgeValue(cEdge.y), 'right', stroke.color, precision)
        pushSidePriceLabel(figures, 'pcl_price_mirror', cMirror, edgeValue(cMirror.y), 'right', stroke.color, precision)
      }
    }

    // All anchors move along/alongside the middle line — same diagonal
    // cursor for each (the parallel edge drags keep the slope anyway).
    const diagonalCursor = computeResizeCursor(coordinates[0], coordinates[1])
    const cursors = coordinates.map(() => diagonalCursor)
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      cursors
    }))

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
    if (params.performPointIndex === 1) {
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
