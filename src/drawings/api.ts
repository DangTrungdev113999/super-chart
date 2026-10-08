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

import type Nullable from '../common/Nullable'
import type Point from '../common/Point'
import type { KLineData } from '../common/Data'
import { logWarn } from '../common/utils/logger'
import { isArray, isString, isNumber, isValid } from '../common/utils/typeChecks'
import type Chart from '../Chart'
import type { Overlay, OverlayCreate } from '../component/Overlay'
import { getOverlayTemplate } from '../extension/overlay/index'

import { createDrawingManager, type DrawingManager, type DrawingManagerOptions } from './manager'
import { getDrawingCatalog, findCatalogItem, findCatalogItemByHotkey, type DrawingToolGroup } from './catalog'
import type { DrawingStore } from './persistence'
import { serializeOverlay, serializedToOverlayCreate, type SerializedDrawing, type SerializedDrawingPoint } from './serialize'
import { attachFloatingToolbar, type FloatingToolbar, type FloatingToolbarHooks } from './ui/floatingToolbar'
import { attachSettingsDialog, type SettingsDialog } from './ui/settingsDialog'
import { closeTextEditorSessions } from './editor/overlayTextEditor'
import { bindDrawingKeyboard } from './interaction/keyboard'

/**
 * `chart.drawings` — the public facade over the drawing subsystem.
 *
 * Wraps the DrawingManager (observe + shadow + history + persistence) with
 * the catalog registry and a semantic/AI-friendly create surface. Hosts use
 * `catalog()` to render toolbars; automation uses `addLine`/`addHLine`/
 * `addZone`/`addFibRetracement` (correct point contracts built in) or the
 * validating `create()` for arbitrary tools.
 */

/** ms timestamp (number) or ISO-8601 string — normalized to ms internally. */
export type DrawingTimeInput = number | string

export interface DrawingPointInput {
  time?: DrawingTimeInput
  dataIndex?: number
  value?: number
}

export type DrawingCreateIfExists = 'ignore' | 'update' | 'replace'

export interface DrawingCreateSpec extends Omit<OverlayCreate, 'points' | 'name'> {
  /** Optional here because `create(name, spec)` carries it separately. */
  name?: string
  points?: DrawingPointInput[]
  /** Behavior when `id` already exists. Default 'update'. */
  ifExists?: DrawingCreateIfExists
}

export interface DrawingListFilter {
  name?: string
  ids?: string[]
  paneId?: string
  /** Keep drawings with any point timestamp inside [from, to] (ms). */
  inRange?: { from: DrawingTimeInput, to: DrawingTimeInput }
  /** Keep drawings intersecting the current visible bar range. */
  intersectsVisible?: boolean
}

export interface DrawingClearFilter {
  ids?: string[]
  name?: string
  /** Locked drawings survive clear() unless explicitly included. */
  includeLocked?: boolean
}

export interface DrawingsConfigureOptions {
  /** Swap/attach a persistence store at runtime. `null` detaches. */
  store?: DrawingStore | null
}

export interface SemanticDrawingBase {
  id?: string
  paneId?: string
  styles?: OverlayCreate['styles']
  extendData?: unknown
  lock?: boolean
  visible?: boolean
  ifExists?: DrawingCreateIfExists
}

export interface DrawingsApi extends DrawingManager {
  /** The tool catalog (groups → sections → items) for host toolbars. */
  catalog: () => DrawingToolGroup[]

  /**
   * Arm a tool by catalog id ('trendLine') or kernel name ('segment').
   * Catalog ids resolve through the registry; unknown ids fall through to
   * the raw overlay name for extension templates.
   */
  activate: (tool: string, opts?: { continuous?: boolean, extendData?: unknown, points?: OverlayCreate['points'] }) => Nullable<string>

  /**
   * Validating programmatic create.
   * - `create('segment', { points })` / `create({ name, points })` → id
   * - `create(spec[])` → ids (invalid entries skipped with a warning)
   * Point count must match the template's anchor contract.
   */
  create: {
    (name: string, spec?: DrawingCreateSpec): Nullable<string>
    (spec: DrawingCreateSpec): Nullable<string>
    (specs: DrawingCreateSpec[]): Array<Nullable<string>>
  }

