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
import type Point from '../../../common/Point'
import type { KLineData } from '../../../common/Data'
import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid, isArray, isNumber } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import { alpha } from './measureCommon'

/**
 * 'barsPattern' — TradingView Bars Pattern (LineToolBarsPattern).
 *
 * Two anchors. On completion the chart bars between the anchor bar indices
 * are captured into `extendData.pattern` (persisted — same as TV capturing
 * the pattern at addPoint) and P2 is normalized to `P1 + (count − 1)` bars
 * with the pattern's edge price diff, so the copy initially renders at
 * native scale. Afterwards the anchors only move/stretch the projection:
 *
 *   x_i = leftAnchorX + i·|x2 − x1|/(count − 1)
 *   y(p) = leftY + scale·(c(p) − c(firstEdge))
 *   scale = (rightY − leftY) / (c(lastEdge) − c(firstEdge))
 *
 * Modes (TV parity): 'bars' (high–low bars), 'openClose' (open–close
 * bodies), 'line', 'lineOpen', 'lineHigh', 'lineLow', 'lineHL2'. `mirrored`
 * reflects OHLC about the pattern mid-price; `flipped` reverses the order.
 * Gray vertical guides mark both anchors; a dashed connector joins them.
 */

interface MiniBar {
  o: number
  h: number
  l: number
  c: number
}

export type BarsPatternMode = 'bars' | 'openClose' | 'line' | 'lineOpen' | 'lineHigh' | 'lineLow' | 'lineHL2'

export interface BarsPatternExtendData {
  /** Pattern color (default TV blue). */
  color?: string
  /** Fill/stroke opacity 0..1 (default 0.75). */
  opacity?: number
  /** Render mode (default 'bars'). */
  mode?: BarsPatternMode
  /** Reflect OHLC about the pattern mid price. */
  mirrored?: boolean
  /** Reverse bar order. */
  flipped?: boolean
  /** Captured source bars — persisted (raw, untransformed). */
  pattern?: MiniBar[]
}

const MODES: ReadonlySet<string> = new Set([
  'bars', 'openClose', 'line', 'lineOpen', 'lineHigh', 'lineLow', 'lineHL2'
])

const DEFAULT_COLOR = '#2962FF'
const DEFAULT_OPACITY = 0.75
const GUIDE_COLOR = '#9598A1'
const BAR_HALF_WIDTH = 1
const MAX_PATTERN_BARS = 400

function modeField (bar: MiniBar, mode: BarsPatternMode): number {
  switch (mode) {
    case 'lineOpen': return bar.o
    case 'lineHigh': return bar.h
    case 'lineLow': return bar.l
    case 'lineHL2': return (bar.h + bar.l) / 2
    default: return bar.c
  }
}

/** TV edge maps — entry edge of the first bar (normal vs flipped). */
function firstEdgePrice (bar: MiniBar, mode: BarsPatternMode, flipped: boolean): number {
  if (mode === 'bars') return flipped ? bar.l : bar.h
  if (mode === 'openClose') return flipped ? bar.c : bar.o
  return modeField(bar, mode)
}

/** TV edge maps — exit edge of the last bar (normal vs flipped). */
function lastEdgePrice (bar: MiniBar, mode: BarsPatternMode, flipped: boolean): number {
  if (mode === 'bars') return flipped ? bar.h : bar.l
  if (mode === 'openClose') return flipped ? bar.o : bar.c
  return modeField(bar, mode)
}

function mirrorBar (bar: MiniBar, mid: number): MiniBar {
  return { o: 2 * mid - bar.o, h: 2 * mid - bar.l, l: 2 * mid - bar.h, c: 2 * mid - bar.c }
}

/** Apply mirrored/flipped transforms to a fresh display copy of the pattern. */
function transformPattern (raw: MiniBar[], mirrored: boolean, flipped: boolean): MiniBar[] {
  let pat = raw
  if (mirrored) {
    let lo = Infinity
    let hi = -Infinity
    for (const b of pat) {
      lo = Math.min(lo, b.l)
      hi = Math.max(hi, b.h)
    }
    if (hi >= lo) {
      const mid = (lo + hi) / 2
      pat = pat.map(b => mirrorBar(b, mid))
    }
  }
  if (flipped) {
    pat = pat.slice().reverse()
  }
  return pat
}

/** Extract `dataList[lo..hi]` as MiniBars, stride-decimated to MAX bars. */
function extractPattern (dataList: KLineData[], lo: number, hi: number): MiniBar[] {
  const out: MiniBar[] = []
  const count = hi - lo + 1
  const stride = Math.max(1, Math.ceil(count / MAX_PATTERN_BARS))
  for (let i = lo; i <= hi; i += stride) {
    const bar = dataList[i]
    out.push({ o: bar.open, h: bar.high, l: bar.low, c: bar.close })
  }
  return out
}

