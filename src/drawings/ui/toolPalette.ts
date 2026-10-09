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

import type { DrawingsApi } from '../api'
import type { DrawingToolGroup, DrawingToolItem } from '../catalog'
import { DRAWING_CHROME, findCatalogItemByOverlay } from '../catalog'
import { getDrawingIcon } from '../icons'
import { isMagnetEnabled, setMagnetEnabled } from '../interaction/snap45'
import { injectDrawingStyles } from './styles'

/**
 * Left-side tool palette (DP-6d) — TradingView's vertical drawing rail.
 *
 * Renders the catalog's groups → sections → items as an icon column with
 * hover flyouts. Clicking a group button arms its last-used tool; clicking
 * the caret (or the group again) opens the flyout. The chrome footer wires
 * magnet / stay-in-drawing / lock-all / hide-all / remove-all.
 *
 * Hosts mount once per chart via `chart.drawings.mountToolbar(el)` and keep
 * no drawing-UI state themselves — tool activation, last-picked memory,
 * and pressed states all live here.
 */

export interface ToolPaletteOptions {
  /**
   * i18n hook — translate any catalog title. `id` is the item/section/
   * chrome id (e.g. 'trendLine', 'lines', 'lockAll'); `fallback` is the
   * built-in English title.
   */
  label?: (id: string, fallback: string) => string
  /**
   * Render only these group ids, in this order. Default: every group.
   * E.g. `['cursor', 'trend-line', 'gann-fib']` for a slim toolbar.
   */
  groups?: string[]
  /**
   * Show the chrome footer (magnet / stay-in-drawing / lock / hide /
   * remove-all). Default true.
   */
  chrome?: boolean
  /**
   * Handler for non-drawing entries (cursor modes, eraser, zoom). Return
   * true to mark handled — the palette skips its default behavior
   * (deactivate the armed tool).
   */
  onNonTool?: (item: DrawingToolItem) => boolean | undefined
}

export interface ToolPalette {
  destroy: () => void
}

