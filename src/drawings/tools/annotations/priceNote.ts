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

import type { Overlay, OverlayFigure, OverlayPerformEventParams, OverlayTemplate } from '../../../component/Overlay'
import type { Chart } from '../../../Chart'
import { isFunction, isNumber, isObject, isString, isValid } from '../../../common/utils/typeChecks'
import type Coordinate from '../../../common/Coordinate'
import { formatPrecision } from '../../../common/utils/format'

import { createAnchorFigures } from '../../interaction/anchors'
import { isSnap45Active, snap45Coordinate } from '../../interaction/snap45'
import type { RichTextAttrs } from '../../figures/richText'
import { getRichTextLayout } from '../../figures/richText'
import type { TextBoxData, TextBoxHorzAlign, TextBoxVertAlign } from '../../text/textBox'

import {
  annotationChartOf,
  baseTextBoxData,
  commitText,
  liveTextOf,
  openAnnotationEditor,
  pointToCoordinate,
  rememberAnnotationContext,
  resolvedTextStyles,
  type AnnotationTextStyle,
  type TextToolExtendData
} from './common'

/**
 * 'simpleAnnotation' — catalog 'priceNote'. REBUILDS the kernel
 * simpleAnnotation into TradingView's two-point Price Note: a line from
 * P1 (price anchor, ringed circle) to P2 (label end), the P1 price drawn
 * as a rounded label AT P2 aligned by the line angle, and the custom text
 * laid out along the line. Legacy string/function extendData is still
 * read as the label and normalized to { text } on placement.
 */

export interface PriceNoteExtendData extends TextToolExtendData {}

/** Text-style bag for the custom label (existing 'textNote' key). */
type PriceNoteTextStyle = AnnotationTextStyle

/** Style bag for the price label — falls back to the line color. */
type PriceLabelStyle = AnnotationTextStyle

const STYLE_KEY = 'textNote'

/** P1 marker: filled disc + TV's circle border ring. */
const P1_CIRCLE_RADIUS = 5
const P1_RING_RADIUS = 8
/** Label separation from the P2 endpoint along the line direction. */
const PRICE_LABEL_OFFSET = 6
/** Custom label separation above the line midpoint. */
const TEXT_LABEL_OFFSET = 4
/** Price label inner padding (TV label padding). */
const PRICE_LABEL_PADDING_HORZ = 6
const PRICE_LABEL_PADDING_VERT = 4

function getNoteStyles (overlay: Overlay<PriceNoteExtendData>): PriceNoteTextStyle {
  return resolvedTextStyles(overlay, STYLE_KEY)
}

function getPriceLabelStyles (overlay: Overlay<PriceNoteExtendData>, fallbackColor: string): PriceLabelStyle {
  const resolved = resolvedTextStyles(overlay, 'priceLabel')
  return {
    ...resolved,
    backgroundColor: resolved.backgroundColor ?? fallbackColor,
    borderColor: resolved.borderColor ?? fallbackColor
  }
}

function getLineColor (overlay: Overlay<PriceNoteExtendData>): string {
  return overlay.styles?.line?.color ?? '#2962FF'
}

function getText (overlay: Overlay<PriceNoteExtendData>): string {
  const extendData = overlay.extendData as PriceNoteExtendData | string | ((o: Overlay) => string) | undefined
  if (isString(extendData)) {
    return extendData
  }
  if (isFunction(extendData)) {
    return extendData(overlay)
  }
  return liveTextOf(overlay) ?? extendData?.text ?? ''
}

/** The P1 price as shown on the y-axis — symbol precision formatted. */
function getPriceText (chart: Chart, overlay: Overlay<PriceNoteExtendData>): string {
  const value = overlay.points[0]?.value
  const precision = chart.getSymbol()?.pricePrecision ?? 2
  return isNumber(value) ? formatPrecision(value, precision) : ''
}

