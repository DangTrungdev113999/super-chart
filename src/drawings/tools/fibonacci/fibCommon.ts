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

import { isArray, isNumber } from '../../../common/utils/typeChecks'
import { SymbolDefaultPrecisionConstants } from '../../../common/SymbolInfo'

import type { Chart } from '../../../Chart'
import type { Overlay } from '../../../component/Overlay'
import type { YAxis } from '../../../component/YAxis'

/**
 * Shared level row for every level-driven fib tool. The lib settings
 * dialog's levels tab binds the whole array verbatim — never per-index
 * merge (AUTHORING §Data contract).
 */
export interface FibLevel {
  visible: boolean
  /** Ratio/fib-number multiplier for the tool's construction. */
  coeff: number
  color: string
  /** Custom label text — replaces the coeff text when set (TV `level.text`). */
  label?: string
}

/**
 * Shared extendData envelope for fib-pack tools. Levels live at
 * `extendData.fib.levels` per the pack spec; `extendData.levels` and
 * `extendData.data.levels` are accepted as read fallbacks (lib settings
 * dialog + consumer payloads write there).
 */
export interface FibExtendData {
  fib?: {
    levels?: FibLevel[]
    /** Fills between adjacent visible levels (default true, TV parity). */
    fillBetween?: boolean
  }
  levels?: FibLevel[]
  data?: { levels?: FibLevel[] }
  /** Extend level lines to the left pane edge. */
  extendLeft?: boolean
  /** Extend level lines to the right pane edge. */
  extendRight?: boolean
  /** Dashed anchor trend line(s) (default true). */
  showTrend?: boolean
  /** Per-level index/ratio captions on time tools (default true). */
  showLabels?: boolean
}

export const FIB_TREND_COLOR = '#787b86'
export const FIB_TREND_DASH: number[] = [4, 4]
export const FIB_FILL_ALPHA = 0.1
export const FIB_LABEL_SIZE = 12
/** Cull margin (px) for vertical lines outside the pane. */
export const FIB_TIME_CULL = 100

/** 'fibonacciLine' default — TV retracement set + hidden extension rows. */
export const FIB_RETRACEMENT_LEVELS: FibLevel[] = [
  { visible: true, coeff: 0, color: '#787b86' },
  { visible: true, coeff: 0.236, color: '#f23645' },
  { visible: true, coeff: 0.382, color: '#ff9800' },
  { visible: true, coeff: 0.5, color: '#4caf50' },
  { visible: true, coeff: 0.618, color: '#089981' },
  { visible: true, coeff: 0.786, color: '#00bcd4' },
  { visible: true, coeff: 1, color: '#787b86' },
  { visible: false, coeff: 1.272, color: '#ff9800' },
  { visible: false, coeff: 1.618, color: '#2962ff' }
]

/** 'fibChannel' / 'fibExtension' default — consumer's 11-level set. */
export const FIB_EXTENSION_LEVELS: FibLevel[] = [
  { visible: true, coeff: 0, color: '#787b86' },
  { visible: true, coeff: 0.236, color: '#f23645' },
  { visible: true, coeff: 0.382, color: '#ff9800' },
  { visible: true, coeff: 0.5, color: '#4caf50' },
  { visible: true, coeff: 0.618, color: '#089981' },
  { visible: true, coeff: 0.786, color: '#00bcd4' },
  { visible: true, coeff: 1, color: '#2962ff' },
  { visible: true, coeff: 1.618, color: '#2962ff' },
  { visible: true, coeff: 2.618, color: '#f23645' },
  { visible: true, coeff: 3.618, color: '#9c27b0' },
  { visible: true, coeff: 4.236, color: '#e91e63' }
]

/** 'fibTimeZone' default — fib numbers as coeff, deduped (0,1,2,3,5,...). */
export const FIB_TIME_ZONE_LEVELS: FibLevel[] = [
  { visible: true, coeff: 0, color: '#787b86' },
  { visible: true, coeff: 1, color: '#2962ff' },
  { visible: true, coeff: 2, color: '#2962ff' },
  { visible: true, coeff: 3, color: '#2962ff' },
  { visible: true, coeff: 5, color: '#2962ff' },
  { visible: true, coeff: 8, color: '#2962ff' },
  { visible: true, coeff: 13, color: '#2962ff' },
  { visible: true, coeff: 21, color: '#2962ff' },
  { visible: true, coeff: 34, color: '#2962ff' },
  { visible: true, coeff: 55, color: '#2962ff' },
  { visible: true, coeff: 89, color: '#2962ff' }
]

