/**
 *       ___           ___                   ___           ___           ___           ___           ___           ___           ___
 *      /\__\         /\__\      ___        /\__\         /\  \         /\  \         /\__\         /\  \         /\  \         /\  \
 *     /:/  /        /:/  /     /\  \      /::|  |       /::\  \       /::\  \       /:/  /        /::\  \       /::\  \        \:\  \
 *    /:/__/        /:/  /      \:\  \    /:|:|  |      /:/\:\  \     /:/\:\  \     /:/__/        /:/\:\  \     /:/\:\  \        \:\  \
 *   /::\__\____   /:/  /       /::\__\  /:/|:|  |__   /::\~\:\  \   /:/  \:\  \   /::\  \ ___   /::\~\:\  \   /::\~\:\  \       /::\  \
 *  /:/\:::::\__\ /:/__/     __/:/\/__/ /:/ |:| /\__\ /:/\:\ \:\__\ /:/__/ \:\__\ /:/\:\  /\__\ /:/\:\ \:\__\ /:/\:\ \:\__\     /:/\:\__\
 *  \/_|:|~~|~    \:\  \    /\/:/  /    \/__|:|/:/  / \:\~\:\ \/__/ \:\  \  \/__/ \/__\:\/:/  / \/__\:\/:/  / \/_|::\/:/  /    /:/  \/__/
 *     |:|  |      \:\  \   \::/__/         |:/:/  /   \:\ \:\__\    \:\  \            \::/  /       \::/  /     |:|::/  /    /:/  /
 *     |:|  |       \:\  \   \:\__\         |::/  /     \:\ \/__/     \:\  \           /:/  /        /:/  /      |:|\/__/     \/__/
 *     |:|  |        \:\__\   \/__/         /:/  /       \:\__\        \:\__\         /:/  /        /:/  /       |:|  |
 *      \|__|         \/__/                 \/__/         \/__/         \/__/         \/__/         \/__/         \|__|
 *
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

import type {
  LineType, PolygonType, TooltipShowRule, TooltipShowType, FeatureType, TooltipFeaturePosition,
  CandleType, CandleTooltipRectPosition, OverlayStyle
} from './common/Styles'
import type Nullable from './common/Nullable'

import { logError, logTag, logWarn } from './common/utils/logger'

import {
  clone, merge, isString, isNumber, isValid, isObject, isArray, isFunction, isBoolean
} from './common/utils/typeChecks'
import {
  formatValue,
  formatPrecision,
  formatBigNumber,
  formatThousands,
  formatFoldDecimal,
  formatTimestampByTemplate
} from './common/utils/format'
import { calcTextWidth } from './common/utils/canvas'
import type { ActionType } from './common/Action'
import type { IndicatorSeries } from './component/Indicator'
import type {
  OverlayMode, Overlay, OverlayCreate, OverlayChangeEvent, OverlayChangeEventType,
  OverlayTemplate, OverlayFigure, OverlayFigureMoveDirection, OverlayFigureBounds,
  OverlayEvent, OverlayEventCallback,
  OverlayCreateFiguresCallback, OverlayCreateFiguresCallbackParams,
  OverlayPerformEventParams, OverlayFilter, OverlayOverride, OverlayConstructor
} from './component/Overlay'
import { checkOverlayFigureEvent, OVERLAY_ID_PREFIX, OVERLAY_FIGURE_KEY_PREFIX } from './component/Overlay'
import type { MouseTouchEvent } from './common/EventHandler'
import type { FigureTemplate, FigureConstructor } from './component/Figure'
import type Coordinate from './common/Coordinate'
import type Bounding from './common/Bounding'
import type Crosshair from './common/Crosshair'
import type Point from './common/Point'
import type { KLineData } from './common/Data'
import type { Period } from './common/Period'
import type { SymbolInfo } from './common/SymbolInfo'

import type { FormatDateType, Options, ZoomAnchor } from './Options'
import ChartImp, { type Chart, type DomPosition } from './Chart'

import { checkCoordinateOnArc } from './extension/figure/arc'
import { checkCoordinateOnCircle } from './extension/figure/circle'
import {
  checkCoordinateOnLine,
  getLinearYFromSlopeIntercept,
  getLinearSlopeIntercept,
  getLinearYFromCoordinates
} from './extension/figure/line'
import { checkCoordinateOnPolygon } from './extension/figure/polygon'
import { checkCoordinateOnRect } from './extension/figure/rect'
import { checkCoordinateOnText } from './extension/figure/text'

import { registerFigure, getSupportedFigures, getFigureClass } from './extension/figure/index'
import { registerIndicator, getSupportedIndicators } from './extension/indicator/index'
import { registerLocale, getSupportedLocales } from './extension/i18n/index'
import { registerOverlay, getOverlayClass, getSupportedOverlays } from './extension/overlay/index'
import type { SegmentExtendData } from './extension/overlay/segment'
import type { TextAttrs } from './extension/figure/text'
import type { RectAttrs } from './extension/figure/rect'
import type { PolygonAttrs } from './extension/figure/polygon'
import type { PathAttrs } from './extension/figure/path'
import type { LineAttrs } from './extension/figure/line'
import type { CircleAttrs } from './extension/figure/circle'
import type { ArcAttrs } from './extension/figure/arc'
import type {
  RegressionTrendExtendData,
  RegressionSource,
  LineStyle as RegressionTrendLineStyle,
  VisibilityRange as RegressionVisibilityRange
} from './extension/overlay/regressionTrend'
import type {
  EllipseExtendData,
  EllipseLineStyle,
  EllipseVisibilityRange
} from './extension/overlay/ellipse'
import { registerStyles } from './extension/styles/index'
import { registerXAxis } from './extension/x-axis'
import { registerYAxis } from './extension/y-axis'
import { KTR_STEP_PERCENT, KCX_PERIOD, type CraziiLevelsExtendData } from './extension/indicator/finpathCraziiFormulas'

import {
  createChartSync,
  SYNC_GROUP_COLORS,
  type ChartSync,
  type ChartSyncOptions,
  type ChartSyncChannel,
  type ChartSyncChannels,
  type ChartSyncAttachOptions
} from './sync/index'

const charts = new Map<string, ChartImp>()
let chartBaseId = 1

/**
 * Chart version
 * @return {string}
 */
