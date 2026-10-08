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
import type DeepPartial from '../common/DeepPartial'
import type ExcludePickPartial from '../common/ExcludePickPartial'
import type Point from '../common/Point'
import type Coordinate from '../common/Coordinate'
import type Bounding from '../common/Bounding'
import type { OverlayStyle } from '../common/Styles'
import type { MouseTouchEvent } from '../common/EventHandler'
import { clone, isArray, isBoolean, isFunction, isNumber, isString, isValid, merge } from '../common/utils/typeChecks'

import type { XAxis } from './XAxis'
import type { YAxis } from './YAxis'
import type ChartStore from '../Store'
import type { Chart } from '../Chart'

export type OverlayMode = 'normal' | 'weak_magnet' | 'strong_magnet'

export interface OverlayPerformEventParams {
  currentStep: number
  mode: OverlayMode
  points: Array<Partial<Point>>
  performPointIndex: number
  performPoint: Partial<Point>
  prevPoints: Array<Partial<Point>>
  /** Key of the figure that triggered the drag (from OverlayFigure.key) */
  figureKey?: string
  /**
   * Raw mouse/touch event for the move — carries modifier keys so templates
   * can implement Shift-snapping, axis locks and clone drags.
   * Absent during restore/replay (override-driven perform calls).
   */
  event?: Partial<MouseTouchEvent>
}

export interface OverlayEventCollection<E> {
  onDrawStart: Nullable<OverlayEventCallback<E>>
  onDrawing: Nullable<OverlayEventCallback<E>>
  onDrawEnd: Nullable<OverlayEventCallback<E>>
  onRemoved: Nullable<OverlayEventCallback<E>>
  onClick: Nullable<OverlayEventCallback<E>>
  onDoubleClick: Nullable<OverlayEventCallback<E>>
  onRightClick: Nullable<OverlayEventCallback<E>>
  onPressedMoveStart: Nullable<OverlayEventCallback<E>>
  onPressedMoving: Nullable<OverlayEventCallback<E>>
  onPressedMoveEnd: Nullable<OverlayEventCallback<E>>
  onMouseMove: Nullable<OverlayEventCallback<E>>
  onMouseEnter: Nullable<OverlayEventCallback<E>>
  onMouseLeave: Nullable<OverlayEventCallback<E>>
  onSelected: Nullable<OverlayEventCallback<E>>
  onDeselected: Nullable<OverlayEventCallback<E>>
}

export function checkOverlayFigureEvent (
  targetEventType: keyof Omit<OverlayEventCollection<unknown>, 'onDrawStart' | 'onDrawing' | 'onDrawEnd' | 'onRemoved'>,
  figure: Nullable<OverlayFigure>
): boolean {
  const ignoreEvent = figure?.ignoreEvent ?? false
  if (isBoolean(ignoreEvent)) {
    return !ignoreEvent
  }
  return !ignoreEvent.includes(targetEventType)
}

export type OverlayFigureMoveDirection = 'both' | 'horz' | 'vert'

/**
 * Pixel-space axis-aligned rect a figure may declare for viewport culling.
 * Opt-in — figures without bounds are never culled.
 */
export interface OverlayFigureBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayFigure {
  key?: string
  type: string
  attrs: unknown
  styles?: unknown
  ignoreEvent?: boolean | Array<keyof Omit<OverlayEventCollection<unknown>, 'onDrawStart' | 'onDrawing' | 'onDrawEnd' | 'onRemoved'>>
  /**
   * When set, this custom figure behaves like a control point with the given index.
   * Dragging it will call eventPressedPointMove(point, pointIndex) instead of eventPressedOtherMove.
   */
  pointIndex?: number
  /**
   * Axis constraint applied when this figure is dragged: 'horz' keeps the
   * dragged value (y) unchanged, 'vert' keeps the dragged time/index (x)
   * unchanged. Mirrors TradingView's PossibleMovingDirections.
   */
  moveDirection?: OverlayFigureMoveDirection
  /**
   * Custom CSS cursor when hovering over this figure.
   * Defaults to 'pointer' if not set.
   */
  cursor?: string
  /**
   * Declared pixel-space bounds — used by the drawings viewport-cull
   * pipeline to skip off-screen figures. Optional.
   */
  bounds?: OverlayFigureBounds
}