  // ── Semantic helpers (primary AI surface) ─────────────────────────────────
  /** Trend line between two points. `name` selects the kernel template. */
  addLine: (args: { from: DrawingPointInput, to: DrawingPointInput, name?: string } & SemanticDrawingBase) => Nullable<string>
  /** Horizontal line at a value. `time` defaults to mid-visible-range. */
  addHLine: (args: { value: number, time?: DrawingTimeInput, label?: string } & SemanticDrawingBase) => Nullable<string>
  /** Filled zone (rectangle) between a time range and two price levels. */
  addZone: (args: { from: DrawingTimeInput, to: DrawingTimeInput, top: number, bottom: number } & SemanticDrawingBase) => Nullable<string>
  /** Fibonacci retracement between two points. */
  addFibRetracement: (args: { from: DrawingPointInput, to: DrawingPointInput } & SemanticDrawingBase) => Nullable<string>

  list: (filter?: DrawingListFilter) => SerializedDrawing[]
  /** Bulk remove — returns removed ids. Locked drawings are skipped by default. */
  clear: (filter?: DrawingClearFilter) => string[]

  /** Open the library settings dialog for a drawing (DP-6c). */
  openSettings: (id: string) => boolean

  configure: (opts: DrawingsConfigureOptions) => void
}

function toTimestamp (input: DrawingTimeInput): number | undefined {
  if (isNumber(input)) {
    return input
  }
  if (isString(input)) {
    const parsed = Date.parse(input)
    return Number.isNaN(parsed) ? undefined : parsed
  }
  return undefined
}

function toPoint (input: DrawingPointInput): Partial<Point> {
  const point: Partial<Point> = {}
  if (input.time !== undefined) {
    point.timestamp = toTimestamp(input.time)
  }
  if (input.dataIndex !== undefined) {
    point.dataIndex = input.dataIndex
  }
  if (input.value !== undefined) {
    point.value = input.value
  }
  return point
}

/** Expected anchor count for a template; -1 = unlimited/freehand. */
function expectedAnchors (name: string): number {
  const template = getOverlayTemplate(name)
  if (template === null) {
    return -1
  }
  const totalStep = template.totalStep ?? 1
  if (template.freehand === true || totalStep >= Number.MAX_SAFE_INTEGER) {
    return -1
  }
  return Math.max(1, totalStep - 1)
}

export type DrawingsApiOptions = Omit<DrawingManagerOptions, 'store'> & {
  /** Persistence adapter — `null` explicitly disables persistence. */
  store?: DrawingStore | null
  /** Floating toolbar: `false` disables, object supplies hooks (DP-6b). */
  toolbar?: boolean | FloatingToolbarHooks
  /** Shared drawing keyboard layer — `false` disables (default on). */
  keyboard?: boolean
}