function version (): string {
  return '__VERSION__'
}

/**
 * Init chart instance
 * @param ds
 * @param options
 * @returns {Chart}
 */
function init (ds: HTMLElement | string, options?: Options): Nullable<Chart> {
  logTag()
  let dom: Nullable<HTMLElement> = null
  if (isString(ds)) {
    dom = document.getElementById(ds)
  } else {
    dom = ds
  }
  if (dom === null) {
    logError('', '', 'The chart cannot be initialized correctly. Please check the parameters. The chart container cannot be null and child elements need to be added!!!')
    return null
  }
  let chart = charts.get(dom.id)
  if (isValid(chart)) {
    logWarn('', '', 'The chart has been initialized on the dom！！！')
    return chart
  }
  const id = `k_line_chart_${chartBaseId++}`
  chart = new ChartImp(dom, options)
  chart.id = id
  dom.setAttribute('k-line-chart-id', id)
  charts.set(id, chart)
  return chart
}

/**
 * Destroy chart instance
 * @param dcs
 */
function dispose (dcs: HTMLElement | Chart | string): void {
  let id: Nullable<string> = null
  if (dcs instanceof ChartImp) {
    id = dcs.id
  } else {
    let dom: Nullable<HTMLElement> = null
    if (isString(dcs)) {
      dom = document.getElementById(dcs)
    } else {
      dom = dcs as HTMLElement
    }
    id = dom?.getAttribute('k-line-chart-id') ?? null
  }
  if (id !== null) {
    charts.get(id)?.destroy()
    charts.delete(id)
  }
}

const utils = {
  clone,
  merge,
  isString,
  isNumber,
  isValid,
  isObject,
  isArray,
  isFunction,
  isBoolean,
  formatValue,
  formatPrecision,
  formatBigNumber,
  formatDate: formatTimestampByTemplate,
  formatThousands,
  formatFoldDecimal,
  calcTextWidth,
  getLinearSlopeIntercept,
  getLinearYFromSlopeIntercept,
  getLinearYFromCoordinates,
  checkCoordinateOnArc,
  checkCoordinateOnCircle,
  checkCoordinateOnLine,
  checkCoordinateOnPolygon,
  checkCoordinateOnRect,
  checkCoordinateOnText
}

