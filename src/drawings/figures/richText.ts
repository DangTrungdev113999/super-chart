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

import type Coordinate from '../../common/Coordinate'
import { isString } from '../../common/utils/typeChecks'
import { isTransparent } from '../../common/utils/color'

import type { FigureTemplate } from '../../component/Figure'

import { createTextWidthCache } from '../text/measure'
import { computeTextBoxLayout, type TextBoxData, type TextBoxLayout } from '../text/textBox'

/**
 * 'richText' figure — TradingView TextRenderer parity: a padded (optionally
 * word-wrapped, rotated, bordered, shadowed) text box. Unlike the built-in
 * 'text' figure it shares geometry with the DOM text editor through
 * computeTextBoxLayout(), so what the canvas paints is exactly what the
 * editor positions its textarea/caret/selection over.
 */

export interface RichTextStyle {
  color?: string
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  /** Rounded-corner radius for background + border. */
  backgroundRoundRect?: number
  boxShadow?: {
    color: string
    blur: number
    offsetX?: number
    offsetY?: number
  }
  /** Extra outline outside the border (TV outlineBorder). */
  outlineBorder?: {
    width: number
    color: string
  }
}

export interface RichTextAttrs extends TextBoxData {
  x: number
  y: number
}

const widthCache = createTextWidthCache()

/** Layout is pure — memoize per attrs object (figure instances persist). */
const layoutCache = new WeakMap<RichTextAttrs, TextBoxLayout>()

export function getRichTextLayout (attrs: RichTextAttrs): TextBoxLayout {
  let layout = layoutCache.get(attrs)
  if (layout === undefined) {
    layout = computeTextBoxLayout(attrs, { x: attrs.x, y: attrs.y }, widthCache)
    layoutCache.set(attrs, layout)
  }
  return layout
}

function pointInPolygon (point: Coordinate, polygon: Coordinate[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (
      (polygon[i].y > point.y) !== (polygon[j].y > point.y) &&
      (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)
    ) {
      inside = !inside
    }
  }
  return inside
}

export function checkCoordinateOnRichText (coordinate: Coordinate, attrs: RichTextAttrs): boolean {
  const layout = getRichTextLayout(attrs)
  return layout.polygonPoints.length > 0 && pointInPolygon(coordinate, layout.polygonPoints)
}

export function drawRichText (ctx: CanvasRenderingContext2D, attrs: RichTextAttrs, styles: RichTextStyle): void {
  const layout = getRichTextLayout(attrs)
  const {
    color = 'currentColor',
    backgroundColor,
    borderColor,
    backgroundRoundRect,
    boxShadow,
    outlineBorder
  } = styles
  const borderWidth = styles.borderWidth ?? Math.max(layout.fontSize / 12, 1)

  ctx.save()
  const angle = attrs.angle ?? 0
  if (angle !== 0) {
    ctx.translate(layout.rotationPoint.x, layout.rotationPoint.y)
    ctx.rotate(angle)
    ctx.translate(-layout.rotationPoint.x, -layout.rotationPoint.y)
  }

  const boxLeft = Math.round(layout.boxLeft)
  const boxTop = Math.round(layout.boxTop)
  const boxWidth = Math.round(layout.boxWidth)
  const boxHeight = Math.round(layout.boxHeight)

  // ── background + border (TV draw order: shadow → bg → border) ───────────
  const hasBg = backgroundColor !== undefined && (!isString(backgroundColor) || !isTransparent(backgroundColor))
  const hasBorder = borderColor !== undefined && borderWidth > 0 && (!isString(borderColor) || !isTransparent(borderColor))
  if (hasBg || hasBorder) {
    let shadowStateSaved = false
    if (boxShadow !== undefined) {
      ctx.save()
      ctx.shadowColor = boxShadow.color
      ctx.shadowBlur = boxShadow.blur
      ctx.shadowOffsetX = boxShadow.offsetX ?? 0
      ctx.shadowOffsetY = boxShadow.offsetY ?? 0
      shadowStateSaved = true
    }
    // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-unnecessary-condition -- rect fallback for old canvas impls
    const rr = ctx.roundRect ?? ctx.rect
    if (hasBg) {
      ctx.fillStyle = backgroundColor
      ctx.beginPath()
      if (backgroundRoundRect !== undefined && backgroundRoundRect > 0) {
        rr.call(ctx, boxLeft, boxTop, boxWidth, boxHeight, backgroundRoundRect)
      } else {
        ctx.rect(boxLeft, boxTop, boxWidth, boxHeight)
      }
      ctx.closePath()
      ctx.fill()
      if (shadowStateSaved) {
        ctx.restore()
        shadowStateSaved = false
      }
    }
    if (hasBorder) {
      const half = borderWidth / 2
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth
      ctx.beginPath()
      if (backgroundRoundRect !== undefined && backgroundRoundRect > 0) {
        rr.call(ctx, boxLeft - half, boxTop - half, boxWidth + borderWidth, boxHeight + borderWidth, backgroundRoundRect + borderWidth)
      } else {
        ctx.rect(boxLeft - half, boxTop - half, boxWidth + borderWidth, boxHeight + borderWidth)
      }
      ctx.closePath()
      ctx.stroke()
      if (shadowStateSaved) {
        ctx.restore()
      }
    }
  }

  // ── text lines ───────────────────────────────────────────────────────────
  ctx.fillStyle = color
  ctx.font = layout.font
  ctx.textAlign = layout.textAlign
  ctx.textBaseline = layout.textBaseline

  const lineStartX = layout.boxLeft + layout.textHorizStart
  // TV applies a 0.05*fontSize baseline adjustment to the middle baseline.
  let lineY = layout.boxTop + layout.textVertStart + 0.05 * layout.fontSize
  const lineAdvance = layout.fontSize + layout.lineSpacing
  for (const line of layout.linesInfo.lines) {
    ctx.fillText(line.text, lineStartX, lineY)
    lineY += lineAdvance
  }

  // ── outline border (drawn last, outside everything) ─────────────────────
  if (outlineBorder !== undefined && outlineBorder.width > 0) {
    const ow = Math.round(outlineBorder.width)
    const existing = hasBorder ? Math.round(borderWidth) : 0
    const path = new Path2D()
    path.rect(boxLeft - existing - ow, boxTop - existing - ow, boxWidth + 2 * (existing + ow), boxHeight + 2 * (existing + ow))
    path.rect(boxLeft - existing, boxTop - existing, boxWidth + 2 * existing, boxHeight + 2 * existing)
    ctx.fillStyle = outlineBorder.color
    ctx.fill(path, 'evenodd')
  }

  ctx.restore()
}

const richText: FigureTemplate<RichTextAttrs, RichTextStyle> = {
  name: 'richText',
  checkEventOn: (coordinate: Coordinate, attrs: RichTextAttrs) => checkCoordinateOnRichText(coordinate, attrs),
  draw: (ctx: CanvasRenderingContext2D, attrs: RichTextAttrs, styles: RichTextStyle) => {
    drawRichText(ctx, attrs, styles)
  }
}

export default richText
