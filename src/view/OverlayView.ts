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

import type Nullable from '../common/Nullable'
import type Coordinate from '../common/Coordinate'
import type Point from '../common/Point'
import type { EventHandler, EventName, MouseTouchEvent, MouseTouchEventCallback } from '../common/EventHandler'
import { isFunction, isNumber, isValid, clone } from '../common/utils/typeChecks'

import type { Axis } from '../component/Axis'
import type { YAxis } from '../component/YAxis'
import type { OverlayFigure, Overlay } from '../component/Overlay'
import type OverlayImp from '../component/Overlay'
import { checkOverlayFigureEvent, OVERLAY_FIGURE_KEY_PREFIX } from '../component/Overlay'

import type { EventOverlayInfoFigureType } from '../Store'

import { PaneIdConstants } from '../pane/types'

import type DrawWidget from '../widget/DrawWidget'
import type DrawPane from '../pane/DrawPane'

import View from './View'

export default class OverlayView<C extends Axis = YAxis> extends View<C> {
  constructor (widget: DrawWidget<DrawPane<C>>) {
    super(widget)
    this._initEvent()
  }

  private _isLightColor (hex: string): boolean {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex)
    if (match === null) return false
    const r = parseInt(match[1], 16)
    const g = parseInt(match[2], 16)
    const b = parseInt(match[3], 16)
    return (r * 299 + g * 587 + b * 114) / 1000 > 128
  }

  private _initEvent (): void {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const paneId = pane.getId()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    let freehandLastCoord: Coordinate | null = null
    this.registerEvent('mouseMoveEvent', event => {
      const progressOverlayInfo = chartStore.getProgressOverlayInfo()
      if (progressOverlayInfo !== null) {
        const overlay = progressOverlayInfo.overlay
        let progressOverlayPaneId = progressOverlayInfo.paneId
        if (overlay.isStart()) {
          chartStore.updateProgressOverlayInfo(paneId)
          progressOverlayPaneId = paneId
        }
        const index = overlay.points.length - 1
        if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
          overlay.eventMoveForDrawing(this._coordinateToPoint(overlay, event), event)
          overlay.onDrawing?.({ chart, overlay, ...event })
          chartStore.executeAction('onOverlayChange', { type: 'progress', overlay })
        }
        return this._figureMouseMoveEvent(
          overlay,
          'point',
          index,
          { key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`, type: 'circle', attrs: {} }
        )(event)
      }
      chartStore.setHoverOverlayInfo(
        {
          paneId,
          overlay: null,
          figureType: 'none',
          figureIndex: -1,
          figure: null
        },
        (o, f) => this._processOverlayMouseEnterEvent(o, f, event),
        (o, f) => this._processOverlayMouseLeaveEvent(o, f, event)
      )
      widget.setForceCursor(null)
      return false
    }).registerEvent('mouseClickEvent', event => {
      const progressOverlayInfo = chartStore.getProgressOverlayInfo()
      if (progressOverlayInfo !== null) {
        const overlay = progressOverlayInfo.overlay
        let progressOverlayPaneId = progressOverlayInfo.paneId
        if (overlay.isStart()) {
          chartStore.updateProgressOverlayInfo(paneId, true)
          progressOverlayPaneId = paneId
        }
        const index = overlay.points.length - 1
        if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
          overlay.eventMoveForDrawing(this._coordinateToPoint(overlay, event), event)
          overlay.onDrawing?.({ chart, overlay, ...event })
          overlay.nextStep()
          chartStore.executeAction('onOverlayChange', { type: 'progress', overlay })
          if (!overlay.isDrawing()) {
            chartStore.progressOverlayComplete()
            overlay.onDrawEnd?.({ chart, overlay, ...event })
          }
        }
        return this._figureMouseClickEvent(
          overlay,
          'point',
          index,
          {
            key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
            type: 'circle',
            attrs: {}
          }
        )(event)
      }
      chartStore.setClickOverlayInfo(
        {
          paneId,
          overlay: null,
          figureType: 'none',
          figureIndex: -1,
          figure: null
        },
        (o, f) => this._processOverlaySelectedEvent(o, f, event),
        (o, f) => this._processOverlayDeselectedEvent(o, f, event)
      )
      return false
    }).registerEvent('mouseDoubleClickEvent', event => {
      const progressOverlayInfo = chartStore.getProgressOverlayInfo()
      if (progressOverlayInfo !== null) {
        const overlay = progressOverlayInfo.overlay
        const progressOverlayPaneId = progressOverlayInfo.paneId
        if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
          overlay.forceComplete()
          // TradingView semantics: a force-completed drawing that never
          // collected its minimum points is CANCELLED, not committed —
          // otherwise double-click strands a degenerate zombie (a 1-point
          // polyline, a 2-point channel missing its third anchor).
          // Unlimited-step tools declare totalStep: MAX_SAFE_INTEGER and
          // need at least 2 points to render meaningfully.
          const minPoints = overlay.totalStep >= Number.MAX_SAFE_INTEGER
            ? 2
            : Math.max(1, overlay.totalStep - 1)
          if (overlay.points.length < minPoints) {
            chartStore.removeOverlay({ id: overlay.id })
            return true
          }
          if (!overlay.isDrawing()) {
            chartStore.progressOverlayComplete()
            overlay.onDrawEnd?.({ chart, overlay, ...event })
          }
        }
        const index = overlay.points.length - 1
        return this._figureMouseClickEvent(
          overlay,
          'point',
          index,
          {
            key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
            type: 'circle',
            attrs: {}
          }
        )(event)
      }
      return false
    }).registerEvent('mouseRightClickEvent', event => {
      const progressOverlayInfo = chartStore.getProgressOverlayInfo()
      if (progressOverlayInfo !== null) {
        const overlay = progressOverlayInfo.overlay
        if (overlay.isDrawing()) {
          const index = overlay.points.length - 1
          return this._figureMouseRightClickEvent(
            overlay,
            'point',
            index,
            {
              key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
              type: 'circle',
              attrs: {}
            }
          )(event)
        }
      }
      return false
    }).registerEvent('mouseDownEvent', event => {
      // Freehand stroke start: a press while a freehand overlay is armed
      // commits the first point and arms the pressed-move collector.
      const progressOverlayInfo = chartStore.getProgressOverlayInfo()
      const overlay = progressOverlayInfo?.overlay ?? null
      if (progressOverlayInfo === null || overlay === null || !overlay.freehand || !overlay.isDrawing() || overlay.lock) {
        return false
      }
      // Axis widgets convert only half a point — never let them start a stroke.
      if (!this.coordinateToPointValueFlag() || !this.coordinateToPointTimestampDataIndexFlag()) {
        return false
      }
      let progressOverlayPaneId = progressOverlayInfo.paneId
      if (overlay.isStart()) {
        chartStore.updateProgressOverlayInfo(paneId)
        progressOverlayPaneId = paneId
      }
      if (progressOverlayPaneId !== paneId) {
        return false
      }
      overlay.eventMoveForDrawing(this._coordinateToPoint(overlay, event), event)
      overlay.nextStep()
      overlay.onDrawing?.({ chart, overlay, ...event })
      chartStore.executeAction('onOverlayChange', { type: 'progress', overlay })
      if (!overlay.isDrawing()) {
        // A finite-step freehand finished on the first point.
        chartStore.progressOverlayComplete()
        overlay.onDrawEnd?.({ chart, overlay, ...event })
        return true
      }
      chartStore.setPressedOverlayInfo({
        paneId,
        overlay,
        figureType: 'none',
        figureIndex: -1,
        figure: null
      })
      freehandLastCoord = { x: event.x, y: event.y }
      return true
    }).registerEvent('mouseUpEvent', event => {
      const { overlay, figure, figureType } = chartStore.getPressedOverlayInfo()
      let consumed = false
      if (overlay !== null) {
        if (overlay.freehand && overlay.isDrawing() && figureType === 'none') {
          // Freehand stroke end — complete and commit the overlay. A
          // press-release with zero travel leaves a single-point stroke
          // that renders nothing — cancel it like a degenerate dblclick.
          overlay.forceComplete()
          if (overlay.points.length < 2) {
            chartStore.removeOverlay({ id: overlay.id })
          } else {
            chartStore.progressOverlayComplete()
            overlay.onDrawEnd?.({ chart, overlay, ...event })
          }
          consumed = true
        } else {
          if (checkOverlayFigureEvent('onPressedMoveEnd', figure)) {
            overlay.onPressedMoveEnd?.({ chart, overlay, figure: figure ?? undefined, ...event })
          }
          // Gesture commit boundary — pairs with 'editStart' emitted on press.
          chartStore.executeAction('onOverlayChange', { type: 'editEnd', overlay })
        }
      }
      freehandLastCoord = null
      chartStore.setPressedOverlayInfo({
        paneId,
        overlay: null,
        figureType: 'none',
        figureIndex: -1,
        figure: null
      })
      return consumed
    }).registerEvent('pressedMouseMoveEvent', event => {
      const { overlay, figureType, figureIndex, figure } = chartStore.getPressedOverlayInfo()
      if (overlay !== null) {
        if (overlay.freehand && overlay.isDrawing() && figureType === 'none') {
          // Freehand stroke — append a point once the pointer travels past
          // the decimation distance, then advance the write slot.
          const minDist = overlay.freehandMinDistance
          const dx = event.x - (freehandLastCoord?.x ?? event.x)
          const dy = event.y - (freehandLastCoord?.y ?? event.y)
          if (dx * dx + dy * dy >= minDist * minDist) {
            overlay.eventMoveForDrawing(this._coordinateToPoint(overlay, event), event)
            overlay.nextStep()
            overlay.onDrawing?.({ chart, overlay, ...event })
            chartStore.executeAction('onOverlayChange', { type: 'progress', overlay })
            freehandLastCoord = { x: event.x, y: event.y }
            if (!overlay.isDrawing()) {
              // A finite-step freehand tool finished mid-stroke — release
              // the pressed slot so later moves can't misroute into
              // eventPressedOtherMove (stale _prevPressedPoint teleport).
              chartStore.progressOverlayComplete()
              overlay.onDrawEnd?.({ chart, overlay, ...event })
              chartStore.setPressedOverlayInfo({
                paneId,
                overlay: null,
                figureType: 'none',
                figureIndex: -1,
                figure: null
              })
              freehandLastCoord = null
            }
          }
          this.getWidget().setForceCursor('crosshair')
          return true
        }
        if (checkOverlayFigureEvent('onPressedMoving', figure)) {
          if (!overlay.lock) {
            const point = this._coordinateToPoint(overlay, event)
            if (figureType === 'point') {
              overlay.eventPressedPointMove(point, figureIndex, figure?.key ?? undefined, figure?.moveDirection, event)
            } else {
              overlay.eventPressedOtherMove(point, this.getWidget().getPane().getChart().getChartStore(), figure?.moveDirection, figure?.key ?? undefined, event)
            }
            chartStore.executeAction('onOverlayChange', { type: 'progress', overlay })
            let prevented = false
            overlay.onPressedMoving?.({ chart, overlay, figure: figure ?? undefined, ...event, preventDefault: () => { prevented = true } })
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
            if (prevented) {
              this.getWidget().setForceCursor(null)
            } else {
              this.getWidget().setForceCursor(figure?.cursor ?? 'pointer')
            }
          }
          return true
        }
      }
      this.getWidget().setForceCursor(null)
      return false
    })
  }

  private _createFigureEvents (
    overlay: OverlayImp,
    figureType: EventOverlayInfoFigureType,
    figureIndex: number,
    figure: OverlayFigure
  ): Nullable<EventHandler> {
    if (overlay.isDrawing() || overlay.ghost) {
      return null
    }
    return {
      mouseMoveEvent: this._figureMouseMoveEvent(overlay, figureType, figureIndex, figure),
      mouseDownEvent: this._figureMouseDownEvent(overlay, figureType, figureIndex, figure),
      mouseClickEvent: this._figureMouseClickEvent(overlay, figureType, figureIndex, figure),
      mouseRightClickEvent: this._figureMouseRightClickEvent(overlay, figureType, figureIndex, figure),
      mouseDoubleClickEvent: this._figureMouseDoubleClickEvent(overlay, figureType, figureIndex, figure)
    }
  }

  private _processOverlayMouseEnterEvent (overlay: OverlayImp, figure: Nullable<OverlayFigure>, event: MouseTouchEvent): boolean {
    if (isFunction(overlay.onMouseEnter) && checkOverlayFigureEvent('onMouseEnter', figure)) {
      overlay.onMouseEnter({ chart: this.getWidget().getPane().getChart(), overlay, figure: figure ?? undefined, ...event })
      return true
    }
    return false
  }

  private _processOverlayMouseLeaveEvent (overlay: OverlayImp, figure: Nullable<OverlayFigure>, event: MouseTouchEvent): boolean {
    if (isFunction(overlay.onMouseLeave) && checkOverlayFigureEvent('onMouseLeave', figure)) {
      overlay.onMouseLeave({ chart: this.getWidget().getPane().getChart(), overlay, figure: figure ?? undefined, ...event })
      return true
    }
    return false
  }

  private _processOverlaySelectedEvent (overlay: OverlayImp, figure: Nullable<OverlayFigure>, event: MouseTouchEvent): boolean {
    if (checkOverlayFigureEvent('onSelected', figure)) {
      overlay.onSelected?.({ chart: this.getWidget().getPane().getChart(), overlay, figure: figure ?? undefined, ...event })
      return true
    }
    return false
  }

  private _processOverlayDeselectedEvent (overlay: OverlayImp, figure: Nullable<OverlayFigure>, event: MouseTouchEvent): boolean {
    if (checkOverlayFigureEvent('onDeselected', figure)) {
      overlay.onDeselected?.({ chart: this.getWidget().getPane().getChart(), overlay, figure: figure ?? undefined, ...event })
      return true
    }
    return false
  }

  private _figureMouseMoveEvent (overlay: OverlayImp, figureType: EventOverlayInfoFigureType, figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      const pane = this.getWidget().getPane()
      const check = !overlay.isDrawing() && checkOverlayFigureEvent('onMouseMove', figure)
      if (check) {
        let prevented = false
        overlay.onMouseMove?.({ chart: pane.getChart(), overlay, figure, ...event, preventDefault: () => { prevented = true } })
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
        if (prevented) {
          this.getWidget().setForceCursor(null)
        } else {
          this.getWidget().setForceCursor(figure.cursor ?? 'pointer')
        }
      }

      pane.getChart().getChartStore().setHoverOverlayInfo(
        { paneId: pane.getId(), overlay, figureType, figure, figureIndex },
        (o, f) => this._processOverlayMouseEnterEvent(o, f, event),
        (o, f) => this._processOverlayMouseLeaveEvent(o, f, event)
      )
      return check
    }
  }

  private _figureMouseDownEvent (overlay: OverlayImp, figureType: EventOverlayInfoFigureType, figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      if (overlay.ghost || overlay.lock) {
        return false
      }
      const pane = this.getWidget().getPane()
      const paneId = pane.getId()
      const chartStore = pane.getChart().getChartStore()
      // Check FIRST — a figure whose spec ignores onPressedMoveStart must not
      // spawn an orphan clone below.
      if (!checkOverlayFigureEvent('onPressedMoveStart', figure)) {
        return false
      }
      // Ctrl/Cmd+drag clones the overlay and drags the clone (TradingView).
      // Lifecycle asymmetry is intentional and matches TV: the clone is
      // committed to the store at drag START, not on first move — a
      // modifier-press without movement leaves a duplicate under the
      // original, exactly as Ctrl+click-drag does on tradingview.com.
      let dragOverlay = overlay
      if ((event.ctrlKey === true || event.metaKey === true) && !overlay.isDrawing()) {
        const ids = chartStore.addOverlays([{
          name: overlay.name,
          paneId: overlay.paneId,
          points: clone(overlay.points),
          extendData: isValid(overlay.extendData) ? clone(overlay.extendData) : undefined,
          styles: isValid(overlay.styles) ? clone(overlay.styles) : undefined,
          lock: false,
          visible: overlay.visible,
          mode: overlay.mode,
          modeSensitivity: overlay.modeSensitivity,
          zLevel: overlay.zLevel
        }], [false])
        const cloneOverlay = chartStore.getOverlayById(ids[0] ?? null)
        if (cloneOverlay === null) {
          return false
        }
        if (cloneOverlay.isDrawing()) {
          // Unlimited-step sources (freehand) create below totalStep — land
          // the clone as a finished overlay rather than the drawing slot.
          cloneOverlay.forceComplete()
          chartStore.progressOverlayComplete()
        }
        dragOverlay = cloneOverlay
      }
      dragOverlay.startPressedMove(this._coordinateToPoint(dragOverlay, event))
      dragOverlay.onPressedMoveStart?.({ chart: pane.getChart(), overlay: dragOverlay, figure, ...event })
      chartStore.setPressedOverlayInfo({ paneId, overlay: dragOverlay, figureType, figureIndex, figure })
      // Gesture commit boundary — everything between editStart/editEnd is
      // one undo/persistence unit (drag gestures emit many 'progress').
      chartStore.executeAction('onOverlayChange', { type: 'editStart', overlay: dragOverlay })
      return !dragOverlay.isDrawing()
    }
  }

  private _figureMouseClickEvent (overlay: OverlayImp, figureType: EventOverlayInfoFigureType, figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      const pane = this.getWidget().getPane()
      const paneId = pane.getId()
      const check = !overlay.isDrawing() && checkOverlayFigureEvent('onClick', figure)
      if (check) {
        overlay.onClick?.({ chart: this.getWidget().getPane().getChart(), overlay, figure, ...event })
      }
      pane.getChart().getChartStore().setClickOverlayInfo(
        { paneId, overlay, figureType, figureIndex, figure },
        (o, f) => this._processOverlaySelectedEvent(o, f, event),
        (o, f) => this._processOverlayDeselectedEvent(o, f, event)
      )
      return check
    }
  }

  private _figureMouseDoubleClickEvent (overlay: OverlayImp, _figureType: EventOverlayInfoFigureType, _figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      if (checkOverlayFigureEvent('onDoubleClick', figure)) {
        overlay.onDoubleClick?.({ ...event, chart: this.getWidget().getPane().getChart(), figure, overlay })
        return !overlay.isDrawing()
      }
      return false
    }
  }

  private _figureMouseRightClickEvent (overlay: OverlayImp, _figureType: EventOverlayInfoFigureType, _figureIndex: number, figure: OverlayFigure): MouseTouchEventCallback {
    return (event: MouseTouchEvent) => {
      if (overlay.ghost || overlay.lock) {
        return false
      }
      if (checkOverlayFigureEvent('onRightClick', figure)) {
        let prevented = false
        overlay.onRightClick?.({ chart: this.getWidget().getPane().getChart(), overlay, figure, ...event, preventDefault: () => { prevented = true } })
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ignore
        if (!prevented) {
          this.getWidget().getPane().getChart().getChartStore().removeOverlay(overlay)
        }
        return !overlay.isDrawing()
      }
      return false
    }
  }

  private _coordinateToPoint (o: Overlay, coordinate: Coordinate): Partial<Point> {
    const point: Partial<Point> = {}
    const pane = this.getWidget().getPane()
    const chart = pane.getChart()
    const paneId = pane.getId()
    const chartStore = chart.getChartStore()
    if (this.coordinateToPointTimestampDataIndexFlag()) {
      const xAxis = chart.getXAxisPane().getAxisComponent()
      const dataIndex = xAxis.convertFromPixel(coordinate.x)
      const timestamp = chartStore.dataIndexToTimestamp(dataIndex) ?? undefined
      point.timestamp = timestamp
      point.dataIndex = dataIndex
    }
    if (this.coordinateToPointValueFlag()) {
      const yAxis = pane.getAxisComponent()
      let value = yAxis.convertFromPixel(coordinate.y)
      if (o.mode !== 'normal' && paneId === PaneIdConstants.CANDLE && isNumber(point.dataIndex)) {
        const kLineData = chartStore.getDataByDataIndex(point.dataIndex)
        if (kLineData !== null) {
          const modeSensitivity = o.modeSensitivity
          if (value > kLineData.high) {
            if (o.mode === 'weak_magnet') {
              const highY = yAxis.convertToPixel(kLineData.high)
              const buffValue = yAxis.convertFromPixel(highY - modeSensitivity)
              if (value < buffValue) {
                value = kLineData.high
              }
            } else {
              value = kLineData.high
            }
          } else if (value < kLineData.low) {
            if (o.mode === 'weak_magnet') {
              const lowY = yAxis.convertToPixel(kLineData.low)
              const buffValue = yAxis.convertFromPixel(lowY - modeSensitivity)
              if (value > buffValue) {
                value = kLineData.low
              }
            } else {
              value = kLineData.low
            }
          } else {
            const max = Math.max(kLineData.open, kLineData.close)
            const min = Math.min(kLineData.open, kLineData.close)
            if (value > max) {
              if (value - max < kLineData.high - value) {
                value = max
              } else {
                value = kLineData.high
              }
            } else if (value < min) {
              if (value - kLineData.low < min - value) {
                value = kLineData.low
              } else {
                value = min
              }
            } else if (max - value < value - min) {
              value = max
            } else {
              value = min
            }
          }
        }
      }
      point.value = value
    }
    return point
  }

  protected coordinateToPointValueFlag (): boolean {
    return true
  }

  protected coordinateToPointTimestampDataIndexFlag (): boolean {
    return true
  }

  override dispatchEvent (name: EventName, event: MouseTouchEvent): boolean {
    if (this.getWidget().getPane().getChart().getChartStore().isOverlayDrawing()) {
      return this.onEvent(name, event)
    }
    return super.dispatchEvent(name, event)
  }

  override drawImp (ctx: CanvasRenderingContext2D): void {
    const overlays = this.getCompleteOverlays()
    overlays.forEach(overlay => {
      if (overlay.visible) {
        this._drawOverlay(ctx, overlay)
      }
    })
    const progressOverlay = this.getProgressOverlay()
    if (isValid(progressOverlay) && progressOverlay.visible) {
      this._drawOverlay(ctx, progressOverlay)
    }
  }

  private _drawOverlay (
    ctx: CanvasRenderingContext2D,
    overlay: OverlayImp
  ): void {
    const { points } = overlay
    const pane = this.getWidget().getPane()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    const yAxis = pane.getAxisComponent() as unknown as Nullable<YAxis>
    const xAxis = chart.getXAxisPane().getAxisComponent()
    const coordinates = points.map(point => {
      let dataIndex: Nullable<number> = null
      if (isNumber(point.timestamp)) {
        dataIndex = chartStore.timestampToDataIndex(point.timestamp)
      } else if (isNumber(point.dataIndex)) {
        dataIndex = point.dataIndex
      }
      const coordinate = { x: 0, y: 0 }
      if (isNumber(dataIndex)) {
        coordinate.x = xAxis.convertToPixel(dataIndex)
      }
      if (isNumber(point.value)) {
        coordinate.y = yAxis?.convertToPixel(point.value) ?? 0
      }
      return coordinate
    })
    if (coordinates.length > 0) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
      // @ts-expect-error
      const figures = [].concat(this.getFigures(overlay, coordinates))
      this.drawFigures(
        ctx,
        overlay,
        figures
      )
    }
    this.drawDefaultFigures(
      ctx,
      overlay,
      coordinates
    )
  }

  protected drawFigures (ctx: CanvasRenderingContext2D, overlay: OverlayImp, figures: OverlayFigure[]): void {
    const defaultStyles = this.getWidget().getPane().getChart().getStyles().overlay
    figures.forEach((figure, figureIndex) => {
      const { type, styles, attrs } = figure
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
      // @ts-expect-error
      const attrsArray = [].concat(attrs)
      attrsArray.forEach((ats) => {
        const pointIdx = figure.pointIndex
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- pointIndex may be undefined at runtime
        const isBoundPoint = pointIdx !== undefined && pointIdx !== null
        const events = figure.ignoreEvent === true
          ? null
          : this._createFigureEvents(
            overlay, isBoundPoint ? 'point' : 'other', isBoundPoint ? pointIdx : figureIndex, figure
          )
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- ignore
        // @ts-expect-error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- ignore
        const ss = { ...defaultStyles[type], ...overlay.styles?.[type], ...styles }
        this.createFigure({
          name: type, attrs: ats, styles: ss
        }, events ?? undefined)?.draw(ctx)
      })
    })
  }

  protected getCompleteOverlays (): OverlayImp[] {
    const pane = this.getWidget().getPane()
    return pane.getChart().getChartStore().getOverlaysByPaneId(pane.getId())
  }

  protected getProgressOverlay (): Nullable<OverlayImp> {
    const pane = this.getWidget().getPane()
    const info = pane.getChart().getChartStore().getProgressOverlayInfo()
    if (isValid(info) && info.paneId === pane.getId()) {
      return info.overlay
    }
    return null
  }

  protected getFigures (
    o: Overlay,
    coordinates: Coordinate[]
  ): OverlayFigure | OverlayFigure[] {
    const widget = this.getWidget()
    const pane = widget.getPane()
    const chart = pane.getChart()
    const chartStore = chart.getChartStore()
    const yAxis = pane.getAxisComponent() as unknown as Nullable<YAxis>
    const xAxis = chart.getXAxisPane().getAxisComponent()
    const bounding = widget.getBounding()
    const clickInfo = chartStore.getClickOverlayInfo()
    const hoverInfo = chartStore.getHoverOverlayInfo()
    return o.createPointFigures?.({
      chart,
      overlay: o,
      coordinates,
      bounding,
      xAxis,
      yAxis,
      isSelected: clickInfo.overlay?.id === o.id && clickInfo.figureType !== 'none',
      isHovered: hoverInfo.overlay?.id === o.id && hoverInfo.figureType !== 'none',
      hoveredFigureKey: hoverInfo.overlay?.id === o.id && hoverInfo.figureType !== 'none'
        ? hoverInfo.figure?.key
        : undefined
    }) ?? []
  }

  protected drawDefaultFigures (
    ctx: CanvasRenderingContext2D,
    overlay: OverlayImp,
    coordinates: Coordinate[]
  ): void {
    if (overlay.needDefaultPointFigure) {
      const chartStore = this.getWidget().getPane().getChart().getChartStore()
      const hoverOverlayInfo = chartStore.getHoverOverlayInfo()
      const clickOverlayInfo = chartStore.getClickOverlayInfo()
      if (
        (hoverOverlayInfo.overlay?.id === overlay.id && hoverOverlayInfo.figureType !== 'none') ||
        (clickOverlayInfo.overlay?.id === overlay.id && clickOverlayInfo.figureType !== 'none')
      ) {
        const chartStyles = chartStore.getStyles()
        // CP colors: border always #1592E6, fill from theme

        // Detect theme for CP fill: light tick text = dark theme → dark fill

        const tickTextColor = String(chartStyles.yAxis.tickText.color)
        const isDarkTheme = this._isLightColor(tickTextColor)
        const themedFill = isDarkTheme ? '#131722' : '#ffffff'

        // Fixed CP sizes for consistent look across all overlays
        const cpRadius = 5
        const cpBorder = 1.5
        const cpOuterR = cpRadius + cpBorder
        const cpActiveOuterR = cpRadius + 2

        coordinates.forEach(({ x, y }, index) => {
          const isHoveredPoint =
            hoverOverlayInfo.overlay?.id === overlay.id &&
            hoverOverlayInfo.figureType === 'point' &&
            hoverOverlayInfo.figure?.key === `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`
          const outerR = isHoveredPoint ? cpActiveOuterR : cpOuterR
          const borderColor = '#1592E6'

          const figureKey = `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`
          // Render as stroke_fill circle (same as rectEnhanced CPs)
          this.createFigure(
            {
              name: 'circle',
              attrs: { x, y, r: outerR },
              styles: { style: 'stroke_fill', color: themedFill, borderColor, borderSize: cpBorder }
            },
            this._createFigureEvents(
              overlay,
              'point',
              index,
              {
                key: figureKey,
                type: 'circle',
                attrs: { x, y, r: outerR },
                styles: { style: 'stroke_fill', color: themedFill, borderColor, borderSize: cpBorder },
                cursor: 'pointer'
              }
            ) ?? undefined
          )?.draw(ctx)
        })
      }
    }
  }
}
