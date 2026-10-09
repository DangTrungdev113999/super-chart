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

import type Point from '../common/Point'
import type { Overlay, OverlayCreate, OverlayMode } from '../component/Overlay'
import type DeepPartial from '../common/DeepPartial'
import type { OverlayStyle } from '../common/Styles'
import { clone } from '../common/utils/typeChecks'

/**
 * Serialized drawing v2 — the persistence + shadow-state schema.
 *
 * Deliberately serializes DATA-level identity, not view state:
 * - points carry timestamp+value (+ optional dataIndex hint); restore
 *   re-derives dataIndex from timestamp so drawings survive data reloads.
 * - transient sync fields (ghost/synced/suppressSync/syncRemoved/
 *   skipDrawReplay) are NEVER serialized — a mirrored overlay is owned by
 *   the peer chart, persisting it would fork the source of truth.
 */
export interface SerializedDrawingPoint extends Partial<Point> {
  /** Per-point interval override (drawings anchored to another timeframe). */
  interval?: string
  /** Per-point bar offset — anchored notes/measure windows. */
  offset?: number
}

export interface SerializedDrawing<E = unknown> {
  schemaVersion: 2
  id: string
  name: string
  /** Omit/undefined = the candle pane. */
  paneId?: string
  groupId?: string
  points: SerializedDrawingPoint[]
  styles?: DeepPartial<OverlayStyle>
  lock?: boolean
  visible?: boolean
  mode?: OverlayMode
  modeSensitivity?: number
  zLevel?: number
  extendData?: E
  /** Whether creation finished — in-progress drawings are never persisted. */
  completed: boolean
  /** Position-as-percent-of-viewport for anchored notes (survives symbol switch). */
  positionPercents?: number[]
  /** Source-authored timestamps — server merges on updatedAt, not write order. */
  createdAt: number
  updatedAt: number
}

/** Fields a restore writes back through createOverlay. */
export function serializedToOverlayCreate (d: SerializedDrawing): OverlayCreate {
  return {
    id: d.id,
    name: d.name,
    paneId: d.paneId,
    groupId: d.groupId ?? 'drawings',
    points: d.points.map(p => {
      const point: SerializedDrawingPoint = { timestamp: p.timestamp, value: p.value, dataIndex: p.dataIndex }
      if (p.interval !== undefined) {
        point.interval = p.interval
      }
      if (p.offset !== undefined) {
        point.offset = p.offset
      }
      return point
    }),
    styles: clone(d.styles ?? null),
    lock: d.lock ?? false,
    visible: d.visible ?? true,
    mode: d.mode,
    modeSensitivity: d.modeSensitivity,
    zLevel: d.zLevel,
    extendData: clone(d.extendData ?? null),
    // Restored drawings are finished — never let them occupy the
    // drawing-progress slot (unlimited-step tools could never satisfy
    // points >= totalStep - 1 and would displace siblings).
    completed: d.completed,
    // Restored points are already normalized — replaying the draw hooks
    // would re-run templates' per-point transforms (e.g. flatTopBottom
    // pins P2's dataIndex to P1's) and silently mutate stored geometry.
    skipDrawReplay: true
  }
}

/**
 * Clone extendData for persistence, dropping top-level transient keys —
 * `_`-prefixed runtime fields (live edit buffers, hover markers) and
 * `isEditing` (mid-edit flag: restoring it would hide a shape's label).
 */
function sanitizeExtendData (extendData: unknown): unknown {
  const cloned = clone(extendData ?? undefined) as unknown
  if (typeof cloned !== 'object' || cloned === null || Array.isArray(cloned)) {
    return cloned
  }
  const src = cloned as Record<string, unknown>
  const rec: Record<string, unknown> = {}
  for (const key of Object.keys(src)) {
    if (!key.startsWith('_') && key !== 'isEditing') {
      rec[key] = src[key]
    }
  }
  return rec
}

/**
 * Key-order-insensitive stringify — `JSON.stringify` makes the fingerprint
 * lie for hosts that rebuild objects with reordered keys.
 */
