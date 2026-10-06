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
 * FP BULLISHNESS — crazii.com's KCX sub-pane ("BULLISHNESS" / "BEARISHNESS").
 *
 * KCX = (3750/11) × Williams %R(n), shown only while the close sits in the
 * lower half of the n-bar range (otherwise 0). crazii labels the pane
 * BEARISHNESS whenever KCX is non-zero, BULLISHNESS otherwise. Rendering
 * mirrors crazii: the histogram is clamped at -300, and a bright bar shows the
 * raw value when it drops below -300 ("retail has nearly finished selling").
 *
 * calcParams[0] is n — pass KCX_PERIOD[ticker]. Formula and match rates:
 * ./finpathCraziiFormulas.ts.
 */

import type { KLineData } from '../../common/Data'
import type { IndicatorTemplate } from '../../component/Indicator'
import { DEFAULT_KCX_PERIOD, KCX_BLINK_LEVEL, kcxValue } from './finpathCraziiFormulas'

interface Kcx {
  kcx?: number
  blink?: number
}

const KCX_COLOR = '#1e90ff'
const BLINK_COLOR = '#7fff00'

const finpathBullishness: IndicatorTemplate<Kcx, number> = {
  name: 'FP_BULLISHNESS',
  shortName: 'KCX',
  series: 'normal',
  calcParams: [DEFAULT_KCX_PERIOD],
  precision: 2,
  figures: [
    {
      key: 'kcx',
      title: 'KCX: ',
      type: 'bar',
      baseValue: 0,
      styles: () => ({ color: KCX_COLOR, style: 'fill', borderColor: KCX_COLOR })
    },
    {
      key: 'blink',
      title: '',
      type: 'bar',
      baseValue: 0,
      styles: () => ({ color: BLINK_COLOR, style: 'fill', borderColor: BLINK_COLOR })
    }
  ],
  calc: (dataList: KLineData[], indicator) => {
    const period = indicator.calcParams[0] ?? DEFAULT_KCX_PERIOD
    return dataList.map((_, i) => {
      const value = kcxValue(dataList, i, period)
      if (value === null) return {}
      return {
        kcx: Math.max(value, KCX_BLINK_LEVEL),
        blink: value < KCX_BLINK_LEVEL ? value : undefined
      }
    })
  }
}

export default finpathBullishness
