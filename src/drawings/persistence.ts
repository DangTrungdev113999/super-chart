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

import { migrateDrawingV1toV2, type SerializedDrawing, type LegacyDrawingV1 } from './serialize'

/**
 * Persistence contract — local-first, server-optional.
 *
 * The manager talks to ONE DrawingStore. Compose:
 *   createCompositeStore({ local: idbAdapter, remote: httpAdapter })
 * for local-first + queued-server behavior; wrap the result in
 * withBroadcastSync() to fan changes across tabs.
 *
 * Hosts implement load/apply; subscribe/flush/setIdentity are optional.
 */
export interface DrawingScope {
  /** Primary partition — usually the symbol (e.g. 'BTCUSDT'). */
  symbol: string
  /** Optional sub-partition when multiple charts share a symbol. */
  chartId?: string
}

export interface DrawingChangeSet {
  upsert?: SerializedDrawing[]
  /** Ids — tombstoned by durable adapters so deletes propagate. */
  remove?: string[]
}

export interface DrawingStoreEvent {
  type: 'upsert' | 'remove' | 'snapshot'
  scope: DrawingScope
  /** upsert/remove carry changed entries; snapshot carries the full scope state. */
  drawings: SerializedDrawing[]
  /** Tombstone ids on remove events. */
  removedIds?: string[]
}

export interface DrawingStoreLoadResult {
  drawings: SerializedDrawing[]
  /** Opaque revision for conflict detection (server adapters). */
  revision?: string | number
}

export interface DrawingStoreApplyMeta {
  /** True when this change originated from a remote/peer event — adapters may skip re-broadcasting it. */
  remote?: boolean
}

export interface DrawingStore {
  load: (scope: DrawingScope) => Promise<DrawingStoreLoadResult>
  apply: (scope: DrawingScope, changes: DrawingChangeSet, meta?: DrawingStoreApplyMeta) => Promise<void>
  /** External changes (another tab, server push). */
  subscribe?: (cb: (event: DrawingStoreEvent) => void) => () => void
  /** Force pending writes durably (pagehide/beforeunload). */
  flush?: (scope?: DrawingScope) => Promise<void>
  /** Identity switch (login/logout) — server adapters re-key rows. */
  setIdentity?: (identity: string | null) => void
}

// ─── In-memory store (tests, SSR, no-persistence hosts) ─────────

export function createMemoryDrawingStore (): DrawingStore {
  const data = new Map<string, Map<string, SerializedDrawing>>()
  const key = (scope: DrawingScope): string => `${scope.symbol}|${scope.chartId ?? ''}`
  return {
    async load (scope) {
      return await Promise.resolve({ drawings: [...(data.get(key(scope))?.values() ?? [])] })
    },
    async apply (scope, changes) {
      const k = key(scope)
      let bucket = data.get(k)
      if (bucket === undefined) {
        bucket = new Map()
        data.set(k, bucket)
      }
      const target = bucket
      changes.upsert?.forEach(d => target.set(d.id, d))
      changes.remove?.forEach(id => target.delete(id))
      await Promise.resolve()
    }
  }
}

// ─── localStorage adapter ────────────────────────────────────────

const LS_PREFIX = 'sc-drawings:'

interface LocalStorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function createLocalStorageStore (storage?: LocalStorageLike): DrawingStore {
  const ls: LocalStorageLike | undefined = storage ??
    (typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : undefined)
  const key = (scope: DrawingScope): string => `${LS_PREFIX}${scope.symbol}${scope.chartId !== undefined ? ':' + scope.chartId : ''}`

  function readAll (scope: DrawingScope): SerializedDrawing[] {
    if (ls === undefined) {
      return []
    }
    try {
      const raw = ls.getItem(key(scope))
      if (raw === null) {
        return []
      }
      const parsed = JSON.parse(raw) as { drawings?: SerializedDrawing[] }
      return parsed.drawings ?? []
    } catch {
      return []
    }
  }

  return {
    async load (scope) {
      return await Promise.resolve({ drawings: readAll(scope) })
    },
    async apply (scope, changes) {
      if (ls === undefined) {
        return
      }
      const drawings = readAll(scope)
      const map = new Map(drawings.map(d => [d.id, d]))
      changes.upsert?.forEach(d => map.set(d.id, d))
      changes.remove?.forEach(id => map.delete(id))
      try {
        ls.setItem(key(scope), JSON.stringify({ drawings: [...map.values()] }))
      } catch {
        // Quota — drop the write; caller keeps the in-memory truth.
      }
      await Promise.resolve()
    }
  }
}

// ─── IndexedDB adapter (v1-envelope aware) ──────────────────────
//
// Contents Pro's zustand-persist writes ONE kv row per symbol-scope:
//   DB 'finpath-chart-db' (v1) → store 'keyvalue' → key
//   'chart-drawings-storage' → { state: { drawings: Record<symbol,
//   SavedDrawing[]> }, version: 0 }
//
// This adapter reads that envelope non-destructively (sibling keys —
// setting-store, zoom-persistence-store, indicator-* — are untouched),
// migrates each drawing v1→v2, and writes its OWN rows under
// 'sc-drawings:<symbol>' in the same DB so the legacy bucket can be
// dropped later without a second migration.

