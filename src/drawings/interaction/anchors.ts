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
import type { OverlayFigure, OverlayFigureMoveDirection } from '../../component/Overlay'

export const ANCHOR_KEY_PREFIX = 'anchor_'
export const ANCHOR_MID_KEY = 'anchor_mid'

/**
 * TradingView anchor sizing: ~6px grab radius on mouse, ~13px on touch.
 * The figure IS the hit target, so touch anchors are physically bigger —
 * no separate tolerance plumbing needed.
 */
export const ANCHOR_HALF_MOUSE = 6
export const ANCHOR_HALF_TOUCH = 13

export interface AnchorFigureStyle {
  /** Anchor border color (default '#1592E6'). */
  borderColor?: string
  /** Anchor fill (default '#ffffff'). */
  backColor?: string
  /** Border width px (default 1.5). */
  borderSize?: number
  /** Locked-selection marker color (default '#787B86'). */
  lockedBorderColor?: string
}

export interface AnchorFiguresParams {
  /**
   * Point coordinates in pane space — one anchor per entry.
   */
  coordinates: Coordinate[]
  isSelected?: boolean
  isHovered?: boolean
  /**
   * Locked overlays render a non-interactive selection outline instead of
   * draggable anchors (TradingView `SelectionRenderer` behavior).
   */
  lock?: boolean
  /**
   * While the overlay is still drawing, the last (in-progress) point's
   * anchor is suppressed (TradingView `lineBeingCreated` behavior).
   */
  isDrawing?: boolean
  /**
   * Use touch-sized anchors (13px half-size instead of 6px).
   */
  isTouch?: boolean
  /**
   * Draw a midpoint translate handle between the two points of a 2-point
   * tool. The handle is an 'other'-type figure — dragging it translates
   * the whole overlay.
   */
  midPoint?: boolean
  /**
   * Anchor shape. 'square' = resize handles (default), 'circle' = round.
   */
  shape?: 'square' | 'circle'
  /**
   * Per-point CSS cursor (e.g. from computeResizeCursor). Falls back to
   * 'pointer'.
   */
  cursors?: Array<string | undefined>
  /**
   * Per-point axis-constrained drag direction. Falls back to 'both'.
   */
  moveDirections?: Array<OverlayFigureMoveDirection | undefined>
  styles?: AnchorFigureStyle
  /**
   * Key prefix for generated figures (default 'anchor_'); the midpoint
   * handle uses `${prefix}mid` unless overridden.
   */
  keyPrefix?: string
  /**
   * Which point indexes get anchors. Defaults to all coordinates.
   */
  pointIndexes?: number[]
}

function anchorVisible (isSelected: boolean, isHovered: boolean, lock: boolean): boolean {
  // TradingView rule: anchors show on selection always, on hover only when
  // the source is not locked.
  return isSelected || (isHovered && !lock)
}

/**
 * Build the draggable control-point figures for an overlay. Returns [] when
 * the overlay should show no anchors (not selected, not hovered-unlocked).
 * For a LOCKED selected overlay call {@link createSelectionOutlineFigures}.
 */
