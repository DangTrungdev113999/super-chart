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

import type {
  OverlayCreateFiguresCallback,
  OverlayTemplate
} from '../../component/Overlay'

import { withFigureCache } from '../interaction/perf'

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
import gannBox from './fibgeo/gannBox'
import gannComplex from './fibgeo/gannComplex'
import gannFan from './fibgeo/gannFan'
import gannFixed from './fibgeo/gannFixed'
import gannSquare from './fibgeo/gannSquare'

import barsPattern from './measure/barsPattern'
import dateAndPriceRange from './measure/dateAndPriceRange'
import dateRange from './measure/dateRange'
import forecast from './measure/forecast'
import ghostFeed from './measure/ghostFeed'
import longPosition from './measure/longPosition'
import measure from './measure/measure'
import priceRange from './measure/priceRange'
import projection from './measure/projection'
import shortPosition from './measure/shortPosition'

import insidePitchfork from './pitchforks/insidePitchfork'
import modifiedSchiffPitchfork from './pitchforks/modifiedSchiffPitchfork'
import pitchfork from './pitchforks/pitchfork'
import schiffPitchfork from './pitchforks/schiffPitchfork'

import arrowLine from './lines/arrowLine'
import crossLine from './lines/crossLine'
import horizontalRayLine from './lines/horizontalRayLine'
import horizontalSegment from './lines/horizontalSegment'
import horizontalStraightLine from './lines/horizontalStraightLine'
import infoLine from './lines/infoLine'
import priceLine from './lines/priceLine'
import rayLine from './lines/rayLine'
import segment from './lines/segment'
import straightLine from './lines/straightLine'
import trendAngle from './lines/trendAngle'
import verticalRayLine from './lines/verticalRayLine'
import verticalSegment from './lines/verticalSegment'
import verticalStraightLine from './lines/verticalStraightLine'

import disjointChannel from './channels/disjointChannel'
import flatTopBottom from './channels/flatTopBottom'
import parallelStraightLine from './channels/parallelStraightLine'
import priceChannelLine from './channels/priceChannelLine'
import regressionTrend from './channels/regressionTrend'

import arc from './shapes/arc'
import circle from './shapes/circle'
import curve from './shapes/curve'
import doubleCurve from './shapes/doubleCurve'
import ellipse from './shapes/ellipse'
import parallelogram from './shapes/parallelogram'
import path from './shapes/path'
import polyline from './shapes/polyline'
import rect from './shapes/rect'
import rotatedRect from './shapes/rotatedRect'
import triangle from './shapes/triangle'

import abcd from './patterns/abcd'
import cyclicLines from './patterns/cyclicLines'
import cypher from './patterns/cypher'
import elliottCorrection from './patterns/elliottCorrection'
import elliottDoubleCombo from './patterns/elliottDoubleCombo'
import elliottImpulse from './patterns/elliottImpulse'
import elliottTriangle from './patterns/elliottTriangle'
import elliottTripleCombo from './patterns/elliottTripleCombo'
import headAndShoulders from './patterns/headAndShoulders'
import sineLine from './patterns/sineLine'
import threeDrives from './patterns/threeDrives'
import timeCycles from './patterns/timeCycles'
import trianglePattern from './patterns/trianglePattern'
import xabcd from './patterns/xabcd'

import arrowMarkDown from './marks/arrowMarkDown'
import arrowMarker from './marks/arrowMarker'
import arrowMarkLeft from './marks/arrowMarkLeft'
import arrowMarkRight from './marks/arrowMarkRight'
import arrowMarkUp from './marks/arrowMarkUp'
import brush from './marks/brush'
import highlighter from './marks/highlighter'

/**
 * Drawing-subsystem tool registry — self-registers on module load so
 * `import ... from 'super-chart'` makes every rebuilt tool available to
 * `chart.createOverlay` / `chart.drawings.activate` with no host setup.
 * Loaded AFTER src/extension/overlay (barrel order in src/index.ts), so
 * same-name rebuilt templates replace their kernel predecessors.
 */

/**
 * Decorates a template's figure callbacks with the shared per-overlay/
 * per-slot cache (coordinates + figuresRev + selection/hover + lock +
 * bounding + currentStep + isTouch signature; `figureCacheDataRev` adds
 * chart.getDataList() revision for data-reading tools). Templates may opt
 * out entirely via `figuresCacheable: false`.
 */
function withDrawingsFigureCache<E> (
  template: OverlayTemplate<E>
): OverlayTemplate<E> {
  if (template.figuresCacheable === false) {
    return template
  }
  const cacheOpts = { includeDataRev: template.figureCacheDataRev === true }
  const wrap = (
    fn: OverlayCreateFiguresCallback<E> | null | undefined,
    slot: string
  ): OverlayCreateFiguresCallback<E> | null =>
    (fn == null ? null : withFigureCache(fn, { ...cacheOpts, slot }))
  return {
    ...template,
    createPointFigures: wrap(template.createPointFigures, 'point'),
    createXAxisFigures: wrap(template.createXAxisFigures, 'x'),
    createYAxisFigures: wrap(template.createYAxisFigures, 'y')
  }
}

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
  gannBox,
  gannComplex,
  gannFan,
  gannFixed,
  gannSquare,
  barsPattern,
  dateAndPriceRange,
  dateRange,
  forecast,
  ghostFeed,
  longPosition,
  measure,
  priceRange,
  projection,
  shortPosition,
  insidePitchfork,
  modifiedSchiffPitchfork,
  pitchfork,
  schiffPitchfork,
  arrowLine,
  crossLine,
  horizontalRayLine,
  horizontalSegment,
  horizontalStraightLine,
  infoLine,
  priceLine,
  rayLine,
  segment,
  straightLine,
  trendAngle,
  verticalRayLine,
  verticalSegment,
  verticalStraightLine,
  disjointChannel,
  flatTopBottom,
  parallelStraightLine,
  priceChannelLine,
  regressionTrend,
  arc,
  circle,
  curve,
  doubleCurve,
  ellipse,
  parallelogram,
  path,
  polyline,
  rect,
  rotatedRect,
  triangle,
  abcd,
  cyclicLines,
  cypher,
  elliottCorrection,
  elliottDoubleCombo,
  elliottImpulse,
  elliottTriangle,
  elliottTripleCombo,
  headAndShoulders,
  sineLine,
  threeDrives,
  timeCycles,
  trianglePattern,
  xabcd,
  arrowMarkDown,
  arrowMarker,
  arrowMarkLeft,
  arrowMarkRight,
  arrowMarkUp,
  brush,
  highlighter
]

drawingTools.forEach(template => {
  registerOverlay(withDrawingsFigureCache(template))
})
