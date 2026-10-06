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
 * Pure formulas behind crazii.com/chart's OP / MLP / KTR / KCB (TP1-3) levels.
 *
 * PROVENANCE: fitted on 2026-10-06 against crazii's own history API
 * (sale-api.crazii.com/api/v1/chart/candle), whose rows carry the server's
 * indicator values next to every bar, and cross-checked with the lesson text
 * shipped in crazii's bundle. Match rates (exact to 1e-3):
 *   - OP  = open of the day's first bar ............ 4500/4500 intraday bars, 9 symbols
 *   - MLP = (prev day open + prev day close) / 2 ... 4457/4500 intraday bars (misses: BTC only)
 *   - KTR = OP * (1 ± n * stepPercent / 100) ....... every day/bar of 9 symbols
 *   - KCB = nearest untouched past daily opens ..... 3500/3500 bars on XAU/XAG/USOil/DAX;
 *                                                    crypto (BTC/ETH) only ~18% — crazii keeps
 *                                                    some opens its own daily bars show as touched
 * Evidence trail: ~/Desktop/crazii-chart-audit/05-cong-thuc-da-giai.md
 */

import type { KLineData } from '../../common/Data'

/**
 * KTR step per level, in percent of OP. Hand-set per symbol on crazii's side
 * (constant across every day observed), keyed by crazii's ticker.
 */
export const KTR_STEP_PERCENT: Readonly<Record<string, number>> = {
  'XAUUSD.ca': 0.4,
  'XAGUSD.ca': 0.668,
  USOil: 0.7,
  BTCUSD: 1.38,
  ETHUSD: 1.2,
  'DAX.ca': 0.369,
  'SP500.ca': 0.318,
  'Nasdaq.ca': 0.312,
  'DowJones.ca': 0.375
}

export const DEFAULT_KTR_STEP_PERCENT = 0.4

/**
 * KCX lookback (bars) per symbol, keyed by crazii's ticker. Same value on
 * every timeframe checked (5m, 15m, 1D).
 */
export const KCX_PERIOD: Readonly<Record<string, number>> = {
  'XAUUSD.ca': 17,
  'XAGUSD.ca': 17,
  USOil: 16,
  BTCUSD: 17,
  ETHUSD: 13,
  'DAX.ca': 11,
  'SP500.ca': 30,
  'Nasdaq.ca': 26,
  'DowJones.ca': 38
}

export const DEFAULT_KCX_PERIOD = 17

/** KCX full scale: a close at the n-bar low reads -3750/11 (≈ -340.91). */
export const KCX_SCALE = 3750 / 11

/** crazii clamps the KCX histogram here and flashes bars that go below it. */
export const KCX_BLINK_LEVEL = -300

/**
 * KCX ("BEARISHNESS" when non-zero) for bar `i`: Williams %R over the last
 * `period` bars (current one included) scaled by KCX_SCALE, kept only when
 * the close sits in the lower half of that range, else 0. Null during warmup.
 * Matched 454/454 bars on 8 of 9 symbols (USOil 452/454).
 */
export function kcxValue (dataList: KLineData[], i: number, period: number): number | null {
  if (i < period - 1) {
    return null
  }
  let highest = -Infinity
  let lowest = Infinity
  for (let j = i - period + 1; j <= i; j++) {
    highest = Math.max(highest, dataList[j].high)
    lowest = Math.min(lowest, dataList[j].low)
  }
  if (highest === lowest) {
    return 0
  }
  const value = KCX_SCALE * (dataList[i].close - highest) / (highest - lowest)
  return value <= -KCX_SCALE / 2 ? value : 0
}

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

/**
 * Trading-day index of a bar. crazii cuts days at its broker server's
 * midnight, so `utcOffsetMinutes` is that server's offset from UTC
 * (0 when the host already feeds server-time timestamps as UTC, like crazii's
 * own chart does).
 */
export function dayIndex (timestamp: number, utcOffsetMinutes: number): number {
  return Math.floor((timestamp + utcOffsetMinutes * MINUTE) / DAY)
}

export interface DailyBar {
  day: number
  open: number
  high: number
  low: number
  close: number
}

