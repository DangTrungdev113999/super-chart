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

import { createDom } from '../../common/utils/dom'
import type Chart from '../../Chart'
import type { Overlay } from '../../component/Overlay'

import type { DrawingManager } from '../manager'
import { serializeOverlay, serializedToOverlayCreate } from '../serialize'
import { getDrawingIcon } from '../icons'
import { injectDrawingStyles } from './styles'

/**
 * Right-click context menu for drawings (TradingView behavior): opens at
 * the cursor on `contextmenu` manager events — Settings / Duplicate / Copy,
 * z-order, Lock / Hide / Remove — plus host-supplied extra items. Rendered
 * on document.body like the flyouts so nothing clips it.
 */
export interface ContextMenuItem {
  id: string
  label: string
  icon?: string
  danger?: boolean
  checked?: boolean
  disabled?: boolean
  onSelect?: (overlay: Overlay) => void
}

export interface ContextMenuOptions {
  label?: (id: string, fallback: string) => string
  /** Open the settings surface for the overlay (wired to the lib dialog by the api). */
  onSettings?: (overlay: Overlay) => void
  /** Copy sink — the api forwards its internal drawing clipboard. */
  onCopy?: (drawing: ReturnType<typeof serializeOverlay>) => void
  /** Host extra rows appended above the Remove separator. */
  extraItems?: (overlay: Overlay) => ContextMenuItem[]
  /** Host veto — return false to suppress the menu for this overlay (e.g.
   *  overlays whose UX is owned by consumer panels). */
  shouldShow?: (overlay: Overlay) => boolean
}

export interface DrawingContextMenu {
  isOpen: () => boolean
  close: () => void
  destroy: () => void
}