/** 'fibTimeExtension' default — ratio multipliers on the time axis. */
export const FIB_TIME_EXTENSION_LEVELS: FibLevel[] = [
  { visible: true, coeff: 0, color: '#787b86' },
  { visible: true, coeff: 0.382, color: '#f23645' },
  { visible: true, coeff: 0.5, color: '#ff9800' },
  { visible: true, coeff: 0.618, color: '#4caf50' },
  { visible: true, coeff: 1, color: '#089981' },
  { visible: true, coeff: 1.382, color: '#00bcd4' },
  { visible: true, coeff: 1.618, color: '#2962ff' },
  { visible: true, coeff: 2, color: '#673ab7' },
  { visible: true, coeff: 2.382, color: '#9c27b0' },
  { visible: true, coeff: 2.618, color: '#e91e63' },
  { visible: true, coeff: 3, color: '#f44336' }
]

/**
 * Resolve the levels array for a fib overlay: `fib.levels` (pack contract)
 * first, then the `levels`/`data.levels` paths the lib settings dialog
 * binds. Whole-array shape only — invalid rows are dropped; a fully
 * empty/invalid array falls through to `defaults`.
 */
export function getFibLevels (extendData: FibExtendData | undefined, defaults: FibLevel[]): FibLevel[] {
  const ed = extendData ?? {}
  const candidates: unknown[] = [ed.fib?.levels, ed.levels, ed.data?.levels]
  for (const candidate of candidates) {
    if (isArray(candidate)) {
      const rows: FibLevel[] = []
      for (const item of candidate) {
        if (item !== null && typeof item === 'object') {
          // extendData is untyped JSON at runtime — normalize each row.
          const level = item as Partial<FibLevel>
          if (isNumber(level.coeff)) {
            rows.push({
              visible: level.visible !== false,
              coeff: level.coeff,
              color: typeof level.color === 'string' ? level.color : '#787b86',
              label: typeof level.label === 'string' ? level.label : undefined
            })
          }
        }
      }
      if (rows.length > 0) {
        return rows
      }
    }
  }
  return defaults
}

export function getFillBetween (extendData: FibExtendData | undefined): boolean {
  return extendData?.fib?.fillBetween ?? true
}

/** Visible levels sorted by coeff — adjacency order for fills. */
export function sortedVisibleLevels (levels: FibLevel[]): FibLevel[] {
  return levels.filter(level => level.visible).sort((a, b) => a.coeff - b.coeff)
}

/**
 * Precision mirror of `extension/overlay/fibonacciLine`: symbol
 * pricePrecision on candle panes, max indicator precision elsewhere.
 */
export function getPricePrecision (chart: Chart, overlay: Overlay, yAxis: YAxis | null): number {
  let precision = 0
  if (yAxis?.isInCandle() ?? true) {
    precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
  } else {
    const indicators = chart.getIndicators({ paneId: overlay.paneId })
    indicators.forEach(indicator => {
      precision = Math.max(precision, indicator.precision)
    })
  }
  return precision
}

/** Kernel fibonacciLine value formatting — decimal fold + thousands separator. */
export function formatFibPrice (chart: Chart, value: number, precision: number): string {
  return chart.getDecimalFold().format(
    chart.getThousandsSeparator().format(value.toFixed(precision))
  )
}

/** Level caption — `label` overrides the coeff text; price appended in parens. */
export function fibLevelText (level: FibLevel, priceText?: string): string {
  const coeffText = level.label ?? String(level.coeff)
  return priceText !== undefined ? `${coeffText} (${priceText})` : coeffText
}

/** #rrggbb(+alpha) — mirrors extension/overlay/lineCommon.alphaColor. */
export function fibAlphaColor (hex: string, alpha: number): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (match === null) {
    return hex
  }
  const r = parseInt(match[1], 16)
  const g = parseInt(match[2], 16)
  const b = parseInt(match[3], 16)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`
}
