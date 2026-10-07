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

import type Bounding from '../common/Bounding'
import type Crosshair from '../common/Crosshair'
import type { CrosshairStyle, CrosshairDirectionStyle, StateTextStyle } from '../common/Styles'
import { isString, isNumber } from '../common/utils/typeChecks'
import { createFont } from '../common/utils/canvas'
import { createDom } from '../common/utils/dom'
import { SymbolDefaultPrecisionConstants } from '../common/SymbolInfo'

import type { Axis } from '../component/Axis'
import type YAxis from '../component/YAxis'

import type { TextAttrs } from '../extension/figure/text'

import type ChartStore from '../Store'

import View from './View'

export default class CrosshairHorizontalLabelView<C extends Axis = YAxis> extends View<C> {
  // HTML overlay elements for Y-axis labels (avoids canvas clipping)
  private _htmlLabelEl: HTMLElement | null = null
  private _htmlInnerEl: HTMLElement | null = null
  private _htmlPriceSpan: HTMLElement | null = null
  private _htmlPercentSpan: HTMLElement | null = null

  private _getOrCreateHtmlLabel (): { container: HTMLElement, inner: HTMLElement, price: HTMLElement, percent: HTMLElement } {
    if (this._htmlLabelEl === null) {
      const paneContainer = this.getWidget().getPane().getContainer()

      this._htmlLabelEl = createDom('div', {
        position: 'absolute',
        right: '5px',
        pointerEvents: 'none',
        zIndex: '3',
        display: 'none',
        whiteSpace: 'nowrap'
      })

      this._htmlInnerEl = createDom('div', {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end'
      })

      this._htmlPriceSpan = createDom('span', {})
      this._htmlPercentSpan = createDom('span', { display: 'none' })

      this._htmlInnerEl.appendChild(this._htmlPriceSpan)
      this._htmlInnerEl.appendChild(this._htmlPercentSpan)
      this._htmlLabelEl.appendChild(this._htmlInnerEl)
      paneContainer.appendChild(this._htmlLabelEl)
    }
    return {
      container: this._htmlLabelEl,
      inner: this._htmlInnerEl!,
      price: this._htmlPriceSpan!,
      percent: this._htmlPercentSpan!
    }
  }

  private _hideHtmlLabel (): void {
    if (this._htmlLabelEl !== null) {
      this._htmlLabelEl.style.display = 'none'
    }
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chartStore = pane.getChart().getChartStore()
    const crosshair = chartStore.getCrosshair()
    const axis = pane.getAxisComponent()
    const isYAxis = 'isInCandle' in axis

    // Check if crosshair is active in this pane
    if (!isString(crosshair.paneId) || !this.compare(crosshair, pane.getId())) {
      if (isYAxis) { this._hideHtmlLabel() }
      return
    }

    const styles = chartStore.getStyles().crosshair
    if (!styles.show) {
      if (isYAxis) { this._hideHtmlLabel() }
      return
    }

    const directionStyles = this.getDirectionStyles(styles)
    const textStyles = directionStyles.text
    if (!directionStyles.show || !textStyles.show) {
      if (isYAxis) { this._hideHtmlLabel() }
      return
    }

    if (isYAxis) {
      // A synced crosshair can arrive without a y coordinate (the source
      // hovered a pane this chart does not have) — no label then.
      if (!isNumber(crosshair.y)) {
        this._hideHtmlLabel()
        return
      }
      // Y-axis: HTML overlay (avoids canvas clipping on narrow Y-axis)
      this._renderHtmlLabel(crosshair, chartStore, axis as unknown as YAxis, textStyles)
    } else {
      // X-axis: canvas rendering (existing behavior, canvas is wide enough)
      const bounding = widget.getBounding()
      const text = this.getText(crosshair, chartStore, axis)
      ctx.font = createFont(textStyles.size, textStyles.weight, textStyles.family)
      this.createFigure({
        name: 'text',
        attrs: this.getTextAttrs(text, ctx.measureText(text).width, crosshair, bounding, axis, textStyles),
        styles: textStyles
      })?.draw(ctx)
    }
  }