/**
 * TradingView `alignByAngle` — buckets the line angle into the label's
 * box-anchor alignment at P2 (canvas y points down):
 *   up-pointing    [-135°,-45°] → centered / bottom (label above P2)
 *   right-pointing  (-45°,45°)  → left / middle    (label right of P2)
 *   down-pointing   [45°,135°]  → centered / top   (label below P2)
 *   left-pointing   otherwise   → right / middle   (label left of P2)
 */
function alignByAngle (angleDeg: number): { horzAlign: TextBoxHorzAlign, vertAlign: TextBoxVertAlign } {
  if (angleDeg >= -45 && angleDeg < 45) {
    return { horzAlign: 'left', vertAlign: 'middle' }
  }
  if (angleDeg >= 45 && angleDeg < 135) {
    return { horzAlign: 'center', vertAlign: 'top' }
  }
  if (angleDeg >= -135 && angleDeg < -45) {
    return { horzAlign: 'center', vertAlign: 'bottom' }
  }
  return { horzAlign: 'right', vertAlign: 'middle' }
}

function lineAngleDeg (p1: Coordinate, p2: Coordinate): number {
  return Math.round((180 * Math.atan2(p2.y - p1.y, p2.x - p1.x)) / Math.PI)
}

/**
 * The custom label anchor — midpoint of the line pushed along the screen-up
 * normal by half the font size plus a gap (TradingView lifts the text off
 * the line). `rad` is the rotation the figure applies, readable ±90°.
 */
function customTextAnchor (p1: Coordinate, p2: Coordinate, fontSize: number): { anchor: Coordinate, rad: number } {
  const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const mid: Coordinate = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
  if (segLen === 0) {
    return { anchor: mid, rad: 0 }
  }
  const dir: Coordinate = { x: (p2.x - p1.x) / segLen, y: (p2.y - p1.y) / segLen }
  // Up-normal of the segment (negative screen-y side).
  let normal: Coordinate = { x: -dir.y, y: dir.x }
  if (normal.y > 0) {
    normal = { x: -normal.x, y: -normal.y }
  }
  let rad = Math.atan2(p2.y - p1.y, p2.x - p1.x)
  // Keep the text right-side up — flip lines pointing left.
  if (rad > Math.PI / 2) {
    rad -= Math.PI
  } else if (rad < -Math.PI / 2) {
    rad += Math.PI
  }
  const lift = fontSize / 2 + TEXT_LABEL_OFFSET
  return {
    anchor: { x: mid.x + normal.x * lift, y: mid.y + normal.y * lift },
    rad
  }
}

/** The custom label's box — midpoint of the line, offset above, rotated. */
function customTextData (overlay: Overlay<PriceNoteExtendData>): TextBoxData {
  const styles = getNoteStyles(overlay)
  return {
    ...baseTextBoxData(getText(overlay), styles),
    horzAlign: 'center',
    vertAlign: 'bottom',
    horzTextAlign: 'center'
  }
}

