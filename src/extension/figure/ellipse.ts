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
import type { PolygonStyle } from '../../common/Styles'
import { isString } from '../../common/utils/typeChecks'
import { isTransparent } from '../../common/utils/color'

import type { FigureTemplate } from '../../component/Figure'

export function checkCoordinateOnEllipse (coordinate: Coordinate, attrs: EllipseAttrs | EllipseAttrs[]): boolean {
  let ellipses: EllipseAttrs[] = []
  ellipses = ellipses.concat(attrs)

  for (const ellipse of ellipses) {
    const { x, y, rx, ry } = ellipse
    if (rx <= 0 || ry <= 0) {
      continue
    }
    const nx = (coordinate.x - x) / rx
    const ny = (coordinate.y - y) / ry
    if (nx * nx + ny * ny <= 1) {
      return true
    }
  }
  return false
}

export function drawEllipse (ctx: CanvasRenderingContext2D, attrs: EllipseAttrs | EllipseAttrs[], styles: Partial<PolygonStyle>): void {
  let ellipses: EllipseAttrs[] = []
  ellipses = ellipses.concat(attrs)

  const {
    style = 'fill',
    color = 'currentColor',
    borderSize = 1,
    borderColor = 'currentColor',
    borderStyle = 'solid',
    borderDashedValue = [2, 2]
  } = styles

  const solid = (style === 'fill' || styles.style === 'stroke_fill') && (!isString(color) || !isTransparent(color))
  if (solid) {
    ctx.fillStyle = color
    ellipses.forEach(({ x, y, rx, ry }) => {
      if (rx > 0 && ry > 0) {
        ctx.beginPath()
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
        ctx.closePath()
        ctx.fill()
      }
    })
  }
  if ((style === 'stroke' || styles.style === 'stroke_fill') && borderSize > 0 && !isTransparent(borderColor)) {
    ctx.strokeStyle = borderColor
    ctx.lineWidth = borderSize
    if (borderStyle === 'dashed' || borderStyle === 'dotted') {
      ctx.setLineDash(borderDashedValue)
    } else {
      ctx.setLineDash([])
    }
    ellipses.forEach(({ x, y, rx, ry }) => {
      if (rx > 0 && ry > 0 && (!solid || Math.min(rx, ry) > borderSize)) {
        ctx.beginPath()
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
        ctx.closePath()
        ctx.stroke()
      }
    })
  }
}

export interface EllipseAttrs {
  x: number
  y: number
  rx: number
  ry: number
}

const ellipse: FigureTemplate<EllipseAttrs | EllipseAttrs[], Partial<PolygonStyle>> = {
  name: 'ellipse',
  checkEventOn: checkCoordinateOnEllipse,
  draw: (ctx: CanvasRenderingContext2D, attrs: EllipseAttrs | EllipseAttrs[], styles: Partial<PolygonStyle>) => {
    drawEllipse(ctx, attrs, styles)
  }
}

export default ellipse
