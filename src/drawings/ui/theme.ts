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
 * Drawings-surface theme. The TV rail chrome ships two palettes — surfaces
 * declare `data-sc-theme="light|dark"` and the stylesheet's CSS variables
 * follow. Detection derives luminance from the chart's candle area
 * background so a light chart gets the light chrome automatically; hosts
 * can force a theme via `drawings.setTheme`.
 */

import type { Chart } from '../../Chart'
import { isArray, isString } from '../../common/utils/typeChecks'

export type DrawingsTheme = 'light' | 'dark'

const overrides = new WeakMap<Chart, DrawingsTheme>()

/** Live surfaces per chart — tagged elements for retagging on setTheme. */
const surfaces = new WeakMap<Chart, Set<HTMLElement>>()

/** Parse #rgb/#rrggbb/rgb(r,g,b) → 0..255 triple, null when unparsable. */
function parseColor (color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim())
  if (hex !== null) {
    let h = hex[1]
    if (h.length === 3) {
      h = h.split('').map(c => c + c).join('')
    }
    if (h.length === 8) {
      h = h.slice(0, 6)
    }
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim())
  if (rgb !== null) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  }
  return null
}

/** Relative luminance 0..1 (sRGB threshold ~0.5 splits light/dark). */
function luminance (color: string): number | null {
  const c = parseColor(color)
  if (c === null) {
    return null
  }
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
}

export function detectDrawingsTheme (chart: Chart): DrawingsTheme {
  const styles = chart.getStyles()
  const bg = styles.candle.area.backgroundColor
  const first = isArray(bg) ? bg[0].color : bg
  if (isString(first)) {
    const l = luminance(first)
    if (l !== null) {
      return l > 0.5 ? 'light' : 'dark'
    }
  }
  return 'dark'
}

export function getDrawingsTheme (chart: Chart): DrawingsTheme {
  return overrides.get(chart) ?? detectDrawingsTheme(chart)
}

/** Tag a surface root so the stylesheet vars apply. */
export function applyDrawingsTheme (chart: Chart, el: HTMLElement): void {
  el.setAttribute('data-sc-theme', getDrawingsTheme(chart))
  let set = surfaces.get(chart)
  if (set === undefined) {
    set = new Set()
    surfaces.set(chart, set)
  }
  // Prune detached nodes so the registry stays bounded.
  for (const e of set) {
    if (!e.isConnected) {
      set.delete(e)
    }
  }
  set.add(el)
}

export function setDrawingsTheme (chart: Chart, theme: DrawingsTheme | 'auto'): void {
  if (theme === 'auto') {
    overrides.delete(chart)
  } else {
    overrides.set(chart, theme)
  }
  const resolved = getDrawingsTheme(chart)
  surfaces.get(chart)?.forEach(el => {
    if (el.isConnected) {
      el.setAttribute('data-sc-theme', resolved)
    }
  })
}
