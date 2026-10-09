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

import type Bounding from '../../common/Bounding'
import type Coordinate from '../../common/Coordinate'
import type { KLineData } from '../../common/Data'
import type {
  OverlayFigure,
  OverlayFigureBounds,
  OverlayCreateFiguresCallback,
  OverlayCreateFiguresCallbackParams
} from '../../component/Overlay'

/**
 * Per-overlay figure-spec cache. The render pipeline calls
 * createPointFigures every frame for every visible overlay — 100 overlays ×
 * 10 figures ≈ 10k+ allocs/frame. Caching the spec objects keyed on the
 * actual inputs eliminates both the template compute and the allocations.
 *
 * The cache invalidates on:
 *  - coordinate changes (quarter-pixel-rounded signature)
 *  - overlay.figuresRev — bumped by override() styles/extendData changes and
 *    by invalidateFigures() for in-place extendData mutations
 *  - selection/hover state, currentStep, and the optional extraKey hook
 */
interface CacheEntry {
  signature: string
  figures: OverlayFigure[]
}

// Per-overlay, per-slot — an overlay wrapping more than one figure callback
// (createPointFigures + createXAxisFigures + createYAxisFigures) gets an
// independent entry per slot so the callbacks don't fight over one cache key.
const cache = new WeakMap<object, Map<string, CacheEntry>>()

/**
 * Above this count the signature switches to stride sampling — freehand
 * tools carry thousands of points and an O(N) signature per frame costs
 * more than the cache saves. The signature keeps length + first + last +
 * every STRIDE-th point. Mid-stroke vertex edits that fall between
 * sampled indices are caught by figuresRev instead — every point
 * mutation path (eventPressedPointMove / eventPressedOtherMove /
 * eventMoveForDrawing / override({points})) bumps the revision.
 */
const COORD_SIG_FULL = 64
const COORD_SIG_STRIDE = 32

function coordsSignature (coordinates: Coordinate[]): string {
  // Quarter-pixel rounding absorbs sub-pixel jitter from axis math without
  // masking real moves.
  const len = coordinates.length
  if (len <= COORD_SIG_FULL) {
    let sig = ''
    for (const c of coordinates) {
      sig += `${Math.round(c.x * 4)},${Math.round(c.y * 4)};`
    }
    return sig
  }
  let sig = `${len}|`
  for (let i = 0; i < len; i += COORD_SIG_STRIDE) {
    const c = coordinates[i]
    sig += `${Math.round(c.x * 4)},${Math.round(c.y * 4)};`
  }
  const tail = coordinates[len - 1]
  sig += `>${Math.round(tail.x * 4)},${Math.round(tail.y * 4)}`
  return sig
}

export interface FigureCacheOptions<E> {
  /**
   * Extra signature material — MANDATORY for anything the template reads
   * that is NOT covered by coordinates/figuresRev/selection/lock/bounding/
   * currentStep/isTouch (e.g. textual values that change sub-pixel,
   * time-derived labels, external flags).
   */
  extraKey?: (params: OverlayCreateFiguresCallbackParams<E>) => string
  /**
   * Cache slot — REQUIRED when the same overlay wraps more than one figure
   * callback kind (point/x-axis/y-axis figures). Give each a distinct slot
   * ('point', 'x', 'y'); defaults to a single shared slot.
   */
  slot?: string
  /**
   * Include a data revision in the signature — REQUIRED for templates whose
   * figure callbacks read `chart.getDataList()` (measure stats, regression,
   * forward bar projections). Keys on list length + last close.
   */
  includeDataRev?: boolean
}

/**
 * Wrap provenance — tools may self-wrap callbacks with withFigureCache/
 * withPerfPipeline for their own extraKey/cull needs, and the drawings
 * registry wraps them AGAIN at registration. Two nested caches with
 * independent signatures cause stale-through-inner hits (outer misses on
 * a key the inner doesn't hash, inner returns stale, outer caches it)
 * and double signature cost per frame. The registry collapses the layers
 * via {@link rewrapFigureCache} — meta records the raw callback + merged
 * options so only one cache lookup ever runs.
 */
interface WrapMeta<E> {
  /** Innermost raw callback (unwraps nested layers). */
  base: OverlayCreateFiguresCallback<E>
  options?: FigureCacheOptions<E> & ViewportCullOptions
  /** True when the base was composed with withViewportCull. */
  viewportCull: boolean
}

const WRAP_META = new WeakMap<OverlayCreateFiguresCallback<never>, WrapMeta<never>>()

/**
 * CONTRACT: the returned array is SHARED — the view and every subsequent
 * createFigures call see the same instance until the signature changes.
 * Templates must treat it as read-only (never push/splice/mutate figure
 * attrs on the result).
 */
