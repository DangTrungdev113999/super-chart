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
import type { Chart } from '../../Chart'

/**
 * Pane-level DOM overlay layer (DP-1). Text editors, floating toolbars and
 * the text caret are real DOM so they get IME/selection/CSS for free — but
 * their pointer events must NEVER bleed through to the chart: a click on a
 * toolbar button would otherwise deselect the drawing, scroll the chart, or
 * arm a tool.
 *
 * The layer sits inside the pane's main-widget container (above both
 * canvases, below nothing else). Non-interactive children pass all events
 * through (pointer-events: none); interactive children stopPropagation on
 * every gesture event the chart listens to.
 */

type IsolateHandler = (e: Event) => void

const LAYER_ATTR = 'data-sc-dom-layer'
const ISOLATED_EVENTS = [
  'mousedown', 'mouseup', 'mousemove',
  'click', 'dblclick', 'contextmenu',
  'wheel',
  'touchstart', 'touchmove', 'touchend', 'touchcancel',
  'pointerdown', 'pointermove', 'pointerup', 'pointercancel'
] as const

export interface DomLayerMountOptions {
  /**
   * Interactive children receive pointer-events:auto and swallow all chart
   * gesture events. Non-interactive children are display-only.
   */
  interactive?: boolean
  /**
   * Decide per event whether to stopPropagation. Default: always stop when
   * interactive. The text editor uses this to let the opening click pass
   * through during its first ~500ms (TradingView's ResetClick window).
   */
  isolate?: (e: Event) => boolean
  className?: string
  /** z-index inside the layer (default 0). */
  zIndex?: number
}

export interface PaneDomLayer {
  getElement: () => HTMLElement
  /**
   * Mount a DOM element in the layer. Returns an unmount function.
   */
  mount: (element: HTMLElement, options?: DomLayerMountOptions) => () => void
  detach: (element: HTMLElement) => void
  /**
   * Remove every mounted element (the layer itself stays).
   */
  clear: () => void
  destroy: () => void
}

class PaneDomLayerImp implements PaneDomLayer {
  private readonly _element: HTMLElement
  private readonly _interactive = new Map<HTMLElement, IsolateHandler>()
  private _destroyed = false

  constructor (host: HTMLElement) {
    this._element = createDom('div', {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      margin: '0',
      padding: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      // Above the widget's main + overlay canvases (z-index 2).
      zIndex: '4',
      boxSizing: 'border-box'
    })
    this._element.setAttribute(LAYER_ATTR, '')
    host.appendChild(this._element)
  }

  getElement (): HTMLElement {
    return this._element
  }

  mount (element: HTMLElement, options?: DomLayerMountOptions): () => void {
    if (this._destroyed) {
      return () => {
        // layer gone — nothing to unmount.
      }
    }
    if (options?.className !== undefined) {
      element.classList.add(options.className)
    }
    if (options?.zIndex !== undefined) {
      element.style.zIndex = String(options.zIndex)
    }
    if (options?.interactive === true) {
      element.style.pointerEvents = 'auto'
      const isolate = options.isolate ?? (() => true)
      const handler = (e: Event): void => {
        if (isolate(e)) {
          e.stopPropagation()
        }
      }
      ISOLATED_EVENTS.forEach(type => {
        element.addEventListener(type, handler)
      })
      this._interactive.set(element, handler)
    }
    this._element.appendChild(element)
    return () => {
      this.detach(element)
    }
  }

  detach (element: HTMLElement): void {
    const handler = this._interactive.get(element)
    if (handler !== undefined) {
      ISOLATED_EVENTS.forEach(type => {
        element.removeEventListener(type, handler)
      })
      this._interactive.delete(element)
      element.style.pointerEvents = ''
    }
    if (element.parentElement === this._element) {
      this._element.removeChild(element)
    }
  }

  clear (): void {
    Array.from(this._interactive.keys()).forEach(element => {
      this.detach(element)
    })
    this._element.innerHTML = ''
  }

  destroy (): void {
    this._destroyed = true
    this.clear()
    this._element.parentElement?.removeChild(this._element)
  }
}

const layers = new WeakMap<HTMLElement, PaneDomLayer>()

/**
 * Resolve (creating on first use) the DOM layer for a pane's main widget.
 * Returns null when the pane does not exist — SSR-safe when chart is gone.
 */
export function getPaneDomLayer (chart: Chart, paneId: string): PaneDomLayer | null {
  const host = chart.getDom(paneId, 'main')
  if (host === null) {
    return null
  }
  let layer = layers.get(host)
  if (layer === undefined) {
    layer = new PaneDomLayerImp(host)
    layers.set(host, layer)
  }
  return layer
}
