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

import type ChartImp from '../Chart'
import type { Chart } from '../Chart'
import type { ActionCallback } from '../common/Action'
import type Crosshair from '../common/Crosshair'
import type Coordinate from '../common/Coordinate'
import type Point from '../common/Point'
import type VisibleRange from '../common/VisibleRange'
import type { Period } from '../common/Period'
import type { SymbolInfo } from '../common/SymbolInfo'
import type Nullable from '../common/Nullable'
import { PaneIdConstants } from '../pane/types'
import { isFunction, isNumber, isString, isValid } from '../common/utils/typeChecks'
import type { Overlay, OverlayChangeEvent, OverlayCreate } from '../component/Overlay'

/**
 * Synchronizable channels. All default to `true` when a chart is attached.
 */
export type ChartSyncChannel = 'crosshair' | 'timeRange' | 'zoom' | 'drawings' | 'symbol' | 'period'

export type ChartSyncChannels = Partial<Record<ChartSyncChannel, boolean>>

/**
 * Suggested default palette for group indicators. Host apps may map these
 * onto their own design tokens.
 */
export const SYNC_GROUP_COLORS = [
  '#2962FF', '#F23645', '#FF9800', '#9C27B0',
  '#00BCD4', '#4CAF50', '#795548', '#607D8B'
]

export interface ChartSyncOptions {
  channels?: ChartSyncChannels
  /**
   * The library never fetches data. When a symbol/period change must be
   * propagated to peer charts, the host receives the peer chart plus the
   * new value and is expected to call `chart.setSymbol(...)`/`setPeriod(...)`
   * (or its own reload routine) on it.
   */
  onApplySymbol?: (chart: Chart, symbol: SymbolInfo) => void
  onApplyPeriod?: (chart: Chart, period: Period) => void
}

export interface ChartSyncAttachOptions {
  /**
   * Charts sharing the same non-null group id synchronize with each other.
   * Charts without a group never sync.
   */
  groupId?: string | null
  /**
   * When true (default for a chart that hasn't finished loading), symbol /
   * period / visible-range emits during the initial setup burst are treated
   * as the chart's baseline and are not propagated — prevents a freshly
   * mounted chart from hijacking its peers while its data pipeline performs
   * `setSymbol`/`setPeriod`/`resetData`. The burst is detected via a short
   * quiet window; the first emit after the chart settles propagates normally.
   * Pass `false` when attaching to a chart that is already fully loaded.
   */
  skipInitialEmits?: boolean
}

export interface ChartSync {
  attach: (chart: Chart, options?: ChartSyncAttachOptions) => void
  detach: (chart: Chart) => void
  setGroup: (chart: Chart, groupId: Nullable<string>) => void
  setChannel: (channel: ChartSyncChannel, enabled: boolean) => void
  dispose: () => void
}

interface AttachedChart {
  chart: Chart
  groupId: Nullable<string>
  unsubscribes: Array<() => void>
  /**
   * Channels that still need their emits absorbed as setup baseline instead
   * of propagated (see `skipInitialEmits`). Setup emits arrive as a burst, so
   * priming stays armed until the chart has been quiet for a settle window.
   */
  priming: Set<'timeRange' | 'symbol' | 'period'>
  primeTimer?: number
}

type ChartStoreInternal = ReturnType<ChartImp['getChartStore']>

interface FrameHost {
  requestAnimationFrame?: (cb: () => void) => number
  cancelAnimationFrame?: (id: number) => void
}
const frameHost = globalThis as FrameHost
const requestFrame: (cb: () => void) => number = isFunction<(cb: () => void) => number>(frameHost.requestAnimationFrame)
  ? (cb) => frameHost.requestAnimationFrame?.(cb) ?? 0
  : (cb) => setTimeout(cb, 16) as unknown as number
const cancelFrame: (id: number) => void = isFunction<(id: number) => void>(frameHost.cancelAnimationFrame)
  ? (id) => { frameHost.cancelAnimationFrame?.(id) }
  : (id) => { clearTimeout(id) }

function getStore (chart: Chart): ChartStoreInternal {
  return (chart as ChartImp).getChartStore()
}

function serializeOverlay (overlay: Overlay): OverlayCreate {
  return {
    id: overlay.id,
    groupId: overlay.groupId,
    paneId: overlay.paneId,
    name: overlay.name,
    lock: overlay.lock,
    visible: overlay.visible,
    zLevel: overlay.zLevel,
    needDefaultPointFigure: overlay.needDefaultPointFigure,
    needDefaultXAxisFigure: overlay.needDefaultXAxisFigure,
    needDefaultYAxisFigure: overlay.needDefaultYAxisFigure,
    mode: overlay.mode,
    modeSensitivity: overlay.modeSensitivity,
    points: overlay.points.map(p => ({ ...p })),
    extendData: overlay.extendData,
    styles: overlay.styles
  }
}

