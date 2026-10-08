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

import { measureText, type TextWidthCache } from './measure'
import { wordWrap, type WrappedLine } from './wordWrap'

/**
 * Text-box layout engine — ported from TradingView's TextRenderer
 * (_getBox / _getBoxSize / _getInternalData / getLinesInfo), minus the
 * decorator system (TV forbids decorators together with wordWrapWidth, and
 * none of our tools use them).
 *
 * This is the SINGLE source of geometry for both the canvas figure and the
 * DOM text editor — the editor's layout() callback consumes this output so
 * caret, selection and the invisible textarea always agree with painted
 * pixels (the #1 defect of ad hoc editors is re-measuring in the DOM).
 */

export const CHART_FONT_FAMILY = "'Trebuchet MS', Roboto, Ubuntu, sans-serif"

export type TextBoxHorzAlign = 'left' | 'center' | 'right'
export type TextBoxVertAlign = 'top' | 'middle' | 'bottom'

export interface TextBoxData {
  text: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  fontFamily?: string
  /** Wrap width in px — presence enables word wrapping inside the box. */
  wordWrapWidth?: number
  /** Limit the number of visible wrapped lines by pixel height. */
  maxHeight?: number
  /** Box anchor alignment (where the anchor point sits on the box). */
  horzAlign?: TextBoxHorzAlign
  vertAlign?: TextBoxVertAlign
  /** Text alignment inside the box (defaults to horzAlign). */
  horzTextAlign?: TextBoxHorzAlign
  offsetX?: number
  offsetY?: number
  /** Rotation around the alignment-dependent rotation point, radians. */
  angle?: number
  /** Inner padding; defaults to fontSize / 3 per TradingView. */
  boxPadding?: number
  boxPaddingVert?: number
  boxPaddingHorz?: number
  boxPaddingLeft?: number
  boxPaddingRight?: number
  /** Explicit box size overrides (auto-measured otherwise). */
  boxWidth?: number
  boxHeight?: number
  /** Extra pixels between lines (lineHeight = fontSize + lineSpacing). */
  lineSpacing?: number
  /** Right-to-left text direction. */
  rtl?: boolean
}

export interface TextBoxLinesInfo {
  /** All wrapped lines including hidden continuation segments. */
  linesIncludingHidden: WrappedLine[]
  /** Visible lines only (hidden + maxHeight-truncated removed). */
  lines: WrappedLine[]
  linesMaxWidth: number
}

export interface TextBoxLayout {
  /** `${bold}${italic}${fontSize}px ${family}` canvas font string. */
  font: string
  fontSize: number
  lineSpacing: number
  /** Outer box (includes padding) in media (CSS px) coordinates. */
  boxLeft: number
  boxTop: number
  boxWidth: number
  boxHeight: number
  /** Auto-measured box size before explicit overrides. */
  textBoxWidth: number
  textBoxHeight: number
  /** Inner text area inside padding. */
  textLeft: number
  textTop: number
  textRight: number
  textBottom: number
  /** fillText anchor relative to (boxLeft, boxTop). */
  textHorizStart: number
  textVertStart: number
  /** Canvas textAlign value ('start' | 'center' | 'end'). */
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  linesInfo: TextBoxLinesInfo
  /** Rotation pivot — follows horz/vert box alignment (TV parity). */
  rotationPoint: Coordinate
  /** Text center rotated around rotationPoint — editor rotation anchor. */
  centerTextRotation: { x: number, y: number, angle: number }
  /** Rotated box corners for hit testing. */
  polygonPoints: Coordinate[]
}

function fontSizeOf (data: TextBoxData): number {
  return Math.ceil(data.fontSize ?? 12)
}

function lineSpacingOf (data: TextBoxData): number {
  return data.lineSpacing ?? 0
}

function getVerticalPadding (data: TextBoxData): number {
  return data.boxPaddingVert ?? data.boxPadding ?? fontSizeOf(data) / 3
}

function getHorizontalPadding (data: TextBoxData): number {
  return data.boxPaddingHorz ?? data.boxPadding ?? fontSizeOf(data) / 3
}

