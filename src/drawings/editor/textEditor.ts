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

import type { Chart } from '../../Chart'
import { createDom } from '../../common/utils/dom'
import { getPaneDomLayer, type PaneDomLayer } from '../dom/domLayer'
import type { WrappedLine } from '../text/wordWrap'
import { getCaretPosition, getSelectionRects, type TextAlignOption } from '../text/textLayout'
import { createTextWidthCache } from '../text/measure'
import { getEditorLetterSpacing } from './letterSpacing'

/**
 * In-place text editor (DP-3) — TradingView's invisible-textarea pattern:
 * a real <textarea> mounted over the renderer-measured text box provides
 * IME, clipboard, selection and a11y for free while staying opacity:0. The
 * canvas keeps painting the text; the caret and selection highlights are
 * DOM nodes on the pane layer so blinking costs zero canvas repaints.
 *
 * Close semantics: EVERY close path commits the session's final value
 * (Escape included — the approved TradingView behavior). The caller
 * receives (reason, finalValue) and decides empty-text removal / undo
 * bookkeeping — a session is exactly one history unit.
 */

export type TextEditorCloseReason = 'hotkey' | 'blur' | 'external'

/**
 * Renderer-measured geometry of the text under edit, in pane-local CSS px.
 * Produced by the tool's own text renderer — never measured separately in
 * the DOM (mismatch = caret drift, the #1 defect in ad hoc editors).
 */
export interface TextEditorInfo {
  font: string
  fontSize: number
  textLeft: number
  textTop: number
  textRight: number
  textBottom: number
  textAlign: TextAlignOption
  /** Extra px between lines (lineHeight = fontSize + lineSpacing). */
  lineSpacing: number
  centerRotation?: { x: number, y: number, angle: number }
  rtl?: boolean
}

export interface TextEditorLayout {
  info: TextEditorInfo
  /** wordWrap() output for the current value (hidden lines included). */
  lines: WrappedLine[]
}

export interface TextEditorSessionOptions {
  chart: Chart
  paneId: string
  value: string
  placeholder?: string
  maxLength?: number
  /** Single-line fields: Enter closes instead of inserting a break. */
  forbidLineBreaks?: boolean
  /** Insert a tab character on Tab (TSV-style editors) instead of blurring. */
  allowTab?: boolean
  /** Word-wrap enabled — drives the letter-spacing compensation table. */
  wordWrapEnabled?: boolean
  /** Re-layout the text as the value changes (wrap may alter the box). */
  layout: (value: string) => TextEditorLayout
  /** Live-value hook — called on every input before relayout. */
  onInput?: (value: string) => void
  onClose: (reason: TextEditorCloseReason, finalValue: string) => void
  onSelectionChange?: (sel: { start: number, end: number }) => void
  /** Selection highlight color (default TradingView blue, ~40% alpha). */
  selectionColor?: string
  /** Caret color — defaults to a dark tone matching chart text. */
  caretColor?: string
}

const EDITOR_PADDING = 2
/** TradingView MouseEventHandlerDelay.ResetClick. */
const OPENING_CLICK_GUARD_MS = 500

const STYLE_ID = 'sc-text-editor-styles'

function ensureEditorStyles (): void {
  // Id-marker dedupe (not a module-global flag) — a removed node or a
  // second document/iframe still gets its styles.
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) {
    return
  }
  const style = document.createElement('style')
  style.id = STYLE_ID
  // Caret: TV blinks at 1s period (500 off / 500 on) starting 300ms after
  // open — steps(1) holds each keyframe half the period.
  style.textContent = `
@keyframes sc-caret-blink { 0% { opacity: 0 } 50% { opacity: 1 } 100% { opacity: 0 } }
.sc-text-caret { animation: sc-caret-blink 1s steps(1) 0.3s infinite; }
.sc-text-sel { position: absolute; pointer-events: none; }
`.trim()
  document.head.appendChild(style)
}

const sharedWidthCache = createTextWidthCache()

export interface TextEditorSession {
  readonly value: string
  readonly closed: boolean
  /**
   * Recompute the box layout + reposition — call when the anchor moved
   * (scroll/zoom/pane resize) while the session stays open.
   */
  relayout: () => void
  /**
   * End the session — commits finalValue exactly once via onClose.
   */
  close: (reason?: TextEditorCloseReason) => void
}

export function createTextEditorSession (options: TextEditorSessionOptions): TextEditorSession {
  return new TextEditorSessionImp(options)
}