export function attachContextMenu (chart: Chart, manager: DrawingManager, options?: ContextMenuOptions): DrawingContextMenu {
  injectDrawingStyles()
  const label = options?.label ?? ((_id: string, fallback: string) => fallback)

  let menu: HTMLElement | null = null

  function itemEl (item: ContextMenuItem, overlay: Overlay): HTMLElement {
    const el = createDom('button')
    el.className = 'sc-drw-menu-item'
    el.type = 'button'
    if (item.checked === true) {
      el.dataset.on = 'true'
    }
    if (item.danger === true) {
      el.classList.add('sc-drw-menu-item--danger')
    }
    if (item.disabled === true) {
      el.disabled = true
      el.classList.add('sc-drw-menu-item--disabled')
    }
    if (item.icon !== undefined) {
      const icon = createDom('span')
      icon.className = 'sc-drw-menu-icon'
      icon.innerHTML = getDrawingIcon(item.icon)
      el.appendChild(icon)
    }
    const text = createDom('span')
    text.className = 'sc-drw-menu-text'
    text.textContent = label(item.id, item.label)
    el.appendChild(text)
    el.addEventListener('click', () => {
      close()
      item.onSelect?.(overlay)
    })
    return el
  }

  function clone (overlay: Overlay): void {
    const serialized = serializeOverlay(overlay)
    if (serialized === null) {
      return
    }
    const create = serializedToOverlayCreate(serialized)
    if (create === null) {
      return
    }
    delete (create as { id?: string }).id
    create.lock = false
    create.visible = true
    const bars = chart.getDataList()
    const oneBar = bars.length > 1 ? bars[1].timestamp - bars[0].timestamp : 0
    if (create.points !== undefined) {
      create.points = create.points.map(p => ({
        ...p,
        timestamp: p.timestamp !== undefined ? p.timestamp + oneBar : p.timestamp,
        dataIndex: p.dataIndex !== undefined ? p.dataIndex + 1 : p.dataIndex
      }))
    }
    manager.create(create)
  }

  function copy (overlay: Overlay): void {
    options?.onCopy?.(serializeOverlay(overlay))
  }

  function zLevelEdge (dir: 1 | -1): number {
    const siblings = chart.getOverlays({ groupId: 'drawings' })
    let edge = 0
    siblings.forEach(o => {
      const z = o.zLevel
      edge = dir === 1 ? Math.max(edge, z) : Math.min(edge, z)
    })
    return edge + dir
  }

  function separator (): HTMLElement {
    const sep = createDom('div')
    sep.className = 'sc-drw-menu-sep'
    return sep
  }

  function open (x: number, y: number, overlay: Overlay): void {
    close()
    const locked = overlay.lock

    const items: Array<ContextMenuItem | 'sep'> = []
    if (options?.onSettings !== undefined) {
      items.push({ id: 'settings', label: 'Settings…', icon: 'settings', onSelect: o => options.onSettings?.(o) })
    }
    items.push(
      { id: 'duplicate', label: 'Duplicate', icon: 'clone', disabled: locked, onSelect: clone },
      { id: 'copy', label: 'Copy', icon: 'copy', disabled: locked, onSelect: copy },
      'sep',
      { id: 'bringToFront', label: 'Bring to front', icon: 'bringToFront', disabled: locked, onSelect: o => { manager.update(o.id, { zLevel: zLevelEdge(1) }) } },
      { id: 'sendToBack', label: 'Send to back', icon: 'sendToBack', disabled: locked, onSelect: o => { manager.update(o.id, { zLevel: zLevelEdge(-1) }) } },
      'sep',
      locked
        ? { id: 'unlock', label: 'Unlock', icon: 'unlock', onSelect: o => { manager.update(o.id, { lock: false }) } }
        : { id: 'lock', label: 'Lock', icon: 'lock', onSelect: o => { manager.update(o.id, { lock: true }) } },
      { id: 'hide', label: 'Hide', icon: 'hide', disabled: locked, onSelect: o => { manager.update(o.id, { visible: false }) } }
    )
    const extras = options?.extraItems?.(overlay)
    if (extras !== undefined && extras.length > 0) {
      items.push('sep', ...extras)
    }
    items.push('sep', {
      id: 'remove',
      label: 'Remove',
      icon: 'remove',
      danger: true,
      disabled: locked,
      onSelect: o => { manager.remove(o.id) }
    })

    menu = createDom('div')
    menu.className = 'sc-drw-menu sc-drw-ctxmenu'
    menu.setAttribute('role', 'menu')
    items.forEach(it => {
      menu?.appendChild(it === 'sep' ? separator() : itemEl(it, overlay))
    })
    document.body.appendChild(menu)

    // pageX/Y are page coordinates — the menu is position:fixed, so
    // convert to client coordinates before clamping to the viewport.
    const rect = menu.getBoundingClientRect()
    let left = x - window.scrollX
    let top = y - window.scrollY
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8)
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8)
    }
    menu.style.left = `${Math.round(left)}px`
    menu.style.top = `${Math.round(top)}px`

    document.addEventListener('pointerdown', onDocDown, true)
    document.addEventListener('keydown', onDocKey, true)
    window.addEventListener('resize', close, { once: true })
  }

  function onDocDown (e: Event): void {
    if (menu !== null && !menu.contains(e.target as Node)) {
      close()
    }
  }

  function onDocKey (e: KeyboardEvent): void {
    if (e.key === 'Escape' && menu !== null) {
      e.preventDefault()
      e.stopImmediatePropagation()
      close()
    }
  }

  function close (): void {
    if (menu !== null) {
      menu.remove()
      menu = null
    }
    document.removeEventListener('pointerdown', onDocDown, true)
    document.removeEventListener('keydown', onDocKey, true)
  }

  const offContextMenu = manager.on('contextmenu', p => {
    if (p.overlay === undefined || p.x === undefined || p.y === undefined) {
      return
    }
    if (options?.shouldShow !== undefined && !options.shouldShow(p.overlay)) {
      return
    }
    open(p.x, p.y, p.overlay)
  })

  return {
    isOpen: () => menu !== null,
    close,
    destroy: () => {
      offContextMenu()
      close()
    }
  }
}