function getLeftPadding (data: TextBoxData): number {
  return data.boxPaddingLeft ?? getHorizontalPadding(data)
}

function getRightPadding (data: TextBoxData): number {
  return data.boxPaddingRight ?? getHorizontalPadding(data)
}

export function textBoxFont (data: TextBoxData): string {
  const size = fontSizeOf(data)
  return `${data.bold === true ? 'bold ' : ''}${data.italic === true ? 'italic ' : ''}${size}px ${data.fontFamily ?? CHART_FONT_FAMILY}`
}

function computeLinesInfo (data: TextBoxData, font: string, widthCache?: TextWidthCache): TextBoxLinesInfo {
  const wrapped = wordWrap(data.text, font, widthCache, false, data.wordWrapWidth)
  let visible = wrapped.filter(line => !line.hidden)
  if (data.maxHeight !== undefined) {
    const maxVisibleLines = Math.floor(
      (data.maxHeight + lineSpacingOf(data)) / (fontSizeOf(data) + lineSpacingOf(data))
    )
    if (visible.length > maxVisibleLines) {
      visible = visible.slice(0, maxVisibleLines)
    }
  }
  let linesMaxWidth = 0
  if (data.wordWrapWidth !== undefined) {
    // TV: when wrapping is enabled the wrap width IS the max line width.
    linesMaxWidth = data.wordWrapWidth
  } else {
    for (const line of visible) {
      linesMaxWidth = Math.max(linesMaxWidth, measureText(line.text, font, widthCache).width)
    }
  }
  return { linesIncludingHidden: wrapped, lines: visible, linesMaxWidth }
}

function rotatePointAroundOrigin (point: Coordinate, origin: Coordinate, angle: number): Coordinate {
  if (angle === 0) {
    return { x: point.x, y: point.y }
  }
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return {
    x: dx * cos - dy * sin + origin.x,
    y: dx * sin + dy * cos + origin.y
  }
}

/**
 * Compute the full text-box layout for `data` anchored at `anchor`
 * (media/CSS-px coordinates). Deterministic and context-free: the same
 * input always produces the same geometry for renderer, hit test, caret
 * and selection.
 */
