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

import type Coordinate from '../../../common/Coordinate'
import type Point from '../../../common/Point'
import type { KLineData } from '../../../common/Data'
import type { OverlayFigure, OverlayCreateFiguresCallbackParams } from '../../../component/Overlay'
import type { Chart } from '../../../Chart'

import { isValid } from '../../../common/utils/typeChecks'

import { rgbaToSolid, fmtNum, signedNum, signedPct, pillFigures, getPricePrecision } from './measureCommon'

/**
 * Shared geometry + stats for 'longPosition' / 'shortPosition'.
 *
 * The kernel originals are 4-point tools whose host injects TP/SL/width
 * points after the single creation click. The rebuild keeps ONE anchor —
 * the entry point — and derives the zones from pixel heights carried in
 * `extendData` (`profitHeight` / `stopHeight` / `zoneWidth`), converted
 * px → value through the pane's y-axis. No host injection required.
 */

export type PositionDirection = 'long' | 'short'

export interface PositionToolExtendData {
  /** Profit-zone height in px — above entry for long, below for short. */
  profitHeight?: number
  /** Stop-zone height in px — below entry for long, above for short. */
  stopHeight?: number
  /** Zone width in px extending right from the entry anchor. */
  zoneWidth?: number
  accountSize?: number
  /** Risk: percent of `accountSize` ('percents') or absolute ('money'). */
  risk?: number
  riskDisplayMode?: 'percents' | 'money'
  tickMultiplier?: number
  lineColor?: string
  profitBackground?: string
  stopBackground?: string
  textColor?: string
  fontSize?: number
  /** Render stats labels without hover/selection (default false). */
  alwaysShowStats?: boolean
  /** Entry/target/stop pills on the y-axis (default true). */
  showPriceLabels?: boolean
  pricePrecision?: number
}

export interface PositionDefaults extends Required<Omit<PositionToolExtendData, 'riskDisplayMode' | 'pricePrecision'>> {
  riskDisplayMode: 'percents' | 'money'
}

export const POSITION_DEFAULTS: PositionDefaults = {
  profitHeight: 150,
  stopHeight: 150,
  zoneWidth: 200,
  accountSize: 1000,
  risk: 25,
  riskDisplayMode: 'percents',
  tickMultiplier: 100,
  lineColor: '#787B86',
  profitBackground: 'rgba(8, 153, 129, 0.2)',
  stopBackground: 'rgba(242, 54, 69, 0.2)',
  textColor: '#ffffff',
  fontSize: 12,
  alwaysShowStats: false,
  showPriceLabels: true
}

export function getPositionExt (extendData: PositionToolExtendData | undefined): PositionDefaults {
  const d = POSITION_DEFAULTS
  const e = extendData ?? {}
  return {
    profitHeight: e.profitHeight ?? d.profitHeight,
    stopHeight: e.stopHeight ?? d.stopHeight,
    zoneWidth: e.zoneWidth ?? d.zoneWidth,
    accountSize: e.accountSize ?? d.accountSize,
    risk: e.risk ?? d.risk,
    riskDisplayMode: e.riskDisplayMode ?? d.riskDisplayMode,
    tickMultiplier: e.tickMultiplier ?? d.tickMultiplier,
    lineColor: e.lineColor ?? d.lineColor,
    profitBackground: e.profitBackground ?? d.profitBackground,
    stopBackground: e.stopBackground ?? d.stopBackground,
    textColor: e.textColor ?? d.textColor,
    fontSize: e.fontSize ?? d.fontSize,
    alwaysShowStats: e.alwaysShowStats ?? d.alwaysShowStats,
    showPriceLabels: e.showPriceLabels ?? d.showPriceLabels
  }
}

// ═══════════════════════════════════════
// Zone geometry
// ═══════════════════════════════════════

export interface PositionGeometry {
  leftX: number
  rightX: number
  entryY: number
  /** Pixel Y of the profit-zone far edge. */
  profitY: number
  /** Pixel Y of the stop-zone far edge. */
  stopY: number
  profitValue: number | null
  stopValue: number | null
}

/**
 * Long: profit zone ABOVE entry, stop zone BELOW.
 * Short: profit zone BELOW entry, stop zone ABOVE.
 * Heights are pixel distances converted back to values for stats —
 * matching the consumer host's `OFFSET_PX → convertFromPixel` injection.
 */
export function computeZoneGeometry (
  chart: Chart,
  paneId: string,
  direction: PositionDirection,
  c1: Coordinate,
  ext: PositionDefaults
): PositionGeometry {
  const sign = direction === 'long' ? 1 : -1
  const profitY = c1.y - sign * ext.profitHeight
  const stopY = c1.y + sign * ext.stopHeight

  const converted = chart.convertFromPixel(
    [{ x: c1.x, y: profitY }, { x: c1.x, y: stopY }],
    { paneId }
  ) as Array<Partial<{ value: number }>>

  return {
    leftX: c1.x,
    rightX: c1.x + ext.zoneWidth,
    entryY: c1.y,
    profitY,
    stopY,
    profitValue: converted[0]?.value ?? null,
    stopValue: converted[1]?.value ?? null
  }
}

