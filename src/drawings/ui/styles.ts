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

/** TV-style preset palette — colors that read on any chart theme. */
export const PALETTE = [
  '#787b86', '#9e9e9e', '#ffffff', '#000000',
  '#2962ff', '#00bcd4', '#089981', '#2dc08e',
  '#ffeb3b', '#ff9800', '#f23645', '#e91e63',
  '#9c27b0', '#673ab7'
]

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
.sc-drw-palette--inline {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #1e222d;
  border: 1px solid #2a2e39;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  z-index: 5;
}
.sc-drw-field:hover .sc-drw-palette--inline { display: grid; }
.sc-drw-dialog {
  position: absolute;
  top: 0;
  left: 0;
  width: 240px;
  background: #1e222d;
  border: 1px solid #2a2e39;
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
  color: #d1d4dc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px;
  user-select: none;
  will-change: transform;
  z-index: 20;
}
.sc-drw-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  font-weight: 600;
  cursor: grab;
  border-bottom: 1px solid #2a2e39;
}
.sc-drw-dialog-header:active { cursor: grabbing; }
.sc-drw-dialog-tabs {
  display: flex;
  gap: 2px;
  padding: 4px 6px 0;
  border-bottom: 1px solid #2a2e39;
}
.sc-drw-dialog-tab {
  padding: 4px 8px;
  border: none;
  border-radius: 3px 3px 0 0;
  background: transparent;
  color: #787b86;
  font: inherit;
  cursor: pointer;
}
.sc-drw-dialog-tab:hover { color: #d1d4dc; }
.sc-drw-dialog-tab[data-on="true"] {
  color: #ffffff;
  background: #2a2e39;
}
.sc-drw-dialog-body {
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
}
.sc-drw-section {
  padding: 6px 2px 3px;
  color: #787b86;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.sc-drw-field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 2px;
  min-height: 24px;
}
.sc-drw-field-label {
  flex: 1;
  color: #9aa0ae;
}
.sc-drw-field-control {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sc-drw-input {
  width: 110px;
  padding: 3px 6px;
  border: 1px solid #2a2e39;
  border-radius: 3px;
  background: #131722;
  color: #d1d4dc;
  font: inherit;
}
.sc-drw-input:focus { outline: none; border-color: #2962ff; }
.sc-drw-input--narrow { width: 64px; }
.sc-drw-color {
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid #2a2e39;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
}
.sc-drw-levels {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
}
.sc-drw-level-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
/* ── Left tool palette (toolPalette.ts) ─────────────────────────────────── */
.sc-drw-tools {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 40px;
  height: 100%;
  padding: 4px 0;
  background: #1e222d;
  border-right: 1px solid #2a2e39;
  color: #d1d4dc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px;
  line-height: 1;
  user-select: none;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
}
.sc-drw-tools-group {
  position: relative;
  display: flex;
}
.sc-drw-tools-btn {
  width: 32px;
  height: 32px;
}
.sc-drw-tools-btn svg { width: 18px; height: 18px; }
.sc-drw-tools-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sc-drw-tools-icon svg { display: block; }
.sc-drw-tools-caret {
  position: absolute;
  right: -1px;
  bottom: -1px;
  /* invisible but generous hit area — the visible triangle stays 4px. */
  width: 16px;
  height: 14px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}
.sc-drw-tools-caret::before {
  content: '';
  position: absolute;
  right: 1px;
  bottom: 1px;
  border-left: 4px solid transparent;
  border-bottom: 4px solid #5d6372;
}
.sc-drw-tools-caret:hover::before { border-bottom-color: #d1d4dc; }
.sc-drw-tools-group:hover .sc-drw-tools-caret::before { border-bottom-color: #9598a1; }
.sc-drw-tools-chrome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin-top: auto;
  padding-top: 4px;
  border-top: 1px solid #2a2e39;
}
.sc-drw-flyout {
  /* position:fixed + document.body — the palette's rail can scroll
     (overflow-y:auto) so an in-rail flyout would be clipped. */
  position: fixed;
  min-width: 190px;
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 4px;
  background: #1e222d;
  border: 1px solid #2a2e39;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  color: #d1d4dc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 11px;
  z-index: 20;
}
.sc-drw-flyout-item {
  padding: 6px 8px;
}
.sc-drw-flyout-item--disabled {
  opacity: 0.4;
  cursor: default;
}
.sc-drw-flyout-item--disabled:hover { background: transparent; }
.sc-drw-flyout-icon {
  display: inline-flex;
  flex: none;
  color: #b2b5be;
}
.sc-drw-flyout-icon svg { width: 16px; height: 16px; }
.sc-drw-flyout-title { flex: 1; }
.sc-drw-flyout-key {
  color: #787b86;
  font-size: 10px;
  text-transform: uppercase;
}
`

/** Inject the drawings UI stylesheet — idempotent, SSR-safe. */
export function injectDrawingStyles (): void {
  if (typeof document === 'undefined') {
    return
  }
  // Dedupe by element id per document — a module-global flag would skip
  // injection in second documents/iframes and never re-add a removed node.
  if (document.getElementById(STYLE_ID) !== null) {
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