export interface OverlayCreateFiguresCallbackParams<E> {
  chart: Chart
  overlay: Overlay<E>
  /**
   * Point positions converted to pane-local CSS pixels — same space that
   * figure `attrs` are drawn in. NOT device pixels (DPR scaling is applied
   * by the view) and NOT data values.
   */
  coordinates: Coordinate[]
  /**
   * The pane's visible rect in CSS pixels (`width`/`height` only — the
   * origin is always the pane's top-left). Use for viewport culling, not
   * for positioning: figure attrs are already pane-local.
   */
  bounding: Bounding
  xAxis: Nullable<XAxis>
  yAxis: Nullable<YAxis>
  /**
   * Whether the overlay is currently selected (clicked). Templates use this
   * to render selection anchors / control handles instead of reaching into
   * internal store state.
   */
  isSelected?: boolean
  /**
   * Whether the pointer is currently hovering over the overlay.
   */
  isHovered?: boolean
  /**
   * `key` of the figure currently under the pointer, if the pointer is over
   * a figure of this overlay. Lets templates render per-anchor hover rings.
   */
  hoveredFigureKey?: string
}

export interface OverlayEvent<E> extends Partial<MouseTouchEvent> {
  figure?: OverlayFigure
  overlay: Overlay<E>
  chart: Chart
}

export type OverlayEventCallback<E> = (event: OverlayEvent<E>) => void

export type OverlayCreateFiguresCallback<E> = (params: OverlayCreateFiguresCallbackParams<E>) => OverlayFigure | OverlayFigure[]

export interface Overlay<E = unknown> extends OverlayEventCollection<E> {
  /**
   * Unique identification
   */
  id: string

  /**
   * Group id
   */
  groupId: string

  /**
   * Pane id
   */
  paneId: string

  /**
   * Name
   */
  name: string

  /**
   * Total number of steps required to complete mouse operation
   */
  totalStep: number

  /**
   * Current step
   */
  currentStep: number

  /**
   * Whether it is locked. Locked overlays skip ALL pointer interaction —
   * no hover, no press/drag, no freehand stroke, no anchor figures. They
   * still render and are still selectable via API (TradingView shows a
   * non-interactive selection outline instead of anchors).
   */
  lock: boolean

  /**
   * Whether the overlay is a ghost (mirror of an overlay being drawn on
   * another chart). Ghosts render in the normal overlay list even while
   * incomplete, never occupy the drawing-progress slot, and are locked.
   */
  ghost: boolean

  /**
   * Transient overlays render and interact normally but are excluded from
   * persistence, undo history, and drawings.list() — e.g. the measure
   * ruler, which vanishes on deselect by design.
   */
  transient?: boolean

  /**
   * Whether the overlay was mirrored onto this chart by a chart-sync layer
   * (as opposed to created by this chart's own user/persistence). Hosts can
   * use this to skip duplicate persistence/history bookkeeping for mirrors.
   */
  synced: boolean

  /**
   * Host-set directive: when true, chart-sync layers must not propagate this
   * overlay's lifecycle events (e.g. `remove` during a symbol-switch wipe)
   * to peer charts. Never serialized onto mirrors.
   */
  suppressSync?: boolean

  /**
   * Per-call `override()` directive: skip the `performEventMoveForDrawing`
   * replay loop. Callers passing already-normalized points (sync mirrors)
   * use this to avoid O(points) step replays on unbounded-step overlays.
   * Never persisted onto the instance.
   */
  skipDrawReplay?: boolean

