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

import type Point from '../../../common/Point'
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid, isNumber } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import { alpha } from './measureCommon'

/**
 * 'ghostFeed' — TradingView Ghost Feed (simplified copy semantics).
 *
 * Two anchors: P1 marks the end of the source window — the N bars
 * immediately preceding it are the source (N = |index2 − index1|, capped).
 * The ghost is a faded copy of those bars drawn to the RIGHT of P1 at
 * bar slots index1+1 … index1+N, rigidly offset in price so the copy's
 * last close lands on P2's price (the "dragged offset"). P2's x-position
 * only controls N; the copy always replays forward from the anchor.
 *
 * Mini candles (wick + body rects) batch into two rect figures — up and
 * down — so figure count stays flat regardless of N. A dashed connector
 * shows the applied offset vector.
 */
export interface GhostFeedExtendData {
  /** Up-candle color (default TV green). */
  upColor?: string
  /** Down-candle color (default TV red). */
  downColor?: string
  /** Ghost opacity 0..1 (default 0.5). */
  opacity?: number
}

const DEFAULT_UP = '#26A69A'
const DEFAULT_DOWN = '#EF5350'
const DEFAULT_OPACITY = 0.5
const GUIDE_COLOR = '#9598A1'
const MAX_GHOST_BARS = 300

/** Narrow internal-store access (kernel forecast pattern) for index↔time. */
interface StoreIndexAccess {
  timestampToDataIndex: (timestamp: number) => number
}

/** Resolve a point's bar index (dataIndex first, timestamp fallback). */
function pointBarIndex (point: Partial<Point>, store: StoreIndexAccess): number | null {
  if (isNumber(point.dataIndex)) {
    return Math.round(point.dataIndex)
  }
  if (isNumber(point.timestamp)) {
    return store.timestampToDataIndex(point.timestamp)
  }
  return null
}

const ghostFeed: OverlayTemplate<GhostFeedExtendData> = {
  name: 'ghostFeed',
  totalStep: 3,
  cullable: false,
  figureCacheDataRev: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, xAxis, yAxis, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) {
      return []
    }
    const ext: GhostFeedExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const upColor = ext.upColor ?? DEFAULT_UP
    const downColor = ext.downColor ?? DEFAULT_DOWN
    const opacity = isNumber(ext.opacity) ? Math.min(1, Math.max(0, ext.opacity)) : DEFAULT_OPACITY

    const p1 = overlay.points[0] ?? {}
    const p2 = overlay.points[1] ?? {}
    const store = (chart as unknown as { getChartStore: () => StoreIndexAccess }).getChartStore()
    const i1 = pointBarIndex(p1, store)
    const i2 = pointBarIndex(p2, store)
    if (i1 === null || i2 === null) {
      return []
    }

    const dataList = chart.getDataList()
    const n = Math.min(MAX_GHOST_BARS, Math.max(1, Math.abs(i2 - i1)))
    // The N bars strictly preceding the anchor are the source window.
    const srcEnd = Math.min(i1 - 1, dataList.length - 1)
    const srcStart = Math.max(0, srcEnd - n + 1)
    const count = srcEnd - srcStart + 1

    const figures: OverlayFigure[] = []
    const [c1, c2] = coordinates

    // Connector showing the applied offset vector (TV segment line).
    figures.push({
      key: 'gf_link',
      type: 'line',
      attrs: { coordinates: [c1, c2] },
      styles: { style: 'dashed', color: alpha(GUIDE_COLOR, 0.8), size: 1, dashedValue: [4, 4] },
      cursor: 'move'
    })

    if (count > 0) {
      // Slot → x px: xAxis handles indices past the data end; fallback
      // extrapolates from the anchors' spacing when the axis is absent.
      const anchorStep = i2 !== i1 ? Math.abs(c2.x - c1.x) / Math.abs(i2 - i1) : 0
      const xFor = (slot: number): number => {
        if (xAxis != null) {
          return xAxis.convertToPixel(slot)
        }
        return c1.x + (slot - i1) * anchorStep
      }

      // Rigid price offset: the copy's newest close lands on P2's price.
      const lastClose = dataList[srcEnd].close
      const delta = isNumber(p2.value) ? p2.value - lastClose : 0
      const yFor = (price: number): number =>
        (yAxis != null ? yAxis.convertToPixel(price + delta) : c1.y + (lastClose - price))

      const barSpace = chart.getBarSpace()
      const bodyHalf = Math.max(1, Math.round(barSpace.bar * 0.3))
      const wickHalf = Math.max(0.5, barSpace.bar * 0.06)

      const upRects: Array<{ x: number, y: number, width: number, height: number }> = []
      const downRects: Array<{ x: number, y: number, width: number, height: number }> = []
      for (let k = 0; k < count; k++) {
        const src = dataList[srcStart + k]
        const x = xFor(i1 + 1 + k)
        const up = src.close >= src.open
        const rects = up ? upRects : downRects
        const yH = yFor(src.high)
        const yL = yFor(src.low)
        // Wick.
        rects.push({
          x: x - wickHalf,
          y: Math.min(yH, yL),
          width: wickHalf * 2,
          height: Math.max(1, Math.abs(yL - yH))
        })
        // Body.
        const yO = yFor(src.open)
        const yC = yFor(src.close)
        rects.push({
          x: x - bodyHalf,
          y: Math.min(yO, yC),
          width: bodyHalf * 2,
          height: Math.max(1, Math.abs(yC - yO))
        })
      }
      if (upRects.length > 0) {
        figures.push({
          key: 'gf_up',
          type: 'rect',
          attrs: upRects,
          styles: { style: 'fill', color: alpha(upColor, opacity) },
          cursor: 'move'
        })
      }
      if (downRects.length > 0) {
        figures.push({
          key: 'gf_down',
          type: 'rect',
          attrs: downRects,
          styles: { style: 'fill', color: alpha(downColor, opacity) },
          cursor: 'move'
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
  }, {
    slot: 'point',
    // The copy reads dataList — key on the data tail so live bars refresh it.
    extraKey: ({ chart }) => {
      const dataList = chart.getDataList()
      const last = dataList.length > 0 ? dataList[dataList.length - 1] : undefined
      return `${dataList.length}:${last?.timestamp ?? 0}`
    }
  })
}

export default ghostFeed
