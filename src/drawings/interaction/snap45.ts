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

import type Coordinate from '../../common/Coordinate'
import type { Chart } from '../../Chart'
import type { MouseTouchEvent } from '../../common/EventHandler'

/**
 * Persistent per-chart interaction state. Kept in a WeakMap so the kernel
 * `Chart`/`Store` types stay untouched; the floating toolbar toggles
 * `align45` through setAlign45Enabled().
 */
export interface DrawingInteractionState {
  /**
   * TradingView's "snap to 45°" persistent toggle (toolbar magnet menu).
   * When true, every drawn/dragged point snaps — as if Shift were held.
   */
  align45: boolean
}

const states = new WeakMap<Chart, DrawingInteractionState>()

export function getDrawingInteractionState (chart: Chart): DrawingInteractionState {
  let state = states.get(chart)
  if (state === undefined) {
    state = { align45: false }
    states.set(chart, state)
  }
  return state
}

export function setAlign45Enabled (chart: Chart, enabled: boolean): void {
  getDrawingInteractionState(chart).align45 = enabled
}

export function isAlign45Enabled (chart: Chart): boolean {
  return getDrawingInteractionState(chart).align45
}

/**
 * Whether a move should snap to 45° increments — Shift held during the
 * gesture, or the persistent toolbar toggle.
 */
export function isSnap45Active (chart: Chart, event?: Partial<MouseTouchEvent>): boolean {
  return event?.shiftKey === true || isAlign45Enabled(chart)
}

/**
 * Snap `to` onto the nearest 45° ray from `from`, preserving distance.
 * Operates in pixel space — convert Point↔Coordinate at the call site.
 */
export function snap45Coordinate (to: Coordinate, from: Coordinate): Coordinate {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance === 0) {
    return to
  }
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return {
    x: from.x + distance * Math.cos(snapped),
    y: from.y + distance * Math.sin(snapped)
  }
}
