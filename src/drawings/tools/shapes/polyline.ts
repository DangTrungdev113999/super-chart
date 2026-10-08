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

import type { OverlayFigure, OverlayTemplate } from '../../../component/Overlay'

import { isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'
import { withPerfPipeline } from '../../interaction/perf'

import {
  markDrawArmed,
  rememberShapeChart,
  settleRestoredUnlimited,
  shapeFillColor,
  shapeFillEnabled,
  shapeStrokeOf
} from './shapeCommon'
import type { ShapeExtendData } from './shapeCommon'

/**
 * 'polyline' — TradingView Polyline: an unlimited-point CLOSED polygon
 * (click to append, double-click to finish — the kernel's dblclick path
 * force-completes). Fill + border resolve through the shared channels;
 * while only one edge exists a plain line previews it.
 *
 * The kernel's minimum for unlimited tools is 2 points; a closed polygon
 * needs 3 — onDrawEnd removes degenerate 2-point finishes (the consumer
 * reference enforced the same bound via its completion event).
 * {@link settleRestoredUnlimited} rescues restored overlays out of the
 * drawing-progress slot; the reference's separate `polylineCompleted`
 * template is unnecessary here.
 */

const polyline: OverlayTemplate<ShapeExtendData> = {
  name: 'polyline',
  totalStep: Number.MAX_SAFE_INTEGER,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,

  createPointFigures: withPerfPipeline(({ chart, coordinates, overlay, isSelected, isHovered, isTouch }) => {
    rememberShapeChart(overlay, chart)
    settleRestoredUnlimited(overlay, chart)
    if (coordinates.length < 2) {
      return []
    }
    const ext: ShapeExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
    const stroke = shapeStrokeOf(overlay, chart, ext, 'polygon')

    const figures: OverlayFigure[] = []
    if (coordinates.length >= 3) {
      figures.push({
        key: 'pl_body',
        type: 'polygon',
        attrs: { coordinates },
        styles: {
          style: 'stroke_fill',
          color: shapeFillEnabled(ext)
            ? shapeFillColor(overlay, ext, stroke.color, 'polygon')
            : 'transparent',
          borderColor: stroke.color,
          borderSize: stroke.size,
          borderStyle: stroke.style,
          borderDashedValue: stroke.dashedValue
        }
      })
    } else {
      // Single-edge preview while the polygon has fewer than 3 points.
      figures.push({
        key: 'pl_edge',
        type: 'line',
        attrs: { coordinates },
        styles: {
          style: stroke.style,
          color: stroke.color,
          size: stroke.size,
          dashedValue: stroke.dashedValue
        }
      })
    }

    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      isTouch
    }))

    return figures
  }),

  onDrawStart: ({ overlay }) => {
    markDrawArmed(overlay)
  },

  onDrawEnd: ({ chart, overlay }) => {
    // Kernel minimum for unlimited tools is 2 points; a closed polygon
    // needs 3 — drop degenerate finishes rather than commit a flat shape.
    if (overlay.points.length < 3) {
      chart.removeOverlay({ id: overlay.id })
    }
  }
}

export default polyline
