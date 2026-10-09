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
import { getOverlayTemplate } from '../extension/overlay/index'
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
  let destroyed = false

  // Pending ops bucketed per scope — a failed requeue can never pin an old
  // scope and contaminate ops enqueued under a later symbol.
  interface PendingBucket { scope: DrawingScope, upsert: Map<string, SerializedDrawing>, remove: Set<string> }
  const pendingByScope = new Map<string, PendingBucket>()
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  // Applies must be serialized — whole-bucket read-modify-write adapters
  // would silently lose the loser's changeset on concurrent flushes.
  let applyChain: Promise<void> = Promise.resolve()
  // Epoch tagging beats timing flags: an overlay stamped with an older
  // epoch removed at ANY later time is an old-scope wipe — drop it without
  // touching persistence. Survives slow store.apply and async host wipes.
  let scopeEpoch = 0
  const overlayEpoch = new WeakMap<Overlay, number>()
  // Mutations are rejected while a scope switch is mid-flight (flush +
  // wipe + load) — undo of a stale command would otherwise resurrect
  // old-scope drawings into the new scope's storage.
  let switchInFlight = false

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
    const serialized = serializeOverlay(overlay, { createdAt: shadow.get(overlay.id)?.createdAt })
    if (serialized === null) {
      return null
    }
    // Stamp the overlay with the scope epoch it belongs to — a remove of a
    // stale-epoch overlay at ANY later time is an old-scope wipe.
    overlayEpoch.set(overlay, scopeEpoch)
    shadow.set(overlay.id, serialized)
    return serialized
  }

  function scopeKey (s: DrawingScope): string {
    // Separator prevents {chartId:'a',symbol:'bc'} colliding with
    // {chartId:'ab',symbol:'c'} into the same bucket.
    return `${s.chartId ?? ''}|${s.symbol}`
  }

  function pendingBucket (s: DrawingScope): PendingBucket {
    const key = scopeKey(s)
    let bucket = pendingByScope.get(key)
    if (bucket === undefined) {
      bucket = { scope: s, upsert: new Map(), remove: new Set() }
      pendingByScope.set(key, bucket)
    }
    return bucket
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
    if (store === null || pendingByScope.size === 0) {
      return
    }
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    // Drain every scope bucket — each keeps its own scope target, so a
    // symbol switch flushes old drawings to the OLD symbol's storage.
    const buckets = [...pendingByScope.values()]
    pendingByScope.clear()
    const storeRef = store
    // Serialize applies — concurrent read-modify-write on the same bucket
    // would silently lose the loser's changeset.
    applyChain = applyChain.then(async () => {
      for (const bucket of buckets) {
        const upsert = [...bucket.upsert.values()]
        const remove = [...bucket.remove]
        try {
          await storeRef.apply(bucket.scope, { upsert, remove })
        } catch {
          // Store failure: requeue under the SAME scope so the next commit
          // retries instead of silently losing the write.
          const live = pendingBucket(bucket.scope)
          upsert.forEach(d => live.upsert.set(d.id, d))
          remove.forEach(id => live.remove.add(id))
          // Don't leave the retry hostage to the next user commit —
          // reschedule the debounce so a transient failure self-heals.
          scheduleSave()
        }
      }
    })
    await applyChain
  }

  function persistUpsert (serialized: SerializedDrawing): void {
    const bucket = pendingBucket(scope())
    bucket.remove.delete(serialized.id)
    bucket.upsert.set(serialized.id, serialized)
    scheduleSave()
  }

  function persistRemove (id: string): void {
    const bucket = pendingBucket(scope())
    bucket.upsert.delete(id)
    bucket.remove.add(id)
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
          // Fingerprint gate — a plain click selects a drawing but emits
          // the same editStart/editEnd bracket; without the check every
          // selection pushed a no-op undo step + a debounced store write +
          // a broadcast upsert to peer tabs.
          if (serializedFingerprint(before) !== serializedFingerprint(after)) {
            history.pushUpdate(overlay.id, before, after)
            persistUpsert(after)
          }
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
        // syncApplied: a peer's edit applied onto the canonical overlay —
        // persist it (the owner is the only persister of peer edits) but
        // never mint a local undo entry for someone else's gesture.
        const fromSync = overlay.syncApplied === true
        if (fromSync) {
          overlay.syncApplied = false
        }
        const before = shadow.get(overlay.id)
        const after = trackShadow(overlay)
        if (after === null || !persistable(overlay)) {
          return
        }
        if (pendingEdit.has(overlay.id)) {
          // Mid-gesture write (e.g. anchoredText's fraction capture inside
          // onPressedMoveEnd) — the coming editEnd owns the whole before→
          // after diff; committing here would mint a duplicate undo unit +
          // a second persistence write + broadcast echo.
          break
        }
        if (before !== undefined && serializedFingerprint(before) !== serializedFingerprint(after)) {
          if (!fromSync) {
            history.pushUpdate(overlay.id, before, after)
          }
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
        // Epoch-tagged drop: an overlay stamped before the current scope
        // epoch is an old-scope wipe — never persist a delete into the new
        // scope's bucket, no matter when the wipe actually runs.
        const entryEpoch = overlayEpoch.get(overlay)
        if (entryEpoch !== undefined && entryEpoch < scopeEpoch) {
          overlayEpoch.delete(overlay)
          return
        }
        if (applyingInternal || applyDepth > 0) {
          return
        }
        if (overlay.syncRemoved === true) {
          // Sync-applied remote remove — drop every undo command for this id
          // or Ctrl+Z resurrects a drawing the owner deleted AND
          // re-broadcasts it group-wide. The store delete already happened
          // on the owner chart; persisting again would echo it.
          history.invalidateOverlay(overlay.id)
          break
        }
        if (overlay.synced && !remoteApplying) {
          // User deleted a synced MIRROR — the canonical record lives on the
          // owner chart. No local undo (undo would materialize a zombie the
          // owner still owns), but the remove MUST reach the shared store:
          // skipping it leaves the record alive and the drawing resurrects
          // on every chart after reload.
          history.invalidateOverlay(overlay.id)
          persistRemove(overlay.id)
          emit('change', { overlay })
          break
        }
        // Remote removes and deletes of untracked helpers never push undo:
        // remoteApplying removes already came from the store — persisting
        // them back would echo the delete to the peer that sent it, and a
        // undo entry would let Ctrl+Z resurrect a drawing the owner deleted.
        if (before !== null && persistable(overlay)) {
          if (!remoteApplying) {
            history.push({ kind: 'remove', snapshot: before })
            persistRemove(overlay.id)
          }
          emit('change', { overlay })
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
    // Same-scope events (restyle, period-only change, duplicate dispatch)
    // must not wipe + reload — the epoch/history clear below is destructive.
    const key = scopeKey(scope())
    if (key === lastScopeKey) {
      return
    }
    lastScopeKey = key
    // Scope switch — bump the epoch so wipe removes of old-scope overlays
    // are recognized by their stamp (not by timing) and dropped without
    // persistence, at any time they arrive. Flush old-scope pending ops
    // first: they carry their captured scope and land in the right bucket.
    scopeEpoch++
    switchInFlight = true
    const epoch = scopeEpoch
    // .then(cb, cb) not .finally — ES5 runtime target has no Promise.finally.
    void flushStore().then(afterFlush, afterFlush)

    function afterFlush (): void {
      // A newer switch superseded this one — leave cleanup to it.
      if (epoch !== scopeEpoch) {
        return
      }
      shadow.clear()
      armed.clear()
      pendingEdit.clear()
      history.clear()
      const afterLoad = (): void => {
        if (epoch === scopeEpoch) {
          switchInFlight = false
        }
      }
      void loadScope(epoch).then(afterLoad, afterLoad)
    }
  }

  async function loadScope (epoch?: number): Promise<void> {
    if (store === null) {
      return
    }
    try {
      const target = scope()
      const { drawings } = await store.load(target)
      // Stale-load guard: a slower load for scope B resolving after a
      // switch to C must not materialize B's drawings on the C chart.
      if (destroyed || (epoch !== undefined && epoch !== scopeEpoch)) {
        return
      }
      applyDepth++
      try {
        drawings.forEach(d => {
          // Per-record isolation — one malformed record (missing points,
          // null entries) must not abort the rest of the load, and a throw
          // here would otherwise surface as a "half-restored" chart.
          try {
            if (d.completed) {
              // Same-id drawings already on the chart get overridden with the
              // stored state — createOverlay would dedupe silently and leave
              // the stale version diverged from storage.
              if (chart.getOverlayById(d.id) !== null) {
                chart.overrideOverlay(serializedToOverlayCreate(d))
              } else {
                // Pre-seed the shadow with the STORED record so trackShadow
                // keeps the original createdAt instead of restamping it.
                shadow.set(d.id, d)
                chart.createOverlay(serializedToOverlayCreate(d))
              }
            }
          } catch {
            // Skip the malformed record; continue with the rest.
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
        // Ids flushed-but-pending or still being drawn must survive the
        // reconcile — the peer can't know about them yet. Pending REMOVE
        // tombstones win the other direction: a drawing the user deleted
        // locally must not resurrect when the peer's snapshot still has it.
        const pendingIds = new Set<string>()
        const pendingRemoves = new Set<string>()
        pendingByScope.forEach(bucket => {
          bucket.upsert.forEach(d => pendingIds.add(d.id))
          bucket.remove.forEach(id => pendingRemoves.add(id))
        })
        chart.getOverlays({ groupId: DRAWINGS_GROUP_ID }).forEach(o => {
          if (!remoteIds.has(o.id) && !o.ghost && !o.synced && !o.isDrawing() &&
              !pendingIds.has(o.id) && persistable(o)) {
            // Drop undo commands for remotely-deleted drawings — otherwise
            // undo would resurrect them AND re-persist into the peer's store.
            history.invalidateOverlay(o.id)
            chart.removeOverlay({ id: o.id })
          }
        })
        event.drawings.forEach(d => {
          try {
            const existing = chart.getOverlayById(d.id)
            // d.completed guards BOTH branches — a half-formed remote
            // record must not clobber a finished local overlay.
            if (existing !== null && !existing.isDrawing() && d.completed) {
              chart.overrideOverlay(serializedToOverlayCreate(d))
            } else if (d.completed && existing === null && !pendingRemoves.has(d.id)) {
              shadow.set(d.id, d)
              chart.createOverlay(serializedToOverlayCreate(d))
            }
          } catch {
            // One malformed remote record must not starve the rest.
          }
        })
      } else {
        event.drawings.forEach(d => {
          try {
            const existing = chart.getOverlayById(d.id)
            if (existing !== null && !existing.isDrawing() && d.completed) {
              chart.overrideOverlay(serializedToOverlayCreate(d))
            } else if (d.completed && existing === null) {
              shadow.set(d.id, d)
              chart.createOverlay(serializedToOverlayCreate(d))
            }
          } catch {
            // One malformed remote record must not starve the rest.
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
  let lastScopeKey = ''
  function bindStore (): void {
    storeUnsub?.()
    storeUnsub = store?.subscribe?.(onStoreEvent) ?? null
    lastScopeKey = scopeKey(scope())
    // Pass the epoch — without it the initial load has no staleness guard:
    // a symbol switch during a slow first load would let scope A's records
    // materialize inside scope B.
    void loadScope(scopeEpoch)
  }

  chart.subscribeAction('onOverlayChange', onOverlayChange)
  chart.subscribeAction('onSymbolChange', onSymbolChange)
  rehydrateShadow()
  bindStore()

  return {
    activate (name, opts) {
      // Guard empty/unregistered tool names — activating '' emits a phantom
      // toolChange and leaves activeTool() reporting an armed tool that
      // createOverlay can never instantiate.
      if (typeof name !== 'string' || name === '') {
        return null
      }
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
      // Disarm means disarm — an in-progress overlay still in the progress
      // slot would keep collecting clicks while activeTool() reports null.
      const inProgress = chart.getOverlays().find(o => o.isDrawing())
      if (inProgress !== undefined) {
        chart.removeOverlay({ id: inProgress.id })
      }
      emit('toolChange', { tool: null })
    },

    activeTool () {
      return activeToolName
    },

    create (spec) {
      // A programmatic create carrying points means "finished drawing" —
      // for unlimited-step templates (path/polyline/brush) the kernel's
      // points>=totalStep-1 check can never finish them, so mark completed
      // explicitly or the overlay strands in the drawing-progress slot.
      const template = getOverlayTemplate(spec.name)
      const completed = spec.completed === true ||
        (template !== null && (template.totalStep ?? 0) >= Number.MAX_SAFE_INTEGER &&
         spec.points !== undefined && spec.points.length > 0)
      const id = chart.createOverlay({
        ...spec,
        groupId: spec.groupId ?? DRAWINGS_GROUP_ID,
        ...(completed ? { completed: true } : {})
      })
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
      // Reject during a scope switch — the undo stack still holds old-scope
      // commands and applying them mid-flight would resurrect old drawings
      // into the NEW scope's chart AND storage.
      if (switchInFlight) {
        return false
      }
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
      if (switchInFlight) {
        return false
      }
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
      if (destroyed) {
        return
      }
      // Drain pending ops bound to the OLD store before rebinding —
      // otherwise the queued writes flush into the new backend.
      const swap = (): void => {
        if (destroyed) {
          return
        }
        store = next
        bindStore()
        // Ops requeued by a failed flush (or queued while store was null)
        // survive the swap — reschedule so they reach the new backend.
        if (pendingByScope.size > 0) {
          scheduleSave()
        }
      }
      if (pendingByScope.size > 0) {
        void flushStore().then(swap, swap)
      } else {
        swap()
      }
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