export function createAnchorFigures (params: AnchorFiguresParams): OverlayFigure[] {
  const {
    coordinates,
    isSelected = false,
    isHovered = false,
    lock = false,
    isDrawing = false,
    isTouch = false,
    midPoint = false,
    shape = 'square',
    cursors,
    moveDirections,
    styles,
    keyPrefix = ANCHOR_KEY_PREFIX,
    pointIndexes
  } = params

  if (!anchorVisible(isSelected, isHovered, lock)) {
    return []
  }
  if (lock) {
    return createSelectionOutlineFigures({ coordinates, styles })
  }

  const half = isTouch ? ANCHOR_HALF_TOUCH : ANCHOR_HALF_MOUSE
  const borderColor = styles?.borderColor ?? '#1592E6'
  const backColor = styles?.backColor ?? '#ffffff'
  const borderSize = styles?.borderSize ?? 1.5

  // Filter out-of-range indexes up front — a template passing bad
  // pointIndexes must not crash on a destructured undefined coordinate.
  const indexes = (pointIndexes ?? coordinates.map((_, i) => i)).filter(i => i >= 0 && i < coordinates.length)
  const figures: OverlayFigure[] = []
  const lastIndex = coordinates.length - 1

  for (const index of indexes) {
    // Suppress the in-progress point's anchor while the overlay is drawn.
    if (isDrawing && index === lastIndex) {
      continue
    }
    const { x, y } = coordinates[index]
    const cx = Math.round(x) - 0.5
    const cy = Math.round(y) - 0.5
    const figure: OverlayFigure = {
      key: `${keyPrefix}${index}`,
      type: shape === 'square' ? 'rect' : 'circle',
      attrs: shape === 'square'
        ? { x: cx - half, y: cy - half, width: half * 2, height: half * 2 }
        : { x: cx, y: cy, r: half },
      styles: {
        style: 'stroke_fill',
        color: backColor,
        borderColor,
        borderSize
      },
      pointIndex: index,
      cursor: cursors?.[index] ?? 'pointer',
      moveDirection: moveDirections?.[index] ?? 'both'
    }
    figures.push(figure)
  }

  if (midPoint && coordinates.length === 2 && !isDrawing) {
    const [a, b] = coordinates
    const mx = Math.round((a.x + b.x) / 2) - 0.5
    const my = Math.round((a.y + b.y) / 2) - 0.5
    figures.push({
      key: `${keyPrefix}mid`,
      type: 'circle',
      // Full anchor-sized hit area — a 0.7× visual radius was a ~8px grab
      // target (circle hit-tests use the exact radius, no tolerance).
      attrs: { x: mx, y: my, r: half },
      styles: {
        style: 'stroke_fill',
        color: backColor,
        borderColor,
        borderSize
      },
      cursor: 'move'
    })
  }

  return figures
}

/**
 * Locked-selection outline: non-interactive corner markers so a locked
 * drawing still reads as "selected but frozen" — TradingView renders a
 * SelectionRenderer instead of LineAnchorRenderer for locked sources.
 */
export function createSelectionOutlineFigures (params: {
  coordinates: Coordinate[]
  isTouch?: boolean
  /** Suppress the in-progress tail marker while drawing. */
  isDrawing?: boolean
  styles?: AnchorFigureStyle
  keyPrefix?: string
}): OverlayFigure[] {
  const {
    coordinates,
    isTouch = false,
    isDrawing = false,
    styles,
    keyPrefix = ANCHOR_KEY_PREFIX
  } = params
  const half = isTouch ? ANCHOR_HALF_TOUCH * 0.7 : ANCHOR_HALF_MOUSE * 0.7
  const borderColor = styles?.lockedBorderColor ?? '#787B86'
  // While drawing, the last coordinate is the cursor-follow point — marking
  // it would draw a selection box under the user's cursor.
  const lastIndex = isDrawing ? coordinates.length - 1 : coordinates.length
  return coordinates.slice(0, lastIndex).map(({ x, y }, index) => ({
    key: `${keyPrefix}sel_${index}`,
    type: 'rect',
    attrs: {
      x: Math.round(x) - 0.5 - half,
      y: Math.round(y) - 0.5 - half,
      width: half * 2,
      height: half * 2
    },
    styles: {
      style: 'stroke',
      color: styles?.backColor ?? '#ffffff',
      borderColor,
      borderSize: 1
    },
    // Selection markers are display-only — never interactive.
    ignoreEvent: true
  }))
}

/**
 * 8-way resize cursor for a handle of a segment: buckets the segment angle
 * into 22.5° steps and maps it to a CSS directional cursor — the TradingView
 * `anchorResizeCursorType` behavior.
 */
export function computeResizeCursor (from: Coordinate, to: Coordinate): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  // Canvas y-axis points down, so +45° is down-right → the handle drags a
  // NW-SE axis. +π/−π collapse to the horizontal bucket.
  const bucket = ((Math.round(angle / (Math.PI / 4)) % 4) + 4) % 4
  switch (bucket) {
    case 0: return 'ew-resize'
    case 1: return 'nwse-resize'
    case 2: return 'ns-resize'
    default: return 'nesw-resize'
  }
}