export function withFigureCache<E> (
  fn: OverlayCreateFiguresCallback<E>,
  options?: FigureCacheOptions<E>
): OverlayCreateFiguresCallback<E> {
  const wrapped = (params: OverlayCreateFiguresCallbackParams<E>): OverlayFigure[] => {
    let dataRev = ''
    if (options?.includeDataRev === true) {
      const list = params.chart.getDataList()
      const first = list[0] as KLineData | undefined
      const last = list[list.length - 1] as KLineData | undefined
      // length + window identity + last-bar OHLCV — same-length rewrites
      // and last-bar updates that don't touch close still invalidate.
      dataRev = `|d${list.length}:${first?.timestamp ?? ''}-${last?.timestamp ?? ''}:` +
        `${last?.open ?? ''},${last?.high ?? ''},${last?.low ?? ''},${last?.close ?? ''},${last?.volume ?? ''}`
    }
    // envRev — Store's monotonic environment counter (theme, symbol,
    // precision, period, formatters, locale, timezone). It lives on the
    // ChartStore, reached through Chart.getChartStore(); absent on older
    // kernels → 0, which simply keeps the previous behavior.
    const envRev = (params.chart as unknown as { getChartStore?: () => ({ getEnvRev?: () => number } | null) })
      .getChartStore?.()?.getEnvRev?.() ?? 0
    const signature =
      coordsSignature(params.coordinates) +
      `|r${params.overlay.figuresRev}` +
      `|e${envRev}` +
      `|s${params.isSelected === true ? 1 : 0}h${params.isHovered === true ? 1 : 0}` +
      `|l${params.overlay.lock ? 1 : 0}` +
      `|b${params.bounding.width}x${params.bounding.height}` +
      `|c${params.overlay.currentStep}` +
      `|t${params.isTouch === true ? 1 : 0}` +
      `|h${params.hoveredFigureKey ?? ''}` +
      dataRev +
      `|k${options?.extraKey?.(params) ?? ''}`

    const slotKey = options?.slot ?? ''
    let slots = cache.get(params.overlay)
    const entry = slots?.get(slotKey)
    if (entry !== undefined && entry.signature === signature) {
      return entry.figures
    }
    const result = fn(params)
    const figures = Array.isArray(result) ? result : [result]
    if (slots === undefined) {
      slots = new Map()
      cache.set(params.overlay, slots)
    }
    slots.set(slotKey, { signature, figures })
    return figures
  }
  WRAP_META.set(
    wrapped as unknown as OverlayCreateFiguresCallback<never>,
    { base: fn as OverlayCreateFiguresCallback<never>, options: options as WrapMeta<never>['options'], viewportCull: false }
  )
  return wrapped
}

/**
 * Collapse a self-wrapped callback into a single cache layer owned by the
 * caller's options — the registry uses this so a tool that applied
 * withFigureCache/withPerfPipeline itself doesn't pay two signature
 * computations or suffer stale-through-inner hits. The returned wrapper
 * keeps the tool's viewport-cull + extraKey and adopts the caller's
 * slot/includeDataRev.
 */
export function rewrapFigureCache<E> (
  fn: OverlayCreateFiguresCallback<E>,
  options?: FigureCacheOptions<E>
): OverlayCreateFiguresCallback<E> {
  const meta = WRAP_META.get(fn as unknown as OverlayCreateFiguresCallback<never>) as WrapMeta<E> | undefined
  if (meta === undefined) {
    return withFigureCache(fn, options)
  }
  const inner = meta.viewportCull ? withViewportCull(meta.base, meta.options) : meta.base
  return withFigureCache(inner, {
    includeDataRev: options?.includeDataRev === true || meta.options?.includeDataRev === true,
    extraKey: meta.options?.extraKey ?? options?.extraKey,
    slot: options?.slot
  })
}

export interface ViewportCullOptions {
  /**
   * Expand the viewport by this many px before dropping figures — keeps
   * partially-visible decorations (labels, line caps) alive near edges.
   * Default 24.
   */
  margin?: number
}

function boundsOutside (bounds: OverlayFigureBounds, bounding: Bounding, margin: number): boolean {
  return (
    bounds.x + bounds.width < -margin ||
    bounds.x > bounding.width + margin ||
    bounds.y + bounds.height < -margin ||
    bounds.y > bounding.height + margin
  )
}

/**
 * Drop figures that declare `bounds` fully outside the viewport. Figures
 * without bounds are always kept (opt-in per figure).
 */
export function withViewportCull<E> (
  fn: OverlayCreateFiguresCallback<E>,
  options?: ViewportCullOptions
): OverlayCreateFiguresCallback<E> {
  const margin = options?.margin ?? 24
  return (params) => {
    const result = fn(params)
    const figures = Array.isArray(result) ? result : [result]
    const { bounding } = params
    return figures.filter(figure => {
      const bounds = figure.bounds
      return bounds === undefined || !boundsOutside(bounds, bounding, margin)
    })
  }
}

/**
 * Convenience: cache → cull. The composition order matters — cull is inner
 * so off-screen figures never enter the cache output.
 */
export function withPerfPipeline<E> (
  fn: OverlayCreateFiguresCallback<E>,
  options?: FigureCacheOptions<E> & ViewportCullOptions
): OverlayCreateFiguresCallback<E> {
  const wrapped = withFigureCache(withViewportCull(fn, options), options)
  // Tag with the RAW callback so rewrapFigureCache rebuilds cull+cache in
  // one layer instead of treating the culled wrapper as the base.
  WRAP_META.set(
    wrapped as unknown as OverlayCreateFiguresCallback<never>,
    { base: fn as OverlayCreateFiguresCallback<never>, options: options as WrapMeta<never>['options'], viewportCull: true }
  )
  return wrapped
}