function openEditor (chart: Chart, overlay: Overlay<PriceNoteExtendData>): void {
  openAnnotationEditor({
    chart,
    overlay,
    data: () => customTextData(overlay),
    // Editor anchors at the (unrotated) label anchor — the canvas figure
    // rotates around it; the DOM textarea stays axis-aligned.
    anchor: () => {
      const p1 = pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {})
      const p2 = pointToCoordinate(chart, overlay.paneId, overlay.points[1] ?? {})
      return customTextAnchor(p1, p2, getNoteStyles(overlay).fontSize ?? 12).anchor
    },
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const simpleAnnotation: OverlayTemplate<PriceNoteExtendData> = {
  name: 'simpleAnnotation',
  // Two points: P1 = price anchor (circle), P2 = label end.
  totalStep: 3,
  // The price label + rotated text escape the segment hull — and the label
  // is fixed-pixel sized — hull-based culling would clip it.
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  // TradingView's renderer draws the line + price label itself — there is
  // no separate y-axis price-line figure on this tool.
  needDefaultYAxisFigure: false,
  styles: {
    textNote: {
      color: '#FFFFFF',
      fontSize: 12,
      bold: false
    },
    priceLabel: {
      color: '#FFFFFF',
      backgroundColor: '#2962FF',
      borderColor: '#2962FF',
      borderWidth: 1,
      backgroundRoundRect: 4,
      fontSize: 12
    },
    line: {
      color: '#2962FF',
      size: 1,
      style: 'solid'
    },
    polygon: {
      color: '#2962FF',
      style: 'fill'
    }
  },
  createPointFigures: ({ overlay, coordinates, bounding, chart, isSelected, isHovered, isTouch }) => {
    rememberAnnotationContext(overlay, chart, bounding)
    if (coordinates.length === 0) {
      return []
    }
    const p1 = coordinates[0]
    const lineColor = getLineColor(overlay)
    const lineStyle = overlay.styles?.line
    const figures: OverlayFigure[] = []

    // P1 circle + TradingView's circle border ring.
    figures.push(
      {
        key: 'p1Circle',
        type: 'circle',
        attrs: { x: p1.x, y: p1.y, r: P1_CIRCLE_RADIUS },
        styles: { style: 'fill', color: lineColor }
      },
      {
        key: 'p1Ring',
        type: 'circle',
        attrs: { x: p1.x, y: p1.y, r: P1_RING_RADIUS },
        styles: { style: 'stroke', color: lineColor, borderSize: 1.5 },
        ignoreEvent: true
      }
    )

    if (coordinates.length >= 2) {
      const p2 = coordinates[1]
      const angleDeg = lineAngleDeg(p1, p2)
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const dir: Coordinate = segLen > 0 ? { x: (p2.x - p1.x) / segLen, y: (p2.y - p1.y) / segLen } : { x: 1, y: 0 }

      // P1 → P2 solid line (the hit body — line figures hit-test by
      // distance to the segment).
      figures.push({
        key: 'line',
        type: 'line',
        attrs: { coordinates: [p1, p2] },
        styles: lineStyle,
        cursor: 'move'
      })

      // Price label at P2 — formatted P1 price, aligned by line angle.
      const priceStyles = getPriceLabelStyles(overlay, lineColor)
      const priceText = getPriceText(chart, overlay)
      const { horzAlign, vertAlign } = alignByAngle(angleDeg)
      const anchorX = p2.x + dir.x * PRICE_LABEL_OFFSET
      const anchorY = p2.y + dir.y * PRICE_LABEL_OFFSET
      const priceData: TextBoxData = {
        text: priceText,
        fontSize: priceStyles.fontSize ?? getNoteStyles(overlay).fontSize ?? 12,
        bold: priceStyles.bold,
        italic: priceStyles.italic,
        fontFamily: priceStyles.fontFamily,
        boxPaddingHorz: PRICE_LABEL_PADDING_HORZ,
        boxPaddingVert: PRICE_LABEL_PADDING_VERT,
        horzAlign,
        vertAlign,
        horzTextAlign: horzAlign
      }
      const priceAttrs: RichTextAttrs = { x: anchorX, y: anchorY, ...priceData }
      const priceLayout = getRichTextLayout(priceAttrs)
      figures.push({
        key: 'priceLabel',
        type: 'richText',
        attrs: priceAttrs,
        styles: {
          color: priceStyles.color ?? '#FFFFFF',
          backgroundColor: priceStyles.backgroundColor,
          borderColor: priceStyles.borderColor,
          borderWidth: priceStyles.borderWidth ?? 1,
          backgroundRoundRect: priceStyles.backgroundRoundRect ?? 4
        },
        bounds: {
          x: priceLayout.boxLeft,
          y: priceLayout.boxTop,
          width: priceLayout.boxWidth,
          height: priceLayout.boxHeight
        },
        cursor: 'move'
      })

      // Custom text along the line — centered on the midpoint, rotated to
      // the line angle (normalized to stay readable, ±90°).
      const text = getText(overlay)
      if (text !== '' && segLen > 0) {
        const fontSize = getNoteStyles(overlay).fontSize ?? 12
        const { anchor: textAnchor, rad } = customTextAnchor(p1, p2, fontSize)
        const textData = customTextData(overlay)
        const textAttrs: RichTextAttrs = {
          x: textAnchor.x,
          y: textAnchor.y,
          ...textData,
          angle: rad
        }
        const textLayout = getRichTextLayout(textAttrs)
        const pad = fontSize
        figures.push({
          key: 'label',
          type: 'richText',
          attrs: textAttrs,
          styles: {
            color: getNoteStyles(overlay).color,
            // TV draws the custom text without a background — glyphs only.
            backgroundColor: 'transparent'
          },
          // Rotated geometry — a padded AABB approximates the hit area.
          bounds: {
            x: Math.min(...textLayout.polygonPoints.map(c => c.x)) - pad / 2,
            y: Math.min(...textLayout.polygonPoints.map(c => c.y)) - pad / 2,
            width: Math.max(...textLayout.polygonPoints.map(c => c.x)) - Math.min(...textLayout.polygonPoints.map(c => c.x)) + pad,
            height: Math.max(...textLayout.polygonPoints.map(c => c.y)) - Math.min(...textLayout.polygonPoints.map(c => c.y)) + pad
          },
          cursor: 'text'
        })
      }
    }

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isTouch,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      midPoint: true,
      keyPrefix: 'anchor_'
    }))
    return figures
  },
  // `this` is the overlay — the perform params carry none.
  performEventPressedMove: function (this: Overlay<PriceNoteExtendData>, params) {
    snapP2(this, params)
  },
  performEventMoveForDrawing: function (this: Overlay<PriceNoteExtendData>, params) {
    snapP2(this, params)
  },
  onDrawEnd: ({ overlay, chart }) => {
    const ed = overlay.extendData
    if (isValid(ed) && !isObject(ed)) {
      // Legacy string/function extendData — normalize to the object form so
      // settings commits merge cleanly. Object payloads keep their keys.
      overlay.extendData = { text: getText(overlay) }
      overlay.invalidateFigures()
    }
    if (!overlay.isDrawing()) {
      openEditor(chart, overlay)
    }
  },
  onDoubleClick: ({ overlay, chart }) => {
    openEditor(chart, overlay)
  }
}

