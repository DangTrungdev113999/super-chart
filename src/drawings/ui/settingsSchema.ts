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

import { isArray, isBoolean, isNumber } from '../../common/utils/typeChecks'
import type { Overlay } from '../../component/Overlay'

import type { DrawingToolItem } from '../catalog'
import type { DrawingExtendData } from '../types'

/**
 * Settings-dialog schema (DP-6c). Derives a tab list (Style / Coordinates /
 * Visibility) from the overlay's catalog `toolbarRecipe` plus the actual
 * styles/extendData present on the instance — the same property-map model
 * the floating toolbar uses, so a rebuilt tool automatically gets a
 * settings surface without a bespoke panel.
 */

export type SettingFieldKind = 'color' | 'number' | 'select' | 'checkbox' | 'text' | 'levels' | 'datetime' | 'header'

export interface SettingField {
  id: string
  kind: SettingFieldKind
  label: string
  /** Current value read from the overlay (not needed for 'header'). */
  get?: () => unknown
  /** Stage a change into the draft patch. */
  set?: (value: unknown) => void
  options?: Array<{ value: string, label: string }>
  min?: number
  max?: number
  step?: number
}

export interface SettingsTabSchema {
  id: 'style' | 'coordinates' | 'visibility'
  title: string
  fields: SettingField[]
}

/**
 * Accumulates edits for one `manager.update` call — each commit produces a
 * single undo/persist unit instead of one per keystroke.
 */
export interface SettingsDraft {
  style: (path: string[], value: unknown) => void
  extendData: (path: string[], value: unknown) => void
  point: (index: number, patch: { timestamp?: number, value?: number }) => void
}

const LINE_STYLE_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' }
]

const TEXT_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' }
]

/** TV interval-visibility matrix — matches the resolutions TV offers. */
export const VISIBLE_INTERVALS = [
  '1m', '3m', '5m', '15m', '30m', '45m',
  '1h', '2h', '3h', '4h',
  '1D', '1W', '1M'
]

const DASHED_VALUE: Record<string, number[]> = {
  solid: [6, 6],
  dashed: [6, 6],
  dotted: [2, 4]
}

function readPath (root: unknown, path: string[]): unknown {
  let node = root
  for (const key of path) {
    if (node === null || typeof node !== 'object') {
      return undefined
    }
    node = (node as Record<string, unknown>)[key]
  }
  return node
}

function hasRecipeControl (item: DrawingToolItem | undefined, kind: string, role?: string): boolean {
  if (item === undefined) {
    return false
  }
  return item.toolbarRecipe.some(control => {
    if (control.kind !== kind) {
      return false
    }
    if (role === undefined) {
      return true
    }
    return 'role' in control && control.role === role
  })
}

/** Locate a levels array on extendData — `levels` or `data.levels`. */
function findLevelsPath (extendData: unknown): { owner: Record<string, unknown>, key: string, levels: unknown[] } | null {
  if (extendData === null || typeof extendData !== 'object') {
    return null
  }
  const ed = extendData as Record<string, unknown>
  const candidates: Array<{ owner: Record<string, unknown>, key: string }> = [{ owner: ed, key: 'levels' }]
  if (ed.data !== null && typeof ed.data === 'object') {
    candidates.push({ owner: ed.data as Record<string, unknown>, key: 'levels' })
  }
  for (const { owner, key } of candidates) {
    const value = owner[key]
    if (isArray(value) && value.length > 0) {
      const first = value[0]
      if (first !== null && typeof first === 'object') {
        return { owner, key, levels: value }
      }
    }
  }
  return null
}

function styleFields (overlay: Overlay, item: DrawingToolItem | undefined, draft: SettingsDraft): SettingField[] {
  const styles = (overlay.styles ?? {}) as Record<string, unknown>
  const fields: SettingField[] = []
  const hasLine = styles.line !== undefined || hasRecipeControl(item, 'color', 'line') || hasRecipeControl(item, 'style', 'line')
  const hasText = item?.capabilities.hasText === true || styles.text !== undefined
  const hasFill = hasRecipeControl(item, 'color', 'fill') || styles.polygon !== undefined

  if (hasLine) {
    fields.push(
      {
        id: 'lineColor',
        kind: 'color',
        label: 'Line color',
        get: () => readPath(styles, ['line', 'color']),
        set: v => { draft.style(['line', 'color'], v) }
      },
      {
        id: 'lineWidth',
        kind: 'number',
        label: 'Width',
        min: 1,
        max: 8,
        step: 1,
        get: () => readPath(styles, ['line', 'size']),
        set: v => { draft.style(['line', 'size'], v) }
      },
      {
        id: 'lineStyle',
        kind: 'select',
        label: 'Style',
        options: LINE_STYLE_OPTIONS,
        get: () => readPath(styles, ['line', 'style']) ?? 'solid',
        set: v => {
          draft.style(['line', 'style'], v)
          if (typeof v === 'string' && v in DASHED_VALUE) {
            draft.style(['line', 'dashedValue'], DASHED_VALUE[v])
          }
        }
      }
    )
  }

  if (hasFill) {
    fields.push({
      id: 'fillColor',
      kind: 'color',
      label: 'Fill color',
      get: () => readPath(styles, ['polygon', 'color']),
      set: v => { draft.style(['polygon', 'color'], v) }
    })
  }

  if (hasRecipeControl(item, 'color', 'background')) {
    fields.push({
      id: 'backgroundColor',
      kind: 'color',
      label: 'Background',
      get: () => readPath(styles, ['rect', 'color']),
      set: v => { draft.style(['rect', 'color'], v) }
    })
  }

  if (hasText) {
    fields.push(
      {
        id: 'textColor',
        kind: 'color',
        label: 'Text color',
        get: () => readPath(styles, ['text', 'color']),
        set: v => { draft.style(['text', 'color'], v) }
      },
      {
        id: 'textSize',
        kind: 'number',
        label: 'Font size',
        min: 8,
        max: 64,
        step: 1,
        get: () => readPath(styles, ['text', 'size']),
        set: v => { draft.style(['text', 'size'], v) }
      },
      {
        id: 'textBold',
        kind: 'checkbox',
        label: 'Bold',
        get: () => readPath(styles, ['text', 'weight']) === 'bold',
        set: v => { draft.style(['text', 'weight'], v === true ? 'bold' : 'normal') }
      },
      {
        id: 'textItalic',
        kind: 'checkbox',
        label: 'Italic',
        get: () => readPath(styles, ['text', 'style']) === 'italic',
        set: v => { draft.style(['text', 'style'], v === true ? 'italic' : 'normal') }
      },
      {
        id: 'textAlign',
        kind: 'select',
        label: 'Align',
        options: TEXT_ALIGN_OPTIONS,
        get: () => readPath(styles, ['text', 'align']) ?? 'center',
        set: v => { draft.style(['text', 'align'], v) }
      }
    )
  }
  return fields
}

