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

import type Chart from '../Chart'
import type Nullable from '../common/Nullable'
import type { ActionCallback } from '../common/Action'
import type { Overlay, OverlayCreate, OverlayChangeEvent } from '../component/Overlay'
import { serializeOverlay, serializedToOverlayCreate, serializedFingerprint, type SerializedDrawing } from './serialize'
import { createDrawingHistory, type DrawingHistory } from './history'
import type { DrawingStore, DrawingScope, DrawingStoreEvent } from './persistence'

/**
 * DrawingManager — OBSERVE + shadow state.
 *
 * The manager does NOT own the overlay list: the chart store remains the
 * source of truth for rendering and hit-testing. The manager subscribes
 * to `onOverlayChange`, keeps a serialized shadow map of every committed
 * drawing, and turns commit boundaries (drawEnd / editEnd / remove) into
 * undo commands + debounced persistence writes.
 *
 * Non-drawings — sync mirrors (synced), in-flight ghosts (ghost), armed
 * in-progress tools, and templates flagged `transient` — are tracked for
 * correctness but never persisted or undone.
 */
export type DrawingsEventType = 'select' | 'deselect' | 'toolChange' | 'change' | 'editStart' | 'editEnd'
export type DrawingsEventCallback = (payload: { overlay?: Overlay, tool?: string | null }) => void

export interface DrawingManagerOptions {
  /** Partition override — defaults to {symbol: chart ticker}. */
  scope?: () => DrawingScope
  store?: DrawingStore
  /** Marks tool names that render but are never listed/persisted/undone (e.g. 'measure'). */
  isTransient?: (name: string) => boolean
  /** Debounce for persistence writes (ms). Default 300. */
  saveDebounceMs?: number
  maxHistory?: number
}

export interface DrawingManager {
  /** Arm a drawing tool — subsequent clicks collect its points. */
  activate: (name: string, opts?: { continuous?: boolean, extendData?: unknown, points?: OverlayCreate['points'] }) => Nullable<string>
  deactivate: () => void
  activeTool: () => string | null

  /** Programmatic create — already-finished overlays (AI / restore paths). */
  create: (spec: OverlayCreate) => Nullable<string>
  update: (id: string, patch: Partial<Pick<OverlayCreate, 'points' | 'styles' | 'extendData' | 'lock' | 'visible' | 'mode' | 'modeSensitivity' | 'zLevel'>>) => boolean
  remove: (id: string) => boolean
  list: () => SerializedDrawing[]
  get: (id: string) => Nullable<Overlay>

  select: (id: Nullable<string>) => void
  deselect: () => void

  undo: () => boolean
  redo: () => boolean
  canUndo: () => boolean
  canRedo: () => boolean

  attachStore: (store: DrawingStore | null) => void
  flush: () => Promise<void>

  /**
   * Bulk-apply suppression — wrap restore/sync batch writes so the flood
   * of 'create'/'update' events doesn't push undo commands or persist
   * entries the caller already owns.
   */
  beginApply: () => void
  endApply: () => void

  on: (type: DrawingsEventType, cb: DrawingsEventCallback) => () => void
  destroy: () => void
}

const DRAWINGS_GROUP_ID = 'drawings'
const SAVE_DEBOUNCE_MS = 300

