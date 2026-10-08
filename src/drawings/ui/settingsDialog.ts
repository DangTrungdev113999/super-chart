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

import type Nullable from '../../common/Nullable'
import { createDom } from '../../common/utils/dom'
import { isArray, isNumber } from '../../common/utils/typeChecks'
import type Chart from '../../Chart'
import type { Overlay } from '../../component/Overlay'

import type { PaneDomLayer } from '../dom/domLayer'
import { getPaneDomLayer } from '../dom/domLayer'
import type { DrawingManager } from '../manager'
import { findCatalogItemByOverlay } from '../catalog'
import { buildSettingsTabs, type SettingField, type SettingsDraft } from './settingsSchema'
import { injectDrawingStyles, PALETTE } from './styles'

/**
 * Settings dialog (DP-6c) — a tabbed, schema-driven panel rendered from the
 * selected overlay's catalog recipe + actual styles. Style / Coordinates /
 * Visibility tabs cover what per-tool settings panels used to hand-roll in
 * the consumer app; each control commit is one `manager.update` → one
 * undo/persist unit.
 */
export interface SettingsDialog {
  open: (overlay: Overlay) => void
  close: () => void
  isOpen: () => boolean
  destroy: () => void
}

const LEVEL_NUMBER_KEYS = ['coeff', 'percent', 'level', 'value', 'ratio']

