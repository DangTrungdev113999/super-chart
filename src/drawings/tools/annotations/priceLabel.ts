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
import type { Chart } from '../../../Chart'
import { isString } from '../../../common/utils/typeChecks'
import { formatPrecision } from '../../../common/utils/format'
import { SymbolDefaultPrecisionConstants } from '../../../common/SymbolInfo'
import { PaneIdConstants } from '../../../pane/types'

import { createAnchorFigures } from '../../interaction/anchors'
import type { RichTextAttrs } from '../../figures/richText'
import { getRichTextLayout } from '../../figures/richText'
import type { TextBoxData } from '../../text/textBox'

import {
  baseTextBoxData,
  commitText,
  liveTextOf,
  openAnnotationEditor,
  pointToCoordinate,
  resolvedHorzTextAlign,
  resolvedTextStyles,
  richTextFigureStyle,
  textEditorHooks,
  type AnnotationTextStyle
} from './common'

/**
 * 'priceLabel' — an axis-style price tag pinned at the anchor's value: a
 * small left-pointing tip touches the point, the pill body sits to its
 * right showing the point's formatted price (extendData.text overrides).
 * The anchor drags VERTICALLY only — the tag always tracks a price level.
 * Editor opens on placement + double-click.
 */

export interface PriceLabelExtendData {
  /** Custom label text — overrides the auto price when set. */
  text?: string
}

export interface PriceLabelStyle extends AnnotationTextStyle {
  /** Tip width px — the arrow touching the anchor (default 6). */
  tipWidth?: number
}

const STYLE_KEY = 'priceLabel'
const DEFAULT_TIP_WIDTH = 6

function getLabelStyles (overlay: Overlay<PriceLabelExtendData>): PriceLabelStyle {
  return resolvedTextStyles(overlay, STYLE_KEY) as PriceLabelStyle
}

function getPrecision (chart: Chart, overlay: Overlay<PriceLabelExtendData>, isCandle: boolean): number {
  if (isCandle) {
    return chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
  }
  let precision = 0
  const indicators = chart.getIndicators({ paneId: overlay.paneId })
  indicators.forEach(indicator => {
    precision = Math.max(precision, indicator.precision)
  })
  return precision
}

function getLabelText (
  chart: Chart,
  overlay: Overlay<PriceLabelExtendData>,
  isCandle: boolean
): string {
  const live = liveTextOf(overlay)
  if (live !== undefined) {
    return live
  }
  const extendData = overlay.extendData as PriceLabelExtendData | string | undefined
  if (isString(extendData)) {
    return extendData
  }
  if (extendData?.text !== undefined && extendData.text !== '') {
    return extendData.text
  }
  const value = overlay.points[0]?.value ?? 0
  return formatPrecision(value, getPrecision(chart, overlay, isCandle))
}

function getBoxData (
  chart: Chart,
  overlay: Overlay<PriceLabelExtendData>,
  isCandle: boolean
): TextBoxData {
  const styles = getLabelStyles(overlay)
  return {
    ...baseTextBoxData(getLabelText(chart, overlay, isCandle), styles),
    bold: styles.bold ?? true,
    horzAlign: 'left',
    vertAlign: 'middle',
    horzTextAlign: resolvedHorzTextAlign(overlay, 'center')
  }
}

function openEditor (chart: Chart, overlay: Overlay<PriceLabelExtendData>): void {
  const styles = getLabelStyles(overlay)
  const tipWidth = styles.tipWidth ?? DEFAULT_TIP_WIDTH
  openAnnotationEditor({
    chart,
    overlay,
    // Editor re-derives the label on each keystroke — once the user commits
    // a custom text it replaces the price display; empty removes the tool.
    data: () => getBoxData(chart, overlay, overlay.paneId === PaneIdConstants.CANDLE),
    anchor: () => {
      const coordinate = pointToCoordinate(chart, overlay.paneId, overlay.points[0] ?? {})
      return { x: coordinate.x + tipWidth, y: coordinate.y }
    },
    forbidLineBreaks: true,
    onCommit: (value) => {
      commitText(chart, overlay, value)
    }
  })
}

const priceLabel: OverlayTemplate<PriceLabelExtendData> = {
  name: 'priceLabel',
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    priceLabel: {
      color: '#FFFFFF',
      backgroundColor: '#2962FF',
      borderColor: '#2962FF',
      borderWidth: 1,
      backgroundRoundRect: 3,
      fontSize: 12,
      bold: true,
      boxPaddingHorz: 8,
      boxPaddingVert: 4
    }
  },
  createPointFigures: ({ chart, overlay, coordinates, yAxis, isSelected, isHovered, isTouch }) => {
    if (coordinates.length === 0) {
      return []
    }
    const point = coordinates[0]
    const styles = getLabelStyles(overlay)
    const isCandle = yAxis?.isInCandle() ?? true
    const data = getBoxData(chart, overlay, isCandle)
    const tipWidth = styles.tipWidth ?? DEFAULT_TIP_WIDTH
    const attrs: RichTextAttrs = { x: point.x + tipWidth, y: point.y, ...data }
    const layout = getRichTextLayout(attrs)
    const figures: OverlayFigure[] = [
      // Left-pointing tip touching the anchor — the axis-tag wedge.
      {
        key: 'tip',
        type: 'polygon',
        attrs: {
          coordinates: [
            { x: point.x, y: point.y },
            { x: point.x + tipWidth, y: point.y - layout.boxHeight / 2 },
            { x: point.x + tipWidth, y: point.y + layout.boxHeight / 2 }
          ]
        },
        styles: { style: 'fill', color: styles.backgroundColor },
        ignoreEvent: true
      },
      {
        key: 'labelPill',
        type: 'richText',
        attrs,
        styles: richTextFigureStyle(styles),
        bounds: {
          x: point.x,
          y: point.y - layout.boxHeight / 2,
          width: layout.boxWidth + tipWidth,
          height: layout.boxHeight
        }
      }
    ]
    figures.push(...createAnchorFigures({
      coordinates,
      isSelected,
      isHovered,
      isTouch,
      isDrawing: overlay.isDrawing(),
      lock: overlay.lock,
      moveDirections: ['vert'],
      keyPrefix: 'anchor_'
    }))
    return figures
  },
  ...textEditorHooks(openEditor)
}

export default priceLabel