/**
 * Shift (or the align-45 toggle) snaps the dragged endpoint onto the
 * nearest 45° ray from the OTHER endpoint — same constraint the line
 * tools apply (TradingView angle snap).
 */
function snapP2 (overlay: Overlay<PriceNoteExtendData>, params: OverlayPerformEventParams): void {
  const event = params.event
  const chart = annotationChartOf(overlay)
  if (event === undefined || chart === undefined || !isSnap45Active(chart, event)) {
    return
  }
  if (!isNumber(event.x) || !isNumber(event.y)) {
    return
  }
  const fixedIndex = params.performPointIndex === 0 ? 1 : 0
  const fixed = params.points[fixedIndex]
  if (!isValid(fixed)) {
    return
  }
  const from = pointToCoordinate(chart, overlay.paneId, fixed)
  const snapped = snap45Coordinate({ x: event.x, y: event.y }, from)
  const converted = chart.convertFromPixel([snapped], { paneId: overlay.paneId })
  const point = Array.isArray(converted) ? converted[0] : converted
  const target = params.points[params.performPointIndex]
  if (!isValid(target) || !isValid(point)) {
    return
  }
  if (isNumber(point.timestamp)) target.timestamp = point.timestamp
  if (isNumber(point.dataIndex)) target.dataIndex = point.dataIndex
  if (isNumber(point.value)) target.value = point.value
}

export default simpleAnnotation