const IDB_DB_NAME = 'finpath-chart-db'
const IDB_STORE = 'keyvalue'
const LEGACY_KEY = 'chart-drawings-storage'
const IDB_PREFIX = 'sc-drawings:'

interface LegacyEnvelope {
  state?: {
    drawings?: Record<string, LegacyDrawingV1[]>
  }
}

async function openDb (dbName: string, storeName: string): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(dbName)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(storeName)) {
        req.result.createObjectStore(storeName)
      }
    }
    req.onsuccess = () => { resolve(req.result) }
    req.onerror = () => { reject(new Error(`indexedDB open failed: ${req.error?.message ?? 'unknown'}`)) }
  })
}

async function idbGet (db: IDBDatabase, storeName: string, key: string): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = () => { resolve(req.result as unknown) }
    req.onerror = () => { reject(new Error(`indexedDB get failed: ${req.error?.message ?? 'unknown'}`)) }
  })
}

async function idbPut (db: IDBDatabase, storeName: string, key: string, value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(value, key)
    tx.oncomplete = () => { resolve() }
    tx.onerror = () => { reject(new Error(`indexedDB put failed: ${tx.error?.message ?? 'unknown'}`)) }
  })
}

export function createIndexedDBStore (options?: { dbName?: string, storeName?: string }): DrawingStore {
  const dbName = options?.dbName ?? IDB_DB_NAME
  const storeName = options?.storeName ?? IDB_STORE
  let dbPromise: Promise<IDBDatabase> | null = null
  const db = async (): Promise<IDBDatabase> => {
    dbPromise ??= openDb(dbName, storeName)
    return await dbPromise
  }
  const key = (scope: DrawingScope): string => `${IDB_PREFIX}${scope.symbol}${scope.chartId !== undefined ? ':' + scope.chartId : ''}`

  async function loadLegacy (symbol: string, database: IDBDatabase): Promise<SerializedDrawing[] | null> {
    try {
      const envelope = await idbGet(database, storeName, LEGACY_KEY) as LegacyEnvelope | undefined
      const list = envelope?.state?.drawings?.[symbol]
      if (!Array.isArray(list) || list.length === 0) {
        return null
      }
      return list.map(d => migrateDrawingV1toV2(d))
    } catch {
      return null
    }
  }

  async function readAll (scope: DrawingScope): Promise<SerializedDrawing[]> {
    const database = await db()
    const existing = await idbGet(database, storeName, key(scope)) as { drawings?: SerializedDrawing[] } | undefined
    if (existing?.drawings !== undefined) {
      return existing.drawings
    }
    // First load after upgrade — pull the legacy envelope, migrate,
    // write under the new key (idempotent: a second load hits the
    // migrated row above and never re-reads the envelope).
    const migrated = await loadLegacy(scope.symbol, database)
    if (migrated !== null) {
      await idbPut(database, storeName, key(scope), { drawings: migrated })
      return migrated
    }
    return []
  }

  return {
    async load (scope) {
      if (typeof globalThis.indexedDB === 'undefined') {
        return { drawings: [] }
      }
      return { drawings: await readAll(scope) }
    },
    async apply (scope, changes) {
      if (typeof globalThis.indexedDB === 'undefined') {
        return
      }
      const drawings = await readAll(scope)
      const map = new Map(drawings.map(d => [d.id, d]))
      changes.upsert?.forEach(d => map.set(d.id, d))
      changes.remove?.forEach(id => map.delete(id))
      const database = await db()
      await idbPut(database, storeName, key(scope), { drawings: [...map.values()] })
    }
  }
}

// ─── BroadcastChannel decorator ─────────────────────────────────
// Multi-tab sync is a TRANSPORT concern layered over any store — not a
// store itself. Events carry full entries so receiving tabs apply
// without re-reading storage.

