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
import type { ActionCallback, ActionType } from '../common/Action'
import type Crosshair from '../common/Crosshair'
import type Coordinate from '../common/Coordinate'
import type Point from '../common/Point'
import type VisibleRange from '../common/VisibleRange'
import type { Period } from '../common/Period'
import type { SymbolInfo } from '../common/SymbolInfo'
import type Nullable from '../common/Nullable'
import { PaneIdConstants } from '../pane/types'
import { clone, isFunction, isNumber, isString, isValid } from '../common/utils/typeChecks'
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
   * The same mechanism also absorbs the async reload burst that follows a
   * sync-applied symbol/period change on a peer.
   */
  priming: Set<ChartSyncChannel>
  primeTimer?: number
  /**
   * Priming can never last longer than this wall-clock deadline — a chart
   * that emits nothing after attach would otherwise swallow the user's first
   * real interaction.
   */
  primeDeadline: number
  /**
   * Whether the last crosshair emit we propagated for this chart was active
   * (had a paneId). Housekeeping `{}` emits (data ticks, layout re-syncs)
   * must not wipe peer crosshairs — only a real active→cleared transition
   * propagates a clear.
   */
  lastCrosshairActive: boolean
  /**
   * Running count of absorbed priming emits. The quiet-window rearms per
   * emit, so without a count cap a sustained emit stream (fast tick feed,
   * continuous drag) could keep priming open to the wall-clock deadline and
   * swallow real user gestures.
   */
  absorbedCount: number
  /**
   * After a symbol/period apply lands via the host adapter, the peer's own
   * emit confirms the new value when its reload pipeline calls setSymbol/
   * setPeriod. Until that confirmation (or the extended deadline), view
   * channels stay muted so the reload burst can't echo the group's state.
   */
  applyAwait?: { symbol?: string, period?: string }
  applyDeadline: number
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
    // Deep-copy so the mirror never shares mutable objects with the source.
    extendData: isValid(overlay.extendData) ? clone(overlay.extendData) : overlay.extendData,
    styles: isValid(overlay.styles) ? clone(overlay.styles) : overlay.styles
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
  // Group assignments made before the chart was attached.
  const pendingGroups = new Map<Chart, Nullable<string>>()

  // Canonical identity keys. Whole-object JSON.stringify is fragile — a
  // merged symbol (leftover fields, different key order) serializes
  // differently from the source's and defeats dedupe.
  function symbolKey (symbol: SymbolInfo): string {
    return symbol.ticker
  }

  function periodKey (period: Period): string {
    return `${period.type}/${period.span}`
  }

  const PRIME_QUIET_MS = 250
  const PRIME_MAX_MS = 2000
  /** Post-apply suppression can outlive the setup cap — host adapters go
   * through their own state pipeline (React store → effect → setSymbol →
   * fetch → resetData), so the confirming emit may arrive seconds later. */
  const PRIME_APPLY_MAX_MS = 8000
  /** A setup/reload burst is a handful of emits; anything beyond this many
   * absorbs is a real interaction stream and must not be eaten. */
  const PRIME_ABSORB_MAX = 80

  function hasAwaitedApply (entry: AttachedChart): boolean {
    return isValid(entry.applyAwait) &&
      (isValid(entry.applyAwait.symbol) || isValid(entry.applyAwait.period))
  }

  function clearPrimeTimer (entry: AttachedChart): void {
    if (isValid(entry.primeTimer)) {
      clearTimeout(entry.primeTimer)
      entry.primeTimer = undefined
    }
  }

  function releasePriming (entry: AttachedChart): void {
    entry.priming.clear()
    entry.applyAwait = undefined
    entry.absorbedCount = 0
    clearPrimeTimer(entry)
  }

  function armPrimeTimer (entry: AttachedChart): void {
    clearPrimeTimer(entry)
    entry.primeTimer = setTimeout(() => {
      entry.priming.clear()
      entry.absorbedCount = 0
      entry.primeTimer = undefined
    }, PRIME_QUIET_MS) as unknown as number
  }

  /**
   * Returns true when the emit should be absorbed. Two suppression modes:
   * - setup priming: quiet-window rearmed per emit, bounded by wall-clock
   *   deadline AND an absorb count cap (sustained emit streams are real
   *   gestures, not bursts).
   * - post-apply await: view channels stay muted until the peer's own
   *   symbol/period emit confirms the applied value, or the extended
   *   deadline passes — covers slow async reload pipelines.
   */
  function absorbPrimed (entry: AttachedChart, channel: ChartSyncChannel): boolean {
    const viewChannel =
      channel === 'timeRange' || channel === 'crosshair' ||
      channel === 'zoom' || channel === 'drawings'
    if (viewChannel && hasAwaitedApply(entry)) {
      if (Date.now() < entry.applyDeadline && entry.absorbedCount < PRIME_ABSORB_MAX) {
        entry.absorbedCount++
        return true
      }
      releasePriming(entry)
      return false
    }
    if (!entry.priming.has(channel)) {
      return false
    }
    if (Date.now() >= entry.primeDeadline || entry.absorbedCount >= PRIME_ABSORB_MAX) {
      releasePriming(entry)
      return false
    }
    entry.absorbedCount++
    armPrimeTimer(entry)
    return true
  }

  /**
   * After a symbol/period apply, the peer's reload pipeline re-emits
   * asynchronously (resetData → range adjusts, housekeeping crosshair emits,
   * bar-space restores). View channels are muted via applyAwait until the
   * peer's own emit confirms the applied value (or the extended deadline).
   */
  function primeAfterApply (entry: AttachedChart): void {
    entry.priming.add('timeRange')
    entry.priming.add('crosshair')
    entry.priming.add('zoom')
    entry.priming.add('drawings')
    entry.primeDeadline = Date.now() + PRIME_MAX_MS
    armPrimeTimer(entry)
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
  // Drawing events queue per overlay id as an ORDERED event list — consecutive
  // progress/update emits collapse into the newest one (a drag burst becomes
  // one apply per frame), while remove/create/drawEnd always append so
  // terminal transitions (e.g. remove→create for a replace) can't be lost.
  interface PendingChannels { crosshair?: Crosshair, timeRange?: VisibleRange, zoom?: boolean, drawings?: Map<string, OverlayChangeEvent[]> }
  const pending = new Map<Chart, PendingChannels>()
  let frame = 0

  function schedule (source: Chart, channel: 'crosshair' | 'timeRange' | 'zoom' | 'drawings', payload?: unknown): void {
    let p = pending.get(source)
    if (!isValid(p)) {
      p = {}
      pending.set(source, p)
    }
    if (channel === 'crosshair') {
      p.crosshair = payload as Crosshair
    } else if (channel === 'timeRange') {
      p.timeRange = payload as VisibleRange
    } else if (channel === 'drawings') {
      const event = payload as OverlayChangeEvent
      let map = p.drawings
      if (!isValid(map)) {
        map = new Map<string, OverlayChangeEvent[]>()
        p.drawings = map
      }
      const list = map.get(event.overlay.id) ?? []
      const last = list[list.length - 1]
      if (
        isValid(last) &&
        (last.type === 'progress' || last.type === 'update') &&
        (event.type === 'progress' || event.type === 'update')
      ) {
        list[list.length - 1] = event
      } else {
        list.push(event)
      }
      map.set(event.overlay.id, list)
    } else {
      p.zoom = true
    }
    if (frame === 0) {
      frame = requestFrame(flush)
    }
  }

  function flush (): void {
    frame = 0
    // Snapshot-then-clear: a schedule() landing mid-flush must land in a fresh
    // queue for the next frame, not mutate entries already being dispatched.
    const entries = [...pending]
    pending.clear()
    entries.forEach(([source, p]) => {
      // Isolate per-source failures: a throwing dispatch must not abort the
      // rest of the queue or leave a poisoned entry that re-fails every frame.
      try {
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
        if (isValid(p.drawings) && channels.drawings) {
          p.drawings.forEach(events => {
            events.forEach(event => {
              try {
                dispatchOverlay(source, event)
              } catch {}
            })
          })
        }
      } catch {
        // Swallowed intentionally — see comment above.
      }
    })
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
      try {
        const store = getStore(chart)
        if (store.getDataList().length === 0) {
          // Nothing to anchor onto yet — writing a crosshair here would draw a
          // stray line near the right edge of an empty chart.
          return
        }
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
      } catch {
        // One broken peer must not drop the event for the rest of the group.
      }
    })
  }

  function dispatchTimeRange (source: Chart, range: VisibleRange): void {
    // Anchor on the last visible bar's timestamp so followers land on the
    // same moment regardless of their timeframe.
    const sourceStore = getStore(source)
    const dataList = sourceStore.getDataList()
    if (dataList.length === 0) {
      return
    }
    const anchorIndex = Math.max(0, Math.min(range.to - 1, dataList.length - 1))
    const timestamp = sourceStore.dataIndexToTimestamp(anchorIndex)
    if (!isNumber(timestamp)) {
      return
    }
    // When the source is parked at the realtime edge, carry the right-edge
    // margin too — otherwise followers glue the last bar to the border.
    const margin = sourceStore.getOffsetRightDistance()
    peers(source).forEach(({ chart }) => {
      try {
        if (getStore(chart).getDataList().length === 0) {
          return
        }
        applying.add(chart)
        try {
          chart.scrollToTimestamp(timestamp)
          if (margin > 0) {
            chart.setOffsetRightDistance(margin)
          }
        } finally {
          applying.delete(chart)
        }
      } catch {
        // One broken peer must not drop the event for the rest of the group.
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
      } catch {
        // One broken peer must not drop the event for the rest of the group.
      } finally {
        applying.delete(chart)
      }
    })
  }

  function mirrorCreate (chart: Chart, overlay: Overlay): void {
    const create = serializeOverlay(overlay)
    chart.createOverlay(
      overlay.isDrawing()
        ? { ...create, ghost: true, lock: true, synced: true }
        : { ...create, synced: true }
    )
  }

  /**
   * Replace a ghost (or stale same-id) mirror with a real interactive overlay
   * once the source finished drawing.
   */
  function promoteMirror (chart: Chart, overlay: Overlay): void {
    chart.removeOverlay({ id: overlay.id })
    chart.createOverlay({ ...serializeOverlay(overlay), synced: true })
  }

  function dispatchOverlay (source: Chart, event: OverlayChangeEvent): void {
    const overlay = event.overlay
    // Drawings are symbol-scoped: mirroring a BTC trendline onto an ETH chart
    // would anchor it to meaningless prices. Charts without a symbol set are
    // treated as "unknown" and only receive mirrors from other unknown-symbol
    // sources — call `chart.setSymbol` to enable cross-symbol filtering.
    // 'remove'/'drawEnd' are symbol-agnostic: they re-key by overlay id and must
    // always reach peers that already hold a mirror (e.g. the source switched
    // symbol mid-draw), or the ghost would be stranded forever.
    const symbolAgnostic = event.type === 'remove' || event.type === 'drawEnd'
    const sourceTicker = getStore(source).getSymbol()?.ticker
    peers(source).forEach(({ chart }) => {
      try {
        if (!symbolAgnostic && getStore(chart).getSymbol()?.ticker !== sourceTicker) {
          return
        }
        applying.add(chart)
        try {
          switch (event.type) {
            case 'create': {
              mirrorCreate(chart, overlay)
              break
            }
            case 'progress': {
              // A ghost mirror whose source already finished must be promoted —
              // overrideOverlay would update it in place but leave it locked
              // and non-interactive forever.
              const existing = chart.getOverlays({ id: overlay.id })[0] as Overlay | undefined
              if (isValid(existing) && existing.ghost && !overlay.isDrawing()) {
                promoteMirror(chart, overlay)
                break
              }
              // Hot path — narrow payload, no structural changes.
              const updated = chart.overrideOverlay({
                id: overlay.id,
                points: overlay.points.map(p => ({ ...p })),
                visible: overlay.visible
              })
              if (!updated) {
                // Follower may have attached after the overlay was created —
                // materialize it instead of dropping the update.
                mirrorCreate(chart, overlay)
              }
              break
            }
            case 'update': {
              const existing = chart.getOverlays({ id: overlay.id })[0] as Overlay | undefined
              if (isValid(existing) && existing.ghost && !overlay.isDrawing()) {
                promoteMirror(chart, overlay)
                break
              }
              // Forward the full mutable surface (styles/lock/mode/extendData/
              // zLevel...) — but never paneId/name/groupId: paneId isn't
              // re-keyed by overrideOverlay and identity fields can't change.
              const { paneId: _p, name: _n, groupId: _g, ghost: _gh, ...rest } = serializeOverlay(overlay)
              const updated = chart.overrideOverlay(rest)
              if (!updated) {
                mirrorCreate(chart, overlay)
              }
              break
            }
            case 'drawEnd': {
              // Replace the ghost with a real, interactive overlay.
              promoteMirror(chart, overlay)
              break
            }
            case 'remove': {
              // Mark the mirror as synced BEFORE removing so a host's baked
              // onRemoved (persistence/delete-with-history) skips it — the
              // peer's own same-id overlay copy would otherwise be deleted
              // from the persisted store when the source switches symbol.
              chart.overrideOverlay({ id: overlay.id, synced: true })
              chart.removeOverlay({ id: overlay.id })
              break
            }
          }
        } finally {
          applying.delete(chart)
        }
      } catch {
        // One broken peer must not drop the event for the rest of the group.
      }
    })
  }

  function dispatchSymbol (source: Chart, symbol: SymbolInfo): void {
    if (!isValid(options.onApplySymbol)) {
      return
    }
    const apply = options.onApplySymbol
    const key = symbolKey(symbol)
    peers(source).forEach(entry => {
      const { chart } = entry
      const meta = appliedMeta.get(chart) ?? {}
      if (meta.symbol === key || !charts.has(chart)) {
        return
      }
      meta.symbol = key
      appliedMeta.set(chart, meta)
      applying.add(chart)
      try {
        apply(chart, symbol)
        // Mute the peer's view channels until its own emit confirms the new
        // symbol (its reload pipeline will setSymbol asynchronously), or the
        // extended deadline passes — a slow fetch can't echo stale range/zoom.
        entry.applyAwait = { ...(entry.applyAwait ?? {}), symbol: key }
        entry.applyDeadline = Date.now() + PRIME_APPLY_MAX_MS
        primeAfterApply(entry)
      } catch {
        // A failed apply stays retryable — resync the dedupe key from the
        // store's actual state rather than blindly restoring the old value
        // (a partially-succeeded apply may already have emitted the new key).
        const liveSymbol = getStore(chart).getSymbol()
        meta.symbol = isValid(liveSymbol) ? symbolKey(liveSymbol) : undefined
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
    const key = periodKey(period)
    peers(source).forEach(entry => {
      const { chart } = entry
      const meta = appliedMeta.get(chart) ?? {}
      if (meta.period === key || !charts.has(chart)) {
        return
      }
      meta.period = key
      appliedMeta.set(chart, meta)
      applying.add(chart)
      try {
        apply(chart, period)
        entry.applyAwait = { ...(entry.applyAwait ?? {}), period: key }
        entry.applyDeadline = Date.now() + PRIME_APPLY_MAX_MS
        primeAfterApply(entry)
      } catch {
        const livePeriod = getStore(chart).getPeriod()
        meta.period = isValid(livePeriod) ? periodKey(livePeriod) : undefined
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
      meta.symbol = symbolKey(currentSymbol)
    }
    if (isValid(currentPeriod)) {
      meta.period = periodKey(currentPeriod)
    }
    appliedMeta.set(chart, meta)
    const alreadySetup = isValid(currentSymbol) && store.getDataList().length > 0
    const priming = new Set<ChartSyncChannel>()
    if (attachOptions.skipInitialEmits ?? !alreadySetup) {
      priming.add('timeRange')
      // Zoom/zoom-restore emits ride along with the setup burst now that
      // setBarSpace emits onZoom — absorb them like the range emits.
      priming.add('zoom')
      priming.add('crosshair')
      // Restore-time createOverlay emits (persisted drawings) must not mirror
      // onto peers — every chart restores its own persisted set.
      priming.add('drawings')
      if (!isValid(currentSymbol)) {
        priming.add('symbol')
      }
      if (!isValid(currentPeriod)) {
        priming.add('period')
      }
    }
    const entry: AttachedChart = {
      chart,
      groupId: 'groupId' in attachOptions
        ? attachOptions.groupId ?? null
        : pendingGroups.get(chart) ?? null,
      unsubscribes: [],
      priming,
      primeDeadline: Date.now() + PRIME_MAX_MS,
      lastCrosshairActive: false,
      absorbedCount: 0,
      applyDeadline: 0
    }
    const onCrosshairChange: ActionCallback = data => {
      if (applying.has(chart)) {
        return
      }
      const active = isString((data as Crosshair | undefined)?.paneId)
      if (active) {
        entry.lastCrosshairActive = true
      } else {
        // Housekeeping re-sync emits `{}` on every data tick — only let a
        // real active→cleared transition propagate, never a bare clear.
        if (!entry.lastCrosshairActive) {
          return
        }
        entry.lastCrosshairActive = false
      }
      if (absorbPrimed(entry, 'crosshair')) {
        return
      }
      schedule(chart, 'crosshair', data)
    }
    const onVisibleRangeChange: ActionCallback = data => {
      if (!applying.has(chart)) {
        if (absorbPrimed(entry, 'timeRange')) {
          return
        }
        schedule(chart, 'timeRange', data)
      }
    }
    const onZoom: ActionCallback = () => {
      if (!applying.has(chart)) {
        if (absorbPrimed(entry, 'zoom')) {
          return
        }
        schedule(chart, 'zoom')
      }
    }
    const onOverlayChange: ActionCallback = data => {
      if (!applying.has(chart) && channels.drawings && isValid(data)) {
        if (absorbPrimed(entry, 'drawings')) {
          return
        }
        schedule(chart, 'drawings', data)
      }
    }
    const onSymbolChange: ActionCallback = data => {
      if (!isValid(data)) {
        return
      }
      const key = symbolKey(data as SymbolInfo)
      // Any symbol emit proves the reload pipeline ran — release the
      // post-apply suppression (a different key means the apply was
      // superseded, equally done waiting).
      if (isValid(entry.applyAwait?.symbol)) {
        delete entry.applyAwait.symbol
        if (!isValid(entry.applyAwait.period)) {
          entry.applyAwait = undefined
        }
      }
      // Meta always tracks the last-known value — the channel flag gates
      // dispatch, not bookkeeping (otherwise a re-enable dedupes wrongly).
      const meta = appliedMeta.get(chart) ?? {}
      if (meta.symbol === key) {
        return
      }
      meta.symbol = key
      appliedMeta.set(chart, meta)
      if (!channels.symbol) {
        return
      }
      if (absorbPrimed(entry, 'symbol')) {
        return
      }
      dispatchSymbol(chart, data as SymbolInfo)
    }
    const onPeriodChange: ActionCallback = data => {
      if (!isValid(data)) {
        return
      }
      const key = periodKey(data as Period)
      if (isValid(entry.applyAwait?.period)) {
        delete entry.applyAwait.period
        if (!isValid(entry.applyAwait.symbol)) {
          entry.applyAwait = undefined
        }
      }
      const meta = appliedMeta.get(chart) ?? {}
      if (meta.period === key) {
        return
      }
      meta.period = key
      appliedMeta.set(chart, meta)
      if (!channels.period) {
        return
      }
      if (absorbPrimed(entry, 'period')) {
        return
      }
      dispatchPeriod(chart, data as Period)
    }
    const subs: Array<[ActionType, ActionCallback]> = [
      ['onCrosshairChange', onCrosshairChange],
      ['onVisibleRangeChange', onVisibleRangeChange],
      ['onZoom', onZoom],
      ['onOverlayChange', onOverlayChange],
      ['onSymbolChange', onSymbolChange],
      ['onPeriodChange', onPeriodChange]
    ]
    const unsubscribes: Array<() => void> = []
    try {
      subs.forEach(([type, callback]) => {
        chart.subscribeAction(type, callback)
        unsubscribes.push(() => { chart.unsubscribeAction(type, callback) })
      })
    } catch (e) {
      // Roll back partial subscriptions — a half-attached chart would leak.
      unsubscribes.forEach(unsub => { unsub() })
      appliedMeta.delete(chart)
      throw e instanceof Error ? e : new Error(String(e))
    }
    entry.unsubscribes = unsubscribes
    charts.set(chart, entry)
    pendingGroups.delete(chart)
    // Arm the quiet timer immediately — a chart that emits nothing after
    // attach must still disarm priming on its own.
    if (entry.priming.size > 0) {
      armPrimeTimer(entry)
    }
  }

  /**
   * Remove a source's in-progress drawing mirror from its peers — ghosts are
   * locked and undeletable, so a stranded one renders (and swallows input)
   * until the chart remounts.
   */
  function purgeInProgressMirror (entry: AttachedChart): void {
    try {
      const progress = getStore(entry.chart).getProgressOverlayInfo()
      if (isValid(progress) && isValid(progress.overlay)) {
        dispatchOverlay(entry.chart, { type: 'remove', overlay: progress.overlay })
      }
    } catch {
      // Torn-down chart — nothing to purge.
    }
  }

  /**
   * Last snapshot the source sends before leaving the group — peers clear a
   * still-active synced crosshair so it doesn't freeze on screen.
   */
  function pushCrosshairClear (source: Chart): void {
    if (!channels.crosshair) {
      return
    }
    peers(source).forEach(({ chart }) => {
      try {
        applying.add(chart)
        try {
          getStore(chart).setCrosshair({})
        } finally {
          applying.delete(chart)
        }
      } catch {}
    })
  }

  function detach (chart: Chart): void {
    const entry = charts.get(chart)
    if (isValid(entry)) {
      purgeInProgressMirror(entry)
      pushCrosshairClear(chart)
      entry.unsubscribes.forEach(unsub => { unsub() })
      clearPrimeTimer(entry)
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
        if (entry.groupId !== groupId) {
          // Dropping out of a group must not strand ghost mirrors — or a
          // frozen synced crosshair — on the now-former peers.
          purgeInProgressMirror(entry)
          entry.groupId = groupId
          pushCrosshairClear(chart)
        }
      } else {
        pendingGroups.set(chart, groupId)
      }
    },
    setChannel (channel: ChartSyncChannel, enabled: boolean): void {
      const was = channels[channel]
      channels[channel] = enabled
      if (was && !enabled && channel === 'drawings') {
        // Turning drawing sync off mid-draw would strand locked ghosts on
        // peers — purge the in-progress mirrors everywhere.
        charts.forEach(entry => { purgeInProgressMirror(entry) })
      }
      if (was && !enabled && channel === 'crosshair') {
        // Stop ghosted crosshairs across every group.
        charts.forEach(entry => {
          try {
            applying.add(entry.chart)
            try {
              getStore(entry.chart).setCrosshair({})
            } finally {
              applying.delete(entry.chart)
            }
          } catch {}
        })
      }
    },
    dispose (): void {
      charts.forEach((_, chart) => { detach(chart) })
      pending.clear()
      pendingGroups.clear()
      appliedMeta.clear()
      if (frame !== 0) {
        cancelFrame(frame)
        frame = 0
      }
    }
  }
}