  /**
   * Set by the sync engine on a peer overlay right before it is removed on
   * behalf of the source chart. Host `onRemoved` handlers use it to
   * distinguish a remote-originated removal (skip the shared-store delete —
   * the owner already deleted it) from a user deleting a synced mirror
   * (the shared entry must go).
   */
  syncRemoved?: boolean

  /**
   * Whether the overlay is visible
   */
  visible: boolean

  /**
   * Draw level
   */
  zLevel: number

  /**
   * Whether the default figure corresponding to the point is required
   */
  needDefaultPointFigure: boolean

  /**
   * Whether the default figure on the Y axis is required
   */
  needDefaultXAxisFigure: boolean

  /**
   * Whether the default figure on the X axis is required
   */
  needDefaultYAxisFigure: boolean

  /**
   * Mode
   */
  mode: OverlayMode

  /**
   * When mode is weak_magnet is the response distance
   */
  modeSensitivity: number

  /**
   * Time and value information
   */
  points: Array<Partial<Point>>

  /**
   * Extended Data
   */
  extendData: E

  /**
   * The style information and format are consistent with the overlay in the unified configuration
   */
  styles: Nullable<DeepPartial<OverlayStyle>>

  /**
   * Create figures corresponding to points
   */
  createPointFigures: Nullable<OverlayCreateFiguresCallback<E>>

  /**
   * Create figures on the Y axis
   */
  createXAxisFigures: Nullable<OverlayCreateFiguresCallback<E>>

  /**
   * Create figures on the X axis
   */
  createYAxisFigures: Nullable<OverlayCreateFiguresCallback<E>>

  /**
   * Special handling callbacks when pressing events
   */
  performEventPressedMove: Nullable<(params: OverlayPerformEventParams) => void>

  /**
   * Whole-body translate hook — fired while a non-point figure (e.g. a
   * midpoint handle) drags the overlay, AFTER the kernel has applied the
   * axis-constrained point diff. Templates use it to maintain derived
   * extendData during body moves and to read `event` modifier keys (e.g.
   * Shift → 45° snap). performPointIndex/performPoint are omitted — they
   * are meaningless for a translate.
   */
  performEventBodyMove: Nullable<(params: Omit<OverlayPerformEventParams, 'performPointIndex' | 'performPoint'>) => void>

  /**
   * In drawing, special handling callback when moving events
   */
  performEventMoveForDrawing: Nullable<(params: OverlayPerformEventParams) => void>

  /**
   * Whether the overlay is still in its drawing steps
   */
  isDrawing: () => boolean

  /**
   * Whether no point has been committed yet
   */
  isStart: () => boolean

  /**
   * Finish the remaining drawing steps immediately (e.g. unlimited-step tools
   * like path/polyline completing on Esc or double-click).
   */
  forceComplete: () => void

  /**
   * Freehand drawing mode (brush/highlighter/measure): the overlay collects
   * points while the pointer is PRESSED instead of per click. Mouse-down
   * starts the stroke, moves append points (decimated by
   * `freehandMinDistance`), mouse-up force-completes.
   */
  freehand?: boolean

  /**
   * Minimum pointer distance (px) between appended points in freehand mode.
   * Default 4.
   */
  freehandMinDistance?: number

  /**
   * Figure-cache revision — bumped by override() whenever styles/extendData
   * change and by invalidateFigures(). The drawings subsystem's figure cache
   * keys on this; templates MUST NOT write it.
   */
  readonly figuresRev: number

  /**
   * Invalidate the cached figure result — call after mutating extendData in
   * place (inside performEvent* callbacks) when using the drawings figure
   * cache wrapper.
   */
  invalidateFigures: () => void
}

export type OverlayTemplate<E = unknown> = ExcludePickPartial<Omit<Overlay<E>, 'id' | 'groupId' | 'paneId' | 'points' | 'currentStep' | 'isDrawing' | 'isStart' | 'forceComplete' | 'invalidateFigures' | 'figuresRev'>, 'name'>

