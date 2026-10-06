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
 * FP KTR BANDS — crazii.com's OP / MLP / KTR±1..3 lines.
 *
 *   OP  = the day's opening price
 *   MLP = (previous day open + previous day close) / 2
 *   KTR = OP × (1 ± n × stepPercent / 100), n = 1, 2, 3
 *
 * Formulas and match rates: ./finpathCraziiFormulas.ts. stepPercent is set per
 * symbol on crazii's side — the host should pass KTR_STEP_PERCENT[ticker] as
 * calcParams[0]. calcParams[1] is the trading-day cut as minutes from UTC.
 * Pass daily bars via extendData.dailyBars so MLP exists on the first loaded day.
 */

import type { KLineData } from '../../common/Data'
import type { IndicatorTemplate } from '../../component/Indicator'
import { applyIndicatorInteraction, getControlPointBgColor } from './indicatorInteractionUtils'
import {
  type CraziiLevelsExtendData,
  DEFAULT_KTR_STEP_PERCENT,
  dayIndex,
  ktrLevel,
  midLevelPrice,
  resolveDailyBars
} from './finpathCraziiFormulas'

interface KtrBands {
  op?: number
  mlp?: number
  ktrPlus1?: number
  ktrPlus2?: number
  ktrPlus3?: number
  ktrMinus1?: number
  ktrMinus2?: number
  ktrMinus3?: number
}

const finpathKtrBands: IndicatorTemplate<KtrBands, number, CraziiLevelsExtendData> = {
  name: 'FP_KTR_BANDS',
  shortName: 'KTR',
  series: 'price',
  calcParams: [DEFAULT_KTR_STEP_PERCENT, 0],
  precision: 2,
  shouldOhlc: true,
  figures: [
    { key: 'ktrPlus3', title: 'KTR+3: ', type: 'line' },
    { key: 'ktrPlus2', title: 'KTR+2: ', type: 'line' },
    { key: 'ktrPlus1', title: 'KTR+1: ', type: 'line' },
    { key: 'op', title: 'OP: ', type: 'line' },
    { key: 'mlp', title: 'MLP: ', type: 'line' },
    { key: 'ktrMinus1', title: 'KTR-1: ', type: 'line' },
    { key: 'ktrMinus2', title: 'KTR-2: ', type: 'line' },
    { key: 'ktrMinus3', title: 'KTR-3: ', type: 'line' }
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
    const stepPercent = indicator.calcParams[0] ?? DEFAULT_KTR_STEP_PERCENT
    const utcOffsetMinutes = indicator.calcParams[1] ?? 0
    const days = resolveDailyBars(dataList, indicator.extendData, utcOffsetMinutes)
    const dayPosition = new Map(days.map((d, i) => [d.day, i]))

    return dataList.map(bar => {
      const i = dayPosition.get(dayIndex(bar.timestamp, utcOffsetMinutes))
      if (i === undefined) return {}
      const op = days[i].open
      return {
        op,
        mlp: i > 0 ? midLevelPrice(days[i - 1]) : undefined,
        ktrPlus1: ktrLevel(op, stepPercent, 1),
        ktrPlus2: ktrLevel(op, stepPercent, 2),
        ktrPlus3: ktrLevel(op, stepPercent, 3),
        ktrMinus1: ktrLevel(op, stepPercent, -1),
        ktrMinus2: ktrLevel(op, stepPercent, -2),
        ktrMinus3: ktrLevel(op, stepPercent, -3)
      }
    })
  }
}

export default finpathKtrBands