export function computeTextBoxLayout (
  data: TextBoxData,
  anchor: Coordinate,
  widthCache?: TextWidthCache
): TextBoxLayout {
  const font = textBoxFont(data)
  const fontSize = fontSizeOf(data)
  const spacing = lineSpacingOf(data)
  const linesInfo = computeLinesInfo(data, font, widthCache)

  // ── _getBoxSize ──────────────────────────────────────────────────────────
  const leftPadding = getLeftPadding(data)
  const rightPadding = getRightPadding(data)
  const verticalPadding = getVerticalPadding(data)

  let textBoxWidth = Math.round(linesInfo.linesMaxWidth + leftPadding + rightPadding)
  if (textBoxWidth % 2 !== 0) {
    textBoxWidth += 1 // TV keeps the auto width even so anchors stay centered.
  }
  const textBoxHeight = fontSize * linesInfo.lines.length +
    spacing * Math.max(0, linesInfo.lines.length - 1) +
    2 * verticalPadding

  const boxWidth = data.boxWidth ?? textBoxWidth
  const boxHeight = data.boxHeight ?? textBoxHeight

  // ── _getBox ──────────────────────────────────────────────────────────────
  let boxLeft = anchor.x
  let boxTop = anchor.y
  const vertAlign = data.vertAlign ?? 'top'
  const horzAlign = data.horzAlign ?? 'left'
  const offsetX = data.offsetX ?? 0
  const offsetY = data.offsetY ?? 0

  switch (vertAlign) {
    case 'bottom':
      boxTop -= boxHeight + offsetY
      break
    case 'middle':
      boxTop -= boxHeight / 2
      break
    default:
      boxTop += offsetY
  }
  switch (horzAlign) {
    case 'center':
      boxLeft -= boxWidth / 2
      break
    case 'right':
      boxLeft -= boxWidth + offsetX
      break
    default:
      boxLeft += offsetX
  }

  // ── _getInternalData ─────────────────────────────────────────────────────
  const horzTextAlign = data.horzTextAlign ?? horzAlign
  const rtl = data.rtl === true

  let textHorizStart = 0
  let textAlign: CanvasTextAlign = 'start'
  switch (horzTextAlign) {
    case 'center': {
      textAlign = 'center'
      const availableTextWidth = boxWidth - leftPadding - rightPadding
      textHorizStart = leftPadding + availableTextWidth / 2
      break
    }
    case 'right': {
      textAlign = 'end'
      textHorizStart = boxWidth - rightPadding
      if (rtl) {
        textHorizStart = leftPadding
        textAlign = 'start'
      }
      break
    }
    default: {
      textAlign = 'start'
      textHorizStart = leftPadding
      if (rtl) {
        textHorizStart = boxWidth - rightPadding
        textAlign = 'end'
      }
    }
  }
  // TV paints each line with textBaseline 'middle'; the anchor sits at
  // textTop + fontSize/2 (+ 0.05*fontSize baseline adjustment at draw time).
  const textVertStart = verticalPadding + fontSize / 2

  const textLeft = boxLeft + leftPadding
  const textRight = boxLeft + boxWidth - rightPadding
  const textTop = boxTop + verticalPadding
  const textBottom = boxTop + boxHeight - verticalPadding

  // ── rotation geometry ────────────────────────────────────────────────────
  const rotationPoint: Coordinate = {
    x: horzAlign === 'center' ? boxLeft + boxWidth / 2 : (horzAlign === 'right' ? boxLeft + boxWidth : boxLeft),
    y: vertAlign === 'middle' ? boxTop + boxHeight / 2 : (vertAlign === 'bottom' ? boxTop + boxHeight : boxTop)
  }
  const angle = data.angle ?? 0
  const textCenter = rotatePointAroundOrigin(
    { x: (textLeft + textRight) / 2, y: (textTop + textBottom) / 2 },
    rotationPoint,
    angle
  )
  const polygonPoints: Coordinate[] = [
    { x: boxLeft, y: boxTop },
    { x: boxLeft + boxWidth, y: boxTop },
    { x: boxLeft + boxWidth, y: boxTop + boxHeight },
    { x: boxLeft, y: boxTop + boxHeight }
  ].map(p => rotatePointAroundOrigin(p, rotationPoint, angle))

  return {
    font,
    fontSize,
    lineSpacing: spacing,
    boxLeft,
    boxTop,
    boxWidth,
    boxHeight,
    textBoxWidth,
    textBoxHeight,
    textLeft,
    textTop,
    textRight,
    textBottom,
    textHorizStart,
    textVertStart,
    textAlign,
    textBaseline: 'middle',
    linesInfo,
    rotationPoint,
    centerTextRotation: { x: textCenter.x, y: textCenter.y, angle },
    polygonPoints
  }
}

/**
 * Whether the layout output (given the same anchor) can differ — used by
 * figure-cache invalidation. Mirrors TV's geometry-affecting field list.
 */
export function textBoxDataEqual (a: TextBoxData, b: TextBoxData): boolean {
  return a.text === b.text &&
    a.fontSize === b.fontSize &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.fontFamily === b.fontFamily &&
    a.wordWrapWidth === b.wordWrapWidth &&
    a.maxHeight === b.maxHeight &&
    a.horzAlign === b.horzAlign &&
    a.vertAlign === b.vertAlign &&
    a.horzTextAlign === b.horzTextAlign &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY &&
    a.angle === b.angle &&
    a.boxPadding === b.boxPadding &&
    a.boxPaddingVert === b.boxPaddingVert &&
    a.boxPaddingHorz === b.boxPaddingHorz &&
    a.boxPaddingLeft === b.boxPaddingLeft &&
    a.boxPaddingRight === b.boxPaddingRight &&
    a.boxWidth === b.boxWidth &&
    a.boxHeight === b.boxHeight &&
    a.lineSpacing === b.lineSpacing &&
    a.rtl === b.rtl
}