export function createDrawingManager (chart: Chart, options?: DrawingManagerOptions): DrawingManager {
  const history: DrawingHistory = createDrawingHistory({ maxHistory: options?.maxHistory })
  const listeners = new Map<DrawingsEventType, Set<DrawingsEventCallback>>()
  const emit = (type: DrawingsEventType, payload: { overlay?: Overlay, tool?: string | null }): void => {
    listeners.get(type)?.forEach(cb => {
      try {
        cb(payload)
      } catch { /* subscriber errors must not break the event stream */ }
    })
  }

  // Serialized shadow of every committed drawing — the before-image source
  // for undo and the diff source for persistence.
  const shadow = new Map<string, SerializedDrawing>()
  // Armed (in-progress) overlay ids — created but not committed yet.
  const armed = new Set<string>()
  // Before-images captured at editStart for the gesture bracket.
  const pendingEdit = new Map<string, SerializedDrawing>()

  let store: DrawingStore | null = options?.store ?? null
  let activeToolName: string | null = null
  let continuousTool: string | null = null
  let applyDepth = 0 // beginApply/endApply nesting
  let applyingInternal = false // manager-originated ops must not self-record
  let remoteApplying = false // store events applied to chart — no re-persist
  let scopeSwitching = false // symbol-change wipe guard
  let destroyed = false

  const pendingUpsert = new Map<string, SerializedDrawing>()
  const pendingRemove = new Set<string>()
  // Scope the pending ops were enqueued under — captured at enqueue so a
  // symbol switch flushes old drawings to the OLD symbol's storage, never
  // the new one (the consumer bug this replaces wrote into whichever
  // symbol happened to be current at flush time).
  let pendingScope: DrawingScope | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const isTransient = options?.isTransient ?? (() => false)

  function scope (): DrawingScope {
    if (options?.scope !== undefined) {
      return options.scope()
    }
    return { symbol: chart.getSymbol()?.ticker ?? '' }
  }

  function persistable (overlay: Overlay): boolean {
    return !overlay.ghost && !overlay.synced && overlay.transient !== true && !isTransient(overlay.name)
  }

  function trackShadow (overlay: Overlay): SerializedDrawing | null {
    const serialized = serializeOverlay(overlay)
    if (serialized === null) {
      return null
    }
    shadow.set(overlay.id, serialized)
    return serialized
  }

  function scheduleSave (): void {
    if (store === null || saveTimer !== null) {
      return
    }
    saveTimer = setTimeout(() => {
      saveTimer = null
      void flushStore()
    }, options?.saveDebounceMs ?? SAVE_DEBOUNCE_MS)
  }

  async function flushStore (): Promise<void> {
    if (store === null || (pendingUpsert.size === 0 && pendingRemove.size === 0)) {
      return
    }
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const upsert = [...pendingUpsert.values()]
    const remove = [...pendingRemove]
    const target = pendingScope ?? scope()
    pendingUpsert.clear()
    pendingRemove.clear()
    pendingScope = null
    try {
      await store.apply(target, { upsert, remove })
    } catch {
      // Store failure: requeue so the next commit retries instead of
      // silently losing the write.
      upsert.forEach(d => pendingUpsert.set(d.id, d))
      remove.forEach(id => pendingRemove.add(id))
      pendingScope = target
      scheduleSave()
    }
  }

  function persistUpsert (serialized: SerializedDrawing): void {
    pendingRemove.delete(serialized.id)
    pendingUpsert.set(serialized.id, serialized)
    pendingScope ??= scope()
    scheduleSave()
  }

  function persistRemove (id: string): void {
    pendingUpsert.delete(id)
    pendingRemove.add(id)
    pendingScope ??= scope()
    scheduleSave()
  }

  /** Commit a finished overlay: shadow + create command + persistence. */
  function commitCreate (overlay: Overlay): void {
    armed.delete(overlay.id)
    const serialized = trackShadow(overlay)
    if (serialized === null || !persistable(overlay)) {
      return
    }
    history.push({ kind: 'create', snapshot: serialized })
    persistUpsert(serialized)
    emit('change', { overlay })
  }

  const onOverlayChange: ActionCallback = (data?: unknown): void => {
    if (destroyed) {
      return
    }
    const event = data as OverlayChangeEvent
    const overlay = event.overlay
    switch (event.type) {
      case 'create': {
        if (applyDepth > 0) {
          // Bulk-apply restore — adopt into shadow only.
          trackShadow(overlay)
          return
        }
        if (overlay.isDrawing()) {
          armed.add(overlay.id)
          return
        }
        // Programmatic complete create (API / sync mirror with full points).
        if (applyingInternal || overlay.ghost || overlay.synced) {
          trackShadow(overlay)
          return
        }
        commitCreate(overlay)
        break
      }
      case 'drawEnd': {
        commitCreate(overlay)
        // Stay-in-drawing: re-arm the tool for the next drawing.
        if (continuousTool !== null && activeToolName === continuousTool) {
          chart.createOverlay({ name: continuousTool, groupId: DRAWINGS_GROUP_ID })
        }
        break
      }
      case 'editStart': {
        const before = shadow.get(overlay.id)
        if (before !== undefined) {
          pendingEdit.set(overlay.id, before)
        }
        emit('editStart', { overlay })
        break
      }
      case 'editEnd': {
        const before = pendingEdit.get(overlay.id)
        pendingEdit.delete(overlay.id)
        const after = trackShadow(overlay)
        if (applyingInternal || applyDepth > 0 || after === null) {
          emit('editEnd', { overlay })
          return
        }
        if (before !== undefined && persistable(overlay)) {
          history.pushUpdate(overlay.id, before, after)
          persistUpsert(after)
        } else if (persistable(overlay)) {
          persistUpsert(after)
        }
        emit('editEnd', { overlay })
        emit('change', { overlay })
        break
      }
      case 'update': {
        // Host-driven overrideOverlay (style panels, programmatic updates).
        if (applyingInternal || applyDepth > 0) {
          trackShadow(overlay)
          return
        }
        const before = shadow.get(overlay.id)
        const after = trackShadow(overlay)
        if (after === null || !persistable(overlay)) {
          return
        }
        if (before !== undefined && serializedFingerprint(before) !== serializedFingerprint(after)) {
          history.pushUpdate(overlay.id, before, after)
          persistUpsert(after)
          emit('change', { overlay })
        }
        break
      }
      case 'remove': {
        armed.delete(overlay.id)
        pendingEdit.delete(overlay.id)
        const before = shadow.get(overlay.id) ?? serializeOverlay(overlay)
        shadow.delete(overlay.id)
        if (applyingInternal || applyDepth > 0 || scopeSwitching) {
          return
        }
        // Remote removes and deletes of untracked helpers never push undo.
        if (before !== null && !remoteApplying && overlay.syncRemoved !== true && persistable(overlay)) {
          history.push({ kind: 'remove', snapshot: before })
          persistRemove(overlay.id)
          emit('change', { overlay })
        } else if (before !== null && persistable(overlay)) {
          persistRemove(overlay.id)
        }
        break
      }
      case 'select': {
        emit('select', { overlay })
        break
      }
      case 'deselect': {
        emit('deselect', { overlay })
        break
      }
      default:
        break
    }
  }

  const onSymbolChange: ActionCallback = (): void => {
    // Scope switch — wipe removes that follow must not persist deletes into
    // the OLD scope nor push undo commands. The old scope's committed state
    // is already in storage (debounced), so flush it first.
    scopeSwitching = true
    void flushStore().finally(() => {
      shadow.clear()
      armed.clear()
      pendingEdit.clear()
      history.clear()
      void loadScope()
      // The consumer wipe runs synchronously after the action dispatch —
      // the flag resets on the next task, covering all wipe removes.
      setTimeout(() => {
        scopeSwitching = false
      }, 0)
    })
  }

  async function loadScope (): Promise<void> {
    if (store === null) {
      return
    }
    try {
      const target = scope()
      const { drawings } = await store.load(target)
      if (destroyed) {
        return
      }
      applyDepth++
      try {
        drawings.forEach(d => {
          if (d.completed) {
            chart.createOverlay(serializedToOverlayCreate(d))
          }
        })
      } finally {
        applyDepth = Math.max(0, applyDepth - 1)
      }
    } catch {
      // Load failure — the chart stays empty rather than half-restored.
    }
  }

  const onStoreEvent = (event: DrawingStoreEvent): void => {
    if (destroyed) {
      return
    }
    const current = scope()
    if (event.scope.symbol !== current.symbol || event.scope.chartId !== current.chartId) {
      return
    }
    remoteApplying = true
    applyingInternal = true
    try {
      if (event.type === 'snapshot') {
        // Full remote state — reconcile: remove ids not present remotely.
        const remoteIds = new Set(event.drawings.map(d => d.id))
        chart.getOverlays({ groupId: DRAWINGS_GROUP_ID }).forEach(o => {
          if (!remoteIds.has(o.id) && !o.ghost && !o.synced) {
            chart.removeOverlay({ id: o.id })
          }
        })
        event.drawings.forEach(d => {
          const existing = chart.getOverlayById(d.id)
          if (existing !== null) {
            chart.overrideOverlay(serializedToOverlayCreate(d))
          } else if (d.completed) {
            chart.createOverlay(serializedToOverlayCreate(d))
          }
        })
      } else {
        event.drawings.forEach(d => {
          const existing = chart.getOverlayById(d.id)
          if (existing !== null) {
            chart.overrideOverlay(serializedToOverlayCreate(d))
          } else if (d.completed) {
            chart.createOverlay(serializedToOverlayCreate(d))
          }
        })
        event.removedIds?.forEach(id => {
          history.invalidateOverlay(id)
          chart.removeOverlay({ id })
        })
      }
    } finally {
      remoteApplying = false
      applyingInternal = false
    }
  }

  function rehydrateShadow (): void {
    shadow.clear()
    chart.getOverlays().forEach(o => {
      if (persistable(o)) {
        trackShadow(o)
      }
    })
  }

  let storeUnsub: (() => void) | null = null
  function bindStore (): void {
    storeUnsub?.()
    storeUnsub = store?.subscribe?.(onStoreEvent) ?? null
    void loadScope()
  }

  chart.subscribeAction('onOverlayChange', onOverlayChange)
  chart.subscribeAction('onSymbolChange', onSymbolChange)
  rehydrateShadow()
  bindStore()

  return {
    activate (name, opts) {
      activeToolName = name
      continuousTool = opts?.continuous === true ? name : null
      emit('toolChange', { tool: name })
      const id = chart.createOverlay({
        name,
        groupId: DRAWINGS_GROUP_ID,
        extendData: opts?.extendData,
        points: opts?.points
      })
      return typeof id === 'string' ? id : null
    },

    deactivate () {
      if (activeToolName === null) {
        return
      }
      activeToolName = null
      continuousTool = null
      emit('toolChange', { tool: null })
    },

    activeTool () {
      return activeToolName
    },

    create (spec) {
      const id = chart.createOverlay({ ...spec, groupId: spec.groupId ?? DRAWINGS_GROUP_ID })
      return typeof id === 'string' ? id : null
    },

    update (id, patch) {
      return chart.overrideOverlay({ id, ...patch })
    },

    remove (id) {
      return chart.removeOverlay({ id })
    },

    list () {
      return chart.getOverlays()
        .filter(o => persistable(o))
        .map(o => serializeOverlay(o))
        .filter((d): d is SerializedDrawing => d !== null)
    },

    get (id) {
      return chart.getOverlayById(id)
    },

    select (id) {
      chart.selectOverlay(id)
    },

    deselect () {
      chart.selectOverlay(null)
    },

    undo () {
      const apply = history.undo()
      if (apply === null) {
        return false
      }
      applyingInternal = true
      try {
        apply.remove.forEach(id => { chart.removeOverlay({ id }) })
        apply.restore.forEach(d => {
          if (chart.getOverlayById(d.id) !== null) {
            chart.overrideOverlay(serializedToOverlayCreate(d))
          } else {
            chart.createOverlay(serializedToOverlayCreate(d))
          }
          shadow.set(d.id, d)
          persistUpsert(d)
        })
        apply.remove.forEach(id => {
          shadow.delete(id)
          persistRemove(id)
        })
      } finally {
        applyingInternal = false
      }
      emit('change', {})
      return true
    },

    redo () {
      const apply = history.redo()
      if (apply === null) {
        return false
      }
      applyingInternal = true
      try {
        apply.remove.forEach(id => { chart.removeOverlay({ id }) })
        apply.restore.forEach(d => {
          if (chart.getOverlayById(d.id) !== null) {
            chart.overrideOverlay(serializedToOverlayCreate(d))
          } else {
            chart.createOverlay(serializedToOverlayCreate(d))
          }
          shadow.set(d.id, d)
          persistUpsert(d)
        })
        apply.remove.forEach(id => {
          shadow.delete(id)
          persistRemove(id)
        })
      } finally {
        applyingInternal = false
      }
      emit('change', {})
      return true
    },

    canUndo () {
      return history.canUndo()
    },

    canRedo () {
      return history.canRedo()
    },

    attachStore (next) {
      store = next
      bindStore()
    },

    async flush () {
      await flushStore()
      await store?.flush?.()
    },

    beginApply () {
      applyDepth++
    },

    endApply () {
      applyDepth = Math.max(0, applyDepth - 1)
    },

    on (type, cb) {
      let set = listeners.get(type)
      if (set === undefined) {
        set = new Set()
        listeners.set(type, set)
      }
      const target = set
      target.add(cb)
      return () => {
        target.delete(cb)
      }
    },

    destroy () {
      destroyed = true
      if (saveTimer !== null) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      void flushStore()
      storeUnsub?.()
      chart.unsubscribeAction('onOverlayChange', onOverlayChange)
      chart.unsubscribeAction('onSymbolChange', onSymbolChange)
      listeners.clear()
      shadow.clear()
      armed.clear()
      pendingEdit.clear()
    }
  }
}
