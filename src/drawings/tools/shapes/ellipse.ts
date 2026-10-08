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

import type { Overlay, OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isString, isValid } from '../../../common/utils/typeChecks'
import { createSelectionOutlineFigures } from '../../interaction/anchors'
import { sampleEllipsePolygon } from '../../../extension/overlay/ellipse/math'
import {
  alphaColor,
  buildXAxisPill,
  buildYAxisPill,
  formatDate,
  pricePrecisionOf
} from '../lines/lineCommon'

import {
  applySquareSnap,
  hiddenAtPeriod,
  rememberShapeChart,
  shapeFillColor,
  shapeFillEnabled,
  shapeHandleFigure,
  shapeLabelSpecOf,
  shapeStrokeOf,
  shapeTextFigure,
  shapeTextPlaceholderFigure
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'ellipse' — TradingView Ellipse. Two diagonal-corner anchors define the
 * axis-aligned bounding box; the ellipse is inscribed (64-sample polygon,
 * point-in-polygon body hit-test). Kernel feature set preserved: fill +
 * border, inscribed text (+ placeholder), per-period visibility gate,
 * selection-driven axis strips with pills. Improvements over the kernel
 * original: `moveDirection`-constrained cardinal handles (no manual
 * axis-restore perform), Shift → square (circle) while drawing, and the
 * anchor factory's locked-outline behavior.
 */

// Pills + strips always use TV blue, regardless of shape color.
const AXIS_PILL_COLOR = '#2962FF'

const ellipse: OverlayTemplate<ShapeExtendData> = {
  name: 'ellipse',
  totalStep: 3,
  cullable: false,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: ({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    rememberShapeChart(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}

    // Per-period visibility gate (kernel parity — fails open).
    if (hiddenAtPeriod(ext, chart.getPeriod())) {
      return []
    }

    const [c0, c1] = coordinates
    const left = Math.min(c0.x, c1.x)
    const right = Math.max(c0.x, c1.x)
    const top = Math.min(c0.y, c1.y)
    const bottom = Math.max(c0.y, c1.y)
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2
    const a = (right - left) / 2
    const b = (bottom - top) / 2

    const stroke = shapeStrokeOf(overlay, chart, ext, 'circle')
    const fillOn = shapeFillEnabled(ext)
    const fillColor = shapeFillColor(overlay, ext, stroke.color, 'circle')

    const figures: OverlayFigure[] = [{
      key: 'ellipse_body',
      type: 'polygon',
      attrs: { coordinates: sampleEllipsePolygon(cx, cy, a, b, 64) },
      styles: {
        style: 'stroke_fill',
        color: fillOn ? fillColor : 'transparent',
        borderColor: stroke.color,
        borderSize: stroke.size,
        borderStyle: stroke.style,
        borderDashedValue: stroke.dashedValue
      }
    }]

    // Inscribed-rect text clip (half-axes a/√2, b/√2) — kernel parity.
    const spec = shapeLabelSpecOf(ext)
    const inscribedBox = {
      left: cx - a / Math.SQRT2,
      top: cy - b / Math.SQRT2,
      right: cx + a / Math.SQRT2,
      bottom: cy + b / Math.SQRT2
    }
    if (spec !== null) {
      figures.push(shapeTextFigure('ellipse_text', spec, inscribedBox, stroke.color))
    } else if (
      ext.isEditing !== true &&
      (!isString(ext.text) || ext.text === '') &&
      ((isSelected ?? false) || (isHovered ?? false)) &&
      // Kernel gate: the placeholder appears only when the text tab is on.
      ext.textEnabled === true
    ) {
      figures.push(shapeTextPlaceholderFigure('ellipse_text_ph', inscribedBox, stroke.color))
    }

    // ─── Cardinal handles (selected/hovered; locked → outline) ───
    if (overlay.lock) {
      if (isSelected === true) {
        figures.push(...createSelectionOutlineFigures({
          coordinates: [
            { x: cx, y: top },
            { x: right, y: cy },
            { x: cx, y: bottom },
            { x: left, y: cy }
          ],
          isTouch
        }))
      }
    } else if (((isSelected ?? false) || (isHovered ?? false)) && !overlay.isDrawing()) {
      // Ownership-aware slots (kernel ellipse hardcoded t/l→0, b/r→1 which
      // misroutes when drawn from the bottom-right): each handle writes
      // the slot owning its edge; moveDirection freezes the other axis.
      const leftOwner = c0.x <= c1.x ? 0 : 1
      const rightOwner = 1 - leftOwner
      const topOwner = c0.y <= c1.y ? 0 : 1
      const bottomOwner = 1 - topOwner
      figures.push(shapeHandleFigure('ellipse_t', { x: cx, y: top }, { pointIndex: topOwner, moveDirection: 'vert', cursor: 'ns-resize', isTouch }))
      figures.push(shapeHandleFigure('ellipse_b', { x: cx, y: bottom }, { pointIndex: bottomOwner, moveDirection: 'vert', cursor: 'ns-resize', isTouch }))
      figures.push(shapeHandleFigure('ellipse_l', { x: left, y: cy }, { pointIndex: leftOwner, moveDirection: 'horz', cursor: 'ew-resize', isTouch }))
      figures.push(shapeHandleFigure('ellipse_r', { x: right, y: cy }, { pointIndex: rightOwner, moveDirection: 'horz', cursor: 'ew-resize', isTouch }))
    }

    return figures
  },

  performEventMoveForDrawing: function (this: Overlay<ShapeExtendData>, params) {
    // Shift while placing the second corner → square bbox (a circle).
    if (params.performPointIndex === 1) {
      applySquareSnap(this, params, 0)
    }
  },

  // ─── X axis: bbox strip + edge pills while selected/hovered ───
  createXAxisFigures: ({ chart, overlay, coordinates, bounding, isSelected, isHovered }) => {
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    if (hiddenAtPeriod(ext, chart.getPeriod())) {
      return []
    }
    if (isSelected !== true && isHovered !== true) {
      return []
    }
    const [c0, c1] = coordinates
    const leftX = Math.min(c0.x, c1.x)
    const rightX = Math.max(c0.x, c1.x)
    const stripWidth = rightX - leftX

    const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const p1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
    const earlierTs = Math.min(p0.timestamp ?? 0, p1.timestamp ?? 0)
    const laterTs = Math.max(p0.timestamp ?? 0, p1.timestamp ?? 0)

    const figs: OverlayFigure[] = []
    if (stripWidth > 0) {
      figs.push({
        key: 'ellipse_xstrip',
        type: 'rect',
        attrs: { x: leftX, y: 0, width: stripWidth, height: bounding.height },
        styles: { style: 'fill', color: alphaColor(AXIS_PILL_COLOR, 0.2) },
        ignoreEvent: true
      })
    }
    const dLeft = formatDate(earlierTs)
    const dRight = formatDate(laterTs)
    if (dLeft !== '') {
      figs.push(buildXAxisPill(leftX, dLeft, AXIS_PILL_COLOR, 'ellipse_x0'))
    }
    if (dRight !== '' && rightX !== leftX) {
      figs.push(buildXAxisPill(rightX, dRight, AXIS_PILL_COLOR, 'ellipse_x1'))
    }
    return figs
  },

  // ─── Y axis: bbox strip + edge pills while selected/hovered ───
  createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis, isSelected, isHovered }) => {
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    if (hiddenAtPeriod(ext, chart.getPeriod())) {
      return []
    }
    if (isSelected !== true && isHovered !== true) {
      return []
    }
    const precision = pricePrecisionOf(chart, overlay, yAxis, ext.pricePrecision)

    const [c0, c1] = coordinates
    const topY = Math.min(c0.y, c1.y)
    const bottomY = Math.max(c0.y, c1.y)
    const stripHeight = bottomY - topY

    const p0 = isValid(overlay.points[0]) ? overlay.points[0] : {}
    const p1 = isValid(overlay.points[1]) ? overlay.points[1] : {}
    const topVal = Math.max(p0.value ?? 0, p1.value ?? 0)
    const bottomVal = Math.min(p0.value ?? 0, p1.value ?? 0)

    const figs: OverlayFigure[] = []
    if (stripHeight > 0) {
      figs.push({
        key: 'ellipse_ystrip',
        type: 'rect',
        attrs: { x: 0, y: topY, width: bounding.width, height: stripHeight },
        styles: { style: 'fill', color: alphaColor(AXIS_PILL_COLOR, 0.2) },
        ignoreEvent: true
      })
    }
    const pillTop = buildYAxisPill(topY, topVal, AXIS_PILL_COLOR, precision, bounding, yAxis ?? undefined, 'ellipse_y0')
    if (pillTop != null) {
      figs.push(pillTop)
    }
    if (bottomY !== topY) {
      const pillBot = buildYAxisPill(bottomY, bottomVal, AXIS_PILL_COLOR, precision, bounding, yAxis ?? undefined, 'ellipse_y1')
      if (pillBot != null) {
        figs.push(pillBot)
      }
    }
    return figs
  }
}

export default ellipse
