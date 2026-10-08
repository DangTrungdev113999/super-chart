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

import type Point from '../../../common/Point'
import type { KLineData } from '../../../common/Data'
import type { OverlayFigure } from '../../../component/Overlay'
import type { Chart } from '../../../Chart'
import { calcTextWidth } from '../../../common/utils/canvas'
import { formatPrecision } from '../../../common/utils/format'

/**
 * Shared helpers for the measure/prediction tool group — color math,
 * Vietnamese label formatting, bar-window statistics and a small
 * label-pill figure builder used by every tool in this directory.
 */

// ═══════════════════════════════════════
// Color helpers
// ═══════════════════════════════════════

/**
 * `#rrggbb` + alpha → `rgba(r, g, b, a)`. `rgb()/rgba()` inputs pass
 * through unchanged; alpha 1 keeps the hex as-is.
 */
export function alpha (color: string, opacity: number): string {
  const clamp = Math.max(0, Math.min(1, opacity))
  if (color.startsWith('rgba') || color.startsWith('rgb(')) {
    return color
  }
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)
  if (match == null) {
    return color
  }
  if (clamp >= 1) {
    return color
  }
  const r = parseInt(match[1], 16)
  const g = parseInt(match[2], 16)
  const b = parseInt(match[3], 16)
  return `rgba(${r}, ${g}, ${b}, ${clamp})`
}

/**
 * Extract a solid `rgb(r, g, b)` from an `rgba()` string — used to
 * derive label-pill backgrounds from translucent zone fills.
 */
export function rgbaToSolid (color: string): string {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color)
  if (match != null) {
    return `rgb(${match[1]}, ${match[2]}, ${match[3]})`
  }
  return color
}

// ═══════════════════════════════════════
// Number / duration / volume formatting
// ═══════════════════════════════════════

export function fmtNum (value: number, precision: number): string {
  return formatPrecision(value, precision)
}

export function signedNum (value: number, precision: number): string {
  const s = formatPrecision(value, precision)
  return value >= 0 ? `+${s}` : s
}

/** Compact sign-aware percent: "+1.23%" / "-1.23%". */
export function signedPct (value: number): string {
  const s = `${value.toFixed(2)}%`
  return value >= 0 ? `+${s}` : s
}

/**
 * Vietnamese compact duration from elapsed minutes:
 * `27n` (ngày) · `5h 12p` · `30p`.
 */
export function formatDurationMinutes (totalMinutes: number): string {
  const mins = Math.round(Math.abs(totalMinutes))
  if (mins >= 1440) {
    const days = Math.floor(mins / 1440)
    const hours = Math.floor((mins % 1440) / 60)
    return hours > 0 ? `${days}n ${hours}h` : `${days}n`
  }
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    const rest = mins % 60
    return rest > 0 ? `${hours}h ${rest}p` : `${hours}h`
  }
  return `${mins}p`
}

export function formatVolume (volume: number): string {
  if (volume >= 1000000000) {
    return `${(volume / 1000000000).toFixed(3)}B`
  }
  if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(3)}M`
  }
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`
  }
  return `${volume}`
}