/** Narrow internal-store access (kernel forecast pattern) for index↔time. */
interface StoreIndexAccess {
  timestampToDataIndex: (timestamp: number) => number
  dataIndexToTimestamp: (dataIndex: number) => number | null | undefined
}

interface ChartIndexAccess {
  getChartStore: () => StoreIndexAccess
}

function indexStore (chart: unknown): StoreIndexAccess {
  return (chart as ChartIndexAccess).getChartStore()
}

/** Resolve a point's bar index — timestamp-first like the render path;
 * stored dataIndex goes stale by +N after a history prepend. */
function pointBarIndex (point: Partial<Point>, store: StoreIndexAccess): number | null {
  if (isNumber(point.timestamp)) {
    return store.timestampToDataIndex(point.timestamp)
  }
  if (isNumber(point.dataIndex)) {
    return Math.round(point.dataIndex)
  }
  return null
}

function readStoredPattern (extendData: unknown): MiniBar[] | null {
  const ext = isValid(extendData) ? extendData as BarsPatternExtendData : {}
  if (!isArray(ext.pattern) || ext.pattern.length === 0) {
    return null
  }
  // Defensive: pattern entries ride through JSON persistence.
  const out: MiniBar[] = []
  for (const b of ext.pattern) {
    if (isValid(b) && isNumber(b.o) && isNumber(b.h) && isNumber(b.l) && isNumber(b.c)) {
      out.push({ o: b.o, h: b.h, l: b.l, c: b.c })
    }
  }
  return out.length > 0 ? out : null
}

