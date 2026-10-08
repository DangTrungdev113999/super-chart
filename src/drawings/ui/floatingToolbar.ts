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
import { isArray } from '../../common/utils/typeChecks'
import type Chart from '../../Chart'
import type { Overlay } from '../../component/Overlay'

import type { PaneDomLayer } from '../dom/domLayer'
import { getPaneDomLayer } from '../dom/domLayer'
import type { DrawingManager } from '../manager'
import { findCatalogItemByOverlay, type ToolbarControl } from '../catalog'
import { getDrawingIcon } from '../icons'
import { isAlign45Enabled, setAlign45Enabled } from '../interaction/snap45'
import { serializeOverlay, serializedToOverlayCreate } from '../serialize'
import { injectDrawingStyles, PALETTE } from './styles'

/**
 * Floating quick-settings toolbar (DP-6b). Lives on the pane DOM layer and
 * renders the selected tool's `toolbarRecipe` from the catalog — the same
 * per-tool-family property-map model TradingView uses.
 *
 * Controls are self-describing: a host renders no buttons itself; the
 * recipe decides which swatches/dropdowns/toggles appear, and actions
 * (clone/remove/lock/hide/more-menu) are wired here once for every tool.
 */

const LINE_WIDTHS = [1, 2, 3, 4]
const LINE_STYLES: Array<{ value: string, title: string }> = [
  { value: 'solid', title: 'Solid' },
  { value: 'dashed', title: 'Dashed' },
  { value: 'dotted', title: 'Dotted' }
]
const FONT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40]
const TEXT_ALIGNS: Array<{ value: string, title: string }> = [
  { value: 'left', title: 'Align left' },
  { value: 'center', title: 'Align center' },
  { value: 'right', title: 'Align right' }
]

export interface ToolbarSourceAction {
  title: string
  iconId?: string
  onClick: (overlay: Overlay) => void
}

export interface FloatingToolbarHooks {
  /** Settings gear — DP-6c dialog or host-side panel. */
  onSettings?: (overlay: Overlay) => void
  /** Alert action hook — host wires its alerting UI. */
  onAlert?: (overlay: Overlay) => void
  /** Text edit shortcut — host/lib opens the text editor. */
  onTextEdit?: (overlay: Overlay) => void
  /** Per-tool action injection (TV's source-actions slot). */
  additionalActions?: (overlay: Overlay) => ToolbarSourceAction[]
}

export interface FloatingToolbar {
  show: (overlay: Overlay) => void
  hide: () => void
  destroy: () => void
}

const DEFAULT_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' },
  { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' },
  { kind: 'settings' }, { kind: 'remove' }, { kind: 'more' }
]

