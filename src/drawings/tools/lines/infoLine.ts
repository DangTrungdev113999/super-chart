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
import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { calcTextWidth } from '../../../common/utils/canvas'
import { createAnchorFigures, computeResizeCursor } from '../../interaction/anchors'
import {
  applySnap45,
  buildXAxisBandFigures,
  buildYAxisBandFigures,
  getArrowCoordinates,
  getExtendedCoordinates,
  labelSpecOf,
  lineColorOf,
  lineStyleOverrides,
  pricePrecisionOf,
  pushSidePriceLabel,
  rememberLineChart
} from './lineCommon'

import type { LineExtendData } from './lineCommon'

/**
 * 'infoLine' — TradingView Info Line. Two anchors; the segment carries a
 * statistics box (price range + pct + pips / bars + duration + distance /
 * angle) plus the usual extension/label options of the line family.
 *
 * Stats default ON for this tool (TradingView `alwaysShowStats: true`).
 * The box honors both the consumer `stats` object shape and the kernel
 * flat `showXxxRange` flags.
 */

export interface InfoLineExtendData extends LineExtendData {}

interface InfoStats {
  priceRange: number
  percentChange: number
  pipChange: number
  barRange: number
  timeStr: string
  pixelDistance: number
  angle: number
}

/** Vietnamese compact duration: `27n` · `5h 12p` · `30p` (consumer format). */
function formatDuration (totalMinutes: number): string {
  const absMins = Math.round(Math.abs(totalMinutes))
  if (absMins >= 1440) {
    const days = Math.floor(absMins / 1440)
    const hours = Math.floor((absMins % 1440) / 60)
    return hours > 0 ? `${days}n ${hours}h` : `${days}n`
  }
  if (absMins >= 60) {
    const hours = Math.floor(absMins / 60)
    const rest = absMins % 60
    return rest > 0 ? `${hours}h ${rest}p` : `${hours}h`
  }
  return `${absMins}p`
}

/** Minutes per bar from the consumer `periodType`/`periodSpan` fields. */
function getPeriodMinutes (periodType: string, periodSpan: number): number {
  switch (periodType) {
    case 'minute': return periodSpan
    case 'hour': return periodSpan * 60
    case 'day': return periodSpan * 1440
    case 'week': return periodSpan * 10080
    case 'month': return periodSpan * 43200
    default: return periodSpan
  }
}