/** Timestamp → `YYYY-MM-DD` (pill body text). */
export function formatISODate (timestamp: number | undefined): string {
  if (timestamp == null) {
    return ''
  }
  const d = new Date(timestamp)
  const mm = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// ═══════════════════════════════════════
// Data access helpers (no host injection)
// ═══════════════════════════════════════

export function getPricePrecision (chart: Chart, override?: number): number {
  return override ?? (chart.getSymbol()?.pricePrecision ?? 2)
}

/** Timestamp → bar index, -1 when not found. */
export function resolveBarIndex (dataList: KLineData[], timestamp: number | undefined): number {
  if (timestamp == null) {
    return -1
  }
  return dataList.findIndex(d => d.timestamp === timestamp)
}

/** Average bar spacing (ms) across the loaded range — 0 when unknown. */
export function barSpacingMs (dataList: KLineData[]): number {
  if (dataList.length < 2) {
    return 0
  }
  const span = dataList[dataList.length - 1].timestamp - dataList[0].timestamp
  return span > 0 ? span / (dataList.length - 1) : 0
}

export interface WindowStats {
  /** Absolute bar count between the anchors (rounded to whole bars). */
  bars: number
  /**
   * Elapsed minutes between the anchors — real timestamp delta when both
   * points resolve to timestamps, otherwise bars × mean spacing estimate.
   */
  minutes: number
  /** Summed volume over the covered real bars (0 when unavailable). */
  volume: number
}

/**
 * Bars / duration / volume for the window spanned by two anchors.
 * Points drawn past the right edge carry a dataIndex but no timestamp —
 * the duration then falls back to the mean bar spacing instead of NaN.
 */
export function windowStats (
  dataList: KLineData[],
  p1: Partial<Point> | undefined,
  p2: Partial<Point> | undefined
): WindowStats {
  const a = p1?.dataIndex
  const b = p2?.dataIndex
  const bars = a != null && b != null ? Math.abs(Math.round(b - a)) : 0

  const t1 = p1?.timestamp
  const t2 = p2?.timestamp
  let minutes = 0
  if (t1 != null && t2 != null) {
    minutes = Math.abs(t2 - t1) / 60000
  } else {
    minutes = (bars * barSpacingMs(dataList)) / 60000
  }

  let volume = 0
  if (a != null && b != null && dataList.length > 0) {
    const lo = Math.max(0, Math.floor(Math.min(a, b)))
    const hi = Math.min(dataList.length - 1, Math.ceil(Math.max(a, b)))
    for (let i = lo; i <= hi; i++) {
      volume += dataList[i].volume ?? 0
    }
  }

  return { bars, minutes, volume }
}

// ═══════════════════════════════════════
// Label pill builder
// ═══════════════════════════════════════

export interface PillLine {
  text: string
  color?: string
  weight?: string | number
  size?: number
}

export interface PillOptions {
  bgColor: string
  borderColor?: string
  borderSize?: number
  borderRadius?: number
  paddingH?: number
  paddingV?: number
  lineGap?: number
  fontSize?: number
  family?: string
}

/**
 * Build a centered multi-line label pill (background rect + one text
 * figure per line). All figures are decorative (`ignoreEvent`). `topY`
 * is the pill's TOP edge — callers position above/below zones.
 * Returns [] when there is nothing to draw.
 */
export function pillFigures (
  key: string,
  centerX: number,
  topY: number,
  lines: PillLine[],
  opts: PillOptions
): OverlayFigure[] {
  if (lines.length === 0) {
    return []
  }
  const padH = opts.paddingH ?? 8
  const padV = opts.paddingV ?? 5
  const gap = opts.lineGap ?? 2
  const fontSize = opts.fontSize ?? 11
  const family = opts.family

  let textW = 0
  let textH = 0
  for (const line of lines) {
    const size = line.size ?? fontSize
    textW = Math.max(textW, calcTextWidth(line.text, size, line.weight, family))
    textH += size
  }
  textH += gap * (lines.length - 1)

  const pillW = textW + padH * 2
  const pillH = textH + padV * 2
  const left = centerX - pillW / 2

  const figures: OverlayFigure[] = [{
    key: `${key}_bg`,
    type: 'rect',
    attrs: { x: left, y: topY, width: pillW, height: pillH },
    styles: {
      style: opts.borderColor != null ? 'stroke_fill' : 'fill',
      color: opts.bgColor,
      borderColor: opts.borderColor,
      borderSize: opts.borderSize ?? 1,
      borderRadius: opts.borderRadius ?? 4
    },
    ignoreEvent: true
  }]

  let lineY = topY + padV
  lines.forEach((line, index) => {
    const size = line.size ?? fontSize
    figures.push({
      key: `${key}_text_${index}`,
      type: 'text',
      attrs: {
        x: centerX,
        y: lineY + size / 2,
        text: line.text,
        align: 'center' as CanvasTextAlign,
        baseline: 'middle' as CanvasTextBaseline
      },
      styles: {
        color: line.color ?? '#ffffff',
        size,
        weight: line.weight,
        family,
        backgroundColor: 'transparent'
      },
      ignoreEvent: true
    })
    lineY += size + gap
  })

  return figures
}

/** Line dash pattern for the shared 'solid' | 'dashed' | 'dotted' vocab. */
export function dashValueFor (lineStyle: string | undefined): number[] {
  if (lineStyle === 'dashed') {
    return [6, 4]
  }
  if (lineStyle === 'dotted') {
    return [2, 2]
  }
  return []
}