function stableStringify (value: unknown): string {
  if (value === null || typeof value !== 'object') {
    // JSON.stringify(undefined) returns undefined at runtime — guard the
    // input instead of the result (the TS signature claims string).
    if (value === undefined) {
      return ''
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const rec = value as Record<string, unknown>
  const keys = Object.keys(rec).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(',')}}`
}

/**
 * Snapshot a live overlay. Returns null for anything that must NOT be
 * persisted: ghosts, sync mirrors, in-progress drawings, invisible
 * transient helpers.
 */
export function serializeOverlay<E> (overlay: Overlay<E>, options?: { now?: number, positionPercents?: number[], createdAt?: number }): SerializedDrawing<E> | null {
  if (overlay.ghost || overlay.synced || overlay.isDrawing() || overlay.transient === true) {
    return null
  }
  const now = options?.now ?? Date.now()
  const extendData = overlay.extendData as Record<string, unknown> | undefined
  const positionPercents = options?.positionPercents ??
    (Array.isArray(extendData?.positionPercents) ? extendData.positionPercents as number[] : undefined)
  return {
    schemaVersion: 2,
    id: overlay.id,
    name: overlay.name,
    paneId: overlay.paneId,
    groupId: overlay.groupId,
    points: overlay.points.map(p => {
      const sp: SerializedDrawingPoint = { timestamp: p.timestamp, value: p.value }
      if (p.dataIndex !== undefined) {
        sp.dataIndex = p.dataIndex
      }
      const raw = p as SerializedDrawingPoint
      if (raw.interval !== undefined) {
        sp.interval = raw.interval
      }
      if (raw.offset !== undefined) {
        sp.offset = raw.offset
      }
      return sp
    }),
    styles: clone(overlay.styles ?? undefined) ?? undefined,
    lock: overlay.lock,
    visible: overlay.visible,
    mode: overlay.mode,
    modeSensitivity: overlay.modeSensitivity,
    zLevel: overlay.zLevel,
    extendData: sanitizeExtendData(overlay.extendData) as E | undefined,
    completed: true,
    positionPercents,
    // createdAt sticks to the first serialization — re-stamping it on every
    // edit would erase the real creation time from storage.
    createdAt: options?.createdAt ?? now,
    updatedAt: now
  }
}

/** Cheap structural fingerprint for change detection (persistence diff + undo before-images). */
export function serializedFingerprint (d: SerializedDrawing): string {
  const pts = d.points.map(p => `${p.timestamp ?? ''},${p.value ?? ''},${p.dataIndex ?? ''},${p.interval ?? ''},${p.offset ?? ''}`).join(';')
  return `${d.name}|${d.paneId ?? ''}|${d.groupId ?? ''}|${pts}|${stableStringify(d.styles ?? null)}|${stableStringify(d.extendData ?? null)}|${d.lock === true ? 1 : 0}${d.visible === false ? 0 : 1}|${d.mode ?? ''}|${d.modeSensitivity ?? ''}|${d.zLevel ?? ''}`
}

// ─── v1 migration ────────────────────────────────────────────────
// Consumer format (zustand-persist envelope): { id, name, symbol, points:
// [{timestamp,value}], styles, lock, visible, mode, groupId, extendData,
// createdAt, updatedAt } — no paneId/completed/zLevel/schemaVersion.

export interface LegacyDrawingV1 {
  id: string
  name: string
  symbol?: string
  points: Array<{ timestamp?: number, value?: number, dataIndex?: number }>
  styles?: DeepPartial<OverlayStyle>
  lock?: boolean
  visible?: boolean
  mode?: OverlayMode
  groupId?: string
  extendData?: unknown
  createdAt?: number
  updatedAt?: number
}

/** v1 → v2 upgrade. Idempotent — safe to run on already-migrated data. */
export function migrateDrawingV1toV2 (legacy: LegacyDrawingV1, fallbackNow?: number): SerializedDrawing {
  const now = fallbackNow ?? Date.now()
  return {
    schemaVersion: 2,
    id: legacy.id,
    name: legacy.name,
    groupId: legacy.groupId ?? 'drawings',
    points: (Array.isArray(legacy.points) ? (legacy.points as unknown[]) : [])
      .filter(p => p !== null && typeof p === 'object')
      .map(p => {
        const point = p as SerializedDrawingPoint
        return { timestamp: point.timestamp, value: point.value, dataIndex: point.dataIndex }
      }),
    styles: clone(legacy.styles ?? null) ?? undefined,
    lock: legacy.lock,
    visible: legacy.visible,
    mode: legacy.mode,
    extendData: clone(legacy.extendData ?? null) ?? undefined,
    completed: true,
    createdAt: legacy.createdAt ?? now,
    updatedAt: legacy.updatedAt ?? now
  }
}