export function attachFloatingToolbar (
  chart: Chart,
  manager: DrawingManager,
  hooks?: FloatingToolbarHooks
): FloatingToolbar {
  injectDrawingStyles()

  let element: HTMLElement | null = null
  let unmount: (() => void) | null = null
  let layer: PaneDomLayer | null = null
  let current: Overlay | null = null
  let menuEl: HTMLElement | null = null
  let menuUnmount: (() => void) | null = null
  let manualOffset: { dx: number, dy: number } | null = null
  let dragState: { startX: number, startY: number, baseX: number, baseY: number } | null = null
  // Toolbar position in pane px — transform-based, so we track it ourselves
  // (offsetLeft/offsetTop stay 0 under translate3d positioning).
  let pos = { x: 0, y: 0 }
  let destroyed = false

  // ── helpers ─────────────────────────────────────────────────────────────

  function btn (iconId: string, title: string, onClick: () => void, on?: boolean): HTMLElement {
    const b = createDom('button')
    b.className = 'sc-drw-btn'
    b.title = title
    b.setAttribute('aria-label', title)
    if (on === true) {
      b.setAttribute('data-on', 'true')
    }
    b.innerHTML = getDrawingIcon(iconId)
    b.addEventListener('click', e => {
      e.stopPropagation()
      onClick()
    })
    return b
  }

  function sep (): HTMLElement {
    const d = createDom('div')
    d.className = 'sc-drw-sep'
    return d
  }

  function closeMenu (): void {
    menuUnmount?.()
    menuUnmount = null
    menuEl = null
  }

  function openMenu (anchorEl: HTMLElement, build: (menu: HTMLElement) => void): void {
    if (menuEl !== null) {
      closeMenu()
      return
    }
    if (layer === null || element === null) {
      return
    }
    closeMenu()
    const menu = createDom('div')
    menu.className = 'sc-drw-menu'
    build(menu)
    // Position below the toolbar, aligned to the anchor button.
    const tbRect = element.getBoundingClientRect()
    const bRect = anchorEl.getBoundingClientRect()
    menu.style.transform = `translate3d(${bRect.left - tbRect.left}px, ${element.offsetHeight + 6}px, 0)`
    menuEl = menu
    element.appendChild(menu)
    menuUnmount = () => {
      menuEl?.parentElement?.removeChild(menuEl)
      menuEl = null
    }
  }

  function styleMenuItem (title: string, active: boolean, onClick: () => void, iconId?: string): HTMLElement {
    const b = createDom('button')
    b.className = 'sc-drw-menu-item'
    if (active) {
      b.setAttribute('data-on', 'true')
    }
    if (iconId !== undefined) {
      b.innerHTML = getDrawingIcon(iconId)
      // title is host-supplied (custom toolbar actions) — never innerHTML it.
      const span = createDom('span')
      span.textContent = title
      b.appendChild(span)
    } else {
      b.textContent = title
    }
    b.addEventListener('click', e => {
      e.stopPropagation()
      closeMenu()
      onClick()
    })
    return b
  }

  // ── control renderers ───────────────────────────────────────────────────

  function patchStyles (path: string[], value: unknown): void {
    if (current === null) {
      return
    }
    const styles: Record<string, unknown> = {}
    let node = styles
    path.slice(0, -1).forEach(key => {
      const next: Record<string, unknown> = {}
      node[key] = next
      node = next
    })
    node[path[path.length - 1]] = value
    manager.update(current.id, { styles: styles as Overlay['styles'] })
  }

  function currentStyleValue (path: string[]): unknown {
    const styles = current?.styles as Record<string, unknown> | undefined
    let node: unknown = styles
    for (const key of path) {
      if (node === null || typeof node !== 'object') {
        return undefined
      }
      node = (node as Record<string, unknown>)[key]
    }
    return node
  }

  function colorControl (role: 'line' | 'fill' | 'text' | 'background'): HTMLElement {
    const paths: Record<typeof role, string[]> = {
      line: ['line', 'color'],
      fill: ['polygon', 'color'],
      text: ['text', 'color'],
      background: ['rect', 'color']
    }
    const path = paths[role]
    const swatch = createDom('span')
    swatch.className = 'sc-drw-swatch'
    const paint = (): void => {
      const v = currentStyleValue(path)
      swatch.style.background = typeof v === 'string' ? v : '#2962ff'
    }
    paint()
    const b = createDom('button')
    b.className = 'sc-drw-btn'
    b.title = `${role} color`
    b.appendChild(swatch)
    b.addEventListener('click', e => {
      e.stopPropagation()
      openMenu(b, menu => {
        const grid = createDom('div')
        grid.className = 'sc-drw-palette'
        PALETTE.forEach(color => {
          const cell = createDom('button')
          cell.className = 'sc-drw-palette-cell'
          cell.style.background = color
          cell.title = color
          cell.addEventListener('click', ev => {
            ev.stopPropagation()
            closeMenu()
            patchStyles(path, color)
          })
          grid.appendChild(cell)
        })
        menu.appendChild(grid)
      })
    })
    return b
  }

  function dropdownButton (iconId: string, title: string, items: Array<{ title: string, active: boolean, onClick: () => void }>): HTMLElement {
    const b = btn(iconId, title, () => {
      openMenu(b, menu => {
        items.forEach(item => {
          menu.appendChild(styleMenuItem(item.title, item.active, item.onClick))
        })
      })
    })
    return b
  }

  function lineStyleControl (): HTMLElement {
    return dropdownButton('trendLine', 'Line style', LINE_STYLES.map(s => ({
      title: s.title,
      active: currentStyleValue(['line', 'style']) === s.value,
      onClick: () => {
        patchStyles(['line', 'style'], s.value)
      }
    })))
  }

  function widthControl (): HTMLElement {
    return dropdownButton('trendLine', 'Line width', LINE_WIDTHS.map(w => ({
      title: `${w}px`,
      active: currentStyleValue(['line', 'size']) === w,
      onClick: () => {
        patchStyles(['line', 'size'], w)
      }
    })))
  }

  function fontSizeControl (): HTMLElement {
    return dropdownButton('text', 'Text size', FONT_SIZES.map(s => ({
      title: `${s}px`,
      active: currentStyleValue(['text', 'size']) === s,
      onClick: () => {
        patchStyles(['text', 'size'], s)
      }
    })))
  }

  function textStyleControl (): HTMLElement {
    const b = btn('text', 'Text style', () => {
      openMenu(b, menu => {
        const bold = currentStyleValue(['text', 'weight']) === 'bold'
        const italic = currentStyleValue(['text', 'style']) === 'italic'
        menu.appendChild(styleMenuItem('Bold', bold, () => {
          patchStyles(['text', 'weight'], bold ? 'normal' : 'bold')
        }))
        menu.appendChild(styleMenuItem('Italic', italic, () => {
          patchStyles(['text', 'style'], italic ? 'normal' : 'italic')
        }))
        menu.appendChild(styleMenuItem('Size…', false, () => {
          openMenu(b, sub => {
            FONT_SIZES.forEach(s => {
              sub.appendChild(styleMenuItem(`${s}px`, currentStyleValue(['text', 'size']) === s, () => {
                patchStyles(['text', 'size'], s)
              }))
            })
          })
        }))
      })
    })
    return b
  }

  function textAlignControl (): HTMLElement {
    const currentAlign = (): string => {
      const v = currentStyleValue(['text', 'align'])
      return typeof v === 'string' ? v : 'center'
    }
    return btn('text', 'Text align', () => {
      const order = TEXT_ALIGNS.map(a => a.value)
      const idx = order.indexOf(currentAlign())
      const next = order[(idx + 1) % order.length]
      patchStyles(['text', 'align'], next)
    })
  }

  function geometryControl (options: Array<'rect' | 'rotated' | 'ellipse'>): HTMLElement {
    const titles: Record<string, string> = { rect: 'Rectangle', rotated: 'Rotated rectangle', ellipse: 'Ellipse' }
    const b = btn('rect', 'Shape', () => {
      openMenu(b, menu => {
        options.forEach(opt => {
          menu.appendChild(styleMenuItem(titles[opt], false, () => {
            if (current !== null) {
              const ext = current.extendData
              const next = typeof ext === 'object' && ext !== null ? { ...(ext as Record<string, unknown>), geometry: opt } : { geometry: opt }
              manager.update(current.id, { extendData: next })
            }
          }))
        })
      })
    })
    return b
  }

  function moreMenu (): HTMLElement {
    const b = btn('settings', 'More', () => {
      openMenu(b, menu => {
        if (current === null) {
          return
        }
        const overlay = current
        const label = createDom('div')
        label.className = 'sc-drw-menu-label'
        label.textContent = 'Order'
        menu.appendChild(label)
        menu.appendChild(styleMenuItem('Bring to front', false, () => {
          manager.update(overlay.id, { zLevel: overlay.zLevel + 1000 })
        }))
        menu.appendChild(styleMenuItem('Send to back', false, () => {
          manager.update(overlay.id, { zLevel: overlay.zLevel - 1000 })
        }))
        const label2 = createDom('div')
        label2.className = 'sc-drw-menu-label'
        label2.textContent = 'Actions'
        menu.appendChild(label2)
        menu.appendChild(styleMenuItem(!overlay.visible ? 'Show' : 'Hide', false, () => {
          manager.update(overlay.id, { visible: !overlay.visible })
        }, 'hide'))
        menu.appendChild(styleMenuItem('Clone', false, () => {
          cloneOverlay(overlay)
        }, 'rect'))
        menu.appendChild(styleMenuItem(overlay.lock ? 'Unlock' : 'Lock', overlay.lock, () => {
          manager.update(overlay.id, { lock: !overlay.lock })
        }, 'lock'))
        hooks?.additionalActions?.(overlay).forEach(action => {
          menu.appendChild(styleMenuItem(action.title, false, () => {
            action.onClick(overlay)
          }, action.iconId))
        })
      })
    })
    return b
  }

  function cloneOverlay (overlay: Overlay): void {
    const serialized = serializeOverlay(overlay)
    if (serialized === null) {
      return
    }
    const create = serializedToOverlayCreate(serialized)
    delete (create as { id?: string }).id
    // Nudge the clone so it doesn't z-fight the original.
    const bars = chart.getDataList()
    const oneBar = bars.length > 1 ? bars[1].timestamp - bars[0].timestamp : 0
    if (isArray(create.points)) {
      create.points = create.points.map(p => ({
        ...p,
        timestamp: p.timestamp !== undefined ? p.timestamp + oneBar : p.timestamp,
        dataIndex: p.dataIndex !== undefined ? p.dataIndex + 1 : p.dataIndex
      }))
    }
    manager.create(create)
  }

  // ── toolbar build ───────────────────────────────────────────────────────

  function controlEl (control: ToolbarControl): HTMLElement | null {
    if (current === null) {
      return null
    }
    const overlay = current
    switch (control.kind) {
      case 'color':
        return colorControl(control.role)
      case 'style':
        return control.role === 'line' ? lineStyleControl() : textStyleControl()
      case 'width':
        return widthControl()
      case 'text':
        return fontSizeControl()
      case 'textAlign':
        return textAlignControl()
      case 'geometry':
        return geometryControl(control.options)
      case 'levels':
        return btn('settings', 'Levels', () => {
          hooks?.onSettings?.(overlay)
        })
      case 'snap45':
        return btn('magnet', 'Snap to 45°', () => {
          setAlign45Enabled(chart, !isAlign45Enabled(chart))
          rerender()
        }, isAlign45Enabled(chart))
      case 'anchor':
        return btn('anchoredText', 'Anchor', () => {
          const ext = overlay.extendData as Record<string, unknown> | null | undefined
          const anchored = ext?.anchored === true
          manager.update(overlay.id, { extendData: { ...ext, anchored: !anchored } })
        })
      case 'alert':
        if (hooks?.onAlert === undefined) {
          return null
        }
        return btn('flag', 'Alert', () => {
          hooks.onAlert?.(overlay)
        })
      case 'lock':
        return btn('lock', overlay.lock ? 'Unlock' : 'Lock', () => {
          manager.update(overlay.id, { lock: !overlay.lock })
          rerender()
        }, overlay.lock)
      case 'visibility':
        return btn('hide', !overlay.visible ? 'Show' : 'Hide', () => {
          manager.update(overlay.id, { visible: !overlay.visible })
          rerender()
        }, !overlay.visible)
      case 'clone':
        return btn('rect', 'Clone', () => {
          cloneOverlay(overlay)
        })
      case 'settings':
        if (hooks?.onSettings === undefined) {
          return null
        }
        return btn('settings', 'Settings', () => {
          hooks.onSettings?.(overlay)
        })
      case 'remove':
        return btn('remove', 'Remove', () => {
          manager.remove(overlay.id)
        })
      case 'more':
        return moreMenu()
    }
  }

  function recipeFor (overlay: Overlay): ToolbarControl[] {
    // In-progress freehand: only a Cancel control (TV swaps Remove for it).
    if (overlay.isDrawing()) {
      return [{ kind: 'remove' }]
    }
    return findCatalogItemByOverlay(overlay.name)?.toolbarRecipe ?? DEFAULT_RECIPE
  }

  function build (): void {
    if (element === null || current === null) {
      return
    }
    // A rebuild orphans any open menu element — the old node's listeners are
    // gone but menuEl still references it, so the next openMenu swallows one
    // click toggling the detached node. Close before wiping.
    closeMenu()
    element.innerHTML = ''
    const grip = createDom('div')
    grip.className = 'sc-drw-btn sc-drw-grip'
    grip.title = 'Drag toolbar'
    grip.innerHTML = '<svg viewBox="0 0 8 20" width="8" height="20" fill="currentColor"><circle cx="2.5" cy="4" r="1.2"/><circle cx="5.5" cy="4" r="1.2"/><circle cx="2.5" cy="10" r="1.2"/><circle cx="5.5" cy="10" r="1.2"/><circle cx="2.5" cy="16" r="1.2"/><circle cx="5.5" cy="16" r="1.2"/></svg>'
    grip.addEventListener('mousedown', e => {
      if (element === null) {
        return
      }
      e.stopPropagation()
      e.preventDefault()
      dragState = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: pos.x,
        baseY: pos.y
      }
    })
    element.appendChild(grip)

    const recipe = recipeFor(current)
    let needSep = false
    recipe.forEach(control => {
      const el = controlEl(control)
      if (el === null) {
        return
      }
      if (needSep) {
        element?.appendChild(sep())
        needSep = false
      }
      element?.appendChild(el)
      if (control.kind === 'color' || control.kind === 'width' || control.kind === 'levels' || control.kind === 'text') {
        needSep = true
      }
    })
  }

  // ── positioning ─────────────────────────────────────────────────────────

  function overlayBounds (): Nullable<{ x1: number, y1: number, x2: number, y2: number }> {
    if (current === null) {
      return null
    }
    const pixels = chart.convertToPixel(current.points, { paneId: current.paneId })
    const list = isArray(pixels) ? pixels : [pixels]
    let x1 = Number.POSITIVE_INFINITY
    let y1 = Number.POSITIVE_INFINITY
    let x2 = Number.NEGATIVE_INFINITY
    let y2 = Number.NEGATIVE_INFINITY
    list.forEach(c => {
      if (c.x !== undefined && c.y !== undefined) {
        x1 = Math.min(x1, c.x)
        y1 = Math.min(y1, c.y)
        x2 = Math.max(x2, c.x)
        y2 = Math.max(y2, c.y)
      }
    })
    if (!Number.isFinite(x1) || !Number.isFinite(y1)) {
      return null
    }
    return { x1, y1, x2, y2 }
  }

  function reposition (): void {
    if (element === null || current === null || layer === null) {
      return
    }
    if (dragState !== null) {
      return // user is dragging the toolbar itself
    }
    const bounds = overlayBounds()
    const host = layer.getElement()
    const pw = host.clientWidth
    const ph = host.clientHeight
    const tw = element.offsetWidth
    const th = element.offsetHeight
    let x = 8
    let y = 8
    if (manualOffset !== null && bounds !== null) {
      x = bounds.x1 + (bounds.x2 - bounds.x1) / 2 - tw / 2 + manualOffset.dx
      y = bounds.y1 - th - 8 + manualOffset.dy
    } else if (bounds !== null) {
      x = bounds.x1 + (bounds.x2 - bounds.x1) / 2 - tw / 2
      y = bounds.y1 - th - 8
      if (y < 4) {
        y = bounds.y2 + 8
      }
    } else {
      x = 8
      y = 8
    }
    x = Math.max(4, Math.min(x, Math.max(4, pw - tw - 4)))
    y = Math.max(4, Math.min(y, Math.max(4, ph - th - 4)))
    pos = { x: Math.round(x), y: Math.round(y) }
    element.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
  }

  function onDragMove (e: MouseEvent): void {
    if (dragState === null || element === null) {
      return
    }
    const dx = e.clientX - dragState.startX
    const dy = e.clientY - dragState.startY
    pos = { x: Math.round(dragState.baseX + dx), y: Math.round(dragState.baseY + dy) }
    element.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
    const bounds = overlayBounds()
    if (bounds !== null) {
      const tw = element.offsetWidth
      const th = element.offsetHeight
      const anchorX = bounds.x1 + (bounds.x2 - bounds.x1) / 2 - tw / 2
      const anchorY = bounds.y1 - th - 8 < 4 ? bounds.y2 + 8 : bounds.y1 - th - 8
      manualOffset = { dx: pos.x - anchorX, dy: pos.y - anchorY }
    }
  }

  function onDragEnd (): void {
    dragState = null
  }

  // ── lifecycle ───────────────────────────────────────────────────────────

  function show (overlay: Overlay): void {
    if (destroyed) {
      return
    }
    hide()
    const nextLayer = getPaneDomLayer(chart, overlay.paneId)
    if (nextLayer === null) {
      return
    }
    layer = nextLayer
    current = overlay
    manualOffset = null
    element = createDom('div')
    element.className = 'sc-drw-toolbar'
    unmount = layer.mount(element, { interactive: true })
    build()
    reposition()
  }

  function hide (): void {
    closeMenu()
    unmount?.()
    unmount = null
    element = null
    current = null
    manualOffset = null
  }

  function rerender (): void {
    build()
    reposition()
  }

  let selectedId: string | null = null
  const onSelect = (payload: { overlay?: Overlay }): void => {
    if (payload.overlay !== undefined) {
      selectedId = payload.overlay.id
      show(payload.overlay)
    }
  }
  const onDeselect = (): void => {
    selectedId = null
    hide()
  }
  const onEditStart = (): void => {
    hide()
  }
  const onEditEnd = (payload: { overlay?: Overlay }): void => {
    // A figure drag on a NON-selected overlay also fires editEnd — binding
    // the toolbar to it would attach controls to an overlay the selection
    // model doesn't own.
    if (payload.overlay !== undefined && payload.overlay.id === selectedId) {
      show(payload.overlay)
    }
  }
  const onChange = (payload: { overlay?: Overlay }): void => {
    // If the tracked overlay vanished (remove/undo/scope wipe), drop the
    // toolbar — the 'change' payload may carry no overlay at all.
    if (selectedId !== null && chart.getOverlayById(selectedId) === null) {
      selectedId = null
      hide()
      return
    }
    if (current !== null && payload.overlay?.id === current.id) {
      rerender()
    } else {
      reposition()
    }
  }
  const onPanOrZoom = (): void => {
    reposition()
  }

  const unsubs: Array<() => void> = [
    manager.on('select', onSelect),
    manager.on('deselect', onDeselect),
    manager.on('editStart', onEditStart),
    manager.on('editEnd', onEditEnd),
    manager.on('change', onChange)
  ]
  chart.subscribeAction('onZoom', onPanOrZoom)
  chart.subscribeAction('onScroll', onPanOrZoom)
  chart.subscribeAction('onVisibleRangeChange', onPanOrZoom)

  if (typeof document !== 'undefined') {
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragEnd)
    // Releasing the button outside the window never delivers mouseup —
    // window blur ends the drag or the next mousemove drags buttonless.
    window.addEventListener('blur', onDragEnd)
  }

  return {
    show,
    hide,
    destroy () {
      destroyed = true
      hide()
      unsubs.forEach(unsub => {
        unsub()
      })
      chart.unsubscribeAction('onZoom', onPanOrZoom)
      chart.unsubscribeAction('onScroll', onPanOrZoom)
      chart.unsubscribeAction('onVisibleRangeChange', onPanOrZoom)
      if (typeof document !== 'undefined') {
        document.removeEventListener('mousemove', onDragMove)
        document.removeEventListener('mouseup', onDragEnd)
        window.removeEventListener('blur', onDragEnd)
      }
    }
  }
}
