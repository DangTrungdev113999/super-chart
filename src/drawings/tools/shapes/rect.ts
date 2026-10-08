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

import { isNumber, isString, isValid } from '../../../common/utils/typeChecks'
import { createSelectionOutlineFigures } from '../../interaction/anchors'
import { isSnap45Active } from '../../interaction/snap45'

import {
  applySquareSnap,
  coordinateToPoint,
  pointToCoordinate,
  rememberShapeChart,
  shapeChartOf,
  shapeFillColor,
  shapeFillEnabled,
  shapeHandleFigure,
  shapeLabelSpecOf,
  shapeStrokeOf,
  shapeTextFigure,
  shapeTextPlaceholderFigure,
  squareCoordinate
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'rect' — TradingView Rectangle. Two diagonal-corner anchors with the
 * kernel rect feature set: fill + border, extend-left/right, middle line,
 * in-box text (+ "+ Add text" placeholder). Improvements over the kernel
 * original: `createAnchorFigures`-consistent square handles with 8-way
 * resize cursors, edge handles axis-constrained by `moveDirection`
 * (kernel-side instead of manual field restore), and Shift-square during
 * both drawing and corner-resize.
 */

const MID_DASH: Record<'solid' | 'dashed' | 'dotted', number[]> = {
  solid: [],
  dashed: [8, 4],
  dotted: [2, 2]
}

/** Diagonally-opposite corner of each corner handle (used for Shift-square). */
const OPPOSITE_CORNER: Record<string, { x: 'right' | 'left', y: 'bottom' | 'top' }> = {
  rect_tl: { x: 'right', y: 'bottom' },
  rect_tr: { x: 'left', y: 'bottom' },
  rect_br: { x: 'left', y: 'top' },
  rect_bl: { x: 'right', y: 'top' }
}

const rect: OverlayTemplate<ShapeExtendData> = {
  name: 'rect',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, bounding, overlay, isSelected, isHovered, isTouch }) => {
    rememberShapeChart(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const [c0, c1] = coordinates

    let left = Math.min(c0.x, c1.x)
    let right = Math.max(c0.x, c1.x)
    const top = Math.min(c0.y, c1.y)
    const bottom = Math.max(c0.y, c1.y)
    if (ext.extendLeft === true) {
      left = 0
    }
    if (ext.extendRight === true) {
      right = bounding.width
    }
    const width = right - left
    const height = bottom - top

    const stroke = shapeStrokeOf(overlay, chart, ext, 'rect')
    const fillOn = shapeFillEnabled(ext)
    const fillColor = shapeFillColor(overlay, ext, stroke.color, 'rect')
    const box = { left, top, right, bottom }

    const figures: OverlayFigure[] = [{
      key: 'rect_body',
      type: 'rect',
      attrs: { x: left, y: top, width, height },
      styles: {
        style: fillOn ? 'stroke_fill' : 'stroke',
        color: fillOn ? fillColor : 'transparent',
        borderColor: stroke.color,
        borderSize: stroke.size,
        borderStyle: stroke.style,
        borderDashedValue: stroke.dashedValue
      }
    }]

    // Middle line (kernel rect parity).
    if (ext.showMiddleLine === true) {
      const midY = top + height * 0.5
      const mlStyle = ext.middleLineStyle ?? 'dashed'
      figures.push({
        key: 'rect_midline',
        type: 'line',
        attrs: { coordinates: [{ x: left, y: midY }, { x: right, y: midY }] },
        styles: {
          style: mlStyle === 'solid' ? 'solid' : 'dashed',
          color: ext.middleLineColor ?? stroke.color,
          size: ext.middleLineWidth ?? 1,
          dashedValue: MID_DASH[mlStyle]
        },
        ignoreEvent: true
      })
    }

    // In-box text, or the "+ Add text" hint while interactive (kernel parity).
    const spec = shapeLabelSpecOf(ext)
    if (spec !== null) {
      figures.push(shapeTextFigure('rect_text', spec, box, stroke.color))
    } else if (
      ext.isEditing !== true &&
      (!isString(ext.text) || ext.text === '') &&
      ((isSelected ?? false) || (isHovered ?? false))
    ) {
      figures.push(shapeTextPlaceholderFigure('rect_text_placeholder', box, stroke.color))
    }

    // ─── Control handles ───
    // Locked → non-interactive selection outline at the 4 corners.
    if (overlay.lock) {
      if (isSelected === true) {
        figures.push(...createSelectionOutlineFigures({
          coordinates: [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom }
          ],
          isTouch
        }))
      }
    } else if (((isSelected ?? false) || (isHovered ?? false)) && !overlay.isDrawing()) {
      const midX = (left + right) / 2
      const midY = (top + bottom) / 2
      // Ownership-aware slot mapping (kernel rect hardcoded tl/bl→0,
      // tr/br→1 which misroutes when the shape was drawn from the
      // bottom-right): each handle writes the slot that OWNS its axis —
      // x into the left/right owner, y into the top/bottom owner. Corners
      // write their x-owner and re-route y to the y-owner in perform.
      const leftOwner = c0.x <= c1.x ? 0 : 1
      const rightOwner = 1 - leftOwner
      const topOwner = c0.y <= c1.y ? 0 : 1
      const bottomOwner = 1 - topOwner
      figures.push(shapeHandleFigure('rect_tl', { x: left, y: top }, { pointIndex: leftOwner, cursor: 'nwse-resize', isTouch }))
      figures.push(shapeHandleFigure('rect_tr', { x: right, y: top }, { pointIndex: rightOwner, cursor: 'nesw-resize', isTouch }))
      figures.push(shapeHandleFigure('rect_br', { x: right, y: bottom }, { pointIndex: rightOwner, cursor: 'nwse-resize', isTouch }))
      figures.push(shapeHandleFigure('rect_bl', { x: left, y: bottom }, { pointIndex: leftOwner, cursor: 'nesw-resize', isTouch }))
      // Edge mids: axis-constrained by moveDirection — 'vert' keeps the
      // dragged point's time/index, 'horz' keeps its value.
      figures.push(shapeHandleFigure('rect_mt', { x: midX, y: top }, { pointIndex: topOwner, moveDirection: 'vert', cursor: 'ns-resize', isTouch }))
      figures.push(shapeHandleFigure('rect_mr', { x: right, y: midY }, { pointIndex: rightOwner, moveDirection: 'horz', cursor: 'ew-resize', isTouch }))
      figures.push(shapeHandleFigure('rect_mb', { x: midX, y: bottom }, { pointIndex: bottomOwner, moveDirection: 'vert', cursor: 'ns-resize', isTouch }))
      figures.push(shapeHandleFigure('rect_ml', { x: left, y: midY }, { pointIndex: leftOwner, moveDirection: 'horz', cursor: 'ew-resize', isTouch }))
    }

    return figures
  },

  performEventPressedMove: function (this: Overlay<ShapeExtendData>, params) {
    const key = params.figureKey
    if (
      (key !== 'rect_tl' && key !== 'rect_tr' && key !== 'rect_br' && key !== 'rect_bl') ||
      params.prevPoints.length < 2
    ) {
      // Edge handles need no perform — moveDirection froze the fixed axis
      // before this hook ran.
      return
    }
    const points = params.points
    const prev = params.prevPoints
    const mpi = params.performPointIndex
    const moved = points[mpi]
    if (!isValid(moved)) {
      return
    }
    let ts = moved.timestamp
    let di = moved.dataIndex
    let val = moved.value

    // Axis ownership from the gesture-start geometry — the same mapping
    // the emitted handles used (the kernel wrote the raw cursor into the
    // x-owner slot; the y-owner may be the sibling).
    const chart = shapeChartOf(this)
    const px0 = chart === undefined ? null : pointToCoordinate(chart, this.paneId, isValid(prev[0]) ? prev[0] : {})
    const px1 = chart === undefined ? null : pointToCoordinate(chart, this.paneId, isValid(prev[1]) ? prev[1] : {})

    // Shift during a corner drag → square, measured from the
    // diagonally-opposite corner at gesture start (pixel space).
    const event = params.event
    if (
      event !== undefined && px0 !== null && px1 !== null && chart !== undefined &&
      isSnap45Active(chart, event) && isNumber(event.x) && isNumber(event.y)
    ) {
      const left = Math.min(px0.x, px1.x)
      const right = Math.max(px0.x, px1.x)
      const top = Math.min(px0.y, px1.y)
      const bottom = Math.max(px0.y, px1.y)
      const cornerSpec = OPPOSITE_CORNER[key] ?? { x: 'right' as const, y: 'top' as const }
      const opposite: Coordinate = {
        x: cornerSpec.x === 'right' ? right : left,
        y: cornerSpec.y === 'bottom' ? bottom : top
      }
      const point = coordinateToPoint(
        chart,
        this.paneId,
        squareCoordinate({ x: event.x, y: event.y }, opposite)
      )
      if (point !== null) {
        ts = point.timestamp
        di = point.dataIndex
        val = point.value
      }
    }

    moved.timestamp = ts
    moved.dataIndex = di
    if (px0 === null || px1 === null) {
      // Ownership unknowable (axis conversion failed) — keep the kernel's
      // raw write rather than risk corrupting both slots.
      moved.value = val
      return
    }
    const topOwner = px0.y <= px1.y ? 0 : 1
    const bottomOwner = 1 - topOwner
    const yOwner = (key === 'rect_tl' || key === 'rect_tr') ? topOwner : bottomOwner
    if (mpi === yOwner) {
      // Same slot owns both axes — keep the full cursor position.
      moved.value = val
    } else {
      // Split corner: restore the x-owner's own y, route the cursor's
      // value onto the slot that owns this edge's y.
      const ownPrev = isValid(prev[mpi]) ? prev[mpi] : {}
      moved.value = ownPrev.value
      const yPoint = points[yOwner]
      if (isValid(yPoint)) {
        yPoint.value = val
      }
    }
  },

  performEventMoveForDrawing: function (this: Overlay<ShapeExtendData>, params) {
    // Shift while placing the second corner → square box.
    if (params.performPointIndex === 1) {
      applySquareSnap(this, params, 0)
    }
  }
}

export default rect
