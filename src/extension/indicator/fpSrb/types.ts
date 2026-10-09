/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Typed extendData for Finpath - Support and Resistance Levels with Breaks.
 *
 * User-configurable settings are optional at the type-level so partial
 * updates from the UI merge cleanly; defaults are applied at runtime
 * via `FP_SRB_DEFAULT_EXTEND_DATA`.
 *
 * Runtime bookkeeping keys (prefixed with `_`) are written by the library
 * during `draw()` and consumed by:
 *   - finpath-web Y-axis label layer (`_resistancePrice` / `_supportPrice`)
 */
export interface SRBExtendData {
  // Master toggle for ALL 4 break-label types
  toggleBreaks?: boolean

  // Resistance line settings
  resistanceColor?: string
  resistanceWidth?: number
  resistanceVisible?: boolean

  // Support line settings
  supportColor?: string
  supportWidth?: number
  supportVisible?: boolean

  // 'B' green label (resistance broken + volume + clean body)
  bUpColor?: string
  bUpVisible?: boolean

  // 'B' red label (support broken + volume + clean body)
  bDownColor?: string
  bDownVisible?: boolean

  // 'Bull Wick' label (resistance broken + bull-wick body)
  bullWickColor?: string
  bullWickVisible?: boolean

  // 'Bear Wick' label (support broken + bear-wick body)
  bearWickColor?: string
  bearWickVisible?: boolean

  // Runtime bookkeeping (written by library)
  _resistancePrice?: number
  _supportPrice?: number
}

/**
 * Per-bar computed state emitted by `computeSRB()`.
 *
 * `resistance` / `support` are intentionally `undefined` at the FIRST bar of a
 * new pivot value (Pine `change() ? na`) to produce the single-bar visual gap
 * required by AC-04, and also during warmup before the first pivot is
 * confirmed.
 */
export interface SRBData {
  // Step-function series — undefined at first bar of a new pivot value
  resistance?: number
  support?: number

  // Break events (fire at the bar where close crosses the level)
  bUp?: boolean // 'B' green — resistance broken + vol + NOT bull-wick
  bDown?: boolean // 'B' red   — support broken   + vol + NOT bear-wick
  bullWick?: boolean // 'Bull Wick' — resistance broken + bull-wick body
  bearWick?: boolean // 'Bear Wick' — support broken   + bear-wick body

  // Anchor prices for label rendering
  high: number
  low: number
}