export function withBroadcastSync (inner: DrawingStore, options?: { channelName?: string }): DrawingStore {
  const channelName = options?.channelName ?? 'sc-drawings-sync'
  const listeners = new Set<(event: DrawingStoreEvent) => void>()
  let channel: BroadcastChannel | null = null
  if (typeof globalThis.BroadcastChannel !== 'undefined') {
    channel = new globalThis.BroadcastChannel(channelName)
    channel.onmessage = (e: MessageEvent<DrawingStoreEvent>) => {
      // Per-listener isolation — one throwing subscriber (e.g. a malformed
      // record crashing a deserializer) must not starve the rest.
      listeners.forEach(cb => {
        try {
          cb(e.data)
        } catch {
          // swallow — same contract as Action.execute
        }
      })
    }
  }
  const post = (event: DrawingStoreEvent): void => { channel?.postMessage(event) }

  return {
    async load (scope) {
      return await inner.load(scope)
    },
    async apply (scope, changes, meta) {
      await inner.apply(scope, changes, meta)
      // Remote-originated changes already arrived over a transport —
      // echoing them back would loop tabs forever.
      if (meta?.remote === true) {
        return
      }
      if (changes.upsert !== undefined && changes.upsert.length > 0) {
        post({ type: 'upsert', scope, drawings: changes.upsert })
      }
      if (changes.remove !== undefined && changes.remove.length > 0) {
        post({ type: 'remove', scope, drawings: [], removedIds: changes.remove })
      }
    },
    subscribe (cb) {
      listeners.add(cb)
      const innerUnsub = inner.subscribe?.(cb)
      return () => {
        listeners.delete(cb)
        innerUnsub?.()
      }
    },
    flush: inner.flush !== undefined
      ? async (scope) => { await inner.flush?.(scope) }
      : undefined,
    setIdentity: inner.setIdentity !== undefined
      ? (id) => inner.setIdentity?.(id)
      : undefined
  }
}

// ─── Composite local-first adapter ──────────────────────────────
// Reads from local; writes local immediately + queues remote. Local is
// the source of truth — a remote failure never loses a drawing.

export interface CompositeStoreOptions {
  local: DrawingStore
  remote?: DrawingStore
  /** Retry interval for the remote queue (ms). Default 5000. */
  retryMs?: number
}

export function createCompositeStore (options: CompositeStoreOptions): DrawingStore {
  const { local, remote } = options
  const retryMs = options.retryMs ?? 5000
  const queue: Array<{ scope: DrawingScope, changes: DrawingChangeSet, meta?: DrawingStoreApplyMeta }> = []
  let flushing = false
  let timer: ReturnType<typeof setTimeout> | null = null

  async function drain (): Promise<void> {
    if (remote === undefined || flushing) {
      return
    }
    flushing = true
    try {
      while (queue.length > 0) {
        const item = queue[0]
        await remote.apply(item.scope, item.changes, item.meta)
        queue.shift()
      }
    } catch {
      schedule()
    } finally {
      flushing = false
    }
  }

  function schedule (): void {
    if (remote === undefined || timer !== null) {
      return
    }
    timer = setTimeout(() => {
      timer = null
      void drain()
    }, retryMs)
  }

  return {
    async load (scope) {
      // Local-first. A remote snapshot merge belongs to the host's
      // conflict-resolution policy — the manager reconciles via events.
      return await local.load(scope)
    },
    async apply (scope, changes, meta) {
      await local.apply(scope, changes, meta)
      if (remote !== undefined && meta?.remote !== true) {
        queue.push({ scope, changes, meta })
        schedule()
      }
    },
    subscribe (cb) {
      const unLocal = local.subscribe?.(cb)
      const unRemote = remote?.subscribe?.(cb)
      return () => {
        unLocal?.()
        unRemote?.()
      }
    },
    async flush (scope) {
      await local.flush?.(scope)
      await drain()
    },
    setIdentity (id) {
      local.setIdentity?.(id)
      remote?.setIdentity?.(id)
    }
  }
}

// ─── HTTP server adapter skeleton ───────────────────────────────
// Host injects fetch — no hard-coded backend. Endpoint contract:
//   GET  <base>/<symbol>[?chartId=] → { drawings, revision? }
//   POST <base>/<symbol>            → { upsert?, remove?, revision? }
// Deletes persist as tombstones server-side so a later load doesn't
// resurrect them.

export interface HttpAdapterOptions {
  baseUrl: string
  fetchImpl?: typeof fetch
  headers?: () => Record<string, string>
}

export function createHttpDrawingStore (options: HttpAdapterOptions): DrawingStore {
  const fetchImpl: ((input: string, init?: RequestInit) => Promise<Response>) | undefined = options.fetchImpl ??
    (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) as (input: string, init?: RequestInit) => Promise<Response> : undefined)
  const url = (scope: DrawingScope): string => {
    const base = options.baseUrl.replace(/\/$/, '')
    const q = scope.chartId !== undefined ? `?chartId=${encodeURIComponent(scope.chartId)}` : ''
    return `${base}/${encodeURIComponent(scope.symbol)}${q}`
  }
  return {
    async load (scope) {
      if (fetchImpl === undefined) {
        return { drawings: [] }
      }
      const res = await fetchImpl(url(scope), { headers: options.headers?.() })
      if (!res.ok) {
        throw new Error(`drawing store load failed: ${res.status}`)
      }
      return await res.json() as DrawingStoreLoadResult
    },
    async apply (scope, changes) {
      if (fetchImpl === undefined) {
        return
      }
      const res = await fetchImpl(url(scope), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...options.headers?.() },
        body: JSON.stringify(changes)
      })
      if (!res.ok) {
        throw new Error(`drawing store apply failed: ${res.status}`)
      }
    }
  }
}
