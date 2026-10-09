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

import type { DrawingStylePaths, DrawingToolItem, StylePath } from '../catalog'
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

/** Locate a levels array on extendData — `fib.levels`, `levels`, or `data.levels` (fib-pack primary first). */
function findLevelsPath (extendData: unknown): { path: string[], levels: unknown[] } | null {
  if (extendData === null || typeof extendData !== 'object') {
    return null
  }
  const ed = extendData as Record<string, unknown>
  const candidates: Array<{ owner: Record<string, unknown>, path: string[] }> = []
  if (ed.fib !== null && typeof ed.fib === 'object') {
    candidates.push({ owner: ed.fib as Record<string, unknown>, path: ['fib', 'levels'] })
  }
  candidates.push({ owner: ed, path: ['levels'] })
  if (ed.data !== null && typeof ed.data === 'object') {
    candidates.push({ owner: ed.data as Record<string, unknown>, path: ['data', 'levels'] })
  }
  for (const { owner, path } of candidates) {
    const value = owner[path[path.length - 1]]
    if (isArray(value) && value.length > 0) {
      const first = value[0]
      if (first !== null && typeof first === 'object') {
        return { path, levels: value }
      }
    }
  }
  return null
}

function styleFields (overlay: Overlay, item: DrawingToolItem | undefined, draft: SettingsDraft): SettingField[] {
  const styles = (overlay.styles ?? {}) as Record<string, unknown>
  const paths = item?.stylePaths ?? {}
  const fields: SettingField[] = []

  // Resolve a stylePaths entry against its styles.* default, then bind
  // get/set to the right draft channel (extendData-targeted paths write
  // through draft.extendData — measure/position tools never read styles.*).
  const resolve = (slot: keyof DrawingStylePaths, fallback: string[]): StylePath => {
    const sp = paths[slot]
    if (sp !== undefined) {
      return sp
    }
    return ['styles', ...fallback]
  }
  const liveRoot = (sp: StylePath): unknown =>
    sp[0] === 'extendData' ? overlay.extendData : liveStyles()
  const liveStyles = (): Record<string, unknown> => (overlay.styles ?? {}) as Record<string, unknown>
  const bind = (sp: StylePath): Pick<SettingField, 'get' | 'set'> => ({
    get: () => readPath(liveRoot(sp), sp.slice(1)),
    set: v => {
      if (sp[0] === 'extendData') {
        draft.extendData(sp.slice(1), v)
      } else {
        draft.style(sp.slice(1), v)
      }
    }
  })

  const hasLine = styles.line !== undefined || hasRecipeControl(item, 'color', 'line') || hasRecipeControl(item, 'style', 'line')
  const hasText = item?.capabilities.hasText === true || styles.text !== undefined
  const hasFill = hasRecipeControl(item, 'color', 'fill') || styles.polygon !== undefined

  if (hasLine) {
    const lineColor = resolve('lineColor', ['line', 'color'])
    const lineWidth = resolve('lineWidth', ['line', 'size'])
    const lineStyle = resolve('lineStyle', ['line', 'style'])
    fields.push(
      { id: 'lineColor', kind: 'color', label: 'Line color', ...bind(lineColor) },
      { id: 'lineWidth', kind: 'number', label: 'Width', min: 1, max: 8, step: 1, ...bind(lineWidth) },
      {
        id: 'lineStyle',
        kind: 'select',
        label: 'Style',
        options: LINE_STYLE_OPTIONS,
        ...bind(lineStyle),
        get: () => readPath(liveRoot(lineStyle), lineStyle.slice(1)) ?? 'solid',
        set: v => {
          if (lineStyle[0] === 'extendData') {
            draft.extendData(lineStyle.slice(1), v)
          } else {
            draft.style(lineStyle.slice(1), v)
            if (typeof v === 'string' && v in DASHED_VALUE) {
              draft.style(['line', 'dashedValue'], DASHED_VALUE[v])
            }
          }
        }
      }
    )
  }

  if (hasFill) {
    const fillColor = resolve('fillColor', ['polygon', 'color'])
    fields.push({ id: 'fillColor', kind: 'color', label: 'Fill color', ...bind(fillColor) })
  }

  if (hasRecipeControl(item, 'color', 'background')) {
    const backgroundColor = resolve('backgroundColor', ['rect', 'color'])
    fields.push({ id: 'backgroundColor', kind: 'color', label: 'Background', ...bind(backgroundColor) })
  }

  if (hasText) {
    const textColor = resolve('textColor', ['text', 'color'])
    const textSize = resolve('textSize', ['text', 'size'])
    const textWeight = resolve('textWeight', ['text', 'weight'])
    const textStyle = resolve('textStyle', ['text', 'style'])
    const textAlign = resolve('textAlign', ['text', 'align'])
    fields.push(
      { id: 'textColor', kind: 'color', label: 'Text color', ...bind(textColor) },
      { id: 'textSize', kind: 'number', label: 'Font size', min: 8, max: 64, step: 1, ...bind(textSize) },
      {
        id: 'textBold',
        kind: 'checkbox',
        label: 'Bold',
        get: () => readPath(liveRoot(textWeight), textWeight.slice(1)) === 'bold',
        set: v => {
          if (textWeight[0] === 'extendData') {
            draft.extendData(textWeight.slice(1), v === true ? 'bold' : 'normal')
          } else {
            draft.style(textWeight.slice(1), v === true ? 'bold' : 'normal')
          }
        }
      },
      {
        id: 'textItalic',
        kind: 'checkbox',
        label: 'Italic',
        get: () => readPath(liveRoot(textStyle), textStyle.slice(1)) === 'italic',
        set: v => {
          if (textStyle[0] === 'extendData') {
            draft.extendData(textStyle.slice(1), v === true ? 'italic' : 'normal')
          } else {
            draft.style(textStyle.slice(1), v === true ? 'italic' : 'normal')
          }
        }
      },
      { id: 'textAlign', kind: 'select', label: 'Align', options: TEXT_ALIGN_OPTIONS, ...bind(textAlign) }
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
    // `_`-prefixed runtime keys and `isEditing` are transient state —
    // serialize strips them; surfacing them as toggles corrupts the strip.
    .filter(key => key !== 'common' && key !== 'data' && !key.startsWith('_') && key !== 'isEditing' && isBoolean(record[key]))
    .map(key => ({
      id: `flag_${key}`,
      kind: 'checkbox' as const,
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()),
      get: () => (overlay.extendData as Record<string, unknown>)[key],
      set: v => { draft.extendData([key], v) }
    }))
}

function levelsField (overlay: Overlay, draft: SettingsDraft): SettingField | null {
  if (findLevelsPath(overlay.extendData) === null) {
    return null
  }
  return {
    id: 'levels',
    kind: 'levels',
    label: 'Levels',
    // Resolve through overlay.extendData on EVERY access — override()
    // replaces extendData with a fresh clone per commit, so a captured
    // owner object goes stale and silently discards later edits.
    get: () => findLevelsPath(overlay.extendData)?.levels,
    set: v => {
      // Levels arrays are committed whole — deep-merging rows per index
      // would leak stale entries on removal.
      const live = findLevelsPath(overlay.extendData)
      if (live !== null) {
        draft.extendData(live.path, v)
      }
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
        // points can shrink (undo/remote) while the dialog is open —
        // a stale index must not throw mid-render.
        get: () => overlay.points[index]?.timestamp,
        set: v => { draft.point(index, { timestamp: v as number }) }
      })
    }
    if (isNumber(point.value)) {
      fields.push({
        id: `point_${index}_value`,
        kind: 'number',
        label: 'Price',
        step: 0,
        get: () => overlay.points[index]?.value,
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