// ═══════════════════════════════════════
// Stats (kernel math, direction-aware)
// ═══════════════════════════════════════

export interface PositionStats {
  /** Signed profit-leg distance in price units (≥ 0 when sane). */
  tpDiff: number
  /** Signed stop-leg distance in price units (≥ 0 when sane). */
  slDiff: number
  tpPct: number
  slPct: number
  riskReward: number
  qty: number
  tpTicks: number
  slTicks: number
}

export function calculatePositionStats (
  direction: PositionDirection,
  entryPrice: number,
  profitValue: number | null,
  stopValue: number | null,
  ext: PositionDefaults
): PositionStats {
  const sign = direction === 'long' ? 1 : -1
  const tpDiff = profitValue != null ? (profitValue - entryPrice) * sign : 0
  const slDiff = stopValue != null ? (entryPrice - stopValue) * sign : 0
  const tpPct = entryPrice !== 0 ? (tpDiff / entryPrice) * 100 : 0
  const slPct = entryPrice !== 0 ? (slDiff / entryPrice) * 100 : 0
  const riskReward = slDiff > 0 ? Math.abs(tpDiff / slDiff) : 0
  const riskAmount = ext.riskDisplayMode === 'percents'
    ? ext.accountSize * (ext.risk / 100)
    : ext.risk
  const qty = slDiff > 0 ? Math.floor(riskAmount / slDiff) : 0
  return {
    tpDiff,
    slDiff,
    tpPct,
    slPct,
    riskReward,
    qty,
    tpTicks: Math.round(tpDiff * ext.tickMultiplier),
    slTicks: Math.round(slDiff * ext.tickMultiplier)
  }
}

// ═══════════════════════════════════════
// Figure builder
// ═══════════════════════════════════════

const LABEL_GAP = 8

/**
 * Build the zone/label figure list shared by both position tools.
 * Zone fills keep events (whole-body drag); labels are decorative.
 * Caller appends the entry anchor via `createAnchorFigures`.
 */
