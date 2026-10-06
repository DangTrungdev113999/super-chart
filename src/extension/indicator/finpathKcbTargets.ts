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
 * FP KCB TARGETS — crazii.com's TP1 / TP2 / TP3 ("KCB") take-profit lines.
 *
 * The nearest three past daily opens that price has never traded back
 * through since, above price when it trades above OP and below otherwise.
 * Recomputed every bar, so a target disappears once today's range reaches it.
 * Formula and match rates: ./finpathCraziiFormulas.ts.
 *
 * Needs months of daily history: pass it via extendData.dailyBars. Without it
 * only the loaded intraday days are searched and older targets go missing.
 * calcParams[0] is the trading-day cut as minutes from UTC.
 */

import type { KLineData } from '../../common/Data'
import type { IndicatorTemplate } from '../../component/Indicator'
import { applyIndicatorInteraction, getControlPointBgColor } from './indicatorInteractionUtils'
import {
  type CraziiLevelsExtendData,
  dayIndex,
  kcbTargets,
  resolveDailyBars,
  untouchedOpens
} from './finpathCraziiFormulas'

interface KcbTargets {
  tp1?: number
  tp2?: number
  tp3?: number
}

const finpathKcbTargets: IndicatorTemplate<KcbTargets, number, CraziiLevelsExtendData> = {
  name: 'FP_KCB_TARGETS',
  shortName: 'KCB',
  series: 'price',
  calcParams: [0],
  precision: 2,
  shouldOhlc: true,
  figures: [
    { key: 'tp1', title: 'TP1: ', type: 'line' },
    { key: 'tp2', title: 'TP2: ', type: 'line' },
    { key: 'tp3', title: 'TP3: ', type: 'line' }
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
    const days = resolveDailyBars(dataList, indicator.extendData, utcOffsetMinutes)
    const dayPosition = new Map(days.map((d, i) => [d.day, i]))

    let currentDay: number | null = null
    let untouched: number[] = []
    let todayHigh = 0
    let todayLow = 0

    return dataList.map(bar => {
      const day = dayIndex(bar.timestamp, utcOffsetMinutes)
      const i = dayPosition.get(day)
      if (i === undefined) return {}
      if (day !== currentDay) {
        currentDay = day
        untouched = untouchedOpens(days.slice(0, i))
        todayHigh = bar.high
        todayLow = bar.low
      } else {
        todayHigh = Math.max(todayHigh, bar.high)
        todayLow = Math.min(todayLow, bar.low)
      }
      const [tp1, tp2, tp3] = kcbTargets(untouched, todayHigh, todayLow, bar.close, days[i].open)
      return { tp1, tp2, tp3 }
    })
  }
}

export default finpathKcbTargets
