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

/**
 * Shared drawing-state contract (DP-0b). Every rebuilt drawing tool carries
 * this state on `overlay.extendData.common` so persistence, the floating
 * toolbar, and interval-visibility menus can treat tools uniformly.
 *
 * The full serialized record (schema v2) is defined by the persistence
 * layer (DP-5); this is the runtime shape tools rely on.
 */
export interface DrawingCommonState {
  /**
   * Timeframes/resolutions the drawing is visible on, e.g. ['1m','5m','1D'].
   * `undefined` or empty = visible on all intervals (TradingView
   * intervalsVisibilities default).
   */
  visibleIntervals?: string[]

  /**
   * Optional per-point interval pinning — point i is only meaningful on
   * these resolutions. Used by timeframe-tied tools (alerts, markers).
   */
  pointIntervals?: Array<string[] | undefined>

  /**
   * Display z-order hint within the overlay zLevel — mirrors TradingView's
   * visual-order zorder field. The overlay's `zLevel` remains the render
   * authority; this preserves the user's "bring forward/back" stack order.
   */
  visualOrder?: number
}

/**
 * ExtendData envelope every library-owned drawing uses: tool payloads live
 * under `extendData` directly, shared cross-tool state under `.common`.
 * Helpers below keep access type-safe.
 */
export interface DrawingExtendData<T = unknown> {
  common?: DrawingCommonState
  data?: T
}

export function getCommonState (overlay: { extendData?: unknown }): DrawingCommonState {
  const ed = overlay.extendData as DrawingExtendData | undefined
  return ed?.common ?? {}
}

export function isVisibleOnInterval (overlay: { extendData?: unknown }, interval: string): boolean {
  const { visibleIntervals } = getCommonState(overlay)
  return visibleIntervals === undefined || visibleIntervals.length === 0 || visibleIntervals.includes(interval)
}

const PERIOD_TYPE_SUFFIX: Record<string, string> = {
  second: 's', minute: 'm', hour: 'h', day: 'D', week: 'W', month: 'M', year: 'Y'
}

/** Map a chart Period to the TV-style interval labels used by visibleIntervals. */
export function periodToIntervalLabel (period: { type?: string, span?: number } | null | undefined): string {
  if (period?.type === undefined) {
    return ''
  }
  return `${period.span ?? 1}${PERIOD_TYPE_SUFFIX[period.type] ?? period.type}`
}