export {
  version, init, dispose,
  registerFigure, getSupportedFigures, getFigureClass,
  registerIndicator, getSupportedIndicators,
  registerOverlay, getSupportedOverlays, getOverlayClass,
  registerLocale, getSupportedLocales,
  registerStyles,
  registerXAxis, registerYAxis,
  createChartSync,
  SYNC_GROUP_COLORS,
  type ChartSync,
  type ChartSyncOptions,
  type ChartSyncChannel,
  type ChartSyncChannels,
  type ChartSyncAttachOptions,
  utils,
  // Per-symbol KTR step for FP_KTR_BANDS calcParams[0]; extendData shape for FP_KTR_BANDS / FP_KCB_TARGETS.
  KTR_STEP_PERCENT,
  // Per-symbol lookback for FP_BULLISHNESS (KCX) calcParams[0].
  KCX_PERIOD,
  type CraziiLevelsExtendData,
  type LineType, type PolygonType, type TooltipShowRule, type TooltipShowType, type FeatureType, type TooltipFeaturePosition, type CandleTooltipRectPosition,
  type CandleType, type FormatDateType, type ZoomAnchor,
  type DomPosition, type ActionType, type IndicatorSeries, type OverlayMode,
  type Overlay, type OverlayCreate, type OverlayChangeEvent, type OverlayChangeEventType,
  type OverlayTemplate, type OverlayFigure, type OverlayFigureMoveDirection, type OverlayFigureBounds,
  type OverlayEvent, type OverlayEventCallback,
  type OverlayCreateFiguresCallback, type OverlayCreateFiguresCallbackParams,
  type OverlayPerformEventParams, type OverlayFilter, type OverlayOverride, type OverlayConstructor,
  checkOverlayFigureEvent, OVERLAY_ID_PREFIX, OVERLAY_FIGURE_KEY_PREFIX,
  type OverlayStyle, type MouseTouchEvent,
  type FigureTemplate, type FigureConstructor,
  type Coordinate, type Bounding,
  type TextAttrs, type RectAttrs, type PolygonAttrs, type PathAttrs,
  type LineAttrs, type CircleAttrs, type ArcAttrs,
  type Crosshair, type Point, type KLineData, type Period, type SymbolInfo,
  type SegmentExtendData,
  type RegressionTrendExtendData,
  type RegressionSource,
  // Public names for regressionTrend overlay types. `RegressionTrendLineStyle`
  // is used instead of `LineStyle` to avoid collision with the internal
  // `common/Styles.LineStyle` interface that leaks into the bundled d.ts.
  type RegressionTrendLineStyle,
  type RegressionVisibilityRange,
  // Public names for the ellipse overlay. Renamed to avoid collision with
  // internal `common/Styles` types and other overlays that use generic
  // `LineStyle` / `VisibilityRange` identifiers.
  type EllipseExtendData,
  type EllipseLineStyle,
  type EllipseVisibilityRange
}

// ─── Drawings subsystem (DP-0b): shared state + interaction contract ─────────
export {
  ANCHOR_KEY_PREFIX,
  ANCHOR_MID_KEY,
  ANCHOR_HALF_MOUSE,
  ANCHOR_HALF_TOUCH,
  createAnchorFigures,
  createSelectionOutlineFigures,
  computeResizeCursor,
  getDrawingInteractionState,
  setAlign45Enabled,
  isAlign45Enabled,
  isSnap45Active,
  snap45Coordinate,
  bindDrawingKeyboard,
  withFigureCache,
  withViewportCull,
  withPerfPipeline,
  getCommonState,
  isVisibleOnInterval,
  getPaneDomLayer,
  createTextWidthCache,
  measureText,
  getMinTextMetrics,
  wordWrap,
  getCaretPosition,
  getSelectionRects,
  createTextEditorSession,
  getEditorLetterSpacing,
  normalizedDevicePixelRatio
} from './drawings'

export type {
  DrawingCommonState,
  DrawingExtendData,
  AnchorFiguresParams,
  AnchorFigureStyle,
  DrawingInteractionState,
  DrawingKeyboardHandlers,
  DrawingKeyboardOptions,
  FigureCacheOptions,
  ViewportCullOptions,
  PaneDomLayer,
  DomLayerMountOptions,
  TextWidthCache,
  MinTextMetrics,
  WrappedLine,
  CaretPosition,
  SelectionRect,
  SelectionRectsOptions,
  TextAlignOption,
  TextLayoutOptions,
  TextEditorSession,
  TextEditorSessionOptions,
  TextEditorCloseReason,
  TextEditorInfo,
  TextEditorLayout
} from './drawings'
