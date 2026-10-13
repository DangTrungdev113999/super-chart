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

import { isValid } from '../common/utils/typeChecks'
import type { Overlay, OverlayCreate } from '../component/Overlay'

/**
 * Per-tool style templates — TV's floating-toolbar "templates" dropdown.
 * "Save as default" snapshots the selected drawing's styles (+extendData)
 * as the template for its tool name; new drawings of that tool pick the
 * template up at create time, and the dropdown can re-apply it to the
 * current selection.
 *
 * Storage is localStorage by default; hosts can swap in a server-backed
 * store via setDrawingTemplateStore.
 */

export interface DrawingTemplate {
  styles?: Overlay['styles']
  extendData?: unknown
  savedAt: number
}

export interface DrawingTemplateStore {
  load: (overlayName: string) => DrawingTemplate | null
  save: (overlayName: string, template: DrawingTemplate) => void
  clear?: (overlayName: string) => void
}

const KEY_PREFIX = 'sc-drw-template:'

const localStore: DrawingTemplateStore = {
  load (overlayName) {
    try {
      if (typeof globalThis.localStorage === 'undefined') {
        return null
      }
      const raw = globalThis.localStorage.getItem(KEY_PREFIX + overlayName)
      if (raw === null) {
        return null
      }
      const parsed: unknown = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object') {
        return parsed as DrawingTemplate
      }
    } catch {
      // Corrupt or unavailable storage — fall through to no-template.
    }
    return null
  },
  save (overlayName, template) {
    try {
      if (typeof globalThis.localStorage === 'undefined') {
        return
      }
      globalThis.localStorage.setItem(KEY_PREFIX + overlayName, JSON.stringify(template))
    } catch {
      // Quota/private mode — saving defaults is best-effort.
    }
  },
  clear (overlayName) {
    try {
      if (typeof globalThis.localStorage === 'undefined') {
        return
      }
      globalThis.localStorage.removeItem(KEY_PREFIX + overlayName)
    } catch {
      // Best-effort.
    }
  }
}

let store: DrawingTemplateStore = localStore

export function setDrawingTemplateStore (custom: DrawingTemplateStore | null): void {
  store = custom ?? localStore
}

export function getDrawingTemplate (overlayName: string): DrawingTemplate | null {
  return store.load(overlayName)
}

export function saveDrawingTemplate (overlayName: string, overlay: Overlay): void {
  store.save(overlayName, {
    styles: overlay.styles,
    extendData: overlay.extendData,
    savedAt: Date.now()
  })
}

export function clearDrawingTemplate (overlayName: string): void {
  store.clear?.(overlayName)
}

/**
 * Merge the saved template (if any) into a create payload — styles merge
 * shallowly per channel so a partial template can't wipe the tool's own
 * defaults; extendData only applies when the caller didn't pass one.
 */
export function applyDrawingTemplate (create: OverlayCreate): OverlayCreate {
  const name = typeof create.name === 'string' ? create.name : ''
  if (name === '') {
    return create
  }
  const template = store.load(name)
  if (template === null) {
    return create
  }
  const next = { ...create }
  if (isValid(template.styles)) {
    const merged: Record<string, unknown> = { ...(next.styles as Record<string, unknown> | undefined) }
    for (const [channel, value] of Object.entries(template.styles)) {
      const existing = merged[channel]
      merged[channel] = existing !== null && typeof existing === 'object' && value !== null && typeof value === 'object'
        ? { ...(existing as Record<string, unknown>), ...(value as Record<string, unknown>) }
        : value
    }
    next.styles = merged as Overlay['styles']
  }
  if (next.extendData === undefined && template.extendData !== undefined) {
    next.extendData = template.extendData
  }
  return next
}
