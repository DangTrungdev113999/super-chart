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

/** Boundary normalization for a stored point — accepts object form and the
 * tuple form `[timestamp, value, dataIndex]` older writers emitted, drops
 * entries anchoring to neither time nor index (a pure `{value}` point
 * renders at garbage x). */
function normalizePoint (p: unknown): SerializedDrawingPoint | null {
  let point: SerializedDrawingPoint | null = null
  if (Array.isArray(p)) {
    const t = p as Array<number | undefined>
    point = { timestamp: t[0], value: t[1], dataIndex: t[2] }
  } else if (p !== null && typeof p === 'object') {
    const raw = p as SerializedDrawingPoint
    point = { timestamp: raw.timestamp, value: raw.value, dataIndex: raw.dataIndex }
    if (raw.interval !== undefined) {
      point.interval = raw.interval
    }
    if (raw.offset !== undefined) {
      point.offset = raw.offset
    }
  }
  if (point === null || (typeof point.timestamp !== 'number' && typeof point.dataIndex !== 'number')) {
    return null
  }
  return point
}

/** Fields a restore writes back through createOverlay. Returns null for
 * records that can't form a drawing — empty name or zero valid anchor
 * points (every tool's totalStep ≥ 1, so a point-less record would be an
 * invisible zombie that still consumes undo/persist slots). */
export function serializedToOverlayCreate (d: SerializedDrawing): OverlayCreate | null {
  const name = typeof d.name === 'string' ? d.name : ''
  const points = (Array.isArray(d.points) ? d.points : [])
    .map(normalizePoint)
    .filter((p): p is SerializedDrawingPoint => p !== null)
  if (name === '' || points.length === 0) {
    return null
  }
  return {
    id: typeof d.id === 'string' ? d.id : undefined,
    name,
    paneId: d.paneId,
    groupId: d.groupId ?? 'drawings',
    points,
    styles: clone(d.styles ?? null),
    // Boundary truthiness — a foreign record's lock:'yes' or visible:0 must
    // not freeze the drawing or block keyboard delete.
    lock: d.lock === true,
    visible: d.visible !== false,
    // Bogus mode values fall into 'normal' — OverlayView treats anything
    // non-'normal' as magnet and would snap every drag. Accept the
    // camelCase spellings older foreign records may carry.
    mode: ((): Overlay['mode'] => {
      const m = d.mode as unknown
      if (m === 'weakMagnet' || m === 'weak_magnet') {
        return 'weak_magnet'
      }
      if (m === 'strongMagnet' || m === 'strong_magnet') {
        return 'strong_magnet'
      }
      return 'normal'
    })(),
    modeSensitivity: typeof d.modeSensitivity === 'number' ? d.modeSensitivity : undefined,
    zLevel: typeof d.zLevel === 'number' ? d.zLevel : undefined,
    // Restore sanitizes too — records written by older/foreign builds may
    // carry isEditing or _-keys that would resurrect mid-edit state.
    extendData: sanitizeExtendData(d.extendData),
    // Restored drawings are finished — never let them occupy the
    // drawing-progress slot (unlimited-step tools could never satisfy
    // points >= totalStep - 1 and would displace siblings).
    completed: Boolean(d.completed),
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
function stableStringify (value: unknown, seen?: Set<unknown>): string {
  if (value === null || typeof value !== 'object') {
    // JSON.stringify(undefined) returns undefined at runtime — guard the
    // input instead of the result (the TS signature claims string).
    if (value === undefined) {
      return ''
    }
    return JSON.stringify(value)
  }
  // Cycle guard — a hostile/host-broken cyclic extendData would recurse
  // forever and take the whole persist pass down with a stack overflow.
  seen ??= new Set()
  if (seen.has(value)) {
    return 'null'
  }
  seen.add(value)
  if (Array.isArray(value)) {
    const out = `[${value.map(v => stableStringify(v, seen)).join(',')}]`
    seen.delete(value)
    return out
  }
  const rec = value as Record<string, unknown>
  const keys = Object.keys(rec).sort()
  const out = `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(rec[k], seen)}`).join(',')}}`
  seen.delete(value)
  return out
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
    // During a hover bump zLevel reads MAX_SAFE_INTEGER — persist the
    // restore target instead so a mid-hover save doesn't pin the drawing
    // at the top of the stack forever.
    zLevel: (overlay as { getPrevZLevel?: () => number | null }).getPrevZLevel?.() ?? overlay.zLevel,
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
  return `${d.name}|${d.paneId ?? ''}|${d.groupId ?? ''}|${pts}|${stableStringify(d.styles ?? null)}|${stableStringify(d.extendData ?? null)}|${d.lock === true ? 1 : 0}${d.visible === false ? 0 : 1}|${d.mode ?? ''}|${d.modeSensitivity ?? ''}|${d.zLevel ?? ''}|${d.positionPercents?.join(',') ?? ''}`
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
    // Same boundary normalization as restore — v1 points may be tuples or
    // carry interval/offset extras the old rebuild used to strip.
    points: (Array.isArray(legacy.points) ? (legacy.points as unknown[]) : [])
      .map(normalizePoint)
      .filter((p): p is SerializedDrawingPoint => p !== null),
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
