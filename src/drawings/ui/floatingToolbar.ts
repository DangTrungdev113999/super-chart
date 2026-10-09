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
import { findCatalogItemByOverlay, type DrawingStylePaths, type StylePath, type ToolbarControl } from '../catalog'
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
    // Position below the toolbar, aligned to the anchor button. Clamp the
    // right edge — a menu anchored near the pane's right side would clip
    // out of the (overflow:hidden) layer and be unreachable.
    const tbRect = element.getBoundingClientRect()
    const bRect = anchorEl.getBoundingClientRect()
    const maxX = Math.max(0, element.clientWidth - menu.offsetWidth - 2)
    const mx = Math.min(bRect.left - tbRect.left, maxX)
    menu.style.transform = `translate3d(${Math.max(0, mx)}px, ${element.offsetHeight + 6}px, 0)`
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

  /**
   * Default role→styles path for controls without an explicit `path` and no
   * matching entry in the item's stylePaths — the styles.line/polygon/text
   * convention shared by line-drawn and text tools.
   */
  const DEFAULT_ROLE_PATHS: Record<string, StylePath> = {
    line: ['styles', 'line', 'color'],
    fill: ['styles', 'polygon', 'color'],
    text: ['styles', 'text', 'color'],
    background: ['styles', 'rect', 'color']
  }

  /** Role → stylePaths slot key. Partial so a lookup miss stays truthy-
   * checkable (Record<string, K> claims every key exists). */
  const ROLE_PATH_KEYS: Partial<Record<string, keyof DrawingStylePaths>> = {
    'color:line': 'lineColor',
    'color:fill': 'fillColor',
    'color:text': 'textColor',
    'color:background': 'backgroundColor',
    'style:line': 'lineStyle',
    width: 'lineWidth',
    text: 'textSize',
    textAlign: 'textAlign'
  }

  /** Resolve a control's write path: explicit control.path → the item's
   * stylePaths slot → the role default. */
  function resolvePath (control: ToolbarControl, role: string): StylePath | undefined {
    const withPath = control as { path?: StylePath }
    if (withPath.path !== undefined) {
      return withPath.path
    }
    const item = current !== null ? findCatalogItemByOverlay(current.name) : undefined
    const slot = ROLE_PATH_KEYS[role !== '' ? `${control.kind}:${role}` : control.kind]
    const mapped: StylePath | undefined = slot !== undefined ? item?.stylePaths?.[slot] : undefined
    if (mapped !== undefined) {
      return mapped
    }
    return DEFAULT_ROLE_PATHS[role]
  }

  /** Write a resolved StylePath — routes to extendData when the path's
   * root says so (measure/position tools style through extendData). */
  function patchPath (sp: StylePath, value: unknown): void {
    if (current === null) {
      return
    }
    const [target, ...keys] = sp
    const root: Record<string, unknown> = {}
    let node = root
    keys.slice(0, -1).forEach(key => {
      const next: Record<string, unknown> = {}
      node[key] = next
      node = next
    })
    node[keys[keys.length - 1]] = value
    if (target === 'extendData') {
      const ext = current.extendData as Record<string, unknown> | null | undefined
      manager.update(current.id, { extendData: { ...(ext ?? {}), ...root } })
    } else {
      manager.update(current.id, { styles: root as Overlay['styles'] })
    }
  }

  function currentPathValue (sp: StylePath): unknown {
    const [target, ...keys] = sp
    const root = target === 'extendData' ? current?.extendData : current?.styles
    let node: unknown = root
    for (const key of keys) {
      if (node === null || typeof node !== 'object') {
        return undefined
      }
      node = (node as Record<string, unknown>)[key]
    }
    return node
  }

  function colorControl (role: 'line' | 'fill' | 'text' | 'background', path: StylePath): HTMLElement {
    const swatch = createDom('span')
    swatch.className = 'sc-drw-swatch'
    const paint = (): void => {
      const v = currentPathValue(path)
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
            patchPath(path, color)
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

  function lineStyleControl (path: StylePath): HTMLElement {
    return dropdownButton('trendLine', 'Line style', LINE_STYLES.map(s => ({
      title: s.title,
      active: currentPathValue(path) === s.value,
      onClick: () => {
        patchPath(path, s.value)
      }
    })))
  }

  function widthControl (path: StylePath): HTMLElement {
    return dropdownButton('trendLine', 'Line width', LINE_WIDTHS.map(w => ({
      title: `${w}px`,
      active: currentPathValue(path) === w,
      onClick: () => {
        patchPath(path, w)
      }
    })))
  }

  function fontSizeControl (path: StylePath): HTMLElement {
    return dropdownButton('text', 'Text size', FONT_SIZES.map(s => ({
      title: `${s}px`,
      active: currentPathValue(path) === s,
      onClick: () => {
        patchPath(path, s)
      }
    })))
  }

  function textStyleControl (): HTMLElement {
    const item = current !== null ? findCatalogItemByOverlay(current.name) : undefined
    const weightPath = item?.stylePaths?.textWeight ?? (['styles', 'text', 'weight'] as StylePath)
    const stylePath2 = item?.stylePaths?.textStyle ?? (['styles', 'text', 'style'] as StylePath)
    const sizePath = item?.stylePaths?.textSize ?? (['styles', 'text', 'size'] as StylePath)
    const b = btn('text', 'Text style', () => {
      openMenu(b, menu => {
        const bold = currentPathValue(weightPath) === 'bold'
        const italic = currentPathValue(stylePath2) === 'italic'
        menu.appendChild(styleMenuItem('Bold', bold, () => {
          patchPath(weightPath, bold ? 'normal' : 'bold')
        }))
        menu.appendChild(styleMenuItem('Italic', italic, () => {
          patchPath(stylePath2, italic ? 'normal' : 'italic')
        }))
        menu.appendChild(styleMenuItem('Size…', false, () => {
          openMenu(b, sub => {
            FONT_SIZES.forEach(s => {
              sub.appendChild(styleMenuItem(`${s}px`, currentPathValue(sizePath) === s, () => {
                patchPath(sizePath, s)
              }))
            })
          })
        }))
      })
    })
    return b
  }

  function textAlignControl (path: StylePath): HTMLElement {
    const currentAlign = (): string => {
      const v = currentPathValue(path)
      return typeof v === 'string' ? v : 'center'
    }
    return btn('text', 'Text align', () => {
      const order = TEXT_ALIGNS.map(a => a.value)
      const idx = order.indexOf(currentAlign())
      const next = order[(idx + 1) % order.length]
      patchPath(path, next)
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
    // A clone is a fresh user drawing — locked/hidden state doesn't carry
    // (TV clones always land unlocked + visible).
    create.lock = false
    create.visible = true
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
      case 'color': {
        const path = resolvePath(control, control.role)
        return path !== undefined ? colorControl(control.role, path) : null
      }
      case 'style': {
        if (control.role !== 'line') {
          return textStyleControl()
        }
        const path = resolvePath(control, 'line')
        return path !== undefined ? lineStyleControl(path) : null
      }
      case 'width': {
        const path = resolvePath(control, '')
        return path !== undefined ? widthControl(path) : null
      }
      case 'text': {
        const path = resolvePath(control, '')
        return path !== undefined ? fontSizeControl(path) : null
      }
      case 'textAlign': {
        const catItem = findCatalogItemByOverlay(overlay.name)
        const path = control.path ?? catItem?.stylePaths?.textAlign ?? (['styles', 'text', 'align'] as StylePath)
        return textAlignControl(path)
      }
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
    // A locked drawing is read-only — suppress mutation controls but keep
    // unlock/visibility/remove reachable (same as TV's locked state).
    if (overlay.lock) {
      return [{ kind: 'lock' }, { kind: 'visibility' }, { kind: 'remove' }]
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
    // A recipe wider than the pane (mobile-width panes + 10-control
    // recipes) clips its tail inside the overflow:hidden layer — make the
    // toolbar scrollable so Remove/Settings stay reachable.
    const maxW = Math.max(0, pw - 8)
    element.style.maxWidth = `${maxW}px`
    element.style.overflowX = tw > maxW ? 'auto' : 'visible'
    element.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`
  }

  function clampPos (x: number, y: number): { x: number, y: number } {
    if (element === null || layer === null) {
      return { x, y }
    }
    const host = layer.getElement()
    const tw = element.offsetWidth
    const th = element.offsetHeight
    return {
      x: Math.max(4, Math.min(x, Math.max(4, host.clientWidth - tw - 4))),
      y: Math.max(4, Math.min(y, Math.max(4, host.clientHeight - th - 4)))
    }
  }

  function onDragMove (e: MouseEvent): void {
    if (dragState === null || element === null) {
      return
    }
    // A missed mouseup (blur, iframe exit) must not drag buttonless.
    if (e.buttons === 0) {
      dragState = null
      return
    }
    const dx = e.clientX - dragState.startX
    const dy = e.clientY - dragState.startY
    pos = clampPos(Math.round(dragState.baseX + dx), Math.round(dragState.baseY + dy))
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
    dragState = null
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
      // Only the drawings group gets a style toolbar — kernel selects for
      // ghosts/mirrors/foreign-group overlays must not bind controls that
      // would write styles onto e.g. indicator overlays.
      const o = payload.overlay
      if (o.groupId !== 'drawings' || o.ghost || o.synced || o.isDrawing()) {
        return
      }
      selectedId = o.id
      show(o)
    }
  }
  const onDeselect = (): void => {
    selectedId = null
    hide()
  }
  const onEditStart = (payload: { overlay?: Overlay }): void => {
    // editStart fires for the PRESSED overlay, not the selected one — only
    // hide when the gesture is actually on our tracked overlay, otherwise
    // dragging a different drawing's figure would strand the toolbar.
    if (payload.overlay === undefined || payload.overlay.id === selectedId) {
      hide()
    }
  }
  const onEditEnd = (payload: { overlay?: Overlay }): void => {
    // Re-show whenever the tracked selection still resolves — covers the
    // case where a drag on a non-selected overlay hid nothing but the
    // tracked overlay's own gesture ends with a mismatched payload.
    if (selectedId === null) {
      return
    }
    if (payload.overlay === undefined || payload.overlay.id === selectedId) {
      const o = chart.getOverlayById(selectedId)
      if (o !== null) {
        show(o)
      }
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
  // Kernel-level remove reaches paths the manager suppresses its own
  // 'change' for (remote removes, scope wipes, bulk applies) — a selected
  // overlay deleted on a peer must not leave the toolbar on a dead id.
  const onKernelOverlayChange = (data?: unknown): void => {
    const evt = data as { type?: string, overlay?: Overlay } | undefined
    if (evt?.type === 'remove' && evt.overlay?.id === selectedId) {
      selectedId = null
      hide()
    }
  }
  chart.subscribeAction('onOverlayChange', onKernelOverlayChange)

  if (typeof document !== 'undefined') {
    // Capture phase — the drag keeps the element under the cursor, so a
    // release lands on it and the layer's stopPropagation would swallow a
    // bubble-phase listener and strand dragState forever.
    document.addEventListener('mousemove', onDragMove, true)
    document.addEventListener('mouseup', onDragEnd, true)
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
        document.removeEventListener('mousemove', onDragMove, true)
        document.removeEventListener('mouseup', onDragEnd, true)
        window.removeEventListener('blur', onDragEnd)
      }
    }
  }
}
