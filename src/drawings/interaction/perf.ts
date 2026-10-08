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

function coordsSignature (coordinates: Coordinate[]): string {
  // Quarter-pixel rounding absorbs sub-pixel jitter from axis math without
  // masking real moves.
  let sig = ''
  for (const c of coordinates) {
    sig += `${Math.round(c.x * 4)},${Math.round(c.y * 4)};`
  }
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
 * CONTRACT: the returned array is SHARED — the view and every subsequent
 * createFigures call see the same instance until the signature changes.
 * Templates must treat it as read-only (never push/splice/mutate figure
 * attrs on the result).
 */
export function withFigureCache<E> (
  fn: OverlayCreateFiguresCallback<E>,
  options?: FigureCacheOptions<E>
): OverlayCreateFiguresCallback<E> {
  return (params) => {
    let dataRev = ''
    if (options?.includeDataRev === true) {
      const list = params.chart.getDataList()
      const last = list[list.length - 1] as KLineData | undefined
      dataRev = `|d${list.length}:${last !== undefined ? last.close : ''}`
    }
    const signature =
      coordsSignature(params.coordinates) +
      `|r${params.overlay.figuresRev}` +
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
  return withFigureCache(withViewportCull(fn, options), options)
}
