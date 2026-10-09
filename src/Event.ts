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

import type Nullable from './common/Nullable'
import EventHandlerImp, { type EventHandler, type MouseTouchEvent, TOUCH_MIN_RADIUS } from './common/EventHandler'
import type Coordinate from './common/Coordinate'
import { UpdateLevel } from './common/Updater'
import type Crosshair from './common/Crosshair'
import { requestAnimationFrame, cancelAnimationFrame } from './common/utils/compatible'
import { isValid, isNumber, isFunction } from './common/utils/typeChecks'

import type { AxisRange } from './component/Axis'
import type YAxis from './component/YAxis'
import type XAxis from './component/XAxis'

import type Chart from './Chart'
import type Pane from './pane/Pane'
import type DrawPane from './pane/DrawPane'
import { PaneIdConstants } from './pane/types'
import { checkOverlayFigureEvent } from './component/Overlay'
import type Widget from './widget/Widget'
import { WidgetNameConstants, REAL_SEPARATOR_HEIGHT } from './widget/types'

/**
 * Squared distance from point (px, py) to line segment (x1,y1)→(x2,y2).
 * Uses squared distance to avoid sqrt for performance.
 */
function pointToSegmentDistanceSq (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    // Degenerate segment (point)
    const ex = px - x1
    const ey = py - y1
    return ex * ex + ey * ey
  }
  // Project point onto segment, clamped to [0,1]
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const nearX = x1 + t * dx
  const nearY = y1 + t * dy
  const ex = px - nearX
  const ey = py - nearY
  return ex * ex + ey * ey
}

interface EventTriggerWidgetInfo {
  pane: Nullable<Pane>
  widget: Nullable<Widget>
}

export default class Event implements EventHandler {
  private readonly _container: HTMLElement
  private readonly _chart: Chart
  private readonly _event: EventHandlerImp

  // 惯性滚动开始时间
  private _flingStartTime = new Date().getTime()
  // True only once the gesture has actually scrolled since the last anchor
  // — a pinch-end re-anchor must not let the tracked finger's release
  // compute a fling from the pinch separation distance.
  private _scrolledSinceAnchor = false
  // 惯性滚动定时器
  private _flingScrollRequestId: Nullable<number> = null
  // 开始滚动时坐标点
  private _startScrollCoordinate: Nullable<Coordinate> = null
  // 开始触摸时坐标
  private _touchCoordinate: Nullable<Coordinate> = null
  // 是否是取消了十字光标
  private _touchCancelCrosshair = false
  // 是否缩放过
  private _touchZoomed = false
  // 用来记录捏合缩放的尺寸
  private _pinchScale = 1

  private _mouseDownWidget: Nullable<Widget> = null

  /** Currently hovered indicator ID (for hover enter/leave transition tracking) */
  private _hoveredIndicatorId: Nullable<string> = null

  /**
   * Check if a coordinate is within any indicator's hit region on a pane.
   * Supports two hit-test modes:
   *   1. _hitArea (AABB rectangle) — used by VPFR
   *   2. _hitSegments (line segments with distance tolerance) — used by SuperTrend
   * Returns the indicator info if hit, null otherwise.
   */
  private _findIndicatorAtPoint (pane: Nullable<Pane>, x: number, y: number): { indicatorId: string; indicatorName: string; paneId: string; indicator: unknown; x: number; y: number } | null {
    if (pane === null) return null
    const chartStore = this._chart.getChartStore()
    const indicators = chartStore.getIndicatorsByPaneId(pane.getId())
    for (const indicator of indicators) {
      if (!indicator.visible) continue
      const extData = indicator.extendData as Record<string, unknown> | undefined
      if (extData == null) continue

      // Mode 1: Line-segment distance hit testing (_hitSegments)
      const hitSegments = extData._hitSegments as Array<{ x1: number; y1: number; x2: number; y2: number }> | undefined
      if (hitSegments != null && hitSegments.length > 0) {
        const HIT_TOLERANCE = 6
        for (const seg of hitSegments) {
          if (pointToSegmentDistanceSq(x, y, seg.x1, seg.y1, seg.x2, seg.y2) <= HIT_TOLERANCE * HIT_TOLERANCE) {
            return { indicatorId: indicator.id, indicatorName: indicator.name, paneId: pane.getId(), indicator, x, y }
          }
        }
      }

      // Mode 2: AABB rectangle hit testing (_hitArea)
      const hitArea = extData._hitArea as { left: number; top: number; right: number; bottom: number } | undefined
      if (hitArea != null && isNumber(hitArea.left)) {
        if (x >= hitArea.left && x <= hitArea.right && y >= hitArea.top && y <= hitArea.bottom) {
          return { indicatorId: indicator.id, indicatorName: indicator.name, paneId: pane.getId(), indicator, x, y }
        }
      }
    }
    return null
  }

  /**
   * Set _selected on a clicked indicator, clear _selected on all others.
   * If no indicator is hit, clear all _selected flags.
   */
  private _updateIndicatorSelected (_pane: Nullable<Pane>, clickedInfo: ReturnType<Event['_findIndicatorAtPoint']>): void {
    const chartStore = this._chart.getChartStore()
    // Clear all _selected flags across all indicators
    const allIndicators = chartStore.getIndicatorsByFilter({})
    for (const ind of allIndicators) {
      const ext = ind.extendData as Record<string, unknown> | undefined
      if (ext != null && ext._selected === true) {
        ext._selected = false
      }
    }
    // Set _selected on clicked indicator
    if (clickedInfo !== null) {
      const indObj = clickedInfo.indicator as { extendData?: Record<string, unknown> } | undefined
      const ext = indObj?.extendData
      if (ext != null) {
        ext._selected = true
      }
    }
    // Redraw to reflect selection change
    this._chart.updatePane(UpdateLevel.Main)
  }