export type OverlayCreate<E = unknown> = ExcludePickPartial<Omit<Overlay<E>, 'currentStep' | 'totalStep' | 'createPointFigures' | 'createXAxisFigures' | 'createYAxisFigures' | 'performEventPressedMove' | 'performEventBodyMove' | 'performEventMoveForDrawing' | 'isDrawing' | 'isStart' | 'forceComplete' | 'invalidateFigures' | 'figuresRev'>, 'name'>
export type OverlayOverride<E = unknown> = Partial<Omit<Overlay<E>, 'currentStep' | 'totalStep' | 'createPointFigures' | 'createXAxisFigures' | 'createYAxisFigures' | 'performEventPressedMove' | 'performEventBodyMove' | 'performEventMoveForDrawing' | 'isDrawing' | 'isStart' | 'forceComplete' | 'invalidateFigures' | 'figuresRev'>>

/**
 * Lifecycle stream emitted through the `onOverlayChange` action.
 * `create`   — an overlay was created (armed for drawing or already finished).
 * `progress` — points changed while drawing or while a point/figure is dragged.
 * `update`   — an existing overlay was overridden via overrideOverlay.
 * `remove`   — an overlay was removed (also fires for cancelled drawings).
 * `drawEnd`  — the progress overlay finished its last step and was committed.
 * `select`/`deselect` — click-selection changed.
 * `editStart`/`editEnd` — a point/figure drag gesture bracketed. Consumers
 *             use the pair as the commit boundary for undo and persistence
 *             (one gesture = one commit, not one commit per progress event).
 */
export type OverlayChangeEventType = 'create' | 'progress' | 'update' | 'remove' | 'drawEnd' | 'select' | 'deselect' | 'editStart' | 'editEnd'

export interface OverlayChangeEvent<E = unknown> {
  type: OverlayChangeEventType
  overlay: Overlay<E>
}

export type OverlayFilter<E = unknown> = Partial<Pick<Overlay<E>, 'id' | 'groupId' | 'name' | 'paneId'>>

export type OverlayInnerConstructor<E = unknown> = new () => OverlayImp<E>
export type OverlayConstructor<E = unknown> = new () => Overlay<E>

const OVERLAY_DRAW_STEP_START = 1
const OVERLAY_DRAW_STEP_FINISHED = -1

function safeStylesJson (styles: unknown): string {
  try {
    return JSON.stringify(styles ?? null)
  } catch {
    // Sentinel that never matches a real snapshot — unserializable styles
    // force a redraw rather than being silently dropped.
    return '__unserializable__'
  }
}

export const OVERLAY_ID_PREFIX = 'overlay_'

export const OVERLAY_FIGURE_KEY_PREFIX = 'overlay_figure_'

export default class OverlayImp<E = unknown> implements Overlay<E> {
  id: string
  groupId = ''
  paneId: string
  name: string
  totalStep = 1
  currentStep = OVERLAY_DRAW_STEP_START
  lock = false
  ghost = false

  transient = false

  synced = false
  visible = true
  zLevel = 0
  needDefaultPointFigure = false
  needDefaultXAxisFigure = false
  needDefaultYAxisFigure = false
  mode: OverlayMode = 'normal'
  modeSensitivity = 8
  points: Array<Partial<Point>> = []
  extendData: E
  styles: Nullable<DeepPartial<OverlayStyle>> = null
  createPointFigures: Nullable<OverlayCreateFiguresCallback<E>> = null
  createXAxisFigures: Nullable<OverlayCreateFiguresCallback<E>> = null
  createYAxisFigures: Nullable<OverlayCreateFiguresCallback<E>> = null
  performEventPressedMove: Nullable<(params: OverlayPerformEventParams) => void> = null

