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

import { isMac } from '../../common/utils/platform'

/**
 * Text measurement engine (DP-2) — ported from TradingView's
 * TextWidthCache + canvasUtils.measureText with one fix: TV's cache resets
 * its entire buffer whenever the context font changes, which thrashes when
 * a chart hosts multiple text fonts. Ours keeps a per-font cache.
 */

export interface MinTextMetrics {
  width: number
  actualBoundingBoxAscent?: number
  actualBoundingBoxDescent?: number
  fontBoundingBoxAscent?: number
  fontBoundingBoxDescent?: number
}

export function getMinTextMetrics (metrics: TextMetrics): MinTextMetrics {
  return {
    width: metrics.width,
    actualBoundingBoxAscent: metrics.actualBoundingBoxAscent,
    actualBoundingBoxDescent: metrics.actualBoundingBoxDescent,
    fontBoundingBoxAscent: metrics.fontBoundingBoxAscent,
    fontBoundingBoxDescent: metrics.fontBoundingBoxDescent
  }
}

/** Bounded FIFO text-metrics cache — TV uses capacity 150 per font. */
class CircularMetricsCache {
  private readonly _map = new Map<string, MinTextMetrics>()
  constructor (private readonly _capacity: number) {}

  get (key: string): MinTextMetrics | undefined {
    return this._map.get(key)
  }

  set (key: string, value: MinTextMetrics): void {
    if (this._map.has(key)) {
      this._map.delete(key)
    } else if (this._map.size >= this._capacity) {
      const oldest = this._map.keys().next()
      if (oldest.done !== true) {
        this._map.delete(oldest.value)
      }
    }
    this._map.set(key, value)
  }

  clear (): void {
    this._map.clear()
  }
}

/**
 * Per-font width cache. TV keys a single buffer by text and resets on font
 * switch; we key caches by font so fonts coexist (mixed-font documents no
 * longer evict each other).
 */
export interface TextWidthCache {
  measureText: (context: CanvasRenderingContext2D, text: string, options?: { mono?: boolean }) => number
  yMidCorrection: (context: CanvasRenderingContext2D, text: string) => number
  getMetrics: (context: CanvasRenderingContext2D, text: string) => MinTextMetrics
  reset: () => void
}

export function createTextWidthCache (capacity = 150): TextWidthCache {
  return new TextWidthCacheImp(capacity)
}

class TextWidthCacheImp implements TextWidthCache {
  private readonly _perFont = new Map<string, CircularMetricsCache>()

  constructor (private readonly _capacity = 150) {}

  measureText (context: CanvasRenderingContext2D, text: string, options?: { mono?: boolean }): number {
    let cacheKey = text
    if (options?.mono === true) {
      cacheKey = text.replace(/\d/g, '0')
    }
    return this.getMetrics(context, cacheKey).width
  }

  yMidCorrection (context: CanvasRenderingContext2D, text: string): number {
    const metrics = this.getMetrics(context, text)
    return metrics.actualBoundingBoxAscent !== undefined && metrics.actualBoundingBoxDescent !== undefined
      ? (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
      : 0
  }

  getMetrics (context: CanvasRenderingContext2D, text: string): MinTextMetrics {
    const font = context.font
    let cache = this._perFont.get(font)
    if (cache === undefined) {
      cache = new CircularMetricsCache(this._capacity)
      this._perFont.set(font, cache)
      // Bound the font map too — fonts are finite in practice.
      if (this._perFont.size > 32) {
        const oldest = this._perFont.keys().next()
        if (oldest.done !== true) {
          this._perFont.delete(oldest.value)
        }
      }
    }
    const cached = cache.get(text)
    if (cached !== undefined) {
      return cached
    }
    const previousBaseline = context.textBaseline
    context.textBaseline = 'middle'
    const metrics = getMinTextMetrics(context.measureText(text))
    context.textBaseline = previousBaseline
    // Do not cache zero-width nonempty text (font still loading).
    if (!(metrics.width === 0 && text.length > 0)) {
      cache.set(text, metrics)
    }
    return metrics
  }

  reset (): void {
    this._perFont.clear()
  }
}

let measurementContext: CanvasRenderingContext2D | null = null
let measurementCanvas: HTMLCanvasElement | null = null

function getMeasurementContext (): CanvasRenderingContext2D {
  if (measurementContext === null) {
    measurementCanvas = document.createElement('canvas')
    measurementCanvas.width = 0
    measurementCanvas.height = 0
    // Safari/macOS returns wrong metrics for detached canvases — TV attaches
    // a display:none canvas to the document there.
    if (isMac() && typeof document.body !== 'undefined') {
      measurementCanvas.style.display = 'none'
      document.body.append(measurementCanvas)
    }
    measurementContext = measurementCanvas.getContext('2d')!
    measurementContext.textBaseline = 'alphabetic'
    measurementContext.textAlign = 'center'
  }
  return measurementContext
}

/**
 * Measure text against the shared measurement context.
 * Pass a TextWidthCache to cache by (font, text).
 */
export function measureText (
  text: string,
  font: string,
  widthCache?: TextWidthCache
): MinTextMetrics {
  const context = getMeasurementContext()
  if (context.font !== font) {
    context.font = font
  }
  return widthCache !== undefined
    ? widthCache.getMetrics(context, text)
    : getMinTextMetrics(context.measureText(text))
}