  private _renderHtmlLabel (crosshair: Crosshair, chartStore: ChartStore, yAxis: YAxis, textStyles: StateTextStyle): void {
    const { container, inner, price, percent } = this._getOrCreateHtmlLabel()
    container.style.display = 'block'
    container.style.top = `${crosshair.y!}px`
    container.style.transform = 'translateY(-50%)'

    // Style inner container from crosshair text styles
    const bgColor = typeof textStyles.backgroundColor === 'string' ? textStyles.backgroundColor : 'transparent'
    inner.style.padding = `${textStyles.paddingTop}px ${textStyles.paddingRight}px ${textStyles.paddingBottom}px ${textStyles.paddingLeft}px`
    inner.style.backgroundColor = bgColor
    const br = textStyles.borderRadius
    inner.style.borderRadius = typeof br === 'number' ? `${br}px` : (br).map(v => `${v}px`).join(' ')
    if (textStyles.borderSize > 0) {
      inner.style.border = `${textStyles.borderSize}px solid ${textStyles.borderColor}`
    } else {
      inner.style.border = 'none'
    }

    // Price text
    const text = this.getText(crosshair, chartStore, yAxis as unknown as Axis)
    price.textContent = text
    price.style.color = String(textStyles.color)
    price.style.fontSize = `${textStyles.size}px`
    price.style.fontWeight = String(textStyles.weight)
    price.style.fontFamily = String(textStyles.family)
    price.style.lineHeight = `${textStyles.size + 4}px`

    // Show percent change for candle pane only
    if (yAxis.isInCandle()) {
      const dataList = chartStore.getDataList()
      if (dataList.length > 0) {
        const lastClose = dataList[dataList.length - 1].close
        const crosshairPrice = yAxis.convertFromPixel(crosshair.y!)

        if (lastClose > 0 && Number.isFinite(crosshairPrice)) {
          const pctChange = ((crosshairPrice - lastClose) / lastClose) * 100
          const sign = pctChange >= 0 ? '+' : ''
          percent.textContent = `${sign}${pctChange.toFixed(2)}%`

          const candleStyles = chartStore.getStyles().candle
          percent.style.color = pctChange >= 0
            ? candleStyles.priceMark.last.upColor
            : candleStyles.priceMark.last.downColor
          percent.style.display = 'block'
          percent.style.fontSize = '10px'
          percent.style.fontWeight = '500'
          percent.style.lineHeight = '14px'
        } else {
          percent.style.display = 'none'
        }
      } else {
        percent.style.display = 'none'
      }
    } else {
      percent.style.display = 'none'
    }
  }

  protected compare (crosshair: Crosshair, paneId: string): boolean {
    return crosshair.paneId === paneId
  }

  protected getDirectionStyles (styles: CrosshairStyle): CrosshairDirectionStyle {
    return styles.horizontal
  }

  protected getText (crosshair: Crosshair, chartStore: ChartStore, axis: Axis): string {
    const yAxis = axis as unknown as YAxis
    const value = axis.convertFromPixel(crosshair.y!)
    let precision = 0
    let shouldFormatBigNumber = false
    if (yAxis.isInCandle()) {
      precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE
    } else {
      const indicators = chartStore.getIndicatorsByPaneId(crosshair.paneId!)
      indicators.forEach(indicator => {
        precision = Math.max(indicator.precision, precision)
        shouldFormatBigNumber ||= indicator.shouldFormatBigNumber
      })
    }
    const yAxisRange = yAxis.getRange()
    let text = yAxis.displayValueToText(
      yAxis.realValueToDisplayValue(
        yAxis.valueToRealValue(value, { range: yAxisRange }),
        { range: yAxisRange }
      ),
      precision
    )

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
    if (shouldFormatBigNumber) {
      text = chartStore.getInnerFormatter().formatBigNumber(text)
    }
    return chartStore.getDecimalFold().format(chartStore.getThousandsSeparator().format(text))
  }

  protected getTextAttrs (text: string, _textWidth: number, crosshair: Crosshair, bounding: Bounding, axis: Axis, _styles: StateTextStyle): TextAttrs {
    const yAxis = axis as unknown as YAxis
    let x = 0
    let textAlign: CanvasTextAlign = 'left'
    if (yAxis.isFromZero()) {
      x = 0
      textAlign = 'left'
    } else {
      x = bounding.width
      textAlign = 'right'
    }

    return { x, y: crosshair.y!, text, align: textAlign, baseline: 'middle' }
  }
}
