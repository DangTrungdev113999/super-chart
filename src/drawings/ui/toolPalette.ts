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
import { DRAWING_CHROME, findCatalogItemByOverlay, type DrawingChromeItem, type DrawingToolGroup, type DrawingToolItem } from '../catalog'
import { getDrawingIcon } from '../icons'
import {
  isMagnetEnabled, setMagnetEnabled,
  isStayInDrawingEnabled, setStayInDrawingEnabled
} from '../interaction/snap45'
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
   * i18n hook — translate any catalog title. `id` is the item or chrome
   * id ('trendLine', 'lockAll'…); section headers arrive namespaced as
   * 'section:<id>' ('section:fibonacci') and the flyout caret as
   * 'moreTools'. `fallback` is the built-in English title.
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

  // The palette may mount inside another document (iframe) — bind DOM and
  // listeners to the container's own document, never the module-global one.
  const ownerDoc = container.ownerDocument

  const root = createDom('div')
  root.className = 'sc-drw-tools'

  /** group id → last armed catalog item (defaults to first available). */
  const lastUsed = new Map<string, DrawingToolItem>()
  /** group id → rail button, for active-tool highlighting. */
  const groupButtons = new Map<string, HTMLElement>()
  /** catalog item id → flyout row, for active highlight inside flyouts. */
  const itemButtons = new Map<string, HTMLElement>()
  /** group id → caret button, for aria-expanded + Esc focus return. */
  const carets = new Map<string, HTMLElement>()

  let flyout: HTMLElement | null = null
  let flyoutGroup: string | null = null
  // Touch fires a compatibility mouseenter right before click — a caret tap
  // on a different group would hover-switch then instantly toggle-close the
  // flyout it just opened. Timestamped switches let the click handler tell
  // "this tap opened it" from "close the already-open flyout".
  let hoverSwitchGroup: string | null = null
  let hoverSwitchAt = 0
  let destroyed = false

  // Chrome toggle state — local to this mount (magnet/stay persist in the
  // chart's interaction state; lock/hide are bulk one-shot gestures).
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
      // Non-tool picks still stick as the group's rail icon (TV parity —
      // the cursor dropdown keeps the last-picked mode showing).
      const owner = findGroupOf(item)
      if (owner !== null) {
        lastUsed.set(owner.id, item)
        updateGroupIcons()
      }
      const handled = options?.onNonTool?.(item) === true
      if (!handled) {
        api.deactivate()
      }
      return
    }
    // Catalog availability can flip after mount (setCatalogItemAvailable)
    // — re-check before arming, not just in the flyout renderer.
    if (!item.available) {
      return
    }
    // magnet/stay resolve inside activate() from the chart's interaction
    // state — identical semantics for palette clicks and hotkeys.
    const id = api.activate(item.id)
    if (id === null) {
      return
    }
    const owner = findGroupOf(item)
    if (owner !== null) {
      lastUsed.set(owner.id, item)
    }
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
      btn.setAttribute('aria-label', btn.title)
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

  function closeFlyout (returnFocus = false): void {
    if (flyout === null) {
      return
    }
    flyout.parentElement?.removeChild(flyout)
    flyout = null
    const closing = flyoutGroup
    flyoutGroup = null
    // Rows are rebuilt per flyout — drop the refs so detached nodes don't
    // accumulate across opens.
    itemButtons.clear()
    if (closing !== null) {
      const caret = carets.get(closing)
      caret?.setAttribute('aria-expanded', 'false')
      // Keyboard dismissal returns focus to the trigger (TV/menu parity).
      if (returnFocus) {
        caret?.focus()
      }
    }
  }

  function openFlyout (group: DrawingToolGroup, anchor: HTMLElement, viaKeyboard = false): void {
    if (flyoutGroup === group.id) {
      closeFlyout()
      return
    }
    closeFlyout()
    const menu = createDom('div')
    menu.className = 'sc-drw-flyout'
    menu.setAttribute('role', 'menu')
    let firstRow: HTMLElement | null = null
    for (const section of group.sections) {
      if (group.sections.length > 1) {
        const head = createDom('div')
        head.className = 'sc-drw-menu-label'
        head.textContent = label(`section:${section.id}`, humanize(section.id))
        menu.appendChild(head)
      }
      for (const it of section.items) {
        const row = createDom('button')
        row.type = 'button'
        row.className = 'sc-drw-menu-item sc-drw-flyout-item'
        row.setAttribute('role', 'menuitem')
        row.setAttribute('data-tool-id', it.id)
        const icon = createDom('span')
        icon.className = 'sc-drw-flyout-icon'
        icon.innerHTML = getDrawingIcon(it.iconId)
        const title = createDom('span')
        title.className = 'sc-drw-flyout-title'
        // Host-supplied i18n strings are never interpolated into innerHTML
        // (same rule as floatingToolbar).
        title.textContent = label(it.id, it.title)
        row.appendChild(icon)
        row.appendChild(title)
        if (it.hotkey !== undefined) {
          const key = createDom('span')
          key.className = 'sc-drw-flyout-key'
          key.textContent = it.hotkey
          row.appendChild(key)
        }
        if (!it.available) {
          row.disabled = true
          row.classList.add('sc-drw-flyout-item--disabled')
        } else {
          row.addEventListener('click', e => {
            e.stopPropagation()
            armItem(it)
            closeFlyout()
          })
        }
        itemButtons.set(it.id, row)
        if (firstRow === null && !row.disabled) {
          firstRow = row
        }
        menu.appendChild(row)
      }
    }
    // Fixed + ownerDocument.body so the flyout survives scrollable/clipping
    // hosts (overflow on the rail, overflow:hidden ancestors).
    const aRect = anchor.getBoundingClientRect()
    const win = ownerDoc.defaultView
    const vh = win?.innerHeight ?? 0
    const vw = win?.innerWidth ?? 0
    menu.style.left = `${aRect.right + 1}px`
    menu.style.top = `${Math.max(0, aRect.top)}px`
    ownerDoc.body.appendChild(menu)
    // Clamp to the viewport: bottom groups slide up, near-right-edge hosts
    // flip the flyout to the left of the rail.
    const mRect = menu.getBoundingClientRect()
    if (mRect.bottom > vh - 4) {
      menu.style.top = `${Math.max(0, vh - mRect.height - 4)}px`
    }
    if (mRect.right > vw - 4) {
      menu.style.left = `${Math.max(0, aRect.left - mRect.width - 1)}px`
    }
    flyout = menu
    flyoutGroup = group.id
    carets.get(group.id)?.setAttribute('aria-expanded', 'true')
    // Keyboard-opened menus hand focus to the first row (click-opened ones
    // stay on the rail — a mouse user's pointer is already there).
    if (viaKeyboard && firstRow !== null) {
      firstRow.focus()
    }
    updateActiveHighlight()
  }

  // ── Rail buttons ─────────────────────────────────────────────────────────

  function addGroupButton (group: DrawingToolGroup): void {
    const current = lastUsed.get(group.id) ?? firstAvailable(group)
    const wrap = createDom('div')
    wrap.className = 'sc-drw-tools-group'

    const b = createDom('button')
    b.type = 'button'
    b.className = 'sc-drw-btn sc-drw-tools-btn'
    b.title = current !== null ? label(current.id, current.title) : humanize(group.id)
    b.setAttribute('aria-label', b.title)
    b.innerHTML = `<span class="sc-drw-tools-icon">${getDrawingIcon(current?.iconId ?? group.iconId)}</span>`
    b.addEventListener('click', e => {
      e.stopPropagation()
      const pick = lastUsed.get(group.id) ?? firstAvailable(group)
      if (pick !== null) {
        armItem(pick)
      }
      // A pick via the rail icon is still a pick — a different group's
      // flyout left open would be a stale menu over a newly-armed tool.
      closeFlyout()
    })
    wrap.appendChild(b)

    // Caret opens the flyout — only when the group has >1 entry.
    const itemCount = group.sections.reduce((n, s) => n + s.items.length, 0)
    if (itemCount > 1) {
      const caret = createDom('button')
      caret.type = 'button'
      caret.className = 'sc-drw-tools-caret'
      caret.setAttribute('aria-label', label('moreTools', 'More tools'))
      caret.setAttribute('aria-haspopup', 'menu')
      caret.setAttribute('aria-expanded', 'false')
      caret.addEventListener('click', e => {
        e.stopPropagation()
        // Touch: this tap's synthesized mouseenter may have just switched
        // the flyout to this group — that counts as the open, not a toggle.
        const justOpened = flyoutGroup === group.id &&
          hoverSwitchGroup === group.id && Date.now() - hoverSwitchAt < 500
        if (justOpened) {
          hoverSwitchGroup = null
          return
        }
        // detail===0 = keyboard-triggered click — hand focus to the menu.
        openFlyout(group, wrap, e.detail === 0)
      })
      wrap.appendChild(caret)
      carets.set(group.id, caret)
      // Hover-to-open reads like TV on dense rails.
      wrap.addEventListener('mouseenter', () => {
        if (flyout !== null && flyoutGroup !== group.id) {
          hoverSwitchGroup = group.id
          hoverSwitchAt = Date.now()
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
    type ChromeSetOn = (on: boolean) => void
    const chromeSetOn = new Map<string, ChromeSetOn>()
    const addChromeButton = (c: DrawingChromeItem): void => {
      const b = createDom('button')
      b.type = 'button'
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
      chromeSetOn.set(c.id, setOn)
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
            const next = !isStayInDrawingEnabled(chart)
            setStayInDrawingEnabled(chart, next)
            setOn(next)
            break
          }
          case 'lockAll': {
            allLocked = !allLocked
            // skipHistory — one bulk gesture must not mint one undo step
            // per drawing.
            api.list().forEach(d => { api.update(d.id, { lock: allLocked }, { skipHistory: true }) })
            setOn(allLocked)
            break
          }
          case 'hideAll': {
            allHidden = !allHidden
            api.list().forEach(d => { api.update(d.id, { visible: !allHidden }, { skipHistory: true }) })
            setOn(allHidden)
            break
          }
          case 'removeAll': {
            // includeLocked — Lock All then Remove All must not deadlock.
            api.clear({ includeLocked: true })
            allLocked = false
            allHidden = false
            chromeSetOn.get('lockAll')?.(false)
            chromeSetOn.get('hideAll')?.(false)
            break
          }
        }
      })
      if (c.id === 'magnet') setOn(isMagnetEnabled(chart))
      if (c.id === 'stayInDrawing') setOn(isStayInDrawingEnabled(chart))
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
    const f = flyout
    if (f === null) return
    // composedPath survives shadow-DOM retargeting; contains() checks the
    // flyout too — it lives on ownerDocument.body, outside the rail root.
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    const inside = path.length > 0
      ? (path.includes(root) || path.includes(f))
      : (e.target instanceof Node && (root.contains(e.target) || f.contains(e.target)))
    if (!inside) {
      closeFlyout()
    }
  }
  ownerDoc.addEventListener('pointerdown', onDocPointer, true)

  // Esc with an open flyout closes ONLY the flyout (TV parity — the first
  // Esc dismisses the menu; a second disarms/deselects). Capture phase +
  // stopPropagation pre-empts the drawings keyboard layer's bubble-phase
  // document listener (it was bound earlier and would otherwise cancel the
  // in-progress drawing in the same keypress).
  const onDocKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && flyout !== null) {
      e.stopPropagation()
      e.preventDefault()
      closeFlyout(true)
    }
  }
  ownerDoc.addEventListener('keydown', onDocKey, true)

  // A fixed-position flyout can't track a moving anchor — closing beats
  // floating disconnected (scroll on any ancestor, rail scroll, resize).
  // Scroll inside the flyout itself must not close it.
  const onDocScroll = (e: Event): void => {
    const f = flyout
    if (f === null) return
    if (e.target instanceof Node && f.contains(e.target)) return
    closeFlyout()
  }
  ownerDoc.addEventListener('scroll', onDocScroll, true)
  const onWinResize = (): void => {
    closeFlyout()
  }
  ownerDoc.defaultView?.addEventListener('resize', onWinResize)

  container.appendChild(root)
  // A tool armed before mountToolbar() gets its highlight immediately —
  // not on the next toolChange.
  updateActiveHighlight()

  return {
    destroy () {
      if (destroyed) return
      destroyed = true
      ownerDoc.removeEventListener('pointerdown', onDocPointer, true)
      ownerDoc.removeEventListener('keydown', onDocKey, true)
      ownerDoc.removeEventListener('scroll', onDocScroll, true)
      ownerDoc.defaultView?.removeEventListener('resize', onWinResize)
      unbindTool()
      closeFlyout()
      root.parentElement?.removeChild(root)
      groupButtons.clear()
      itemButtons.clear()
      carets.clear()
    }
  }
}