  performEventBodyMove: Nullable<(params: Omit<OverlayPerformEventParams, 'performPointIndex' | 'performPoint'>) => void> = null
  performEventMoveForDrawing: Nullable<(params: OverlayPerformEventParams) => void> = null
  onDrawStart: Nullable<OverlayEventCallback<E>> = null
  onDrawing: Nullable<OverlayEventCallback<E>> = null
  onDrawEnd: Nullable<OverlayEventCallback<E>> = null
  onClick: Nullable<OverlayEventCallback<E>> = null
  onDoubleClick: Nullable<OverlayEventCallback<E>> = null
  onRightClick: Nullable<OverlayEventCallback<E>> = null
  onPressedMoveStart: Nullable<OverlayEventCallback<E>> = null
  onPressedMoving: Nullable<OverlayEventCallback<E>> = null
  onPressedMoveEnd: Nullable<OverlayEventCallback<E>> = null
  onMouseMove: Nullable<OverlayEventCallback<E>> = null
  onMouseEnter: Nullable<OverlayEventCallback<E>> = null
  onMouseLeave: Nullable<OverlayEventCallback<E>> = null
  onRemoved: Nullable<OverlayEventCallback<E>> = null
  onSelected: Nullable<OverlayEventCallback<E>> = null
  onDeselected: Nullable<OverlayEventCallback<E>> = null

  freehand = false
  freehandMinDistance = 4

  // Plain field (not a getter) — merge() assigns source props directly, so a
  // getter-only accessor would throw if a caller ever passes figuresRev in.
  figuresRev = 0

  invalidateFigures (): void { this.figuresRev++ }

  private _prevZLevel = 0

  private _prevOverlay: Pick<Overlay<E>, 'zLevel' | 'visible' | 'points' | 'extendData'> & { stylesJson?: string }

  private _prevPressedPoint: Nullable<Partial<Point>> = null
  private _prevPressedPoints: Array<Partial<Point>> = []

  constructor (overlay: OverlayTemplate<E>) {
    this.override(overlay)
  }

  override (overlay: Partial<Overlay<E>>): void {
    // Snapshot only the fields shouldUpdate() compares — a deep clone of the
    // whole overlay here used to dominate the drag/sync hot path. styles are
    // compared by value (JSON) because override() merges them in place —
    // a same-reference compare would silently drop style-only updates.
    // stringify can throw on non-serializable values (BigInt, throwing
    // toJSON) — fall back to a reference sentinel so override never throws.
    // Styles JSON is captured ONLY when the incoming override carries styles;
    // drag/point overrides skip both stringifies entirely.
    const stylesJson = isValid(overlay.styles) ? safeStylesJson(this.styles) : undefined
    this._prevOverlay = {
      zLevel: this.zLevel,
      visible: this.visible,
      points: this.points.map(p => ({ ...p })),
      extendData: this.extendData,
      stylesJson
    }

    const {
      id,
      name,
      currentStep: _,
      points,
      styles,
      extendData,
      skipDrawReplay,
      // Kernel-owned members must never be merge-clobbered by a spread of
      // an overlay snapshot (regressed figuresRev poisons the figure cache;
      // shadowed methods break the instance; restored _prev* snapshots make
      // shouldUpdate() compare against a foreign baseline and drop real
      // changes).
      figuresRev: _fr,
      invalidateFigures: _inf,
      isDrawing: _d,
      isStart: _s,
      forceComplete: _fc,
      _prevOverlay: _po,
      _prevPressedPoint: _pp,
      _prevPressedPoints: _pps,
      _prevZLevel: _pz,
      ...others
    } = overlay as Partial<Overlay<E>> & {
      _prevOverlay?: unknown
      _prevPressedPoint?: unknown
      _prevPressedPoints?: unknown
      _prevZLevel?: unknown
    }

    merge(this, others)

    // Handle extendData separately — always produce a mutable merged result
    // (frozen objects from Immer/store and their sub-objects cannot be mutated)
    if (isValid(extendData)) {
      if (isValid(this.extendData)) {
        // Clone existing first to ensure all sub-objects are mutable, then merge new values
        this.extendData = clone(this.extendData)
        merge(this.extendData, extendData)
      } else {
        this.extendData = clone(extendData)
      }
      this.figuresRev++
    }

    if (!isString(this.name)) {
      this.name = name ?? ''
    }

    if (!isString(this.id) && isString(id)) {
      this.id = id
    }

    if (isValid(styles)) {
      if (this.styles == null || Object.isFrozen(this.styles)) {
        this.styles = clone(styles)
      } else {
        merge(this.styles, styles)
      }
      this.figuresRev++
    }

    if (isArray(points) && points.length > 0) {
      let repeatTotalStep = 0
      this.points = [...points]
      if (points.length >= this.totalStep - 1) {
        this.currentStep = OVERLAY_DRAW_STEP_FINISHED
        repeatTotalStep = this.totalStep - 1
      } else {
        this.currentStep = points.length + 1
        repeatTotalStep = points.length
      }
      // Prevent wrong drawing due to wrong points
      if (isFunction(this.performEventMoveForDrawing) && skipDrawReplay !== true) {
        for (let i = 0; i < repeatTotalStep; i++) {
          this.performEventMoveForDrawing({
            currentStep: i + 2,
            mode: this.mode,
            points: this.points,
            performPointIndex: i,
            performPoint: this.points[i],
            prevPoints: this._prevPressedPoints
          })
        }
      }

      if (this.currentStep === OVERLAY_DRAW_STEP_FINISHED) {
        this.performEventPressedMove?.({
          currentStep: this.currentStep,
          mode: this.mode,
          points: this.points,
          performPointIndex: this.points.length - 1,
          performPoint: this.points[this.points.length - 1],
          prevPoints: this._prevPressedPoints
        })
      }
    }
  }