class TextEditorSessionImp implements TextEditorSession {
  private readonly _options: TextEditorSessionOptions
  private readonly _layer: PaneDomLayer | null
  private readonly _wrapper: HTMLElement
  private readonly _textarea: HTMLTextAreaElement
  private readonly _caret: HTMLElement
  private readonly _selHost: HTMLElement
  private readonly _mountedAt = performance.now()
  private _closed = false
  private _unmounts: Array<() => void> = []

  constructor (options: TextEditorSessionOptions) {
    this._options = options
    this._layer = getPaneDomLayer(options.chart, options.paneId)
    ensureEditorStyles()

    this._wrapper = createDom('div', {
      position: 'absolute',
      margin: '0',
      boxSizing: 'border-box',
      pointerEvents: 'none'
    })
    this._wrapper.setAttribute('data-name', 'text-editor')

    this._textarea = createDom('textarea', {
      // Invisible input device — the chart renders the text.
      opacity: '0',
      position: 'absolute',
      margin: '0',
      border: '0',
      outline: '0',
      padding: `${EDITOR_PADDING}px`,
      overflow: 'hidden',
      resize: 'none',
      boxSizing: 'border-box',
      pointerEvents: 'all',
      background: 'transparent'
    })
    this._textarea.value = options.value
    if (options.placeholder !== undefined) {
      this._textarea.placeholder = options.placeholder
    }
    if (options.maxLength !== undefined) {
      this._textarea.maxLength = options.maxLength
    }
    this._textarea.setAttribute('data-qa-id', 'inplace-text-editor')
    this._wrapper.appendChild(this._textarea)

    this._caret = createDom('div', {
      position: 'absolute',
      pointerEvents: 'none',
      width: '2px'
    })
    this._caret.classList.add('sc-text-caret')
    this._wrapper.appendChild(this._caret)

    this._selHost = createDom('div', { position: 'absolute', pointerEvents: 'none', top: '0', left: '0' })
    this._wrapper.insertBefore(this._selHost, this._textarea)

    // 500ms opening-click guard: during the ResetClick window the click that
    // opened the editor keeps flowing to the chart (TV parity); after that
    // all gestures inside the editor are contained.
    const unmountWrapper = this._layer?.mount(this._wrapper, {
      interactive: true,
      isolate: () => performance.now() - this._mountedAt > OPENING_CLICK_GUARD_MS
    })
    if (unmountWrapper !== undefined) {
      this._unmounts.push(unmountWrapper)
    }

    this._bindEvents()
    this._relayout()

    // Focus after mount so the opening click can't steal it back.
    this._textarea.focus()
    this._textarea.setSelectionRange(options.value.length, options.value.length)
    this._syncCaret()
  }

  get value (): string {
    return this._textarea.value
  }

  get closed (): boolean {
    return this._closed
  }

  private _bindEvents (): void {
    const onChange = (): void => {
      this._options.onInput?.(this._textarea.value)
      this._emitSelection()
      this._relayout()
      this._syncCaret()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      // Escape commits (approved TV behavior — never cancels).
      if (e.key === 'Escape' || (this._options.forbidLineBreaks === true && e.key === 'Enter')) {
        e.preventDefault()
        this.close('hotkey')
        return
      }
      // TSV-style editors: Tab inserts the cell separator instead of
      // moving focus (which would blur → close → commit prematurely).
      if (e.key === 'Tab' && this._options.allowTab === true) {
        e.preventDefault()
        const t = this._textarea
        const start = t.selectionStart
        const end = t.selectionEnd
        t.setRangeText('\t', start, end, 'end')
        onChange()
      }
    }
    const onBlur = (): void => {
      this.close('blur')
    }
    const onSelect = (): void => {
      this._emitSelection()
      this._syncCaret()
    }
    const syncSelection = (): void => {
      this._emitSelection()
      this._syncCaret()
    }

    this._textarea.addEventListener('input', onChange)
    this._textarea.addEventListener('keydown', onKeyDown)
    this._textarea.addEventListener('blur', onBlur)
    this._textarea.addEventListener('select', onSelect)
    document.addEventListener('mousemove', syncSelection)
    document.addEventListener('touchmove', syncSelection)
    this._unmounts.push(() => {
      document.removeEventListener('mousemove', syncSelection)
      document.removeEventListener('touchmove', syncSelection)
    })
  }

  private _emitSelection (): void {
    this._options.onSelectionChange?.({
      start: this._textarea.selectionStart,
      end: this._textarea.selectionEnd
    })
  }