  /**
   * Update indicator hover state. Only fires on enter/leave transitions.
   * Directly mutates extendData._hovered and triggers a lightweight pane redraw.
   */
  private _updateIndicatorHover (pane: Nullable<Pane>, hoverInfo: ReturnType<Event['_findIndicatorAtPoint']>): void {
    if (hoverInfo !== null) {
      if (this._hoveredIndicatorId !== hoverInfo.indicatorId) {
        // Clear previous hover
        this._clearIndicatorHover()
        // Set new hover
        const indObj = hoverInfo.indicator as { extendData?: Record<string, unknown> } | undefined
        const ext = indObj?.extendData
        if (ext != null) {
          ext._hovered = true
        }
        this._hoveredIndicatorId = hoverInfo.indicatorId
        if (pane !== null) {
          this._chart.updatePane(UpdateLevel.Main, pane.getId())
        }
      }
    } else if (this._hoveredIndicatorId !== null) {
      this._clearIndicatorHover()
      // Redraw all panes to clear dots (hovered indicator could be in any pane)
      this._chart.updatePane(UpdateLevel.Main)
    }
  }

  /** Clear _hovered flag on the currently hovered indicator */
  private _clearIndicatorHover (): void {
    if (this._hoveredIndicatorId === null) return
    const chartStore = this._chart.getChartStore()
    const indicators = chartStore.getIndicatorsByFilter({ id: this._hoveredIndicatorId })
    for (const ind of indicators) {
      const ext = ind.extendData as Record<string, unknown> | undefined
      if (ext != null) {
        ext._hovered = false
      }
    }
    this._hoveredIndicatorId = null
  }

  private _prevYAxisRange: Nullable<AxisRange> = null

  private _xAxisStartScaleCoordinate: Nullable<Coordinate> = null
  private _xAxisStartScaleDistance = 0
  private _xAxisScale = 1

  private _yAxisStartScaleDistance = 0

  private _mouseMoveTriggerWidgetInfo: EventTriggerWidgetInfo = { pane: null, widget: null }