  getPrevZLevel (): number { return this._prevZLevel }

  setPrevZLevel (zLevel: number): void { this._prevZLevel = zLevel }

  shouldUpdate (): { draw: boolean, sort: boolean } {
    const sort = this._prevOverlay.zLevel !== this.zLevel
    // Field-wise compare — JSON.stringify(points) twice per override was the
    // hot-path bottleneck during drag/draw bursts (O(N) serialization + allocs).
    const prevPoints = this._prevOverlay.points
    const points = this.points
    let pointsChanged = prevPoints.length !== points.length
    if (!pointsChanged) {
      for (let i = 0; i < points.length; i++) {
        const prev = prevPoints[i]
        const curr = points[i]
        if (
          prev.timestamp !== curr.timestamp ||
          prev.value !== curr.value ||
          prev.dataIndex !== curr.dataIndex
        ) {
          pointsChanged = true
          break
        }
      }
    }
    const prevStylesJson = this._prevOverlay.stylesJson
    const stylesChanged = prevStylesJson !== undefined && prevStylesJson !== safeStylesJson(this.styles)
    const draw = sort ||
      pointsChanged ||
      this._prevOverlay.visible !== this.visible ||
      this._prevOverlay.extendData !== this.extendData ||
      stylesChanged

    return { sort, draw }
  }

  nextStep (): void {
    if (this.currentStep === this.totalStep - 1) {
      this.currentStep = OVERLAY_DRAW_STEP_FINISHED
    } else {
      this.currentStep++
    }
  }

  forceComplete (): void {
    this.currentStep = OVERLAY_DRAW_STEP_FINISHED
  }

  isDrawing (): boolean {
    return this.currentStep !== OVERLAY_DRAW_STEP_FINISHED
  }

  isStart (): boolean {
    return this.currentStep === OVERLAY_DRAW_STEP_START
  }

