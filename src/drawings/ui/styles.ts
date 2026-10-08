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

/**
 * CSS-in-TS for the drawings UI — injected once per document, prefixed
 * `sc-drw-`. No .css file, no shadow DOM, no custom elements: the bundle
 * stays UMD-safe and multiple charts on one page share a single sheet.
 */

const STYLE_ID = 'sc-drawings-styles'

const CSS = `
.sc-drw-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  background: #1e222d;
  border: 1px solid #2a2e39;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  color: #d1d4dc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px;
  line-height: 1;
  user-select: none;
  white-space: nowrap;
  will-change: transform;
}
.sc-drw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: #d1d4dc;
  cursor: pointer;
}
.sc-drw-btn:hover { background: #2a2e39; color: #ffffff; }
.sc-drw-btn:active { background: #363c4e; }
.sc-drw-btn[data-on="true"] { color: #2962ff; }
.sc-drw-btn[data-on="true"]:hover { color: #4c7dff; }
.sc-drw-btn svg { display: block; width: 16px; height: 16px; }
.sc-drw-btn--wide { width: auto; padding: 0 6px; font-size: 11px; }
.sc-drw-grip {
  cursor: grab;
  color: #5d6372;
  width: 14px;
}
.sc-drw-grip:active { cursor: grabbing; }
.sc-drw-sep {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: #2a2e39;
}
.sc-drw-swatch {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.25);
}
.sc-drw-menu {
  position: absolute;
  top: 0;
  left: 0;
  min-width: 120px;
  padding: 4px;
  background: #1e222d;
  border: 1px solid #2a2e39;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  color: #d1d4dc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px;
  z-index: 10;
}
.sc-drw-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.sc-drw-menu-item:hover { background: #2a2e39; }
.sc-drw-menu-item[data-on="true"] { color: #4c7dff; }
.sc-drw-menu-item svg { width: 14px; height: 14px; flex: none; }
.sc-drw-menu-label {
  padding: 4px 8px 2px;
  color: #787b86;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sc-drw-palette {
  display: grid;
  grid-template-columns: repeat(7, 18px);
  gap: 4px;
  padding: 4px;
}
.sc-drw-palette-cell {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 2px;
  cursor: pointer;
}
.sc-drw-palette-cell:hover { transform: scale(1.15); border-color: #ffffff; }
`

let injected = false

/** Inject the drawings UI stylesheet — idempotent, SSR-safe. */
export function injectDrawingStyles (): void {
  if (injected || typeof document === 'undefined') {
    return
  }
  if (document.getElementById(STYLE_ID) !== null) {
    injected = true
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
  injected = true
}
