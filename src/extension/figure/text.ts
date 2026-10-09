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

import type Coordinate from '../../common/Coordinate'
import type { TextStyle } from '../../common/Styles'

import { createFont, calcTextWidth } from '../../common/utils/canvas'

import type { FigureTemplate } from '../../component/Figure'

import { type RectAttrs, drawRect } from './rect'

/**
 * Word-wrap text into lines that fit within maxWidth.
 * Uses canvas measureText for accurate width calculation.
 */
function wrapText (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine.length > 0 ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine)
  }
  return lines.length > 0 ? lines : ['']
}

export function getTextRect (attrs: TextAttrs, styles: Partial<TextStyle>): RectAttrs {
  const { size = 12, paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0, weight = 'normal', family } = styles
  const { x, y, text, align = 'left', baseline = 'top', width: w, height: h } = attrs
  const width = w ?? (paddingLeft + calcTextWidth(text, size, weight, family) + paddingRight)
  const height = h ?? (paddingTop + size + paddingBottom)
  let startX = 0
  switch (align) {
    case 'left':
    case 'start': {
      startX = x
      break
    }
    case 'right':
    case 'end': {
      startX = x - width
      break
    }
    default: {
      startX = x - width / 2
      break
    }
  }
  let startY = 0
  switch (baseline) {
    case 'top':
    case 'hanging': {
      startY = y
      break
    }
    case 'bottom':
    case 'ideographic':
    case 'alphabetic': {
      startY = y - height
      break
    }
    default: {
      startY = y - height / 2
      break
    }
  }
  return { x: startX, y: startY, width, height }
}

export function checkCoordinateOnText (coordinate: Coordinate, attrs: TextAttrs | TextAttrs[], styles: Partial<TextStyle>): boolean {
  let texts: TextAttrs[] = []
  texts = texts.concat(attrs)
  const { size = 12, weight = 'normal', family } = styles
  const lineHeight = size * 1.3

  for (const text of texts) {
    // When explicit width+height are set (word-wrap mode), use actual text content height for hit testing
    // instead of the full container height — so only clicks on the text lines register
    let hitRect: RectAttrs = { x: 0, y: 0, width: 0, height: 0 }
    if (text.width != null && text.height != null) {
      const contentWidth = text.width
      // Estimate line count from text width vs available width
      const textW = calcTextWidth(text.text, size, weight, family)
      const lineCount = Math.max(1, Math.ceil(textW / contentWidth))
      const contentHeight = lineCount * lineHeight

      // Use getTextRect for X positioning but override height with actual content height
      const fullRect = getTextRect(text, styles)
      // Re-center vertically based on actual content height (same logic as drawText)
      const vAlign = text.baseline ?? 'top'
      let startY = fullRect.y
      if (vAlign === 'middle') {
        startY = fullRect.y + (fullRect.height - contentHeight) / 2
      } else if (vAlign === 'bottom' || vAlign === 'alphabetic' || vAlign === 'ideographic') {
        startY = fullRect.y + fullRect.height - contentHeight
      }
      hitRect = { x: fullRect.x, y: startY, width: fullRect.width, height: contentHeight }
    } else {
      hitRect = getTextRect(text, styles)
    }

    if (
      coordinate.x >= hitRect.x &&
      coordinate.x <= hitRect.x + hitRect.width &&
      coordinate.y >= hitRect.y &&
      coordinate.y <= hitRect.y + hitRect.height
    ) {
      return true
    }
  }
  return false
}

export function drawText (ctx: CanvasRenderingContext2D, attrs: TextAttrs | TextAttrs[], styles: Partial<TextStyle>): void {
  let texts: TextAttrs[] = []
  texts = texts.concat(attrs)
  const {
    color = 'currentColor',
    size = 12,
    family,
    weight,
    fontStyle,
    paddingLeft = 0,
    paddingTop = 0
  } = styles
  const rects = texts.map(text => getTextRect(text, styles))
  drawRect(ctx, rects, { ...styles, color: styles.backgroundColor })

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = createFont(size, weight, family, fontStyle)
  ctx.fillStyle = color

  const lineHeight = size * 1.3

  texts.forEach((text, index) => {
    const rect = rects[index]
    const hasRotation = text.rotation != null && text.rotation !== 0
    if (hasRotation) {
      ctx.save()
      ctx.translate(text.x, text.y)
      ctx.rotate(text.rotation!)
      ctx.translate(-text.x, -text.y)
    }
    if (text.width != null && text.height != null) {
      // Multi-line word wrap + clip to bounds
      ctx.save()
      ctx.beginPath()
      ctx.rect(rect.x, rect.y, rect.width, rect.height)
      ctx.clip()

      const innerWidth = rect.width - paddingLeft
      const lines = wrapText(ctx, text.text, innerWidth)
      const totalTextH = lines.length === 1 ? size : lines.length * lineHeight
      const align = text.align ?? 'left'
      const vAlign = text.baseline ?? 'top'

      // Vertical offset: center text lines within shape bounds
      let startY = rect.y + paddingTop
      if (vAlign === 'middle') {
        startY = rect.y + (rect.height - totalTextH) / 2
      } else if (vAlign === 'bottom' || vAlign === 'alphabetic' || vAlign === 'ideographic') {
        startY = rect.y + rect.height - totalTextH - paddingTop
      }

      for (let i = 0; i < lines.length; i++) {
        const ly = startY + i * lineHeight
        let lx = rect.x + paddingLeft
        if (align === 'center') {
          const lw = ctx.measureText(lines[i]).width
          lx = rect.x + (rect.width - lw) / 2
        } else if (align === 'right' || align === 'end') {
          const lw = ctx.measureText(lines[i]).width
          lx = rect.x + rect.width - lw - paddingLeft
        }
        ctx.fillText(lines[i], lx, ly)
      }
      ctx.restore()
    } else {
      ctx.fillText(text.text, rect.x + paddingLeft, rect.y + paddingTop)
    }
    if (hasRotation) {
      ctx.restore()
    }
  })
}

export interface TextAttrs {
  x: number
  y: number
  text: string
  width?: number
  height?: number
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  /** Rotation angle in radians, applied around (x, y) */
  rotation?: number
}

const text: FigureTemplate<TextAttrs | TextAttrs[], Partial<TextStyle>> = {
  name: 'text',
  checkEventOn: checkCoordinateOnText,
  draw: (ctx: CanvasRenderingContext2D, attrs: TextAttrs | TextAttrs[], styles: Partial<TextStyle>) => {
    drawText(ctx, attrs, styles)
  }
}

export default text