  eventMoveForDrawing (point: Partial<Point>, event?: Partial<MouseTouchEvent>): void {
    const pointIndex = this.currentStep - 1
    const newPoint: Partial<Point> = {}
    if (isNumber(point.timestamp)) {
      newPoint.timestamp = point.timestamp
    }
    if (isNumber(point.dataIndex)) {
      newPoint.dataIndex = point.dataIndex
    }
    if (isNumber(point.value)) {
      newPoint.value = point.value
    }
    this.points[pointIndex] = newPoint
    this.performEventMoveForDrawing?.({
      currentStep: this.currentStep,
      mode: this.mode,
      points: this.points,
      performPointIndex: pointIndex,
      performPoint: newPoint,
      prevPoints: this._prevPressedPoints,
      event
    })
  }

  eventPressedPointMove (point: Partial<Point>, pointIndex: number, figureKey?: string, moveDirection?: OverlayFigureMoveDirection, event?: Partial<MouseTouchEvent>): void {
    if (pointIndex >= this.points.length) {
      while (this.points.length <= pointIndex) {
        this.points.push({})
      }
    }
    // PossibleMovingDirections constraint (TradingView parity): a 'horz'
    // figure drags horizontally only — keep the point's value; 'vert' keeps
    // its time/index. Applied BEFORE assignment so performEventPressedMove
    // sees the constrained point.
    if (moveDirection === 'horz') {
      point = { ...point, value: this.points[pointIndex].value }
    } else if (moveDirection === 'vert') {
      point = {
        ...point,
        timestamp: this.points[pointIndex].timestamp,
        dataIndex: this.points[pointIndex].dataIndex
      }
    }
    this.points[pointIndex].timestamp = point.timestamp
    if (isNumber(point.dataIndex)) {
      this.points[pointIndex].dataIndex = point.dataIndex
    }
    if (isNumber(point.value)) {
      this.points[pointIndex].value = point.value
    }
    this.performEventPressedMove?.({
      currentStep: this.currentStep,
      points: this.points,
      mode: this.mode,
      performPointIndex: pointIndex,
      performPoint: this.points[pointIndex],
      prevPoints: this._prevPressedPoints,
      figureKey,
      event
    })
  }

  startPressedMove (point: Partial<Point>): void {
    this._prevPressedPoint = { ...point }
    this._prevPressedPoints = clone(this.points)
  }

  eventPressedOtherMove (point: Partial<Point>, chartStore: ChartStore, moveDirection?: OverlayFigureMoveDirection, figureKey?: string, event?: MouseTouchEvent): void {
    if (this._prevPressedPoint !== null) {
      let difDataIndex: Nullable<number> = null
      if (moveDirection !== 'vert' && isNumber(point.dataIndex) && isNumber(this._prevPressedPoint.dataIndex)) {
        difDataIndex = point.dataIndex - this._prevPressedPoint.dataIndex
      }
      let difValue: Nullable<number> = null
      if (moveDirection !== 'horz' && isNumber(point.value) && isNumber(this._prevPressedPoint.value)) {
        difValue = point.value - this._prevPressedPoint.value
      }
      this.points = this._prevPressedPoints.map(p => {
        if (isNumber(p.timestamp)) {
          p.dataIndex = chartStore.timestampToDataIndex(p.timestamp)
        }
        const newPoint = { ...p }
        if (isNumber(difDataIndex) && isNumber(p.dataIndex)) {
          newPoint.dataIndex = p.dataIndex + difDataIndex
          newPoint.timestamp = chartStore.dataIndexToTimestamp(newPoint.dataIndex) ?? undefined
        }
        if (isNumber(difValue) && isNumber(p.value)) {
          newPoint.value = p.value + difValue
        }
        return newPoint
      })
      this.performEventBodyMove?.({
        currentStep: this.currentStep,
        points: this.points,
        mode: this.mode,
        prevPoints: this._prevPressedPoints,
        figureKey,
        event
      })
    }
  }

  static extend<E = unknown> (template: OverlayTemplate<E>): OverlayInnerConstructor<E> {
    class Custom extends OverlayImp<E> {
      constructor () {
        super(template)
      }
    }
    return Custom
  }
}