export function createDrawingsApi (chart: Chart, options?: DrawingsApiOptions): DrawingsApi {
  const manager: DrawingManager = createDrawingManager(chart, {
    ...options,
    store: options?.store ?? undefined
  })
  const settingsDialog: SettingsDialog = attachSettingsDialog(chart, manager)
  const toolbarOption = options?.toolbar
  const toolbarHooks: FloatingToolbarHooks | undefined = typeof toolbarOption === 'object'
    ? { onSettings: overlay => { settingsDialog.open(overlay) }, ...toolbarOption }
    : { onSettings: overlay => { settingsDialog.open(overlay) } }
  const toolbar: FloatingToolbar | null = toolbarOption === false
    ? null
    : attachFloatingToolbar(chart, manager, toolbarHooks)

  let selectedId: string | null = null
  const unbindSelection = [
    manager.on('select', p => {
      selectedId = p.overlay?.id ?? null
    }),
    manager.on('deselect', () => {
      selectedId = null
    })
  ]

  function selectedOverlay (): Nullable<Overlay> {
    return selectedId !== null ? chart.getOverlayById(selectedId) : null
  }

  function cancelInProgress (): boolean {
    const inProgress = chart.getOverlays().find(o => o.isDrawing())
    if (inProgress === undefined) {
      return false
    }
    // Esc on an unlimited-step tool with enough points COMPLETES the drawing
    // (same semantics as double-click finish) — removing it would discard
    // an otherwise valid path/polyline stroke.
    if (inProgress.totalStep >= Number.MAX_SAFE_INTEGER && inProgress.points.length >= 2) {
      inProgress.forceComplete()
      const chartStore = (chart as unknown as {
        getChartStore: () => {
          getProgressOverlayInfo: () => Nullable<{ overlay: Overlay }>
          progressOverlayComplete: () => void
        }
      }).getChartStore()
      const progressInfo = chartStore.getProgressOverlayInfo()
      if (progressInfo?.overlay === inProgress) {
        chartStore.progressOverlayComplete()
      }
      inProgress.onDrawEnd?.({ chart, overlay: inProgress })
      return true
    }
    return chart.removeOverlay({ id: inProgress.id })
  }

  let clipboard: SerializedDrawing | null = null
  const unbindKeyboard = options?.keyboard === false
    ? null
    : bindDrawingKeyboard({
      onEscape: () => {
        if (!cancelInProgress()) {
          manager.deselect()
        }
      },
      onDelete: () => {
        const selected = selectedOverlay()
        if (selected !== null && !selected.lock) {
          manager.remove(selected.id)
          return true
        }
        return false
      },
      onUndo: () => {
        manager.undo()
      },
      onRedo: () => {
        manager.redo()
      },
      onCopy: () => {
        const selected = selectedOverlay()
        if (selected === null) {
          return false
        }
        clipboard = serializeOverlay(selected)
        return true
      },
      onPaste: () => {
        if (clipboard === null) {
          return false
        }
        const create = serializedToOverlayCreate(clipboard)
        delete (create as { id?: string }).id
        manager.create(create)
        return true
      },
      onHotkey: (key) => {
        // TradingView bare-letter tool shortcuts — only activate tools the
        // catalog marks available (unimplemented entries stay inert).
        const item = findCatalogItemByHotkey(key)
        if (item !== null) {
          manager.activate(item.overlayName)
        }
      }
    })

  function resolveToolName (tool: string): string {
    return findCatalogItem(tool)?.overlayName ?? tool
  }

  function validateCreate (name: string, points: DrawingPointInput[] | undefined): boolean {
    if (points === undefined) {
      return true
    }
    const expected = expectedAnchors(name)
    if (expected === -1) {
      if (points.length < 2) {
        logWarn('', '', `drawings.create('${name}'): unlimited tools need >= 2 points, got ${points.length}`)
        return false
      }
      return true
    }
    if (points.length !== expected) {
      logWarn('', '', `drawings.create('${name}'): expected ${expected} points, got ${points.length}`)
      return false
    }
    return true
  }

  function createOne (name: string, spec: DrawingCreateSpec): Nullable<string> {
    const { ifExists = 'update', points, name: _specName, ...rest } = spec
    if (spec.id !== undefined) {
      const existing = chart.getOverlayById(spec.id)
      if (existing !== null) {
        switch (ifExists) {
          case 'ignore':
            return existing.id
          case 'update': {
            const patch: Record<string, unknown> = { ...rest }
            if (points !== undefined && validateCreate(name, points)) {
              patch.points = points.map(toPoint)
            }
            chart.overrideOverlay({ id: spec.id, ...patch })
            return existing.id
          }
          case 'replace':
            chart.removeOverlay({ id: spec.id })
            break
        }
      }
    }
    if (!validateCreate(name, points)) {
      return null
    }
    return manager.create({
      ...rest,
      name,
      points: points?.map(toPoint)
    })
  }

  function base (args: SemanticDrawingBase): Omit<DrawingCreateSpec, 'name' | 'points'> {
    const { id, paneId, styles, extendData, lock, visible, ifExists } = args
    return { id, paneId, styles, extendData, lock, visible, ifExists }
  }

  function midVisibleDataIndex (): number {
    const range = chart.getVisibleRange()
    return Math.floor((range.realFrom + range.realTo) / 2)
  }

  function filterList (filter: DrawingListFilter | undefined, drawings: SerializedDrawing[]): SerializedDrawing[] {
    if (filter === undefined) {
      return drawings
    }
    const idSet = filter.ids !== undefined ? new Set(filter.ids) : null
    const rangeFrom = filter.inRange !== undefined ? toTimestamp(filter.inRange.from) : undefined
    const rangeTo = filter.inRange !== undefined ? toTimestamp(filter.inRange.to) : undefined
    let visFrom: number | null = null
    let visTo: number | null = null
    if (filter.intersectsVisible === true) {
      const range = chart.getVisibleRange()
      const bars = chart.getDataList()
      const first = bars[range.realFrom] as KLineData | undefined
      const last = bars[Math.min(range.realTo, bars.length) - 1] as KLineData | undefined
      visFrom = first?.timestamp ?? null
      visTo = last?.timestamp ?? null
    }
    const inTsRange = (p: SerializedDrawingPoint, from: number | null, to: number | null): boolean => {
      if (from === null || to === null) {
        return true
      }
      if (p.timestamp !== undefined) {
        return p.timestamp >= from && p.timestamp <= to
      }
      return false
    }
    return drawings.filter(d => {
      if (idSet !== null && !idSet.has(d.id)) {
        return false
      }
      if (filter.name !== undefined && d.name !== filter.name) {
        return false
      }
      if (filter.paneId !== undefined && d.paneId !== filter.paneId) {
        return false
      }
      if (rangeFrom !== undefined && rangeTo !== undefined) {
        if (!d.points.some(p => inTsRange(p, rangeFrom, rangeTo))) {
          return false
        }
      }
      if (visFrom !== null && visTo !== null) {
        if (!d.points.some(p => inTsRange(p, visFrom, visTo))) {
          return false
        }
      }
      return true
    })
  }

  return {
    ...manager,

    catalog () {
      return getDrawingCatalog()
    },

    activate (tool, opts) {
      return manager.activate(resolveToolName(tool), opts)
    },

    create: ((nameOrSpec: string | DrawingCreateSpec | DrawingCreateSpec[], spec?: DrawingCreateSpec): Nullable<string> | Array<Nullable<string>> => {
      if (isArray(nameOrSpec)) {
        return nameOrSpec.map(s => {
          if (isValid(s.name)) {
            return createOne(s.name, s)
          }
          logWarn('', '', 'drawings.create: spec without a name was skipped')
          return null
        })
      }
      if (isString(nameOrSpec)) {
        const resolved = resolveToolName(nameOrSpec)
        return createOne(resolved, spec ?? { name: resolved })
      }
      if (isValid(nameOrSpec.name)) {
        return createOne(nameOrSpec.name, nameOrSpec)
      }
      logWarn('', '', 'drawings.create: spec without a name was skipped')
      return null
    }) as DrawingsApi['create'],

    addLine (args) {
      const { from, to, name = 'segment', ...rest } = args
      return createOne(name, { ...base(rest), points: [from, to] })
    },

    addHLine (args) {
      const { value, time, label, ...rest } = args
      const point: DrawingPointInput = { value, dataIndex: midVisibleDataIndex() }
      if (time !== undefined) {
        point.time = time
        delete point.dataIndex
      }
      const extendData = {
        ...(isValid(rest.extendData) && typeof rest.extendData === 'object' ? rest.extendData as Record<string, unknown> : {}),
        ...(label !== undefined ? { text: label, showLabel: true } : {})
      }
      return createOne('horizontalStraightLine', { ...base(rest), extendData, points: [point] })
    },

    addZone (args) {
      const { from, to, top, bottom, ...rest } = args
      return createOne('rect', {
        ...base(rest),
        points: [{ time: from, value: top }, { time: to, value: bottom }]
      })
    },

    addFibRetracement (args) {
      const { from, to, ...rest } = args
      return createOne('fibonacciLine', { ...base(rest), points: [from, to] })
    },

    list (filter?: DrawingListFilter) {
      return filterList(filter, manager.list())
    },

    clear (filter?: DrawingClearFilter) {
      const name = filter?.name
      const nameSet = filter?.ids !== undefined ? new Set(filter.ids) : null
      const includeLocked = filter?.includeLocked === true
      const removed: string[] = []
      chart.getOverlays({ groupId: 'drawings' }).forEach(o => {
        if (o.isDrawing() || o.ghost || o.synced) {
          return
        }
        if (nameSet !== null && !nameSet.has(o.id)) {
          return
        }
        if (name !== undefined && o.name !== name) {
          return
        }
        if (o.lock && !includeLocked) {
          return
        }
        if (chart.removeOverlay({ id: o.id })) {
          removed.push(o.id)
        }
      })
      return removed
    },

    openSettings (id) {
      const overlay = chart.getOverlayById(id)
      if (overlay === null) {
        return false
      }
      settingsDialog.open(overlay)
      return true
    },

    configure (opts) {
      if ('store' in opts) {
        manager.attachStore(opts.store ?? null)
      }
    },

    destroy () {
      unbindKeyboard?.()
      unbindSelection.forEach(unsub => {
        unsub()
      })
      closeTextEditorSessions(chart)
      toolbar?.destroy()
      settingsDialog.destroy()
      clipboard = null
      manager.destroy()
    }
  }
}