  /** Reposition the wrapper + textarea + caret + selection from layout(). */
  private _relayout (): void {
    const { info } = this._options.layout(this._textarea.value)
    const textWidth = Math.ceil(info.textRight - info.textLeft) + 1
    const textHeight = Math.ceil(info.textBottom - info.textTop)
    let top = 0
    let left = 0
    let rotationAngle = 0
    if (info.centerRotation === undefined || info.centerRotation.angle === 0) {
      top = Math.round(info.textTop)
      left = Math.round(info.textLeft)
    } else {
      left = info.centerRotation.x - textWidth / 2
      top = info.centerRotation.y - textHeight / 2
      rotationAngle = info.centerRotation.angle
    }

    const w = this._wrapper.style
    w.left = `${left - EDITOR_PADDING}px`
    w.top = `${top - EDITOR_PADDING}px`
    w.width = `${textWidth + 2 * EDITOR_PADDING}px`
    w.height = `${textHeight + 2 * EDITOR_PADDING}px`
    w.transform = rotationAngle !== 0 ? `rotate(${rotationAngle}rad)` : ''
    w.transformOrigin = rotationAngle !== 0 ? 'center' : ''

    const t = this._textarea.style
    t.width = '100%'
    t.height = '100%'
    t.font = info.font
    t.lineHeight = `${info.fontSize + info.lineSpacing}px`
    t.textAlign = info.textAlign
    t.direction = info.rtl === true ? 'rtl' : 'ltr'
    const spacing = this._options.wordWrapEnabled === true
      ? getEditorLetterSpacing(info.font, info.fontSize, window.devicePixelRatio)
      : undefined
    t.letterSpacing = spacing !== undefined ? `${spacing}px` : 'normal'
  }

  /** Update the DOM caret + selection rects from the textarea selection. */
  private _syncCaret (): void {
    if (this._closed) {
      return
    }
    const value = this._textarea.value
    const { info, lines } = this._options.layout(value)
    const textWidth = Math.ceil(info.textRight - info.textLeft) + 1
    const lineHeight = info.fontSize + info.lineSpacing
    const start = getCaretPosition({
      symbolPosition: this._textarea.selectionStart,
      textWidth,
      lines,
      font: info.font,
      lineHeight: info.fontSize,
      lineSpacing: info.lineSpacing,
      textAlign: info.textAlign,
      rtl: info.rtl,
      widthCache: sharedWidthCache
    })
    const end = getCaretPosition({
      symbolPosition: this._textarea.selectionEnd,
      textWidth,
      lines,
      font: info.font,
      lineHeight: info.fontSize,
      lineSpacing: info.lineSpacing,
      textAlign: info.textAlign,
      rtl: info.rtl,
      widthCache: sharedWidthCache
    })

    // Selection highlights — DOM rects, zero canvas cost.
    this._selHost.innerHTML = ''
    if (this._textarea.selectionStart !== this._textarea.selectionEnd) {
      const rects = getSelectionRects({
        start,
        end,
        lines,
        font: info.font,
        left: 0,
        right: textWidth,
        lineHeight: info.fontSize,
        lineSpacing: info.lineSpacing,
        textAlign: info.textAlign,
        rtl: info.rtl,
        widthCache: sharedWidthCache
      })
      for (const r of rects) {
        const node = createDom('div', {
          position: 'absolute',
          left: `${r.x + EDITOR_PADDING}px`,
          top: `${r.y + EDITOR_PADDING}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
          background: this._options.selectionColor ?? 'rgba(41, 98, 255, 0.4)'
        })
        node.classList.add('sc-text-sel')
        this._selHost.appendChild(node)
      }
      this._caret.style.display = 'none'
    } else {
      // Caret position is relative to the text box inside the wrapper's padding.
      this._caret.style.display = ''
      this._caret.style.left = `${start.x + EDITOR_PADDING}px`
      this._caret.style.top = `${start.y + EDITOR_PADDING}px`
      this._caret.style.height = `${lineHeight}px`
      const dpr = window.devicePixelRatio
      this._caret.style.width = `${Math.max(2 * Math.floor(dpr), 2) / dpr}px`
      this._caret.style.background = this._options.caretColor ?? '#1e222d'
    }
  }

  /** Public relayout — scroll/zoom/pane-resize while open re-anchors the box. */
  relayout (): void {
    if (!this._closed) {
      this._relayout()
      this._syncCaret()
    }
  }

  /** End the session — commits finalValue exactly once. */
  close (reason: TextEditorCloseReason = 'external'): void {
    if (this._closed) {
      return
    }
    this._closed = true
    const finalValue = this._textarea.value
    this._unmounts.forEach(unmount => {
      unmount()
    })
    this._unmounts = []
    this._options.onClose(reason, finalValue)
  }
}