const barsPattern: OverlayTemplate<BarsPatternExtendData> = {
  name: 'barsPattern',
  totalStep: 3,
  cullable: false,
  figureCacheDataRev: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, bounding, yAxis, overlay, isSelected, isHovered, isTouch }) => {
    if (coordinates.length < 2) {
      return []
    }
    const ext: BarsPatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const color = ext.color ?? DEFAULT_COLOR
    const opacity = isNumber(ext.opacity) ? Math.min(1, Math.max(0, ext.opacity)) : DEFAULT_OPACITY
    const mode: BarsPatternMode = isValid(ext.mode) && MODES.has(ext.mode) ? ext.mode : 'bars'
    const mirrored = ext.mirrored ?? false
    const flipped = ext.flipped ?? false

    // Stored pattern (post-capture / restore) takes precedence; while the
    // pattern isn't captured yet (mid-draw or legacy data) derive live.
    let raw = readStoredPattern(overlay.extendData)
    if (raw === null) {
      const p1 = overlay.points[0] ?? {}
      const p2 = overlay.points[1] ?? {}
      const i0 = pointBarIndex(p1, indexStore(chart))
      const i1 = pointBarIndex(p2, indexStore(chart))
      const dataList = chart.getDataList()
      if (i0 !== null && i1 !== null && dataList.length > 0) {
        const lo = Math.max(0, Math.min(i0, i1))
        const hi = Math.min(dataList.length - 1, Math.max(i0, i1))
        raw = extractPattern(dataList, lo, hi)
      }
    }

    const figures: OverlayFigure[] = []
    const [c1, c2] = coordinates
    const leftX = Math.min(c1.x, c2.x)
    const rightX = Math.max(c1.x, c2.x)
    const leftY = c1.x <= c2.x ? c1.y : c2.y
    const rightY = c1.x <= c2.x ? c2.y : c1.y

    // Vertical guides at both anchors + the median connector (TV look).
    figures.push({
      key: 'bp_guide_l',
      type: 'line',
      attrs: { coordinates: [{ x: leftX, y: 0 }, { x: leftX, y: bounding.height }] },
      styles: { style: 'dashed', color: alpha(GUIDE_COLOR, 0.7), size: 1, dashedValue: [4, 4] },
      ignoreEvent: true
    })
    figures.push({
      key: 'bp_guide_r',
      type: 'line',
      attrs: { coordinates: [{ x: rightX, y: 0 }, { x: rightX, y: bounding.height }] },
      styles: { style: 'dashed', color: alpha(GUIDE_COLOR, 0.7), size: 1, dashedValue: [4, 4] },
      ignoreEvent: true
    })
    figures.push({
      key: 'bp_median',
      type: 'line',
      attrs: { coordinates: [{ x: leftX, y: leftY }, { x: rightX, y: rightY }] },
      styles: { style: 'dashed', color: alpha(GUIDE_COLOR, 0.7), size: 1, dashedValue: [4, 4] },
      cursor: 'move'
    })

    const pattern = raw !== null ? transformPattern(raw, mirrored, flipped) : []
    if (pattern.length > 0) {
      const len = pattern.length
      const step = len > 1 ? (rightX - leftX) / (len - 1) : 0

      // Vertical mapping: firstEdge lands on the left anchor, lastEdge on
      // the right anchor (TV re-anchoring), via the pane's price→pixel
      // conversion so log/fixed scales stay correct.
      const firstP = firstEdgePrice(pattern[0], mode, flipped)
      const lastP = lastEdgePrice(pattern[len - 1], mode, flipped)
      // Price→pixel via the pane's y-axis; -price fallback keeps the math
      // valid (linear) when the axis isn't available.
      const pc = (price: number): number => (yAxis != null ? yAxis.convertToPixel(price) : -price)
      const denom = pc(lastP) - pc(firstP)
      const scale = Math.abs(denom) > 1e-8 ? (rightY - leftY) / denom : 1
      const yFor = (price: number): number => leftY + scale * (pc(price) - pc(firstP))

      if (mode === 'bars' || mode === 'openClose') {
        const rects = pattern.map((bar, i) => {
          const x = leftX + i * step
          const ya = mode === 'bars' ? yFor(bar.h) : yFor(bar.o)
          const yb = mode === 'bars' ? yFor(bar.l) : yFor(bar.c)
          return {
            x: x - BAR_HALF_WIDTH,
            y: Math.min(ya, yb),
            width: BAR_HALF_WIDTH * 2,
            height: Math.max(1, Math.abs(yb - ya))
          }
        })
        figures.push({
          key: 'bp_bars',
          type: 'rect',
          attrs: rects,
          styles: { style: 'fill', color: alpha(color, opacity) },
          cursor: 'move'
        })
      } else {
        const trace: Coordinate[] = pattern.map((bar, i) => ({
          x: leftX + i * step,
          y: yFor(modeField(bar, mode))
        }))
        figures.push({
          key: 'bp_line',
          type: 'line',
          attrs: { coordinates: trace },
          styles: { style: 'solid', color: alpha(color, opacity), size: 2 },
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
    // Live extraction reads dataList until the pattern is captured —
    // key on the data tail so a stale preview never sticks.
    extraKey: ({ chart }) => {
      const dataList = chart.getDataList()
      const last = dataList.length > 0 ? dataList[dataList.length - 1].timestamp : 0
      return `${dataList.length}:${last}`
    }
  }),

  /**
   * TV parity: capture the source bars at draw completion into
   * extendData.pattern, order the anchors left→right, and normalize P2 so
   * the copy initially renders at native scale (span = count−1 bars and
   * P2.value = P1.value + firstEdge − lastEdge).
   */
  onDrawEnd: ({ overlay, chart }) => {
    if (overlay.ghost || overlay.synced) {
      return
    }
    const points = overlay.points
    if (!isValid(points) || points.length < 2) {
      return
    }
    const dataList = chart.getDataList()
    if (dataList.length === 0) {
      return
    }
    const store = indexStore(chart)
    const i0 = pointBarIndex(points[0], store)
    const i1 = pointBarIndex(points[1], store)
    if (i0 === null || i1 === null) {
      return
    }
    const lo = Math.max(0, Math.min(i0, i1))
    const hi = Math.min(dataList.length - 1, Math.max(i0, i1))
    const pattern = extractPattern(dataList, lo, hi)
    if (pattern.length === 0) {
      return
    }

    const ext: BarsPatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    ext.pattern = pattern
    overlay.extendData = ext

    // Left anchor first — swap point order when drawn right→left.
    if (i0 > i1) {
      const tmp = points[0]
      points[0] = points[1]
      points[1] = tmp
    }
    const mode: BarsPatternMode = isValid(ext.mode) && MODES.has(ext.mode) ? ext.mode : 'bars'
    const flipped = ext.flipped ?? false
    const disp = transformPattern(pattern, ext.mirrored ?? false, flipped)
    const firstP = firstEdgePrice(disp[0], mode, flipped)
    const lastP = lastEdgePrice(disp[disp.length - 1], mode, flipped)

    const targetIndex = Math.min(i0, i1) + (disp.length - 1)
    points[1].dataIndex = targetIndex
    const ts = store.dataIndexToTimestamp(targetIndex)
    if (ts != null) {
      points[1].timestamp = ts
    }
    if (isNumber(points[0].value)) {
      // Native scale: rightY-leftY must equal pc(lastP)-pc(firstP), which
      // under a linear axis is -(p2.value - p1.value)·k — so the delta is
      // lastP - firstP, not firstP - lastP (inverted copy otherwise).
      points[1].value = points[0].value + lastP - firstP
    }
    overlay.invalidateFigures()
  }
}

export default barsPattern
