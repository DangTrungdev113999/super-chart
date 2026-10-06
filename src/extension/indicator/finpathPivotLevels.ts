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
 * FP PIVOT LEVELS — PLACEHOLDER for crazii.com's "Pivot 01" / "Pivot 02".
 *
 * NOT crazii's formula. On 2026-10-06 the previous-day high/low used here was
 * tested against 7 days of crazii's server values and matched 0 of them, as
 * did Classic, Fibonacci, Camarilla, Woodie, DeMark and CPR pivots, and every
 * OHLC / midpoint of the prior 30 daily bars. crazii's own lesson text says
 * the pivots come from a statistical model "not based on previous
 * peaks/troughs", some days have none, and Pivot 1 can swap with Pivot 2.
 * Kept only so the lines have an occupant until the real model is recovered.
 * calcParams[0] is the trading-day cut as minutes from UTC.
 */

import type { KLineData } from '../../common/Data'
import type { IndicatorTemplate } from '../../component/Indicator'
import { applyIndicatorInteraction, getControlPointBgColor } from './indicatorInteractionUtils'
import { dayIndex } from './finpathCraziiFormulas'

interface PivotLevels {
  pivot01?: number
  pivot02?: number
}

const finpathPivotLevels: IndicatorTemplate<PivotLevels, number> = {
  name: 'FP_PIVOT_LEVELS',
  shortName: 'Pivot (placeholder)',
  calcParams: [0],
  series: 'price',
  precision: 2,
  shouldOhlc: true,
  figures: [
    { key: 'pivot01', title: 'Pivot 01: ', type: 'line' },
    { key: 'pivot02', title: 'Pivot 02: ', type: 'line' }
  ],
  postDraw: ({ ctx, indicator, xAxis, yAxis, chart }) => {
    const result = indicator.result
    if (result.length === 0) return false
    const { from, to } = chart.getVisibleRange()
    if (from >= to) return false
    const keys = indicator.figures.map(f => f.key)
    applyIndicatorInteraction(ctx, indicator, result as unknown as Array<Record<string, unknown>>, from, to, xAxis, yAxis, keys, 0, getControlPointBgColor(chart))
    return false
  },
  calc: (dataList: KLineData[], indicator) => {
    const utcOffsetMinutes = indicator.calcParams[0] ?? 0
    let sessionHigh = -Infinity
    let sessionLow = Infinity
    let prevSessionHigh: number | null = null
    let prevSessionLow: number | null = null

    return dataList.map((bar, i) => {
      const prevBar = i > 0 ? dataList[i - 1] : null
      const isNewSession = prevBar === null || dayIndex(prevBar.timestamp, utcOffsetMinutes) !== dayIndex(bar.timestamp, utcOffsetMinutes)

      if (isNewSession) {
        if (sessionHigh !== -Infinity) {
          prevSessionHigh = sessionHigh
          prevSessionLow = sessionLow
        }
        sessionHigh = bar.high
        sessionLow = bar.low
      } else {
        sessionHigh = Math.max(sessionHigh, bar.high)
        sessionLow = Math.min(sessionLow, bar.low)
      }

      return { pivot01: prevSessionHigh ?? undefined, pivot02: prevSessionLow ?? undefined }
    })
  }
}

export default finpathPivotLevels
