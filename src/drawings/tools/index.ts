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

import { registerOverlay } from '../../extension/overlay/index'

import textNote from './text'

import anchoredNote from './annotations/anchoredNote'
import anchoredText from './annotations/anchoredText'
import callout from './annotations/callout'
import comment from './annotations/comment'
import flagMark from './annotations/flagMark'
import simpleTag from './annotations/note'
import priceLabel from './annotations/priceLabel'
import signpost from './annotations/signpost'
import table from './annotations/table'

import fibChannel from './fibonacci/fibChannel'
import fibExtension from './fibonacci/fibExtension'
import fibRetracement from './fibonacci/fibRetracement'
import fibTimeExtension from './fibonacci/fibTimeExtension'
import fibTimeZone from './fibonacci/fibTimeZone'

import fibCircles from './fibgeo/fibCircles'
import fibSpeedArcs from './fibgeo/fibSpeedArcs'
import fibSpeedFan from './fibgeo/fibSpeedFan'
import fibSpiral from './fibgeo/fibSpiral'
import fibWedge from './fibgeo/fibWedge'
import gannFan from './fibgeo/gannFan'

import dateAndPriceRange from './measure/dateAndPriceRange'
import dateRange from './measure/dateRange'
import measure from './measure/measure'
import priceRange from './measure/priceRange'

/**
 * Drawing-subsystem tool registry — self-registers on module load so
 * `import ... from 'super-chart'` makes every rebuilt tool available to
 * `chart.createOverlay` / `chart.drawings.activate` with no host setup.
 * Loaded AFTER src/extension/overlay (barrel order in src/index.ts), so
 * same-name rebuilt templates replace their kernel predecessors.
 */

const drawingTools = [
  textNote,
  anchoredNote,
  anchoredText,
  callout,
  comment,
  flagMark,
  simpleTag,
  priceLabel,
  signpost,
  table,
  fibChannel,
  fibExtension,
  fibRetracement,
  fibTimeExtension,
  fibTimeZone,
  fibCircles,
  fibSpeedArcs,
  fibSpeedFan,
  fibSpiral,
  fibWedge,
  gannFan,
  dateAndPriceRange,
  dateRange,
  measure,
  priceRange
]

drawingTools.forEach(template => {
  registerOverlay(template)
})