/** Collapses intraday bars into daily OHLC, in input order. */
export function toDailyBars (dataList: KLineData[], utcOffsetMinutes: number): DailyBar[] {
  const days: DailyBar[] = []
  for (const bar of dataList) {
    const day = dayIndex(bar.timestamp, utcOffsetMinutes)
    const last = days.length > 0 ? days[days.length - 1] : null
    if (last?.day === day) {
      last.high = Math.max(last.high, bar.high)
      last.low = Math.min(last.low, bar.low)
      last.close = bar.close
    } else {
      days.push({ day, open: bar.open, high: bar.high, low: bar.low, close: bar.close })
    }
  }
  return days
}

/**
 * Options the host passes through `indicator.extendData`.
 *
 * `dailyBars` matters: MLP needs the previous day and KCB needs months of
 * daily opens, while an intraday chart only loads a few days. Without it the
 * indicators fall back to days rebuilt from the visible bars, which leaves the
 * first loaded day without MLP and drops older untouched opens from KCB.
 */
export interface CraziiLevelsExtendData {
  dailyBars?: KLineData[]
}

/**
 * Daily bars for the indicator, merging the host's `dailyBars` with days
 * rebuilt from `dataList`. The host's bars may be a snapshot taken earlier
 * (e.g. before midnight), while the intraday list always runs up to now, so
 * for every day the intraday list covers: open comes from the host (intraday
 * may start mid-day), high/low are the union of both, close comes from intraday.
 */
export function resolveDailyBars (
  dataList: KLineData[],
  extendData: CraziiLevelsExtendData | null | undefined,
  utcOffsetMinutes: number
): DailyBar[] {
  const fromIntraday = toDailyBars(dataList, utcOffsetMinutes)
  const hostBars = extendData?.dailyBars
  if (hostBars == null || hostBars.length === 0) {
    return fromIntraday
  }
  const byDay = new Map<number, DailyBar>()
  for (const d of toDailyBars(hostBars, utcOffsetMinutes)) {
    byDay.set(d.day, d)
  }
  for (const d of fromIntraday) {
    const host = byDay.get(d.day)
    byDay.set(d.day, host === undefined
      ? d
      : { day: d.day, open: host.open, high: Math.max(host.high, d.high), low: Math.min(host.low, d.low), close: d.close })
  }
  return Array.from(byDay.values()).sort((a, b) => a.day - b.day)
}

/** MLP for a day, from the previous day's bar. */
export function midLevelPrice (prevDay: DailyBar): number {
  return (prevDay.open + prevDay.close) / 2
}

/** KTR level `n` (n = ±1, ±2, ±3) around OP. */
export function ktrLevel (op: number, stepPercent: number, n: number): number {
  return op * (1 + n * stepPercent / 100)
}

/**
 * Opens of `pastDays` (oldest first, all before today) that no later past
 * day's high-low range has touched. Each later day is checked on its own —
 * merging ranges would wrongly swallow levels sitting in a gap between days.
 * Computed once per day; `kcbTargets` then filters by today's range.
 */
export function untouchedOpens (pastDays: DailyBar[]): number[] {
  const result: number[] = []
  for (let j = 0; j < pastDays.length; j++) {
    const level = pastDays[j].open
    let touched = false
    for (let k = j + 1; k < pastDays.length; k++) {
      if (pastDays[k].low <= level && level <= pastDays[k].high) {
        touched = true
        break
      }
    }
    if (!touched) {
      result.push(level)
    }
  }
  return result
}

/**
 * KCB take-profit targets (crazii's TP1/TP2/TP3) as of one bar: untouched
 * past opens that today's range so far hasn't reached either, above `close`
 * when it is above OP and below otherwise, nearest first. Fewer than `count`
 * come back when not enough untouched opens exist.
 */
export function kcbTargets (
  untouched: number[],
  todayHigh: number,
  todayLow: number,
  close: number,
  op: number,
  count = 3
): number[] {
  const above = close > op
  return untouched
    .filter(level => !(todayLow <= level && level <= todayHigh) && (above ? level > close : level < close))
    .sort((a, b) => Math.abs(a - close) - Math.abs(b - close))
    .slice(0, count)
}