  private readonly _boundKeyBoardDownEvent: ((event: KeyboardEvent) => void) = (event: KeyboardEvent) => {
    // Never steal keys from editable targets — the drawing text editor's
    // textarea bubbles keydown to the chart container, and Shift+Arrow /
    // Shift+= / Shift+- would scroll/zoom while the user selects text.
    const target = event.target
    if (target instanceof Element) {
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable) ||
        target.closest('input, textarea, select, [contenteditable]') !== null
      ) {
        return
      }
    }
    if (event.shiftKey) {
      switch (event.code) {
        case 'Equal': {
          this._chart.getChartStore().zoom(0.5, null, 'main')
          break
        }
        case 'Minus': {
          this._chart.getChartStore().zoom(-0.5, null, 'main')
          break
        }
        case 'ArrowLeft': {
          const store = this._chart.getChartStore()
          store.startScroll()
          store.scroll(-3 * store.getBarSpace().bar)
          break
        }
        case 'ArrowRight': {
          const store = this._chart.getChartStore()
          store.startScroll()
          store.scroll(3 * store.getBarSpace().bar)
          break
        }
        default: {
          break
        }
      }
    }
  }

  constructor (container: HTMLElement, chart: Chart) {
    this._container = container
    this._chart = chart
    this._event = new EventHandlerImp(container, this, {
      treatVertDragAsPageScroll: () => false,
      treatHorzDragAsPageScroll: () => false
    })
    container.addEventListener('keydown', this._boundKeyBoardDownEvent)
  }

  pinchStartEvent (): boolean {
    this._touchZoomed = true
    this._pinchScale = 1
    // A pinch mid-freehand must END the stroke: touchMove is suppressed while
    // two fingers are down, and resuming afterwards would append points from
    // the stale last coordinate — a visible tail jump across the pinch (and
    // the zoom changes pixel geometry mid-stroke). Mirror the mouseup rule:
    // fewer than 2 points is a degenerate stroke → drop it.
    const chartStore = this._chart.getChartStore()
    const pressed = chartStore.getPressedOverlayInfo().overlay
    if (pressed !== null && pressed.isDrawing() && pressed.freehand) {
      pressed.forceComplete()
      if (pressed.points.length < 2) {
        chartStore.removeOverlay({ id: pressed.id })
      } else {
        // onDrawEnd BEFORE complete — measure-style tools delete themselves
        // in the hook; skipping it strands the ruler on the chart forever.
        pressed.onDrawEnd?.({ chart: this._chart, overlay: pressed })
        if (chartStore.getOverlayById(pressed.id) !== null) {
          chartStore.progressOverlayComplete()
        }
      }
      chartStore.setPressedOverlayInfo({ paneId: '', overlay: null, figureType: 'none', figureIndex: -1, figure: null })
      this._chart.updatePane(UpdateLevel.Overlay)
    }
    return true
  }

  pinchEvent (e: MouseTouchEvent, scale: number): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    if (pane?.getId() !== PaneIdConstants.X_AXIS && widget?.getName() === WidgetNameConstants.MAIN) {
      const event = this._makeWidgetEvent(e, widget)
      const zoomScale = (scale - this._pinchScale) * 5
      this._pinchScale = scale
      this._chart.getChartStore().zoom(zoomScale, { x: event.x, y: event.y }, 'main')
      return true
    }
    return false
  }

  pinchEndEvent (e: MouseTouchEvent, hasRemaining?: number): boolean {
    // One finger may remain after pinch — re-anchor the scroll baseline to
    // its current WIDGET-LOCAL position, or the accumulated pinch
    // displacement applies at once as a scroll jump on the next touchmove.
    // When no finger remains the anchor is disarmed — keeping it would let
    // the release compute a fling from a stale/fake origin (teleport).
    if (this._startScrollCoordinate === null) {
      return false
    }
    if (hasRemaining === 0) {
      this._startScrollCoordinate = null
      return false
    }
    const { widget } = this._findWidgetByEvent(e)
    if (widget?.getName() === WidgetNameConstants.MAIN) {
      const event = this._makeWidgetEvent(e, widget)
      this._startScrollCoordinate = { x: event.x, y: event.y }
      this._flingStartTime = new Date().getTime()
      this._scrolledSinceAnchor = false
    } else {
      this._startScrollCoordinate = null
    }
    return false
  }

  mouseWheelHortEvent (_: MouseTouchEvent, distance: number): boolean {
    const store = this._chart.getChartStore()
    store.startScroll()
    store.scroll(distance)
    return true
  }

  mouseWheelVertEvent (e: MouseTouchEvent, scale: number): boolean {
    const { widget } = this._findWidgetByEvent(e)
    const event = this._makeWidgetEvent(e, widget)
    const name = widget?.getName()
    if (name === WidgetNameConstants.MAIN) {
      this._chart.getChartStore().zoom(scale, { x: event.x, y: event.y }, 'main')
      return true
    }
    if (name === WidgetNameConstants.Y_AXIS) {
      return this._processYAxisWheelScaleEvent(widget as Widget<DrawPane<YAxis>>, scale)
    }
    return false
  }

  mouseDownEvent (e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    this._mouseDownWidget = widget
    // A mouse grab on a hybrid touchscreen can land mid-fling — stop the
    // inertial raf or scroll() and the drag fight over the scroll anchor.
    if (this._flingScrollRequestId !== null) {
      cancelAnimationFrame(this._flingScrollRequestId)
      this._flingScrollRequestId = null
    }
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.SEPARATOR: {
          return widget.dispatchEvent('mouseDownEvent', event)
        }
        case WidgetNameConstants.MAIN: {
          const consumed = widget.dispatchEvent('mouseDownEvent', event)
          // Arm scroll only when the press wasn't consumed by an overlay —
          // a consumed anchor press that loses its pressed slot mid-gesture
          // (Esc cancel, sync remove) would otherwise scroll the chart by
          // the total press-to-now displacement (touch path mirrors this).
          if (!consumed) {
            const yAxis = (pane as DrawPane<YAxis>).getAxisComponent()
            if (!yAxis.getAutoCalcTickFlag()) {
              const range = yAxis.getRange()
              this._prevYAxisRange = { ...range }
            }
            this._startScrollCoordinate = { x: event.x, y: event.y }
            this._chart.getChartStore().startScroll()
          }
          return consumed
        }
        case WidgetNameConstants.X_AXIS: {
          return this._processXAxisScrollStartEvent(widget, event)
        }
        case WidgetNameConstants.Y_AXIS: {
          return this._processYAxisScaleStartEvent(widget as Widget<DrawPane<YAxis>>, event)
        }
      }
    }
    return false
  }

  mouseMoveEvent (e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    const event = this._makeWidgetEvent(e, widget)
    if (
      this._mouseMoveTriggerWidgetInfo.pane?.getId() !== pane?.getId() ||
      this._mouseMoveTriggerWidgetInfo.widget?.getName() !== widget?.getName()
    ) {
      // Leaving a MAIN widget for an axis/separator ends overlay + indicator
      // hover — OverlayView registers no widget-level mouseLeave, so without
      // this the last-hovered drawing keeps its zLevel bump and onMouseLeave
      // never fires until re-entry.
      if (this._mouseMoveTriggerWidgetInfo.widget?.getName() === WidgetNameConstants.MAIN) {
        const chartStore = this._chart.getChartStore()
        chartStore.setHoverOverlayInfo(
          { paneId: '', overlay: null, figureType: 'none', figureIndex: -1, figure: null },
          () => false,
          (o, f) => {
            if (isFunction(o.onMouseLeave) && checkOverlayFigureEvent('onMouseLeave', f)) {
              o.onMouseLeave({ chart: this._chart, overlay: o, figure: f ?? undefined, ...e })
              return true
            }
            return false
          }
        )
        this._clearIndicatorHover()
      }
      widget?.dispatchEvent('mouseEnterEvent', event)
      this._mouseMoveTriggerWidgetInfo.widget?.dispatchEvent('mouseLeaveEvent', event)
      this._mouseMoveTriggerWidgetInfo = { pane, widget }
    }
    if (widget !== null) {
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          const consumed = widget.dispatchEvent('mouseMoveEvent', event)
          let crosshair: Crosshair | undefined = { x: event.x, y: event.y, paneId: pane?.getId() }
          if (consumed) {
            const forceCursor = widget.getForceCursor()
            if (forceCursor == null) {
              crosshair = undefined
            }
            widget.setCursor(forceCursor ?? 'pointer')
          } else {
            const hoverInfo = this._findIndicatorAtPoint(pane, event.x, event.y)
            if (hoverInfo !== null) {
              widget.setCursor('pointer')
            } else {
              widget.setCursor('crosshair')
            }
            this._updateIndicatorHover(pane, hoverInfo)
          }
          this._chart.getChartStore().setCrosshair(crosshair)
          return consumed
        }
        case WidgetNameConstants.SEPARATOR:
        case WidgetNameConstants.X_AXIS:
        case WidgetNameConstants.Y_AXIS: {
          const consumed = widget.dispatchEvent('mouseMoveEvent', event)
          this._chart.getChartStore().setCrosshair()
          return consumed
        }
      }
    }
    return false
  }

  pressedMouseMoveEvent (e: MouseTouchEvent): boolean {
    if (this._mouseDownWidget !== null && this._mouseDownWidget.getName() === WidgetNameConstants.SEPARATOR) {
      return this._mouseDownWidget.dispatchEvent('pressedMouseMoveEvent', e)
    }
    const { pane, widget } = this._findWidgetByEvent(e)
    if (
      widget !== null &&
      this._mouseDownWidget?.getPane().getId() === pane?.getId() &&
      this._mouseDownWidget?.getName() === widget.getName()
    ) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          // eslint-disable-next-line @typescript-eslint/init-declarations -- ignore
          let crosshair: Crosshair | undefined
          const consumed = widget.dispatchEvent('pressedMouseMoveEvent', event)
          if (!consumed) {
            this._processMainScrollingEvent(widget as Widget<DrawPane<YAxis>>, event)
          }
          if (!consumed || widget.getForceCursor() === 'pointer') {
            crosshair = { x: event.x, y: event.y, paneId: pane?.getId() }
          }
          this._chart.getChartStore().setCrosshair(crosshair, { forceInvalidate: true })
          return consumed
        }
        case WidgetNameConstants.X_AXIS: {
          return this._processXAxisScrollingEvent(widget as Widget<DrawPane<XAxis>>, event)
        }
        case WidgetNameConstants.Y_AXIS: {
          return this._processYAxisScalingEvent(widget as Widget<DrawPane<YAxis>>, event)
        }
      }
    }
    return false
  }

  mouseUpEvent (e: MouseTouchEvent): boolean {
    const { widget } = this._findWidgetByEvent(e)
    const target = this._releaseTarget(widget)
    let consumed = false
    if (target !== null) {
      const event = this._makeWidgetEvent(e, target)
      const name = target.getName()
      switch (name) {
        case WidgetNameConstants.MAIN:
        case WidgetNameConstants.SEPARATOR:
        case WidgetNameConstants.X_AXIS:
        case WidgetNameConstants.Y_AXIS: {
          consumed = target.dispatchEvent('mouseUpEvent', event)
          break
        }
      }
      if (consumed) {
        this._chart.updatePane(UpdateLevel.Overlay)
      }
    }
    this._mouseDownWidget = null
    this._startScrollCoordinate = null
    this._prevYAxisRange = null
    this._xAxisStartScaleCoordinate = null
    this._xAxisStartScaleDistance = 0
    this._xAxisScale = 1
    this._yAxisStartScaleDistance = 0
    return consumed
  }

  mouseClickEvent (e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const consumed = widget.dispatchEvent('mouseClickEvent', event)
      if (!consumed && widget.getName() === WidgetNameConstants.MAIN) {
        const indicatorInfo = this._findIndicatorAtPoint(pane, event.x, event.y)
        // Update selected state (set on clicked, clear on all others)
        this._updateIndicatorSelected(pane, indicatorInfo)
        if (indicatorInfo !== null) {
          this._chart.getChartStore().executeAction('onIndicatorShapeClick', indicatorInfo)
          return true
        }
      }
      return consumed
    }
    return false
  }

  mouseRightClickEvent (e: MouseTouchEvent): boolean {
    const { widget } = this._findWidgetByEvent(e)
    let consumed = false
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN:
        case WidgetNameConstants.X_AXIS:
        case WidgetNameConstants.Y_AXIS: {
          consumed = widget.dispatchEvent('mouseRightClickEvent', event)
          break
        }
      }
      if (consumed) {
        this._chart.updatePane(UpdateLevel.Overlay)
      }
    }
    return false
  }

  mouseDoubleClickEvent (e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    if (widget !== null) {
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          const event = this._makeWidgetEvent(e, widget)
          const consumed = widget.dispatchEvent('mouseDoubleClickEvent', event)
          if (!consumed) {
            // Check if double-click is on an indicator shape (e.g., VPVR histogram)
            const indicatorInfo = this._findIndicatorAtPoint(pane, event.x, event.y)
            if (indicatorInfo !== null) {
              this._chart.getChartStore().executeAction('onIndicatorShapeDoubleClick', indicatorInfo)
              return true
            }
          }
          return consumed
        }
        case WidgetNameConstants.Y_AXIS: {
          const yAxis = (pane as DrawPane<YAxis>).getAxisComponent()
          if (!yAxis.getAutoCalcTickFlag()) {
            yAxis.setAutoCalcTickFlag(true)
            this._chart.layout({
              measureWidth: true,
              update: true,
              buildYAxisTick: true
            })
            return true
          }
          break
        }
      }
    }
    return false
  }

  mouseLeaveEvent (e: MouseTouchEvent): boolean {
    const chartStore = this._chart.getChartStore()
    chartStore.setCrosshair()
    // Leaving the surface must end hover too — otherwise the last-hovered
    // overlay keeps its MAX_SAFE_INTEGER zLevel bump and onMouseLeave never
    // fires until the pointer re-enters and hovers something else.
    chartStore.setHoverOverlayInfo(
      { paneId: '', overlay: null, figureType: 'none', figureIndex: -1, figure: null },
      () => false,
      (o, f) => {
        if (isFunction(o.onMouseLeave) && checkOverlayFigureEvent('onMouseLeave', f)) {
          o.onMouseLeave({ chart: this._chart, overlay: o, figure: f ?? undefined, ...e })
          return true
        }
        return false
      }
    )
    // Indicator hover also ends on surface exit — _clearIndicatorHover is
    // otherwise only reachable from a move inside the surface.
    this._clearIndicatorHover()
    // Notify the last-hovered widget itself (separator strips track leave to
    // reset their active drag styling).
    this._mouseMoveTriggerWidgetInfo.widget?.dispatchEvent('mouseLeaveEvent', e)
    // Reset so re-entering fires widget mouseEnter again.
    this._mouseMoveTriggerWidgetInfo = { pane: null, widget: null }
    return true
  }

  touchStartEvent (e: MouseTouchEvent): boolean {
    // Crosshair suppression is per-gesture — a drag/pinch/cancel path that
    // skips tapEvent would otherwise leave the flag armed and eat the NEXT
    // tap's crosshair. Clearing here (before this gesture can re-arm it)
    // bounds the flag to the gesture that set it.
    this._touchCancelCrosshair = false
    const { pane, widget } = this._findWidgetByEvent(e)
    this._mouseDownWidget = widget
    // Cancel an in-flight fling for ANY touch — a touch on an axis or
    // separator during inertial scroll must still stop the raf or it keeps
    // scrolling underneath the new gesture.
    if (this._flingScrollRequestId !== null) {
      cancelAnimationFrame(this._flingScrollRequestId)
      this._flingScrollRequestId = null
    }
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      event.preventDefault?.()
      const name = widget.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          const chartStore = this._chart.getChartStore()
          if (widget.dispatchEvent('mouseDownEvent', event)) {
            this._touchCancelCrosshair = true
            this._touchCoordinate = null
            chartStore.setCrosshair(undefined, { notInvalidate: true })
            this._chart.updatePane(UpdateLevel.Overlay)
            return true
          }
          this._flingStartTime = new Date().getTime()
          const yAxis = (pane as DrawPane<YAxis>).getAxisComponent()
          if (!yAxis.getAutoCalcTickFlag()) {
            const range = yAxis.getRange()
            this._prevYAxisRange = { ...range }
          }
          this._startScrollCoordinate = { x: event.x, y: event.y }
          chartStore.startScroll()
          this._touchZoomed = false
          this._scrolledSinceAnchor = false
          if (this._touchCoordinate !== null) {
            const xDif = event.x - this._touchCoordinate.x
            const yDif = event.y - this._touchCoordinate.y
            const radius = Math.sqrt(xDif * xDif + yDif * yDif)
            if (radius < TOUCH_MIN_RADIUS) {
              this._touchCoordinate = { x: event.x, y: event.y }
              chartStore.setCrosshair({ x: event.x, y: event.y, paneId: pane?.getId() })
            } else {
              this._touchCoordinate = null
              this._touchCancelCrosshair = true
              chartStore.setCrosshair()
            }
          }
          return true
        }
        case WidgetNameConstants.X_AXIS: {
          return this._processXAxisScrollStartEvent(widget, event)
        }
        case WidgetNameConstants.Y_AXIS: {
          return this._processYAxisScaleStartEvent(widget as Widget<DrawPane<YAxis>>, event)
        }
        case WidgetNameConstants.SEPARATOR: {
          // Without this the separator's touchStartEvent registration never
          // fires — _dragFlag/_topPane stay unset and the follow-up
          // pressedMouseMoveEvent no-ops: pane resize was dead on touch.
          return widget.dispatchEvent('touchStartEvent', event)
        }
      }
    }
    return false
  }

  touchMoveEvent (e: MouseTouchEvent): boolean {
    if (this._mouseDownWidget !== null && this._mouseDownWidget.getName() === WidgetNameConstants.SEPARATOR) {
      // Same claim as the main/axis branches — without preventDefault the
      // browser may scroll the page (or cancel the touch) mid-resize.
      e.preventDefault?.()
      return this._mouseDownWidget.dispatchEvent('pressedMouseMoveEvent', e)
    }
    const { pane, widget } = this._findWidgetByEvent(e)
    // Same identity gate as pressedMouseMoveEvent — a touch gesture is
    // widget-local: without it a freehand stroke sliding across a pane
    // boundary writes points in the wrong pane's coordinate space.
    if (
      widget !== null &&
      this._mouseDownWidget?.getPane().getId() === pane?.getId() &&
      this._mouseDownWidget?.getName() === widget.getName()
    ) {
      const event = this._makeWidgetEvent(e, widget)
      const name = widget.getName()
      const chartStore = this._chart.getChartStore()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          if (widget.dispatchEvent('pressedMouseMoveEvent', event)) {
            event.preventDefault?.()
            chartStore.setCrosshair(undefined, { notInvalidate: true })
            this._chart.updatePane(UpdateLevel.Overlay)
            return true
          }
          if (this._touchCoordinate !== null) {
            event.preventDefault?.()
            chartStore.setCrosshair({ x: event.x, y: event.y, paneId: pane?.getId() })
          } else {
            // Claim the drag — without preventDefault a vertical-dominant
            // scroll-drag lets the browser scroll the page underneath the
            // gesture (or cancel it mid-flight) since no touch-action CSS
            // is guaranteed by hosts.
            event.preventDefault?.()
            this._processMainScrollingEvent(widget as Widget<DrawPane<YAxis>>, event)
          }
          return true
        }
        case WidgetNameConstants.X_AXIS: {
          event.preventDefault?.()
          return this._processXAxisScrollingEvent(widget as Widget<DrawPane<XAxis>>, event)
        }
        case WidgetNameConstants.Y_AXIS: {
          return this._processYAxisScalingEvent(widget as Widget<DrawPane<YAxis>>, event)
        }
      }
    }
    return false
  }

  touchEndEvent (e: MouseTouchEvent): boolean {
    const { widget } = this._findWidgetByEvent(e)
    // Same release routing as mouseUpEvent — touchend off-chart must still
    // close the gesture on a widget that can see the pressed overlay.
    const target = this._releaseTarget(widget)
    let consumed = false
    if (target !== null) {
      const event = this._makeWidgetEvent(e, target)
      const name = target.getName()
      switch (name) {
        case WidgetNameConstants.MAIN: {
          // Repaint when the release is consumed — the freehand tail point /
          // gesture commit written here must invalidate like the mouse path.
          if (target.dispatchEvent('mouseUpEvent', event)) {
            this._chart.updatePane(UpdateLevel.Overlay)
          }
          // Only a gesture that actually scrolled may fling — after a pinch
          // the tracked finger's release sits ~0ms from the re-anchor and
          // the pinch separation reads as a teleport velocity.
          if (this._startScrollCoordinate !== null && this._scrolledSinceAnchor) {
            const time = new Date().getTime() - this._flingStartTime
            const distance = event.x - this._startScrollCoordinate.x
            let v = distance / (time > 0 ? time : 1) * 20
            if (time < 200 && Math.abs(v) > 0) {
              const store = this._chart.getChartStore()
              const flingScroll: (() => void) = () => {
                this._flingScrollRequestId = requestAnimationFrame(() => {
                  store.startScroll()
                  store.scroll(v)
                  v = v * (1 - 0.025)
                  if (Math.abs(v) < 1) {
                    if (this._flingScrollRequestId !== null) {
                      cancelAnimationFrame(this._flingScrollRequestId)
                      this._flingScrollRequestId = null
                    }
                  } else {
                    flingScroll()
                  }
                })
              }
              flingScroll()
            }
          }
          consumed = true
          break
        }
        case WidgetNameConstants.SEPARATOR:
        case WidgetNameConstants.X_AXIS:
        case WidgetNameConstants.Y_AXIS: {
          consumed = target.dispatchEvent('mouseUpEvent', event)
          if (consumed) {
            this._chart.updatePane(UpdateLevel.Overlay)
          }
          break
        }
      }
    }
    // Cleanup must run on EVERY exit path — an early return that skips it
    // strands _startScrollCoordinate (phantom fling on the next tap) and
    // _mouseDownWidget (release-fallback pointing at a stale widget).
    this._startScrollCoordinate = null
    this._prevYAxisRange = null
    this._xAxisStartScaleCoordinate = null
    this._xAxisStartScaleDistance = 0
    this._xAxisScale = 1
    this._yAxisStartScaleDistance = 0
    this._mouseDownWidget = null
    return consumed
  }

  tapEvent (e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    let consumed = false
    if (widget !== null) {
      const event = this._makeWidgetEvent(e, widget)
      const result = widget.dispatchEvent('mouseClickEvent', event)
      if (widget.getName() === WidgetNameConstants.MAIN) {
        const event = this._makeWidgetEvent(e, widget)
        const chartStore = this._chart.getChartStore()
        if (result) {
          this._touchCancelCrosshair = true
          this._touchCoordinate = null
          chartStore.setCrosshair(undefined, { notInvalidate: true })
          consumed = true
        } else {
          if (!this._touchCancelCrosshair && !this._touchZoomed) {
            this._touchCoordinate = { x: event.x, y: event.y }
            chartStore.setCrosshair({ x: event.x, y: event.y, paneId: pane?.getId() }, { notInvalidate: true })
            consumed = true
          }
        }
        // The suppression flag only lives for THIS gesture — it is armed in
        // touchStart/overlay-tap and consulted here. Leaving it set after an
        // overlay tap would swallow the crosshair on the NEXT empty tap.
        this._touchCancelCrosshair = false
      }
      if (consumed || result) {
        this._chart.updatePane(UpdateLevel.Overlay)
      }
    }
    return consumed
  }

  doubleTapEvent (e: MouseTouchEvent): boolean {
    return this.mouseDoubleClickEvent(e)
  }

  longTapEvent (e: MouseTouchEvent): boolean {
    const { pane, widget } = this._findWidgetByEvent(e)
    if (widget !== null && widget.getName() === WidgetNameConstants.MAIN) {
      const event = this._makeWidgetEvent(e, widget)
      this._touchCoordinate = { x: event.x, y: event.y }
      this._chart.getChartStore().setCrosshair({ x: event.x, y: event.y, paneId: pane?.getId() })
      return true
    }
    return false
  }

  private _processMainScrollingEvent (widget: Widget<DrawPane<YAxis>>, event: MouseTouchEvent): void {
    if (this._startScrollCoordinate !== null) {
      const yAxis = widget.getPane().getAxisComponent()
      if (this._prevYAxisRange !== null && !yAxis.getAutoCalcTickFlag() && yAxis.scrollZoomEnabled) {
        event.preventDefault?.()
        const { from, to, range } = this._prevYAxisRange
        let distance = 0
        if (yAxis.reverse) {
          distance = this._startScrollCoordinate.y - event.y
        } else {
          distance = event.y - this._startScrollCoordinate.y
        }
        const bounding = widget.getBounding()
        const scale = distance / bounding.height
        const difRange = range * scale
        const newFrom = from + difRange
        const newTo = to + difRange
        const newRealFrom = yAxis.valueToRealValue(newFrom, { range: this._prevYAxisRange })
        const newRealTo = yAxis.valueToRealValue(newTo, { range: this._prevYAxisRange })
        const newDisplayFrom = yAxis.realValueToDisplayValue(newRealFrom, { range: this._prevYAxisRange })
        const newDisplayTo = yAxis.realValueToDisplayValue(newRealTo, { range: this._prevYAxisRange })
        yAxis.setRange({
          from: newFrom,
          to: newTo,
          range: newTo - newFrom,
          realFrom: newRealFrom,
          realTo: newRealTo,
          realRange: newRealTo - newRealFrom,
          displayFrom: newDisplayFrom,
          displayTo: newDisplayTo,
          displayRange: newDisplayTo - newDisplayFrom
        })
      }
      const distance = event.x - this._startScrollCoordinate.x
      if (distance !== 0) {
        this._scrolledSinceAnchor = true
      }
      this._chart.getChartStore().scroll(distance)
    }
  }

  private _processXAxisScrollStartEvent (widget: Widget, event: MouseTouchEvent): boolean {
    const consumed = widget.dispatchEvent('mouseDownEvent', event)
    if (consumed) {
      this._chart.updatePane(UpdateLevel.Overlay)
      return true
    }
    // Arm the scale anchor only for an unconsumed press — a consumed
    // overlay-figure press that loses its slot mid-gesture would otherwise
    // zoom the axis by the total displacement on the next move.
    this._xAxisStartScaleCoordinate = { x: event.x, y: event.y }
    this._xAxisStartScaleDistance = event.pageX
    return consumed
  }

  private _processXAxisScrollingEvent (widget: Widget<DrawPane<XAxis>>, event: MouseTouchEvent): boolean {
    const consumed = widget.dispatchEvent('pressedMouseMoveEvent', event)
    if (!consumed) {
      const xAxis = widget.getPane().getAxisComponent()
      if (xAxis.scrollZoomEnabled && this._xAxisStartScaleDistance !== 0) {
        const scale = this._xAxisStartScaleDistance / event.pageX
        if (Number.isFinite(scale)) {
          const zoomScale = (scale - this._xAxisScale) * 10
          this._xAxisScale = scale
          this._chart.getChartStore().zoom(zoomScale, this._xAxisStartScaleCoordinate, 'xAxis')
        }
      }
    } else {
      this._chart.updatePane(UpdateLevel.Overlay)
    }
    return consumed
  }

  private _processYAxisWheelScaleEvent (widget: Widget<DrawPane<YAxis>>, scale: number): boolean {
    const yAxis = widget.getPane().getAxisComponent()
    if (!yAxis.scrollZoomEnabled) {
      return false
    }
    const range = yAxis.getRange()
    // scale > 0 (wheel up) → multiplier < 1 → zoom IN (narrower price range)
    // scale < 0 (wheel down) → multiplier > 1 → zoom OUT (broader price range)
    const multiplier = 1 - scale * 0.08
    const newRange = range.range * multiplier
    const difRange = (newRange - range.range) / 2
    const newFrom = range.from - difRange
    const newTo = range.to + difRange
    const newRealFrom = yAxis.valueToRealValue(newFrom, { range })
    const newRealTo = yAxis.valueToRealValue(newTo, { range })
    const newDisplayFrom = yAxis.realValueToDisplayValue(newRealFrom, { range })
    const newDisplayTo = yAxis.realValueToDisplayValue(newRealTo, { range })
    yAxis.setRange({
      from: newFrom,
      to: newTo,
      range: newRange,
      realFrom: newRealFrom,
      realTo: newRealTo,
      realRange: newRealTo - newRealFrom,
      displayFrom: newDisplayFrom,
      displayTo: newDisplayTo,
      displayRange: newDisplayTo - newDisplayFrom
    })
    this._chart.layout({
      measureWidth: true,
      update: true,
      buildYAxisTick: true
    })
    return true
  }

  private _processYAxisScaleStartEvent (widget: Widget<DrawPane<YAxis>>, event: MouseTouchEvent): boolean {
    const consumed = widget.dispatchEvent('mouseDownEvent', event)
    if (consumed) {
      this._chart.updatePane(UpdateLevel.Overlay)
      return true
    }
    // Same consumed-press guard as the x-axis — an overlay press must not
    // arm the scale anchor.
    const range = widget.getPane().getAxisComponent().getRange()
    this._prevYAxisRange = { ...range }
    this._yAxisStartScaleDistance = event.pageY
    return consumed
  }

  private _processYAxisScalingEvent (widget: Widget<DrawPane<YAxis>>, event: MouseTouchEvent): boolean {
    const consumed = widget.dispatchEvent('pressedMouseMoveEvent', event)
    if (!consumed) {
      // Claim every Y-axis drag, not just armed-scale drags — otherwise a
      // touch drag with scrollZoomEnabled=false scrolls the page mid-gesture
      // (X_AXIS prevents unconditionally).
      event.preventDefault?.()
      const yAxis = widget.getPane().getAxisComponent()
      if (this._prevYAxisRange !== null && yAxis.scrollZoomEnabled && this._yAxisStartScaleDistance !== 0) {
        const { from, to, range } = this._prevYAxisRange
        const scale = event.pageY / this._yAxisStartScaleDistance
        // pageY can hit 0 or go negative when the drag leaves the viewport —
        // a non-positive/NaN scale collapses or flips the axis range.
        if (!isNumber(scale) || scale <= 0) {
          return consumed
        }
        const newRange = range * scale
        const difRange = (newRange - range) / 2
        const newFrom = from - difRange
        const newTo = to + difRange
        const newRealFrom = yAxis.valueToRealValue(newFrom, { range: this._prevYAxisRange })
        const newRealTo = yAxis.valueToRealValue(newTo, { range: this._prevYAxisRange })
        const newDisplayFrom = yAxis.realValueToDisplayValue(newRealFrom, { range: this._prevYAxisRange })
        const newDisplayTo = yAxis.realValueToDisplayValue(newRealTo, { range: this._prevYAxisRange })
        yAxis.setRange({
          from: newFrom,
          to: newTo,
          range: newRange,
          realFrom: newRealFrom,
          realTo: newRealTo,
          realRange: newRealTo - newRealFrom,
          displayFrom: newDisplayFrom,
          displayTo: newDisplayTo,
          displayRange: newDisplayTo - newDisplayFrom
        })
        this._chart.layout({
          measureWidth: true,
          update: true,
          buildYAxisTick: true
        })
      }
    } else {
      this._chart.updatePane(UpdateLevel.Overlay)
    }
    return consumed
  }

  /**
   * The widget a pointer release should be delivered to. A pressed overlay
   * always releases on a widget that can see overlay views — a gesture that
   * began on a separator (which hosts none) would strand the pressed slot, so
   * route to the pressed pane's main widget instead. Without a pressed
   * overlay the release goes to the widget under the pointer, falling back
   * to where the gesture started so off-chart releases still close gestures.
   */
  private _releaseTarget (widget: Nullable<Widget>): Nullable<Widget> {
    const pressedInfo = this._chart.getChartStore().getPressedOverlayInfo()
    if (pressedInfo.overlay !== null) {
      if (
        this._mouseDownWidget !== null &&
        this._mouseDownWidget.getName() !== WidgetNameConstants.SEPARATOR
      ) {
        return this._mouseDownWidget
      }
      return this._chart.getDrawPaneById(pressedInfo.paneId)?.getMainWidget() ?? this._mouseDownWidget ?? widget
    }
    // A separator drag keeps its own lifecycle — releasing over a draw pane
    // must still reach SeparatorWidget.mouseUpEvent or _dragFlag stays armed
    // and the separator leaks its active styling forever.
    if (this._mouseDownWidget?.getName() === WidgetNameConstants.SEPARATOR) {
      return this._mouseDownWidget
    }
    return widget ?? this._mouseDownWidget
  }

  private _findWidgetByEvent (event: MouseTouchEvent): EventTriggerWidgetInfo {
    const { x, y } = event
    const separatorPanes = this._chart.getSeparatorPanes()
    const separatorSize = this._chart.getStyles().separator.size
    for (const items of separatorPanes) {
      const pane = items[1]
      const bounding = pane.getBounding()
      const top = bounding.top - Math.round((REAL_SEPARATOR_HEIGHT - separatorSize) / 2)
      if (
        x >= bounding.left && x <= bounding.left + bounding.width &&
        y >= top && y <= top + REAL_SEPARATOR_HEIGHT
      ) {
        return { pane, widget: pane.getWidget() }
      }
    }

    const drawPanes = this._chart.getDrawPanes()

    let pane: Nullable<DrawPane> = null
    for (const p of drawPanes) {
      const bounding = p.getBounding()
      if (
        x >= bounding.left && x <= bounding.left + bounding.width &&
        y >= bounding.top && y <= bounding.top + bounding.height
      ) {
        pane = p
        break
      }
    }
    let widget: Nullable<Widget> = null
    if (pane !== null) {
      if (!isValid(widget)) {
        const mainWidget = pane.getMainWidget()
        const mainBounding = mainWidget.getBounding()
        if (
          x >= mainBounding.left && x <= mainBounding.left + mainBounding.width &&
          y >= mainBounding.top && y <= mainBounding.top + mainBounding.height
        ) {
          widget = mainWidget
        }
      }
      if (!isValid(widget)) {
        const yAxisWidget = pane.getYAxisWidget()
        if (yAxisWidget !== null) {
          const yAxisBounding = yAxisWidget.getBounding()
          if (
            x >= yAxisBounding.left && x <= yAxisBounding.left + yAxisBounding.width &&
            y >= yAxisBounding.top && y <= yAxisBounding.top + yAxisBounding.height
          ) {
            widget = yAxisWidget
          }
        }
      }
    }
    return { pane, widget }
  }

  private _makeWidgetEvent (event: MouseTouchEvent, widget: Nullable<Widget>): MouseTouchEvent {
    const bounding = widget?.getBounding() ?? null
    return {
      ...event,
      x: event.x - (bounding?.left ?? 0),
      y: event.y - (bounding?.top ?? 0)
    }
  }

  destroy (): void {
    this._container.removeEventListener('keydown', this._boundKeyBoardDownEvent)
    // A fling raf outliving destroy would scroll/update a torn-down chart.
    if (this._flingScrollRequestId !== null) {
      cancelAnimationFrame(this._flingScrollRequestId)
      this._flingScrollRequestId = null
    }
    this._mouseDownWidget = null
    this._event.destroy()
  }
}
