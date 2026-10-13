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
/* TV-capture tokens — dark theme measured off the real TradingView rail:
   rail #0f0f0f, surfaces #1f1f1f, hover #2e2e2e, text #dbdbdb, muted #8c8c8c,
   active tool = light tile #f0f3fa with dark icon. */
.sc-drw-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 2px;
  background: #1f1f1f;
  border: none;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  color: #dbdbdb;
  font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif;
  font-size: 12px;
  line-height: 1;
  user-select: none;
  white-space: nowrap;
  will-change: transform;
}
.sc-drw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #dbdbdb;
  cursor: pointer;
  flex: none;
}
.sc-drw-btn:hover { background: #2e2e2e; }
.sc-drw-btn:active { background: #363636; }
.sc-drw-btn[data-on="true"] { color: #2962ff; }
.sc-drw-btn[data-on="true"]:hover { color: #4c7dff; }
.sc-drw-btn svg { display: block; width: 28px; height: 28px; }
.sc-drw-btn--wide { width: auto; padding: 0 8px; font-size: 12px; gap: 4px; }
.sc-drw-btn--wide svg { width: 16px; height: 16px; }
.sc-drw-grip {
  cursor: grab;
  color: #8c8c8c;
  width: 14px;
}
.sc-drw-grip:active { cursor: grabbing; }
.sc-drw-sep {
  width: 1px;
  height: 18px;
  margin: 0 1px;
  background: rgba(219, 219, 219, 0.14);
  flex: none;
}
/* Color buttons are icon glyphs with a 3px color bar at the foot — TV's
   "Màu công cụ đường kẻ / Màu văn bản" affordance, not a solid swatch. */
.sc-drw-colorbtn { position: relative; }
.sc-drw-colorbtn svg { width: 28px; height: 28px; }
.sc-drw-colorbar {
  position: absolute;
  left: 9px;
  right: 9px;
  bottom: 5px;
  height: 3px;
  border-radius: 1.5px;
}
.sc-drw-widthbtn { width: auto; padding: 0 8px; gap: 5px; font-size: 12px; }
.sc-drw-widthbtn .sc-drw-width-line { flex: none; }
.sc-drw-widthbtn .sc-drw-width-caret { display: inline-flex; flex: none; color: #8c8c8c; }
.sc-drw-widthbtn .sc-drw-width-caret svg { width: 10px; height: 10px; }
.sc-drw-menu {
  position: absolute;
  top: 0;
  left: 0;
  min-width: 140px;
  padding: 4px;
  background: #1f1f1f;
  border: none;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), 0 8px 20px rgba(0, 0, 0, 0.45);
  color: #dbdbdb;
  font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif;
  font-size: 13px;
  z-index: 10;
}
.sc-drw-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.sc-drw-menu-item:hover { background: #2e2e2e; }
.sc-drw-menu-item[data-on="true"] { color: #4c7dff; }
.sc-drw-menu-item svg { width: 18px; height: 18px; flex: none; }
.sc-drw-ctxmenu {
  position: fixed;
  top: 0;
  left: 0;
  min-width: 220px;
  z-index: 1200;
}
.sc-drw-menu-sep {
  height: 1px;
  margin: 4px -4px;
  background: #0f0f0f;
}
.sc-drw-menu-icon { display: flex; width: 18px; height: 18px; flex: none; align-items: center; justify-content: center; }
.sc-drw-menu-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-drw-menu-item--danger { color: #f23645; }
.sc-drw-menu-item--disabled { color: #8c8c8c; cursor: default; }
.sc-drw-menu-item--disabled:hover { background: transparent; }
.sc-drw-menu-label {
  padding: 8px 12px 4px;
  color: #8c8c8c;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.sc-drw-palette {
  display: grid;
  grid-template-columns: repeat(7, 20px);
  gap: 5px;
  padding: 6px;
}
.sc-drw-palette-cell {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  cursor: pointer;
}
.sc-drw-palette-cell:hover { transform: scale(1.15); border-color: #ffffff; }
.sc-drw-palette--inline {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: #1f1f1f;
  border: none;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), 0 8px 20px rgba(0, 0, 0, 0.45);
  z-index: 5;
}
.sc-drw-field:hover .sc-drw-palette--inline { display: grid; }
.sc-drw-dialog {
  position: absolute;
  top: 0;
  left: 0;
  width: 250px;
  background: #1f1f1f;
  border: none;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4), 0 8px 20px rgba(0, 0, 0, 0.45);
  color: #dbdbdb;
  font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif;
  font-size: 12px;
  user-select: none;
  will-change: transform;
  z-index: 20;
}
.sc-drw-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-weight: 600;
  cursor: grab;
  border-bottom: 1px solid rgba(219, 219, 219, 0.08);
}
.sc-drw-dialog-header:active { cursor: grabbing; }
.sc-drw-dialog-tabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px 0;
  border-bottom: 1px solid rgba(219, 219, 219, 0.08);
}
.sc-drw-dialog-tab {
  padding: 6px 10px;
  border: none;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: #8c8c8c;
  font: inherit;
  cursor: pointer;
}
.sc-drw-dialog-tab:hover { color: #dbdbdb; }
.sc-drw-dialog-tab[data-on="true"] {
  color: #ffffff;
  background: #2e2e2e;
}
.sc-drw-dialog-body {
  max-height: 340px;
  overflow-y: auto;
  padding: 10px;
}
.sc-drw-section {
  padding: 8px 2px 4px;
  color: #8c8c8c;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.sc-drw-field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
  min-height: 26px;
}
.sc-drw-field-label {
  flex: 1;
  color: #9a9a9a;
}
.sc-drw-field-control {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}
.sc-drw-input {
  width: 112px;
  padding: 4px 8px;
  border: 1px solid #2e2e2e;
  border-radius: 4px;
  background: #0f0f0f;
  color: #dbdbdb;
  font: inherit;
}
.sc-drw-input:focus { outline: none; border-color: #2962ff; }
.sc-drw-input--narrow { width: 64px; }
.sc-drw-color {
  width: 30px;
  height: 24px;
  padding: 0;
  border: 1px solid #2e2e2e;
  border-radius: 4px;
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
/* ── Left tool palette (toolPalette.ts) — TV rail: 52px, flat #0f0f0f,
   52×38 buttons, 28px icons, right-edge › carets, light active tile. ──── */
.sc-drw-tools {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  width: 52px;
  height: 100%;
  padding: 2px 0;
  background: #0f0f0f;
  border-right: none;
  color: #dbdbdb;
  font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif;
  font-size: 12px;
  line-height: 1;
  user-select: none;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}
.sc-drw-tools::-webkit-scrollbar { display: none; }
.sc-drw-tools-group {
  position: relative;
  display: flex;
  width: 52px;
  flex: none;
}
.sc-drw-tools-btn {
  width: 52px;
  height: 38px;
  border-radius: 0;
}
.sc-drw-tools-btn:hover { background: transparent; }
.sc-drw-tools-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 5px;
}
.sc-drw-tools-icon svg { display: block; width: 28px; height: 28px; }
.sc-drw-tools-btn:hover .sc-drw-tools-icon { background: #2e2e2e; }
.sc-drw-tools-btn[data-on="true"] { color: #0f0f0f; }
.sc-drw-tools-btn[data-on="true"] .sc-drw-tools-icon {
  background: #f0f3fa;
  color: #0f0f0f;
}
/* The flyout caret is TV's right-edge › sliver — a separate narrow button
   overlaid on the group's right side, vertically centered. */
.sc-drw-tools-caret {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: 11px;
  height: 34px;
  padding: 0 0 0 1px;
  margin: 0;
  border: none;
  border-radius: 4px 0 0 4px;
  background: transparent;
  color: #8c8c8c;
  cursor: pointer;
}
.sc-drw-tools-caret svg { display: block; width: 5px; height: 8px; }
.sc-drw-tools-caret:hover { background: #2e2e2e; color: #dbdbdb; }
.sc-drw-tools-chrome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  margin-top: auto;
  padding-top: 2px;
  width: 100%;
  border-top: 1px solid rgba(219, 219, 219, 0.1);
}
.sc-drw-flyout {
  /* position:fixed + document.body — the palette's rail can scroll
     (overflow-y:auto) so an in-rail flyout would be clipped. */
  position: fixed;
  width: 292px;
  max-width: calc(100vw - 60px);
  max-height: calc(100vh - 16px);
  overflow-y: auto;
  padding: 4px 0;
  background: #1f1f1f;
  border: none;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  color: #dbdbdb;
  font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif;
  font-size: 14px;
  z-index: 20;
  scrollbar-width: thin;
}
.sc-drw-flyout-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 6px 10px 6px 8px;
  border-radius: 0;
}
.sc-drw-flyout-item[data-on="true"] { background: #2e2e2e; color: inherit; }
.sc-drw-flyout-item--disabled {
  opacity: 0.4;
  cursor: default;
}
.sc-drw-flyout-item--disabled:hover { background: transparent; }
.sc-drw-flyout-icon {
  display: inline-flex;
  flex: none;
  color: #dbdbdb;
}
.sc-drw-flyout-icon svg { width: 28px; height: 28px; }
.sc-drw-flyout-title { flex: 1; font-size: 14px; }
.sc-drw-flyout-key {
  color: #8c8c8c;
  font-size: 12px;
  text-transform: uppercase;
  flex: none;
}
.sc-drw-flyout-sep {
  height: 1px;
  margin: 4px 0;
  background: #0f0f0f;
}
.sc-drw-tools-sep {
  width: 24px;
  height: 1px;
  margin: 4px auto;
  background: rgba(219, 219, 219, 0.12);
  flex: none;
}
.sc-drw-emoji {
  width: 300px;
  background: #1f1f1f;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
  color: #dbdbdb;
  font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif;
  z-index: 20;
  overflow: hidden;
}
.sc-drw-emoji-tabs {
  display: flex;
  gap: 2px;
  padding: 6px 8px 0;
  border-bottom: 1px solid rgba(219, 219, 219, 0.1);
}
.sc-drw-emoji-tab {
  flex: 1;
  background: transparent;
  border: none;
  color: #8c8c8c;
  font-size: 13px;
  padding: 8px 4px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.sc-drw-emoji-tab[data-on="true"] {
  color: #dbdbdb;
  border-bottom-color: #2962ff;
}
.sc-drw-emoji-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 8px;
  max-height: 260px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.sc-drw-emoji-cell {
  background: transparent;
  border: none;
  border-radius: 4px;
  font-size: 20px;
  line-height: 1;
  padding: 5px 0;
  cursor: pointer;
}
.sc-drw-emoji-cell:hover { background: #2e2e2e; }
`

/** Inject the drawings UI stylesheet — idempotent, SSR-safe. */
export function injectDrawingStyles (doc?: Document): void {
  if (doc === undefined) {
    if (typeof document === 'undefined') {
      return
    }
    doc = document
  }
  // Dedupe by element id per document — a module-global flag would skip
  // injection in second documents/iframes and never re-add a removed node.
  if (doc.getElementById(STYLE_ID) !== null) {
    return
  }
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  doc.head.appendChild(style)
}
