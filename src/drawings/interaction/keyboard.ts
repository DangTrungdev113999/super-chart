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
 * Shared drawing keyboard layer. One binding feeds the drawings manager;
 * individual tools never attach their own listeners.
 *
 * TradingView key map:
 *   Esc               — cancel in-progress drawing (unlimited-step tools
 *                       complete instead); commit open text edits
 *   Delete/Backspace  — remove the selected drawing
 *   Ctrl/Cmd+Z        — undo last committed gesture
 *   Ctrl/Cmd+Shift+Z  — redo
 *   Ctrl/Cmd+C / V    — copy / paste-clone the selection
 */
export interface DrawingKeyboardHandlers {
  onEscape?: () => void
  onDelete?: () => void
  onUndo?: () => void
  onRedo?: () => void
  onCopy?: () => void
  onPaste?: () => void
}

export interface DrawingKeyboardOptions {
  /**
   * Optional gate — return false to skip dispatch (e.g. chart not focused,
   * another pane owns the keys). Defaults to always dispatch.
   */
  isActive?: () => boolean
  /** Binding target — defaults to `document` (SSR-safe no-op). */
  target?: Document | HTMLElement
}

function isEditableTarget (target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return true
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true
  }
  return target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !== null
}

/**
 * Bind the shared keyboard layer. Returns an unbind function.
 * Guards: editable DOM targets and IME composition never reach handlers.
 */
export function bindDrawingKeyboard (handlers: DrawingKeyboardHandlers, options?: DrawingKeyboardOptions): () => void {
  const target = options?.target ?? (typeof document !== 'undefined' ? document : undefined)
  if (target === undefined) {
    return () => {
      // SSR — nothing bound, nothing to unbind.
    }
  }

  const onKeyDown = (e: Event): void => {
    if (!(e instanceof KeyboardEvent)) {
      return
    }
    // Never intercept typing — inputs, textareas, contenteditable, IME.
    if (isEditableTarget(e.target) || e.isComposing) {
      return
    }
    if (options?.isActive?.() === false) {
      return
    }

    const mod = e.ctrlKey || e.metaKey
    if (mod) {
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          handlers.onRedo?.()
        } else {
          handlers.onUndo?.()
        }
      } else if (key === 'c' && handlers.onCopy !== undefined) {
        e.preventDefault()
        handlers.onCopy()
      } else if (key === 'v' && handlers.onPaste !== undefined) {
        e.preventDefault()
        handlers.onPaste()
      } else if (key === 'y') {
        // Windows redo convention alongside Cmd+Shift+Z.
        e.preventDefault()
        handlers.onRedo?.()
      }
      return
    }

    if (e.key === 'Escape' && handlers.onEscape !== undefined) {
      handlers.onEscape()
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && handlers.onDelete !== undefined) {
      e.preventDefault()
      handlers.onDelete()
    }
  }

  target.addEventListener('keydown', onKeyDown)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
  }
}