const infoLine: OverlayTemplate<InfoLineExtendData> = {
  name: 'infoLine',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis, isSelected, isHovered, isTouch }) => {
    rememberLineChart(overlay, chart)
    if (coordinates.length < 2) return []

    const [c1, c2] = coordinates
    const ext: InfoLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const points = overlay.points
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)
    const lineColor = lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    const lineStyles = lineStyleOverrides(overlay, chart, ext)
    const isActive = (isSelected ?? false) || (isHovered ?? false)

    const figures: OverlayFigure[] = []

    // ─── Rendered endpoints (optional extension) ───
    const extendLeft = ext.extendLeft === true
    const extendRight = ext.extendRight === true
    let lineStart: Coordinate = { x: c1.x, y: c1.y }
    let lineEnd: Coordinate = { x: c2.x, y: c2.y }
    if (extendLeft || extendRight) {
      const [s, e] = getExtendedCoordinates(c1, c2, bounding.width, bounding.height, extendLeft, extendRight)
      lineStart = s
      lineEnd = e
    }

    // ─── Main line (extendData style channel + styles.line) ───
    figures.push({
      key: 'il_line',
      type: 'line',
      attrs: { coordinates: [lineStart, lineEnd] },
      styles: lineStyles
    })

    // ─── Arrow end caps ───
    const leftEnd = ext.leftEnd ?? 0
    const rightEnd = ext.rightEnd ?? 0
    if (leftEnd === 1) {
      const coords = getArrowCoordinates(c2, extendLeft ? lineStart : c1)
      if (coords.length === 3) {
        figures.push({ key: 'il_arrow_left', type: 'polygon', attrs: { coordinates: coords }, styles: { style: 'fill', color: lineColor }, ignoreEvent: true })
      }
    }
    if (rightEnd === 1) {
      const coords = getArrowCoordinates(c1, extendRight ? lineEnd : c2)
      if (coords.length === 3) {
        figures.push({ key: 'il_arrow_right', type: 'polygon', attrs: { coordinates: coords }, styles: { style: 'fill', color: lineColor }, ignoreEvent: true })
      }
    }

    // ─── Stats flags: consumer `stats` object wins; flat kernel flags
    //     when present; otherwise TradingView defaults (everything on). ───
    const flatFlagsPresent =
      ext.showPriceRange === true || ext.showPercentPriceRange === true ||
      ext.showPipsPriceRange === true || ext.showBarsRange === true ||
      ext.showDateTimeRange === true || ext.showDistance === true ||
      ext.showAngle === true
    const stats = ext.stats ?? (
      flatFlagsPresent
        ? {
            priceRange: ext.showPriceRange === true,
            percentChange: ext.showPercentPriceRange === true,
            pipChange: ext.showPipsPriceRange === true,
            barRange: ext.showBarsRange === true,
            dateTimeRange: ext.showDateTimeRange === true,
            distance: ext.showDistance === true,
            angle: ext.showAngle === true
          }
        : {
            priceRange: true,
            percentChange: true,
            pipChange: true,
            barRange: true,
            dateTimeRange: true,
            distance: true,
            angle: true
          }
    )
    const alwaysShow = ext.statsAlwaysVisible ?? ext.alwaysShowStats ?? true
    const statsVisible = alwaysShow || isActive

    if (statsVisible) {
      const p1Value = points[0]?.value
      const p2Value = points[1]?.value
      const p1Index = points[0]?.dataIndex
      const p2Index = points[1]?.dataIndex

      const diff = isNumber(p1Value) && isNumber(p2Value) ? p2Value - p1Value : 0
      const bars = isNumber(p1Index) && isNumber(p2Index) ? p2Index - p1Index : 0
      const ddx = c2.x - c1.x
      const ddy = c2.y - c1.y
      const calculatedStats: InfoStats = {
        priceRange: diff,
        percentChange: isNumber(p1Value) && p1Value !== 0 ? (diff / Math.abs(p1Value)) * 100 : 0,
        pipChange: Math.round(diff * 100),
        barRange: bars,
        timeStr: formatDuration(Math.abs(bars) * getPeriodMinutes(ext.periodType ?? 'day', ext.periodSpan ?? 1)),
        pixelDistance: Math.round(Math.sqrt(ddx * ddx + ddy * ddy)),
        angle: Math.round(Math.atan2(c1.y - c2.y, c2.x - c1.x) * (180 / Math.PI) * 100) / 100
      }

      const lines: string[] = []
      const line1: string[] = []
      if (stats.priceRange === true) {
        line1.push(calculatedStats.priceRange.toFixed(precision))
      }
      if (stats.percentChange === true) {
        line1.push(`(${calculatedStats.percentChange.toFixed(2)}%)`)
      }
      if (stats.pipChange === true) {
        line1.push(`${calculatedStats.pipChange}`)
      }
      if (line1.length > 0) {
        lines.push(`↕    ${line1.join(', ')}`)
      }
      const line2: string[] = []
      if (stats.barRange === true) {
        line2.push(`${Math.abs(calculatedStats.barRange)} thanh`)
      }
      if (stats.dateTimeRange === true) {
        line2.push(`(${calculatedStats.timeStr})`)
      }
      if (stats.distance === true) {
        line2.push(`khoảng cách: ${calculatedStats.pixelDistance} px`)
      }
      if (line2.length > 0) {
        lines.push(`↔    ${line2.join(', ')}`)
      }
      if (stats.angle === true) {
        lines.push(`△    ${calculatedStats.angle.toFixed(0)}°`)
      }

      if (lines.length > 0) {
        const pad = 12
        const lineStep = 20
        const fontSize = 12
        let boxW = 0
        for (const line of lines) {
          boxW = Math.max(boxW, calcTextWidth(line, fontSize, 'normal'))
        }
        boxW += pad * 2
        const boxH = pad * 2 + lines.length * lineStep

        const position = typeof ext.statsPosition === 'string'
          ? ext.statsPosition
          : ext.statsPosition === 1
            ? 'top'
            : ext.statsPosition === 3
              ? 'bottom'
              : 'center'

        let boxX = 0
        let boxY = 0
        if (position === 'top') {
          boxX = Math.max(c1.x, c2.x)
          boxY = Math.min(c1.y, c2.y) - boxH - 10
        } else if (position === 'bottom') {
          boxX = Math.max(c1.x, c2.x)
          boxY = Math.max(c1.y, c2.y) + 10
        } else {
          // Near the second anchor, offset away from the line's slope.
          if (ddy > 0) {
            boxX = c2.x + 10
            boxY = c2.y - boxH - 10
          } else {
            boxX = c2.x + 10
            boxY = c2.y + 10
          }
        }
        boxX = Math.max(10, Math.min(boxX, bounding.width - boxW - 10))
        boxY = Math.max(10, Math.min(boxY, bounding.height - boxH - 10))

        figures.push({
          key: 'il_stats_bg',
          type: 'rect',
          attrs: { x: boxX, y: boxY, width: boxW, height: boxH },
          styles: {
            style: 'stroke_fill',
            color: 'rgba(42, 46, 57, 0.95)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderSize: 1,
            borderRadius: 4
          },
          ignoreEvent: true
        })
        lines.forEach((line, index) => {
          figures.push({
            key: `il_stats_${index}`,
            type: 'text',
            attrs: {
              x: boxX + pad,
              y: boxY + pad + index * lineStep + 6,
              text: line,
              align: 'left' as CanvasTextAlign,
              baseline: 'middle' as CanvasTextBaseline
            },
            styles: { color: '#D1D4DC', size: fontSize, weight: 'normal', backgroundColor: 'transparent' },
            ignoreEvent: true
          })
        })
      }
    }

    // ─── Price labels beside the anchors (reference style) ───
    if (ext.showPriceLabel === true || ext.showPriceLabels === true) {
      pushSidePriceLabel(figures, 'il_price0', c1, points[0]?.value, 'left', lineColor, precision)
      pushSidePriceLabel(figures, 'il_price1', c2, points[1]?.value, 'right', lineColor, precision)
    }

    // ─── Custom text label (reference flat placement) ───
    const spec = labelSpecOf(ext)
    if (isValid(spec) && spec.text !== undefined && spec.text !== '') {
      const hAlign = spec.hAlign ?? 'center'
      let textX = 0
      if (hAlign === 'left') {
        textX = Math.min(c1.x, c2.x)
      } else if (hAlign === 'right') {
        textX = Math.max(c1.x, c2.x)
      } else {
        textX = (c1.x + c2.x) / 2
      }
      const minY = Math.min(c1.y, c2.y)
      const maxY = Math.max(c1.y, c2.y)
      let textY = (c1.y + c2.y) / 2
      if (spec.vAlign === 'top') {
        textY = minY - 20
      } else if (spec.vAlign === 'bottom') {
        textY = maxY + 20
      }
      figures.push({
        key: 'il_label',
        type: 'text',
        attrs: {
          x: textX,
          y: textY,
          text: spec.text,
          align: (hAlign === 'left' || hAlign === 'right' ? hAlign : 'center') as CanvasTextAlign,
          baseline: 'middle' as CanvasTextBaseline
        },
        styles: {
          color: spec.textColor ?? lineColor,
          size: spec.fontSize ?? 14,
          weight: spec.bold === true ? 'bold' : 'normal',
          style: spec.italic === true ? 'italic' : 'normal',
          backgroundColor: 'transparent'
        },
        ignoreEvent: true
      })
    }

    // ─── Anchors + optional midpoint handle ───
    const resizeCursor = computeResizeCursor(c1, c2)
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch,
      midPoint: ext.showMidpoint === true || ext.showMiddlePoint === true,
      cursors: [resizeCursor, resizeCursor]
    }))

    return figures
  },

  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
    if (coordinates.length < 1) return []
    const ext: InfoLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildYAxisBandFigures('il', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color),
      precision: pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision),
      yAxis: yAxis ?? undefined
    })
  },

  createXAxisFigures: ({ chart, overlay, coordinates, bounding }) => {
    if (coordinates.length < 1) return []
    const ext: InfoLineExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    return buildXAxisBandFigures('il', {
      overlay,
      coordinates,
      bounding,
      lineColor: lineColorOf(overlay, chart, ext.lineColor ?? ext.color)
    })
  },

  performEventPressedMove: function (this: Overlay<InfoLineExtendData>, params) {
    if (params.performPointIndex === 0 || params.performPointIndex === 1) {
      applySnap45(this, params, params.performPointIndex === 0 ? 1 : 0)
    }
  },

  performEventMoveForDrawing: function (this: Overlay<InfoLineExtendData>, params) {
    if (params.performPointIndex === 1) {
      applySnap45(this, params, 0)
    }
  }
}

export default infoLine
