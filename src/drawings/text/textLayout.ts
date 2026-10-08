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

import { measureText, type TextWidthCache } from './measure'
import type { WrappedLine } from './wordWrap'

/**
 * Caret/selection geometry (module 824940) — ported to return CSS-pixel
 * rectangles instead of drawing to canvas. The text editor renders these as
 * DOM nodes on the pane DOM layer, so caret blinking and selection changes
 * cost ZERO canvas repaints.
 */

export type TextAlignOption = 'left' | 'center' | 'right' | 'start' | 'end'

export interface CaretPosition {
  /** x offset of the caret inside the text box (CSS px, pre-rotation). */
  x: number
  /** y offset of the caret top inside the text box. */
  y: number
  /** Index of the visible line the caret sits on. */
  lineNumber: number
}

export interface TextLayoutOptions {
  /** String position (UTF-16 code units) to map, 0..text.length. */
  symbolPosition: number
  /** Total text box width (CSS px) — lines are aligned inside it. */
  textWidth: number
  /** wordWrap() output for the CURRENT text (hidden lines included). */
  lines: WrappedLine[]
  font: string
  /** Line height in CSS px. */
  lineHeight: number
  lineSpacing?: number
  textAlign: TextAlignOption
  /** Right-to-left text direction. */
  rtl?: boolean
  widthCache?: TextWidthCache
}

function caretOrigin (textAlign: TextAlignOption, textWidth: number, rtl: boolean): number {
  switch (textAlign) {
    case 'center': return textWidth / 2
    case 'start': return rtl ? textWidth : 0
    case 'end': return rtl ? 0 : textWidth
    case 'right': return textWidth
    default: return 0
  }
}

/**
 * Map a string position through wrapped and hidden line segments to caret
 * coordinates. A caret at a wrap boundary advances to the next visible line.
 */
export function getCaretPosition (options: TextLayoutOptions): CaretPosition {
  const {
    symbolPosition,
    textWidth,
    lines,
    lineHeight,
    font,
    textAlign,
    lineSpacing = 0,
    rtl = false,
    widthCache
  } = options

  let caretX = caretOrigin(textAlign, textWidth, rtl)
  let caretY = 0
  const lineAdvance = lineHeight + lineSpacing
  let consumedSymbols = 0
  let lineNumber = 0
  let visibleText = ''

  for (let index = 0; index < lines.length; index++) {
    let positionInLine = symbolPosition - consumedSymbols
    const { wrappedLinePart, wrappedLineEnd, hidden, text } = lines[index]
    const nextLine = index < lines.length - 1 ? lines[index + 1] : null
    if (!hidden) {
      visibleText = text
    }
    if (nextLine !== null && positionInLine > text.length) {
      consumedSymbols += text.length + (wrappedLinePart && !wrappedLineEnd ? 0 : 1)
      if (!hidden) {
        caretY += lineAdvance
      }
      continue
    }
    if (hidden) {
      caretY -= lineAdvance
    }
    const caretMovesToNextLine =
      wrappedLinePart &&
      !wrappedLineEnd &&
      text.length === positionInLine &&
      nextLine !== null &&
      !nextLine.hidden
    if (hidden) {
      visibleText += ' '
      positionInLine = visibleText.length
    }
    if (textAlign === 'center') {
      if (caretMovesToNextLine) {
        caretX = textWidth / 2
      } else {
        const lineWidth = measureText(visibleText, font, widthCache).width
        const prefixWidth = measureText(visibleText.slice(0, positionInLine), font, widthCache).width
        const centerX = textWidth / 2
        caretX = rtl
          ? centerX + lineWidth / 2 - prefixWidth
          : centerX - lineWidth / 2 + prefixWidth
      }
    } else if (
      (textAlign === 'right' && !rtl) ||
      (textAlign === 'left' && rtl) ||
      textAlign === 'end'
    ) {
      if (caretMovesToNextLine) {
        caretX = textWidth
      } else {
        const measuredWidth = measureText(visibleText.slice(positionInLine), font, widthCache).width
        caretX = rtl ? measuredWidth : textWidth - measuredWidth
      }
    } else if (caretMovesToNextLine) {
      caretX = 0
    } else {
      const measuredWidth = measureText(visibleText.slice(0, positionInLine), font, widthCache).width
      caretX = rtl ? textWidth - measuredWidth : measuredWidth
    }
    if (caretMovesToNextLine) {
      lineNumber = index + 1
      caretY += lineAdvance
    } else {
      lineNumber = index
    }
    break
  }
  return { x: caretX, y: caretY, lineNumber }
}

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SelectionRectsOptions {
  /** Caret positions for both ends (from getCaretPosition). */
  start: CaretPosition
  end: CaretPosition
  lines: WrappedLine[]
  font: string
  /** Text box left edge x (CSS px). */
  left: number
  /** Text box right edge x (CSS px). */
  right: number
  lineHeight: number
  lineSpacing?: number
  textAlign: TextAlignOption
  rtl?: boolean
  widthCache?: TextWidthCache
}

