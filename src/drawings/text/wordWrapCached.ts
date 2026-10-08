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

import { wordWrap, type WrappedLine } from './wordWrap'
import type { TextWidthCache } from './measure'

/**
 * wordWrap with an LRU memo on top — ported from TradingView's
 * wordWrapCached. Cache key is (font, skipHiddenLines, wrapWidth, text);
 * the metrics cache identity is intentionally NOT part of the key (TV
 * parity — widths for a given font are cache-independent).
 *
 * The underlying wordWrap mutates nothing, so cached WrappedLine arrays
 * are safe to share — callers must not mutate the returned lines.
 */

const MAX_ENTRIES = 200

export type WordWrapFn = (
  text: string,
  font: string,
  metricsCache?: TextWidthCache,
  skipHiddenLines?: boolean,
  wrapWidth?: number
) => WrappedLine[]

export function createCachedWordWrap (): WordWrapFn {
  const cache = new Map<string, WrappedLine[]>()
  return (text, font, metricsCache, skipHiddenLines = true, wrapWidth) => {
    const key = `${font}|${skipHiddenLines ? 's' : 'h'}|${wrapWidth ?? -1}|${text}`
    const cached = cache.get(key)
    if (cached !== undefined) {
      // Refresh recency for LRU eviction.
      cache.delete(key)
      cache.set(key, cached)
      return cached
    }
    const lines = wordWrap(text, font, metricsCache, skipHiddenLines, wrapWidth)
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next()
      if (oldest.done !== true) {
        cache.delete(oldest.value)
      }
    }
    cache.set(key, lines)
    return lines
  }
}
