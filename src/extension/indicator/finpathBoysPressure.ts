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
 * FP BOYS PRESSURE — placeholder stand-in for crazii.com's "BOYS BUYING" /
 * "BOYS SELLING" sub-pane histogram.
 *
 * PLACEHOLDER — NOT crazii's formula. What is known about crazii's KSI
 * (2026-10-06, live socket probe): it is a points score in ±3.7, step 0.1/3,
 * built from several step components of the form "close above/below a hidden
 * level derived from prior bars"; one large component sets the colour, small
 * ones adjust the size. The levels are not plain SMA/EMA/LWMA of price and
 * have not been recovered, see crazii-chart-audit/05-cong-thuc-da-giai.md.
 * Until they are, this renders a self-contained buy/sell-pressure histogram
 * (close-location value weighted by volume) so the pane has an occupant.
 */

import { formatValue } from '../../common/utils/format'
import type { KLineData } from '../../common/Data'
import type { IndicatorTemplate } from '../../component/Indicator'
import { moneyFlowMultiplier } from './finpathKtrShared'

interface BoysPressure {
  value?: number
}

const finpathBoysPressure: IndicatorTemplate<BoysPressure, number> = {
  name: 'FP_BOYS_PRESSURE',
  shortName: 'Boys Pressure (placeholder)',
  series: 'normal',
  precision: 2,
  figures: [{
    key: 'value',
    title: 'Boys Pressure: ',
    type: 'bar',
    baseValue: 0,
    styles: ({ data, indicator, defaultStyles }) => {
      const value = data.current?.value ?? 0
      const color = value >= 0
        ? formatValue(indicator.styles, 'bars[0].upColor', (defaultStyles!.bars)[0].upColor) as string
        : formatValue(indicator.styles, 'bars[0].downColor', (defaultStyles!.bars)[0].downColor) as string
      return { color, style: 'fill', borderColor: color }
    }
  }],
  calc: (dataList: KLineData[]) => dataList.map((bar) => {
    const volume = bar.volume ?? (bar.high - bar.low)
    return { value: moneyFlowMultiplier(bar) * volume }
  })
}

export default finpathBoysPressure