export function buildPositionFigures (
  params: OverlayCreateFiguresCallbackParams<PositionToolExtendData>,
  direction: PositionDirection
): OverlayFigure[] {
  const { chart, overlay, coordinates, isSelected, isHovered } = params
  if (coordinates.length < 1) {
    return []
  }
  const c1 = coordinates[0]
  const ext = getPositionExt(overlay.extendData)
  const rawExt = isValid(overlay.extendData) ? overlay.extendData : undefined
  const geo = computeZoneGeometry(chart, overlay.paneId, direction, c1, ext)
  const entryPrice = (overlay.points[0] as Partial<Point> | undefined)?.value ?? 0
  const stats = calculatePositionStats(direction, entryPrice, geo.profitValue, geo.stopValue, ext)

  const profitTop = Math.min(geo.profitY, geo.entryY)
  const profitH = Math.abs(geo.profitY - geo.entryY)
  const stopTop = Math.min(geo.entryY, geo.stopY)
  const stopH = Math.abs(geo.stopY - geo.entryY)
  const zoneWidth = Math.max(geo.rightX - geo.leftX, 20)
  const centerX = geo.leftX + zoneWidth / 2

  const figures: OverlayFigure[] = []

  // ── Profit zone fill (events kept → whole-body drag) ──
  figures.push({
    key: 'pos_profit_zone',
    type: 'rect',
    attrs: { x: geo.leftX, y: profitTop, width: zoneWidth, height: profitH },
    styles: { style: 'fill', color: ext.profitBackground },
    cursor: 'move',
    bounds: { x: geo.leftX, y: profitTop, width: zoneWidth, height: profitH }
  })

  // ── Stop zone fill ──
  figures.push({
    key: 'pos_stop_zone',
    type: 'rect',
    attrs: { x: geo.leftX, y: stopTop, width: zoneWidth, height: stopH },
    styles: { style: 'fill', color: ext.stopBackground },
    cursor: 'move',
    bounds: { x: geo.leftX, y: stopTop, width: zoneWidth, height: stopH }
  })

  // ── Entry line ──
  figures.push({
    key: 'pos_entry_line',
    type: 'line',
    attrs: { coordinates: [{ x: geo.leftX, y: geo.entryY }, { x: geo.leftX + zoneWidth, y: geo.entryY }] },
    styles: { style: 'dashed', color: ext.lineColor, size: 1, dashedValue: [6, 4] },
    ignoreEvent: true
  })

  // ── Dashed center line through the zones ──
  figures.push({
    key: 'pos_center_line',
    type: 'line',
    attrs: { coordinates: [{ x: centerX, y: geo.profitY }, { x: centerX, y: geo.stopY }] },
    styles: { style: 'dashed', color: ext.lineColor, size: 1, dashedValue: [4, 4] },
    ignoreEvent: true
  })

  // ── Labels: hover/selection or alwaysShowStats ──
  const showLabels = ext.alwaysShowStats || isSelected === true || isHovered === true
  if (showLabels) {
    const precision = getPricePrecision(chart, rawExt?.pricePrecision)
    const profitSolid = rgbaToSolid(ext.profitBackground)
    const stopSolid = rgbaToSolid(ext.stopBackground)

    // TP label beyond the profit zone's far edge.
    const tpText = `Mục tiêu: ${signedNum(stats.tpDiff, precision)} (${signedPct(stats.tpPct)})`
    const tpPillH = ext.fontSize + 10
    const tpLabelY = direction === 'long'
      ? profitTop - tpPillH - LABEL_GAP
      : profitTop + profitH + LABEL_GAP
    figures.push(...pillFigures('pos_tp_label', centerX, tpLabelY, [
      { text: tpText, color: ext.textColor, weight: 'bold', size: ext.fontSize }
    ], { bgColor: profitSolid, borderRadius: 4, fontSize: ext.fontSize }))

    // SL label beyond the stop zone's far edge.
    const slText = `Dừng: ${signedNum(stats.slDiff, precision)} (${signedPct(stats.slPct)})`
    const slPillH = ext.fontSize + 10
    const slLabelY = direction === 'long'
      ? stopTop + stopH + LABEL_GAP
      : stopTop - slPillH - LABEL_GAP
    figures.push(...pillFigures('pos_sl_label', centerX, slLabelY, [
      { text: slText, color: ext.textColor, weight: 'bold', size: ext.fontSize }
    ], { bgColor: stopSolid, borderRadius: 4, fontSize: ext.fontSize }))

    // Entry label: R-multiple + qty (+ live P&L vs the last bar's close).
    const dataList: KLineData[] = chart.getDataList()
    const lastClose = dataList.length > 0 ? dataList[dataList.length - 1].close : entryPrice
    const openPL = direction === 'long' ? lastClose - entryPrice : entryPrice - lastClose
    const entryBg = openPL >= 0 ? profitSolid : stopSolid
    const entryLines = [
      {
        text: `Mở P&L: ${signedNum(openPL, precision)}, S.Lg: ${stats.qty}`,
        color: ext.textColor,
        weight: 'bold' as const,
        size: ext.fontSize
      },
      {
        text: `Tỷ lệ Rủi ro/Lợi nhuận: ${stats.riskReward.toFixed(2)}`,
        color: ext.textColor,
        size: ext.fontSize
      }
    ]
    // Center on the entry line; when the zones are too short vertically,
    // nudge into the taller zone so the pill doesn't cover the line.
    const entryPillH = ext.fontSize * 2 + 2 + 10
    let entryLabelY = geo.entryY - entryPillH / 2
    if (profitH < entryPillH / 2 || stopH < entryPillH / 2) {
      entryLabelY = profitH >= stopH ? geo.entryY - entryPillH - 5 : geo.entryY + 5
    }
    figures.push(...pillFigures('pos_entry_label', centerX, entryLabelY, entryLines, {
      bgColor: entryBg,
      borderColor: '#ffffff',
      borderSize: 1.5,
      borderRadius: 6,
      fontSize: ext.fontSize
    }))
  }

  return figures
}

/**
 * Y-axis pills for the three position levels (entry / target / stop),
 * gated by `extendData.showPriceLabels` — kernel parity.
 */
export function buildPositionYAxisFigures (
  params: OverlayCreateFiguresCallbackParams<PositionToolExtendData>,
  direction: PositionDirection
): OverlayFigure[] {
  const { chart, overlay, coordinates, bounding, yAxis } = params
  if (coordinates.length < 1) {
    return []
  }
  const ext = getPositionExt(overlay.extendData)
  if (!ext.showPriceLabels) {
    return []
  }
  const rawExt = isValid(overlay.extendData) ? overlay.extendData : undefined
  const geo = computeZoneGeometry(chart, overlay.paneId, direction, coordinates[0], ext)
  const precision = getPricePrecision(chart, rawExt?.pricePrecision)
  const isFromZero = yAxis?.isFromZero() ?? false
  const align: CanvasTextAlign = isFromZero ? 'left' : 'right'
  const x = isFromZero ? 0 : bounding.width

  const figures: OverlayFigure[] = []
  const pill = (y: number, value: number | null, bg: string): void => {
    if (value == null) {
      return
    }
    figures.push({
      key: '',
      type: 'text',
      attrs: { x, y, text: fmtNum(value, precision), align, baseline: 'middle' as CanvasTextBaseline },
      styles: {
        color: '#ffffff',
        backgroundColor: bg,
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 2,
        paddingBottom: 2,
        borderRadius: 2
      },
      ignoreEvent: true
    })
  }
  pill(geo.entryY, (overlay.points[0] as Partial<Point> | undefined)?.value ?? null, ext.lineColor)
  pill(geo.profitY, geo.profitValue, rgbaToSolid(ext.profitBackground))
  pill(geo.stopY, geo.stopValue, rgbaToSolid(ext.stopBackground))
  return figures
}