/**
 * Group-scoped multi-chart synchronization. Everything runs at the library
 * action level — no framework, no React — so per-frame interactions
 * (crosshair, drags, drawing progress) propagate without a render loop.
 */
export function createChartSync (options: ChartSyncOptions = {}): ChartSync {
  const channels: Record<ChartSyncChannel, boolean> = {
    crosshair: true,
    timeRange: true,
    zoom: true,
    drawings: true,
    symbol: true,
    period: true,
    ...options.channels
  }
  const charts = new Map<Chart, AttachedChart>()
  // Charts currently being written to by the sync engine — events emitted
  // while applying are echoes and must not be re-broadcast.
  const applying = new Set<Chart>()
  // Symbol/period applies typically re-enter asynchronously (the host's
  // adapter goes through its own state before calling chart.setSymbol) —
  // suppress echoes by value instead of only by synchronous flag.
  const appliedMeta = new Map<Chart, { symbol?: string, period?: string }>()

  function metaKey (value: unknown): string {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  function peers (source: Chart): AttachedChart[] {
    const sourceEntry = charts.get(source)
    if (!isValid(sourceEntry) || !isString(sourceEntry.groupId)) {
      return []
    }
    const list: AttachedChart[] = []
    charts.forEach(entry => {
      if (entry.chart !== source && entry.groupId === sourceEntry.groupId) {
        list.push(entry)
      }
    })
    return list
  }

  // Latest payload per source chart per channel, flushed once per frame.
  interface PendingChannels { crosshair?: Crosshair, timeRange?: VisibleRange, zoom?: boolean }
  const pending = new Map<Chart, PendingChannels>()
  let frame = 0

  function schedule (source: Chart, channel: 'crosshair' | 'timeRange' | 'zoom', payload?: unknown): void {
    let p = pending.get(source)
    if (!isValid(p)) {
      p = {}
      pending.set(source, p)
    }
    if (channel === 'crosshair') {
      p.crosshair = payload as Crosshair
    } else if (channel === 'timeRange') {
      p.timeRange = payload as VisibleRange
    } else {
      p.zoom = true
    }
    if (frame === 0) {
      frame = requestFrame(flush)
    }
  }

  function flush (): void {
    frame = 0
    pending.forEach((p, source) => {
      if (!charts.has(source)) {
        return
      }
      if (p.crosshair !== undefined && channels.crosshair) {
        dispatchCrosshair(source, p.crosshair)
      }
      if (p.timeRange !== undefined && channels.timeRange) {
        dispatchTimeRange(source, p.timeRange)
      }
      if (p.zoom === true && channels.zoom) {
        dispatchZoom(source)
      }
    })
    pending.clear()
  }

  function dispatchCrosshair (source: Chart, crosshair: Crosshair): void {
    const paneId = crosshair.paneId
    if (!isString(paneId)) {
      peers(source).forEach(({ chart }) => {
        const store = getStore(chart)
        applying.add(chart)
        try {
          store.setCrosshair({})
        } finally {
          applying.delete(chart)
        }
      })
      return
    }
    // Translate the source pixel position into logical values — timestamp for
    // the x axis, price for the y axis — so the follower crosshair lands on the
    // same moment and price level regardless of its own timeframe/scale.
    const sourcePoint = isNumber(crosshair.x)
      ? (source.convertFromPixel([{ x: crosshair.x, y: crosshair.y }], { paneId }) as Array<Partial<Point>>)[0]
      : null
    const timestamp = crosshair.timestamp ?? sourcePoint?.timestamp
    const value = sourcePoint?.value
    if (!isNumber(timestamp)) {
      return
    }
    peers(source).forEach(({ chart }) => {
      const store = getStore(chart)
      applying.add(chart)
      try {
        const toCoordinate = (point: Partial<Point>, targetPaneId: string): Partial<Coordinate> => {
          const result = chart.convertToPixel(point, { paneId: targetPaneId })
          return Array.isArray(result) ? result[0] : result
        }
        let coordinate = toCoordinate({ timestamp, value }, paneId)
        let targetPaneId = paneId
        if (!isNumber(coordinate.x) && paneId !== PaneIdConstants.CANDLE) {
          // The source crosshair sat on a pane the follower does not have
          // (e.g. an indicator pane that exists only on the source). Fall back
          // to the candle pane so the vertical line and legend still sync.
          coordinate = toCoordinate({ timestamp }, PaneIdConstants.CANDLE)
          targetPaneId = PaneIdConstants.CANDLE
        }
        if (isNumber(coordinate.x)) {
          store.setCrosshair({ x: coordinate.x, y: coordinate.y, paneId: targetPaneId })
        }
      } finally {
        applying.delete(chart)
      }
    })
  }

  function dispatchTimeRange (source: Chart, range: VisibleRange): void {
    // Anchor on the last visible bar's timestamp so followers land on the
    // same moment regardless of their timeframe.
    const sourceStore = getStore(source)
    const dataList = sourceStore.getDataList()
    const anchorIndex = Math.min(range.to - 1, dataList.length - 1)
    const timestamp = sourceStore.dataIndexToTimestamp(anchorIndex)
    if (!isNumber(timestamp)) {
      return
    }
    peers(source).forEach(({ chart }) => {
      applying.add(chart)
      try {
        chart.scrollToTimestamp(timestamp)
      } finally {
        applying.delete(chart)
      }
    })
  }

  function dispatchZoom (source: Chart): void {
    // Absolute bar-space parity — same bar width on every grouped chart.
    const bar = source.getBarSpace().bar
    peers(source).forEach(({ chart }) => {
      applying.add(chart)
      try {
        chart.setBarSpace(bar)
      } finally {
        applying.delete(chart)
      }
    })
  }

  function dispatchOverlay (source: Chart, event: OverlayChangeEvent): void {
    const overlay = event.overlay
    // Drawings are symbol-scoped: mirroring a BTC trendline onto an ETH chart
    // would anchor it to meaningless prices. Charts without a symbol set are
    // treated as "unknown" and only receive mirrors from other unknown-symbol
    // sources — call `chart.setSymbol` to enable cross-symbol filtering.
    const sourceTicker = getStore(source).getSymbol()?.ticker
    peers(source).forEach(({ chart }) => {
      if (getStore(chart).getSymbol()?.ticker !== sourceTicker) {
        return
      }
      applying.add(chart)
      try {
        switch (event.type) {
          case 'create': {
            const create = serializeOverlay(overlay)
            if (overlay.isDrawing()) {
              // Mirror the in-progress drawing as a locked ghost — renders
              // partial points without arming or swallowing input.
              chart.createOverlay({ ...create, ghost: true, lock: true })
            } else {
              chart.createOverlay(create)
            }
            break
          }
          case 'progress':
          case 'update': {
            const updated = chart.overrideOverlay({
              id: overlay.id,
              points: overlay.points.map(p => ({ ...p })),
              visible: overlay.visible
            })
            if (!updated) {
              // Follower may have attached after the overlay was created —
              // materialize it instead of dropping the update.
              const create = serializeOverlay(overlay)
              chart.createOverlay(overlay.isDrawing() ? { ...create, ghost: true, lock: true } : create)
            }
            break
          }
          case 'drawEnd': {
            // Replace the ghost with a real, interactive overlay.
            chart.removeOverlay({ id: overlay.id })
            chart.createOverlay(serializeOverlay(overlay))
            break
          }
          case 'remove': {
            chart.removeOverlay({ id: overlay.id })
            break
          }
        }
      } finally {
        applying.delete(chart)
      }
    })
  }

  function dispatchSymbol (source: Chart, symbol: SymbolInfo): void {
    if (!isValid(options.onApplySymbol)) {
      return
    }
    const apply = options.onApplySymbol
    const key = metaKey(symbol)
    peers(source).forEach(({ chart }) => {
      const meta = appliedMeta.get(chart) ?? {}
      if (meta.symbol === key) {
        return
      }
      meta.symbol = key
      appliedMeta.set(chart, meta)
      applying.add(chart)
      try {
        apply(chart, symbol)
      } finally {
        applying.delete(chart)
      }
    })
  }

  function dispatchPeriod (source: Chart, period: Period): void {
    if (!isValid(options.onApplyPeriod)) {
      return
    }
    const apply = options.onApplyPeriod
    const key = metaKey(period)
    peers(source).forEach(({ chart }) => {
      const meta = appliedMeta.get(chart) ?? {}
      if (meta.period === key) {
        return
      }
      meta.period = key
      appliedMeta.set(chart, meta)
      applying.add(chart)
      try {
        apply(chart, period)
      } finally {
        applying.delete(chart)
      }
    })
  }

  function attach (chart: Chart, attachOptions: ChartSyncAttachOptions = {}): void {
    if (charts.has(chart)) {
      return
    }
    const store = getStore(chart)
    // Seed the value-dedupe keys from the chart's current state so re-emitted
    // setup values never propagate; when attaching before the data pipeline
    // has run, additionally prime the first emit of each channel as baseline.
    const meta = appliedMeta.get(chart) ?? {}
    const currentSymbol = store.getSymbol()
    const currentPeriod = store.getPeriod()
    if (isValid(currentSymbol)) {
      meta.symbol = metaKey(currentSymbol)
    }
    if (isValid(currentPeriod)) {
      meta.period = metaKey(currentPeriod)
    }
    appliedMeta.set(chart, meta)
    const alreadySetup = isValid(currentSymbol) && store.getDataList().length > 0
    const priming = new Set<'timeRange' | 'symbol' | 'period'>()
    if (attachOptions.skipInitialEmits ?? !alreadySetup) {
      priming.add('timeRange')
      if (!isValid(currentSymbol)) {
        priming.add('symbol')
      }
      if (!isValid(currentPeriod)) {
        priming.add('period')
      }
    }
    const entry: AttachedChart = {
      chart,
      groupId: attachOptions.groupId ?? null,
      unsubscribes: [],
      priming
    }
    const onCrosshairChange: ActionCallback = data => {
      if (!applying.has(chart)) {
        schedule(chart, 'crosshair', data)
      }
    }
    // Setup emits arrive as a burst (setSymbol → setPeriod → data → range
    // adjusts). While priming, keep absorbing and rearm a quiet timer — the
    // burst drains together, so trailing emits can't slip through and hijack
    // peers. The first emit after ~250ms of quiet is a real user change.
    const absorbPrimed = (): void => {
      if (isValid(entry.primeTimer)) {
        clearTimeout(entry.primeTimer)
      }
      entry.primeTimer = setTimeout(() => {
        entry.priming.clear()
        entry.primeTimer = undefined
      }, 250) as unknown as number
    }
    const onVisibleRangeChange: ActionCallback = data => {
      if (!applying.has(chart)) {
        if (entry.priming.has('timeRange')) {
          absorbPrimed()
          return
        }
        schedule(chart, 'timeRange', data)
      }
    }
    const onZoom: ActionCallback = () => {
      if (!applying.has(chart)) {
        schedule(chart, 'zoom')
      }
    }
    const onOverlayChange: ActionCallback = data => {
      if (!applying.has(chart) && channels.drawings && isValid(data)) {
        dispatchOverlay(chart, data as OverlayChangeEvent)
      }
    }
    const onSymbolChange: ActionCallback = data => {
      if (!channels.symbol || !isValid(data)) {
        return
      }
      const key = metaKey(data)
      const meta = appliedMeta.get(chart) ?? {}
      if (meta.symbol === key) {
        return
      }
      meta.symbol = key
      appliedMeta.set(chart, meta)
      if (entry.priming.has('symbol')) {
        absorbPrimed()
        return
      }
      dispatchSymbol(chart, data as SymbolInfo)
    }
    const onPeriodChange: ActionCallback = data => {
      if (!channels.period || !isValid(data)) {
        return
      }
      const key = metaKey(data)
      const meta = appliedMeta.get(chart) ?? {}
      if (meta.period === key) {
        return
      }
      meta.period = key
      appliedMeta.set(chart, meta)
      if (entry.priming.has('period')) {
        absorbPrimed()
        return
      }
      dispatchPeriod(chart, data as Period)
    }
    chart.subscribeAction('onCrosshairChange', onCrosshairChange)
    chart.subscribeAction('onVisibleRangeChange', onVisibleRangeChange)
    chart.subscribeAction('onZoom', onZoom)
    chart.subscribeAction('onOverlayChange', onOverlayChange)
    chart.subscribeAction('onSymbolChange', onSymbolChange)
    chart.subscribeAction('onPeriodChange', onPeriodChange)
    entry.unsubscribes = [
      () => { chart.unsubscribeAction('onCrosshairChange', onCrosshairChange) },
      () => { chart.unsubscribeAction('onVisibleRangeChange', onVisibleRangeChange) },
      () => { chart.unsubscribeAction('onZoom', onZoom) },
      () => { chart.unsubscribeAction('onOverlayChange', onOverlayChange) },
      () => { chart.unsubscribeAction('onSymbolChange', onSymbolChange) },
      () => { chart.unsubscribeAction('onPeriodChange', onPeriodChange) }
    ]
    charts.set(chart, entry)
  }

  function detach (chart: Chart): void {
    const entry = charts.get(chart)
    if (isValid(entry)) {
      entry.unsubscribes.forEach(unsub => { unsub() })
      if (isValid(entry.primeTimer)) {
        clearTimeout(entry.primeTimer)
      }
      charts.delete(chart)
      pending.delete(chart)
      appliedMeta.delete(chart)
    }
  }

  return {
    attach,
    detach,
    setGroup (chart: Chart, groupId: Nullable<string>): void {
      const entry = charts.get(chart)
      if (isValid(entry)) {
        entry.groupId = groupId
      }
    },
    setChannel (channel: ChartSyncChannel, enabled: boolean): void {
      channels[channel] = enabled
    },
    dispose (): void {
      charts.forEach(entry => {
        entry.unsubscribes.forEach(unsub => { unsub() })
      })
      charts.clear()
      pending.clear()
      appliedMeta.clear()
      if (frame !== 0) {
        cancelFrame(frame)
        frame = 0
      }
    }
  }
}