/**
 * Selection rectangles per visible line — including the space width that an
 * explicit newline contributes at a line end. Same math as drawSelection,
 * returned as data so the editor can render DOM nodes.
 */
export function getSelectionRects (options: SelectionRectsOptions): SelectionRect[] {
  const {
    start,
    end,
    lines,
    font,
    left,
    right,
    lineHeight,
    lineSpacing = 0,
    textAlign,
    rtl = false,
    widthCache
  } = options

  const lineAdvance = lineHeight + lineSpacing
  const centerX = (left + right) / 2
  const rects: SelectionRect[] = []

  if (start.lineNumber === end.lineNumber) {
    rects.push({
      x: Math.min(start.x, end.x),
      y: start.y,
      width: Math.abs(start.x - end.x),
      height: lineAdvance
    })
    return rects
  }

  const spaceWidth = measureText(' ', font, widthCache).width
  let visibleLineIndex = 0
  for (let lineIndex = start.lineNumber; lineIndex <= end.lineNumber; lineIndex++) {
    const isFirstLine = lineIndex === start.lineNumber
    const isLastLine = lineIndex === end.lineNumber
    const line = lines[lineIndex]
    if (lineIndex >= lines.length || line.hidden) {
      continue
    }
    const lineWidth = measureText(line.text, font, widthCache).width
    let selectionLeft = 0
    let selectionRight = 0
    let rightAligned = false
    if (textAlign === 'center') {
      selectionLeft = isFirstLine ? start.x : (rtl ? centerX + lineWidth / 2 : centerX - lineWidth / 2)
      selectionRight = isLastLine ? end.x : (rtl ? centerX - lineWidth / 2 : centerX + lineWidth / 2)
    } else if (
      textAlign === 'right' ||
      (rtl && textAlign === 'start') ||
      (!rtl && textAlign === 'end')
    ) {
      selectionLeft = isFirstLine ? start.x : right - lineWidth
      selectionRight = isLastLine ? end.x : right
      rightAligned = true
    } else {
      selectionLeft = isFirstLine ? start.x : left
      selectionRight = isLastLine ? end.x : left + lineWidth
    }
    let rangeLeft = Math.min(selectionLeft, selectionRight)
    let rangeRight = Math.max(selectionLeft, selectionRight)
    if (!(isLastLine || (line.wrappedLinePart && !line.wrappedLineEnd))) {
      if (rightAligned) {
        rangeLeft -= spaceWidth
      } else {
        rangeRight += spaceWidth
      }
    }
    rects.push({
      x: rangeLeft,
      y: start.y + visibleLineIndex * lineAdvance,
      width: rangeRight - rangeLeft,
      height: lineAdvance
    })
    visibleLineIndex += 1
  }
  return rects
}