function optionFields (overlay: Overlay, draft: SettingsDraft): SettingField[] {
  // Top-level booleans on extendData become auto-labeled toggles — extend
  // modes, fan/arc visibility flags etc. carried by rebuilt tools.
  const ed = overlay.extendData
  if (ed === null || typeof ed !== 'object') {
    return []
  }
  const record = ed as Record<string, unknown>
  return Object.keys(record)
    .filter(key => key !== 'common' && key !== 'data' && isBoolean(record[key]))
    .map(key => ({
      id: `flag_${key}`,
      kind: 'checkbox' as const,
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
      get: () => (overlay.extendData as Record<string, unknown>)[key],
      set: v => { draft.extendData([key], v) }
    }))
}

function levelsField (overlay: Overlay, draft: SettingsDraft): SettingField | null {
  const found = findLevelsPath(overlay.extendData)
  if (found === null) {
    return null
  }
  const { owner, key } = found
  return {
    id: 'levels',
    kind: 'levels',
    label: 'Levels',
    get: () => owner[key],
    set: v => {
      // Levels arrays are committed whole — deep-merging rows per index
      // would leak stale entries on removal.
      const parentPath = owner === (overlay.extendData as Record<string, unknown>).data ? ['data', key] : [key]
      draft.extendData(parentPath, v)
    }
  }
}

function coordinateFields (overlay: Overlay, draft: SettingsDraft): SettingField[] {
  const fields: SettingField[] = []
  overlay.points.forEach((point, index) => {
    fields.push({
      id: `point_${index}_header`,
      kind: 'header',
      label: `Point ${index + 1}`
    })
    if (isNumber(point.timestamp)) {
      fields.push({
        id: `point_${index}_time`,
        kind: 'datetime',
        label: 'Time',
        get: () => overlay.points[index].timestamp,
        set: v => { draft.point(index, { timestamp: v as number }) }
      })
    }
    if (isNumber(point.value)) {
      fields.push({
        id: `point_${index}_value`,
        kind: 'number',
        label: 'Price',
        step: 0,
        get: () => overlay.points[index].value,
        set: v => { draft.point(index, { value: v as number }) }
      })
    }
  })
  return fields
}

function visibilityFields (overlay: Overlay, draft: SettingsDraft): SettingField[] {
  const current = (): string[] => {
    const common = (overlay.extendData as DrawingExtendData | undefined)?.common
    return common?.visibleIntervals ?? []
  }
  return [
    {
      id: 'visibleIntervals_header',
      kind: 'header',
      label: 'Show on timeframes (empty = all)'
    },
    ...VISIBLE_INTERVALS.map(interval => ({
      id: `iv_${interval}`,
      kind: 'checkbox' as const,
      label: interval,
      get: () => current().includes(interval),
      set: (v: unknown) => {
        const next = new Set(current())
        if (v === true) {
          next.add(interval)
        } else {
          next.delete(interval)
        }
        draft.extendData(['common', 'visibleIntervals'], [...next])
      }
    }))
  ]
}

export function buildSettingsTabs (overlay: Overlay, item: DrawingToolItem | undefined, draft: SettingsDraft): SettingsTabSchema[] {
  const style = [...styleFields(overlay, item, draft)]
  const levels = levelsField(overlay, draft)
  if (levels !== null) {
    style.push(levels)
  }
  style.push(...optionFields(overlay, draft))

  const tabs: SettingsTabSchema[] = []
  if (style.length > 0) {
    tabs.push({ id: 'style', title: 'Style', fields: style })
  }
  const coordinates = coordinateFields(overlay, draft)
  if (coordinates.length > 0) {
    tabs.push({ id: 'coordinates', title: 'Coordinates', fields: coordinates })
  }
  tabs.push({ id: 'visibility', title: 'Visibility', fields: visibilityFields(overlay, draft) })
  return tabs
}

/** Read the draft-shaped paths — used by the dialog for field `get` fallbacks. */
export function readOverlayPath (overlay: Overlay, path: string[]): unknown {
  const root: Record<string, unknown> = {
    styles: (overlay.styles ?? {}) as Record<string, unknown>,
    extendData: (overlay.extendData ?? {}) as Record<string, unknown>
  }
  return readPath(root, path)
}