function humanize (id: string): string {
  return id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function mountToolPalette (
  container: HTMLElement,
  chart: Chart,
  api: DrawingsApi,
  options?: ToolPaletteOptions
): ToolPalette {
  injectDrawingStyles()

  const label = options?.label ?? ((_id: string, fallback: string) => fallback)
  const groups = api.catalog().filter(g => options?.groups === undefined || options.groups.includes(g.id))
  if (options?.groups !== undefined) {
    // Honor the caller's ordering — filter() keeps catalog order.
    groups.sort((a, b) => options.groups!.indexOf(a.id) - options.groups!.indexOf(b.id))
  }

  const root = createDom('div')
  root.className = 'sc-drw-tools'

  /** group id → last armed catalog item (defaults to first available). */
  const lastUsed = new Map<string, DrawingToolItem>()
  /** group id → rail button, for active-tool highlighting. */
  const groupButtons = new Map<string, HTMLElement>()
  /** catalog item id → flyout row, for active highlight inside flyouts. */
  const itemButtons = new Map<string, HTMLElement>()

  let flyout: HTMLElement | null = null
  let flyoutGroup: string | null = null
  let destroyed = false

  // Chrome toggle state — local to this mount.
  let stayInDrawing = false
  let allLocked = false
  let allHidden = false

  function firstAvailable (group: DrawingToolGroup): DrawingToolItem | null {
    for (const section of group.sections) {
      const found = section.items.find(i => i.available)
      if (found !== undefined) return found
    }
    return null
  }

  function armItem (item: DrawingToolItem): void {
    if (item.nonTool === true || item.overlayName === '') {
      const handled = options?.onNonTool?.(item) === true
      if (!handled) {
        api.deactivate()
      }
      return
    }
    const owner = findGroupOf(item)
    if (owner !== null) {
      lastUsed.set(owner.id, item)
    }
    api.activate(item.id, {
      continuous: stayInDrawing,
      mode: isMagnetEnabled(chart) ? 'weak_magnet' : 'normal'
    })
    updateGroupIcons()
  }

  function findGroupOf (item: DrawingToolItem): DrawingToolGroup | null {
    for (const g of groups) {
      for (const s of g.sections) {
        if (s.items.includes(item)) return g
      }
    }
    return null
  }

  /** Rail buttons show the icon of the group's last-used tool (TV parity). */
  function updateGroupIcons (): void {
    for (const g of groups) {
      const btn = groupButtons.get(g.id)
      if (btn === undefined) continue
      const current = lastUsed.get(g.id) ?? firstAvailable(g)
      if (current === null) continue
      const iconHost = btn.querySelector('.sc-drw-tools-icon')
      if (iconHost !== null) {
        iconHost.innerHTML = getDrawingIcon(current.iconId)
      }
      btn.title = label(current.id, current.title)
    }
  }

  function updateActiveHighlight (): void {
    const tool = api.activeTool()
    const activeItem = tool !== null ? findCatalogItemByOverlay(tool) : null
    for (const [gid, b] of groupButtons) {
      const on = activeItem !== null && findGroupOf(activeItem)?.id === gid
      if (on) {
        b.setAttribute('data-on', 'true')
      } else {
        b.removeAttribute('data-on')
      }
    }
    for (const [id, b] of itemButtons) {
      if (activeItem?.id === id) {
        b.setAttribute('data-on', 'true')
      } else {
        b.removeAttribute('data-on')
      }
    }
  }

  function closeFlyout (): void {
    flyout?.parentElement?.removeChild(flyout)
    flyout = null
    flyoutGroup = null
    // Rows are rebuilt per flyout — drop the refs so detached nodes don't
    // accumulate across opens.
    itemButtons.clear()
  }

  function openFlyout (group: DrawingToolGroup, anchor: HTMLElement): void {
    if (flyoutGroup === group.id) {
      closeFlyout()
      return
    }
    closeFlyout()
    const menu = createDom('div')
    menu.className = 'sc-drw-flyout'
    for (const section of group.sections) {
      if (group.sections.length > 1) {
        const head = createDom('div')
        head.className = 'sc-drw-menu-label'
        head.textContent = label(`section:${section.id}`, humanize(section.id))
        menu.appendChild(head)
      }
      for (const it of section.items) {
        const row = createDom('button')
        row.className = 'sc-drw-menu-item sc-drw-flyout-item'
        row.innerHTML = `<span class="sc-drw-flyout-icon">${getDrawingIcon(it.iconId)}</span>` +
          `<span class="sc-drw-flyout-title">${label(it.id, it.title)}</span>` +
          (it.hotkey !== undefined ? `<span class="sc-drw-flyout-key">${it.hotkey}</span>` : '')
        if (!it.available) {
          row.setAttribute('disabled', 'true')
          row.classList.add('sc-drw-flyout-item--disabled')
        } else {
          row.addEventListener('click', e => {
            e.stopPropagation()
            armItem(it)
            closeFlyout()
          })
        }
        itemButtons.set(it.id, row)
        menu.appendChild(row)
      }
    }
    // Vertical-align the flyout with the group button; clamp inside the
    // container so a bottom group doesn't overflow the palette.
    const rootRect = root.getBoundingClientRect()
    const aRect = anchor.getBoundingClientRect()
    menu.style.top = `${Math.max(0, aRect.top - rootRect.top)}px`
    root.appendChild(menu)
    const overflow = menu.offsetTop + menu.offsetHeight - root.clientHeight
    if (overflow > 0) {
      menu.style.top = `${Math.max(0, menu.offsetTop - overflow)}px`
    }
    flyout = menu
    flyoutGroup = group.id
    updateActiveHighlight()
  }

  // ── Rail buttons ─────────────────────────────────────────────────────────

  function addGroupButton (group: DrawingToolGroup): void {
    const current = lastUsed.get(group.id) ?? firstAvailable(group)
    const wrap = createDom('div')
    wrap.className = 'sc-drw-tools-group'

    const b = createDom('button')
    b.className = 'sc-drw-btn sc-drw-tools-btn'
    b.title = current !== null ? label(current.id, current.title) : group.id
    b.setAttribute('aria-label', b.title)
    b.innerHTML = `<span class="sc-drw-tools-icon">${getDrawingIcon(current?.iconId ?? group.iconId)}</span>`
    b.addEventListener('click', e => {
      e.stopPropagation()
      const pick = lastUsed.get(group.id) ?? firstAvailable(group)
      if (pick !== null) {
        armItem(pick)
      }
    })
    wrap.appendChild(b)

    // Caret opens the flyout — only when the group has >1 entry.
    const itemCount = group.sections.reduce((n, s) => n + s.items.length, 0)
    if (itemCount > 1) {
      const caret = createDom('button')
      caret.className = 'sc-drw-tools-caret'
      caret.setAttribute('aria-label', 'More tools')
      caret.addEventListener('click', e => {
        e.stopPropagation()
        openFlyout(group, wrap)
      })
      wrap.appendChild(caret)
      // Hover-to-open reads like TV on dense rails.
      wrap.addEventListener('mouseenter', () => {
        if (flyout !== null && flyoutGroup !== group.id) {
          openFlyout(group, wrap)
        }
      })
    }

    root.appendChild(wrap)
    groupButtons.set(group.id, b)
  }

  for (const group of groups) {
    addGroupButton(group)
  }

  // ── Chrome footer ────────────────────────────────────────────────────────

  if (options?.chrome !== false) {
    const footer = createDom('div')
    footer.className = 'sc-drw-tools-chrome'
    const addChromeButton = (c: (typeof DRAWING_CHROME)[number]): void => {
      const b = createDom('button')
      b.className = 'sc-drw-btn sc-drw-tools-btn'
      b.title = label(c.id, c.title)
      b.setAttribute('aria-label', b.title)
      b.innerHTML = getDrawingIcon(c.iconId)
      const setOn = (on: boolean): void => {
        if (on) {
          b.setAttribute('data-on', 'true')
        } else {
          b.removeAttribute('data-on')
        }
      }
      b.addEventListener('click', e => {
        e.stopPropagation()
        switch (c.id) {
          case 'magnet': {
            const next = !isMagnetEnabled(chart)
            setMagnetEnabled(chart, next)
            setOn(next)
            break
          }
          case 'stayInDrawing': {
            stayInDrawing = !stayInDrawing
            setOn(stayInDrawing)
            break
          }
          case 'lockAll': {
            allLocked = !allLocked
            api.list().forEach(d => { api.update(d.id, { lock: allLocked }) })
            setOn(allLocked)
            break
          }
          case 'hideAll': {
            allHidden = !allHidden
            api.list().forEach(d => { api.update(d.id, { visible: !allHidden }) })
            setOn(allHidden)
            break
          }
          case 'removeAll': {
            api.clear()
            break
          }
        }
      })
      if (c.id === 'magnet') setOn(isMagnetEnabled(chart))
      footer.appendChild(b)
    }
    for (const c of DRAWING_CHROME) {
      addChromeButton(c)
    }
    root.appendChild(footer)
  }

  // ── Events ───────────────────────────────────────────────────────────────

  const unbindTool = api.on('toolChange', () => {
    updateActiveHighlight()
  })

  const onDocPointer = (e: Event): void => {
    if (flyout !== null && e.target instanceof Node && !root.contains(e.target)) {
      closeFlyout()
    }
  }
  document.addEventListener('pointerdown', onDocPointer, true)

  container.appendChild(root)

  return {
    destroy () {
      if (destroyed) return
      destroyed = true
      document.removeEventListener('pointerdown', onDocPointer, true)
      unbindTool()
      closeFlyout()
      root.parentElement?.removeChild(root)
      groupButtons.clear()
      itemButtons.clear()
    }
  }
}