function toLocalInputValue (timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInputValue (value: string): Nullable<number> {
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}

export function attachSettingsDialog (chart: Chart, manager: DrawingManager): SettingsDialog {
  injectDrawingStyles()

  let element: HTMLElement | null = null
  let unmount: Nullable<() => void> = null
  let layer: PaneDomLayer | null = null
  let current: Overlay | null = null
  let pos = { x: 40, y: 40 }
  let dragState: { startX: number, startY: number, baseX: number, baseY: number } | null = null
  let activeTab = 'style'
  let destroyed = false

  // ── draft ───────────────────────────────────────────────────────────────

  function makeDraft (): SettingsDraft & { commit: () => void } {
    const styles: Record<string, unknown> = {}
    const extendData: Record<string, unknown> = {}
    const pointsPatch = new Map<number, { timestamp?: number, value?: number }>()

    const stage = (root: Record<string, unknown>, path: string[], value: unknown): void => {
      let node = root
      path.slice(0, -1).forEach(key => {
        if (node[key] === null || typeof node[key] !== 'object') {
          node[key] = {}
        }
        node = node[key] as Record<string, unknown>
      })
      node[path[path.length - 1]] = value
    }

    return {
      style: (path, value) => { stage(styles, path, value) },
      extendData: (path, value) => { stage(extendData, path, value) },
      point: (index, patch) => {
        pointsPatch.set(index, { ...pointsPatch.get(index), ...patch })
      },
      commit: () => {
        if (current === null) {
          return
        }
        const patch: Parameters<DrawingManager['update']>[1] = {}
        if (Object.keys(styles).length > 0) {
          patch.styles = styles as Overlay['styles']
        }
        if (Object.keys(extendData).length > 0) {
          patch.extendData = extendData
        }
        if (pointsPatch.size > 0) {
          const next = current.points.map(p => ({ ...p }))
          pointsPatch.forEach((p, index) => {
            if (index < next.length) {
              Object.assign(next[index], p)
            }
          })
          patch.points = next
        }
        if (Object.keys(patch).length > 0) {
          manager.update(current.id, patch)
        }
        // DELETE the draft keys — assigning undefined keeps them enumerable,
        // so the next commit emits {key: undefined} and merge() writes
        // clone(undefined) over live styles/extendData — deleting them.
        for (const k of Object.keys(styles)) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- draft keys are dynamic style-group names; assigning undefined keeps them enumerable and the next commit would emit {key: undefined}
          delete styles[k]
        }
        for (const k of Object.keys(extendData)) {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- same reason: dynamic extendData keys must be removed, not set to undefined
          delete extendData[k]
        }
        pointsPatch.clear()
      }
    }
  }

  let draft = makeDraft()

  // ── field renderers ─────────────────────────────────────────────────────

  function fieldRow (label: string): { row: HTMLElement, control: HTMLElement } {
    const row = createDom('div')
    row.className = 'sc-drw-field'
    const lab = createDom('label')
    lab.className = 'sc-drw-field-label'
    lab.textContent = label
    const control = createDom('div')
    control.className = 'sc-drw-field-control'
    row.appendChild(lab)
    row.appendChild(control)
    return { row, control }
  }

  function numberInput (field: SettingField): HTMLElement {
    const { row, control } = fieldRow(field.label)
    const input = createDom('input')
    input.className = 'sc-drw-input'
    input.type = 'number'
    if (field.min !== undefined) { input.min = String(field.min) }
    if (field.max !== undefined) { input.max = String(field.max) }
    if (field.step !== undefined && field.step !== 0) { input.step = String(field.step) }
    const v = field.get?.()
    input.value = isNumber(v) ? String(v) : ''
    input.addEventListener('change', () => {
      const parsed = Number(input.value)
      if (!Number.isNaN(parsed)) {
        field.set?.(parsed)
        draft.commit()
      }
    })
    control.appendChild(input)
    return row
  }

  function colorInput (field: SettingField): HTMLElement {
    const { row, control } = fieldRow(field.label)
    const swatch = createDom('span')
    swatch.className = 'sc-drw-swatch'
    const paint = (): void => {
      const v = field.get?.()
      swatch.style.background = typeof v === 'string' ? v : '#2962ff'
    }
    paint()
    const grid = createDom('div')
    grid.className = 'sc-drw-palette sc-drw-palette--inline'
    PALETTE.forEach(color => {
      const cell = createDom('button')
      cell.className = 'sc-drw-palette-cell'
      cell.style.background = color
      cell.title = color
      cell.addEventListener('click', e => {
        e.stopPropagation()
        field.set?.(color)
        draft.commit()
        paint()
      })
      grid.appendChild(cell)
    })
    control.appendChild(swatch)
    control.appendChild(grid)
    return row
  }

  function selectInput (field: SettingField): HTMLElement {
    const { row, control } = fieldRow(field.label)
    const select = createDom('select')
    select.className = 'sc-drw-input'
    field.options?.forEach(opt => {
      const o = createDom('option')
      o.value = opt.value
      o.textContent = opt.label
      select.appendChild(o)
    })
    const v = field.get?.()
    if (typeof v === 'string') {
      select.value = v
    }
    select.addEventListener('change', () => {
      field.set?.(select.value)
      draft.commit()
    })
    control.appendChild(select)
    return row
  }

  function checkboxInput (field: SettingField): HTMLElement {
    const { row, control } = fieldRow(field.label)
    const input = createDom('input')
    input.type = 'checkbox'
    input.checked = field.get?.() === true
    input.addEventListener('change', () => {
      field.set?.(input.checked)
      draft.commit()
    })
    control.appendChild(input)
    return row
  }

  function datetimeInput (field: SettingField): HTMLElement {
    const { row, control } = fieldRow(field.label)
    const input = createDom('input')
    input.className = 'sc-drw-input'
    input.type = 'datetime-local'
    const v = field.get?.()
    if (isNumber(v)) {
      input.value = toLocalInputValue(v)
    }
    input.addEventListener('change', () => {
      const ms = fromLocalInputValue(input.value)
      if (ms !== null) {
        field.set?.(ms)
        draft.commit()
      }
    })
    control.appendChild(input)
    return row
  }

  function levelsEditor (field: SettingField): HTMLElement {
    const wrap = createDom('div')
    wrap.className = 'sc-drw-levels'
    const levels = field.get?.()
    if (!isArray(levels)) {
      return wrap
    }
    // Each row edits a clone of the whole array — removal/reorder can't
    // leak through a per-index merge. Re-read via field.get() every write:
    // after the first commit the overlay holds a NEW array and the captured
    // `levels` is stale — mapping it would silently drop earlier edits.
    const writeRow = (index: number, patch: Record<string, unknown>): void => {
      const live = field.get?.()
      if (!isArray(live)) {
        return
      }
      const next = (live as Array<Record<string, unknown>>).map((level, i) =>
        i === index ? { ...level, ...patch } : level
      )
      field.set?.(next)
      draft.commit()
    }
    ;(levels as Array<Record<string, unknown>>).forEach((level, index) => {
      const row = createDom('div')
      row.className = 'sc-drw-level-row'

      const vis = createDom('input')
      vis.type = 'checkbox'
      vis.checked = level.visible !== false
      vis.title = 'Show level'
      vis.addEventListener('change', () => { writeRow(index, { visible: vis.checked }) })
      row.appendChild(vis)

      const numKey = LEVEL_NUMBER_KEYS.find(k => isNumber(level[k])) ?? null
      const num = createDom('input')
      num.className = 'sc-drw-input sc-drw-input--narrow'
      num.type = 'number'
      num.step = '0.001'
      num.value = numKey !== null ? String(level[numKey]) : ''
      num.disabled = numKey === null
      num.addEventListener('change', () => {
        const parsed = Number(num.value)
        if (!Number.isNaN(parsed) && numKey !== null) {
          writeRow(index, { [numKey]: parsed })
        }
      })
      row.appendChild(num)

      if (typeof level.color === 'string' || 'color' in level) {
        const color = createDom('input')
        color.type = 'color'
        color.className = 'sc-drw-color'
        color.value = typeof level.color === 'string' ? level.color : '#2962ff'
        color.addEventListener('change', () => { writeRow(index, { color: color.value }) })
        row.appendChild(color)
      }
      wrap.appendChild(row)
    })
    const header = createDom('div')
    header.className = 'sc-drw-field-label'
    header.textContent = field.label
    const box = createDom('div')
    box.className = 'sc-drw-field'
    box.appendChild(header)
    box.appendChild(wrap)
    return box
  }

  function renderField (field: SettingField): HTMLElement | null {
    switch (field.kind) {
      case 'header': {
        const h = createDom('div')
        h.className = 'sc-drw-section'
        h.textContent = field.label
        return h
      }
      case 'color': return colorInput(field)
      case 'number': return numberInput(field)
      case 'select': return selectInput(field)
      case 'checkbox': return checkboxInput(field)
      case 'datetime': return datetimeInput(field)
      case 'levels': return levelsEditor(field)
      case 'text': {
        const { row, control } = fieldRow(field.label)
        const input = createDom('input')
        input.className = 'sc-drw-input'
        input.value = typeof field.get?.() === 'string' ? field.get() as string : ''
        input.addEventListener('change', () => {
          field.set?.(input.value)
          draft.commit()
        })
        control.appendChild(input)
        return row
      }
    }
    return null
  }

  // ── panel ───────────────────────────────────────────────────────────────

  function renderBody (): void {
    if (element === null || current === null) {
      return
    }
    const body = element.querySelector('.sc-drw-dialog-body')
    if (body === null) {
      return
    }
    body.innerHTML = ''
    draft = makeDraft()
    const tabs = buildSettingsTabs(current, findCatalogItemByOverlay(current.name) ?? undefined, draft)
    if (tabs.length === 0) {
      return
    }
    const tab = tabs.find(t => t.id === activeTab) ?? tabs[0]
    activeTab = tab.id
    const tabBar = element.querySelector('.sc-drw-dialog-tabs')
    if (tabBar !== null) {
      tabBar.innerHTML = ''
      tabs.forEach(t => {
        const b = createDom('button')
        b.className = 'sc-drw-dialog-tab'
        b.textContent = t.title
        if (t.id === activeTab) {
          b.setAttribute('data-on', 'true')
        }
        b.addEventListener('click', e => {
          e.stopPropagation()
          activeTab = t.id
          renderBody()
        })
        tabBar.appendChild(b)
      })
    }
    tab.fields.forEach(field => {
      const el = renderField(field)
      if (el !== null) {
        body.appendChild(el)
      }
    })
  }

  function onDocumentMouseDown (e: MouseEvent): void {
    if (element !== null && !element.contains(e.target as Node)) {
      close()
    }
  }

  function onDocumentKeyDown (e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // Swallow the key — otherwise the shared drawing keyboard layer also
      // sees it and deselects the overlay / cancels the armed tool on top
      // of the dialog closing.
      e.stopPropagation()
      e.preventDefault()
      close()
    }
  }

  function clampPos (): void {
    if (layer === null) {
      return
    }
    const host = layer.getElement()
    const w = element?.offsetWidth ?? 240
    const h = element?.offsetHeight ?? 200
    // Clamp inside the pane — an unclamped drag parks the dialog off-layer
    // (overflow:hidden) where it can never be grabbed again.
    pos.x = Math.max(0, Math.min(pos.x, Math.max(0, host.clientWidth - w)))
    pos.y = Math.max(0, Math.min(pos.y, Math.max(0, host.clientHeight - h)))
  }

  function onDragMove (e: MouseEvent): void {
    if (dragState === null || element === null) {
      return
    }
    pos = {
      x: dragState.baseX + (e.clientX - dragState.startX),
      y: dragState.baseY + (e.clientY - dragState.startY)
    }
    clampPos()
    element.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
  }

  function onDragEnd (): void {
    dragState = null
  }

  const onOverlayChange = (): void => {
    // 'change' covers remove/update/create/undo/redo/restore — close
    // whenever the open overlay is gone, regardless of which path removed
    // it (undo and scope wipes carry no overlay in the payload).
    if (current !== null && chart.getOverlayById(current.id) === null) {
      close()
    }
  }

  let unsubRemove: Nullable<() => void> = null
  let docListenersBound = false

  function bindDocListeners (): void {
    if (docListenersBound) {
      return
    }
    docListenersBound = true
    document.addEventListener('mousedown', onDocumentMouseDown, true)
    document.addEventListener('keydown', onDocumentKeyDown, true)
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
    // Mouseup outside the window never dispatches — blur ends the drag.
    window.addEventListener('blur', onDragEnd)
    unsubRemove = manager.on('change', onOverlayChange)
  }

  function unbindDocListeners (): void {
    if (!docListenersBound) {
      return
    }
    docListenersBound = false
    document.removeEventListener('mousedown', onDocumentMouseDown, true)
    document.removeEventListener('keydown', onDocumentKeyDown, true)
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
    window.removeEventListener('blur', onDragEnd)
    unsubRemove?.()
    unsubRemove = null
  }

  function open (overlay: Overlay): void {
    if (destroyed) {
      return
    }
    close()
    current = overlay
    layer = getPaneDomLayer(chart, overlay.paneId)
    if (layer === null) {
      current = null
      return
    }
    activeTab = 'style'
    element = createDom('div')
    element.className = 'sc-drw-dialog'
    element.setAttribute('role', 'dialog')
    element.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
    // Keep chart interaction events from bleeding through the panel.
    const el = element
    ;['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'wheel', 'touchstart', 'touchmove', 'touchend'].forEach(type => {
      el.addEventListener(type, e => { e.stopPropagation() })
    })

    const header = createDom('div')
    header.className = 'sc-drw-dialog-header'
    const title = createDom('span')
    title.textContent = overlay.name
    const closeBtn = createDom('button')
    closeBtn.className = 'sc-drw-btn'
    closeBtn.textContent = '×'
    closeBtn.title = 'Close'
    closeBtn.addEventListener('click', e => {
      e.stopPropagation()
      close()
    })
    header.appendChild(title)
    header.appendChild(closeBtn)
    header.addEventListener('mousedown', e => {
      if ((e.target as HTMLElement) === closeBtn) {
        return
      }
      dragState = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y }
      e.preventDefault()
    })
    element.appendChild(header)

    const tabs = createDom('div')
    tabs.className = 'sc-drw-dialog-tabs'
    element.appendChild(tabs)

    const body = createDom('div')
    body.className = 'sc-drw-dialog-body'
    element.appendChild(body)

    // interactive: without it the layer leaves pointerEvents:none on the
    // container — every input is unreachable AND the document mousedown
    // handler sees each click as "outside" → auto-close on first click.
    unmount = layer.mount(element, { interactive: true })
    bindDocListeners()
    renderBody()
    // pos persists across opens — a pane resize could leave it parked
    // off-layer, so re-clamp now that the element has a real size.
    clampPos()
    element.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
  }

  function close (): void {
    unmount?.()
    unmount = null
    element = null
    current = null
    layer = null
    unbindDocListeners()
  }

  return {
    open,
    close,
    isOpen: () => element !== null,
    destroy: () => {
      destroyed = true
      close()
    }
  }
}
