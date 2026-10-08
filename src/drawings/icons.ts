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
 * Inline SVG icon registry — TradingView-style stroke icons.
 *
 * All icons render on a 28×28 viewBox with `stroke="currentColor"` and no
 * hard-coded fills, so toolbars inherit the host theme color. Paths are
 * authored in the same geometry language as TV's line-tools-icons set
 * (thin diagonal strokes for lines, level ticks for fib, loops for waves).
 *
 * `getDrawingIcon` resolves an iconId to markup; unknown ids get the
 * generic 'tool' glyph so a tool is never invisible in a toolbar.
 */
export type DrawingIconId = string

const SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">'

const ICONS: Record<string, string> = {
  cursor: `${SVG_OPEN}<path d="M9 4l11 12-5.5 1L17 22l-2.6 1.4L12 18l-3 3z"/></svg>`,
  cross: `${SVG_OPEN}<path d="M14 4v20M4 14h20"/><circle cx="14" cy="14" r="3"/></svg>`,
  trendLine: `${SVG_OPEN}<path d="M5 22L23 6"/><circle cx="5" cy="22" r="2"/><circle cx="23" cy="6" r="2"/></svg>`,
  ray: `${SVG_OPEN}<path d="M6 21L25 8"/><circle cx="6" cy="21" r="2"/><path d="M20 10.5L25 8l-1.2 5"/></svg>`,
  extendedLine: `${SVG_OPEN}<path d="M3 24L25 4" stroke-dasharray="2 3"/><path d="M8 21L20 9"/><circle cx="8" cy="21" r="2"/><circle cx="20" cy="9" r="2"/></svg>`,
  horizontalLine: `${SVG_OPEN}<path d="M4 14h20"/><path d="M11 10l3 4-3 4" opacity="0.6"/></svg>`,
  horizontalRay: `${SVG_OPEN}<path d="M6 14h18"/><circle cx="6" cy="14" r="2"/></svg>`,
  verticalLine: `${SVG_OPEN}<path d="M14 4v20"/></svg>`,
  segment: `${SVG_OPEN}<path d="M8 20L20 8"/><circle cx="8" cy="20" r="2"/><circle cx="20" cy="8" r="2"/></svg>`,
  parallelChannel: `${SVG_OPEN}<path d="M5 24L21 8"/><path d="M9 26L25 10" opacity="0.7"/><circle cx="5" cy="24" r="1.8"/><circle cx="21" cy="8" r="1.8"/><circle cx="25" cy="10" r="1.8"/></svg>`,
  priceChannel: `${SVG_OPEN}<path d="M5 22L13 14"/><path d="M5 10h20" opacity="0.7"/><path d="M5 26h20" opacity="0.7"/><circle cx="5" cy="22" r="1.8"/><circle cx="13" cy="14" r="1.8"/></svg>`,
  flatTopBottom: `${SVG_OPEN}<path d="M4 9h20"/><path d="M4 19h20" opacity="0.6"/><path d="M9 9v10M19 9v10" opacity="0.5"/></svg>`,
  disjointChannel: `${SVG_OPEN}<path d="M6 23L22 7"/><path d="M10 25L26 9"/><path d="M6 17L14 9" opacity="0.55"/><path d="M10 25L26 9" opacity="0.75"/></svg>`,
  pitchfork: `${SVG_OPEN}<path d="M5 24L13 8"/><path d="M9 25L21 4"/><path d="M13 26L25 6"/><circle cx="5" cy="24" r="1.8"/><circle cx="13" cy="8" r="1.8"/><circle cx="21" cy="4" r="1.8"/></svg>`,
  fibRetracement: `${SVG_OPEN}<path d="M5 7L23 21"/><path d="M4 9h20M4 13h20M4 17h20M4 21h20" opacity="0.6"/></svg>`,
  fibTimeZone: `${SVG_OPEN}<path d="M6 22L22 6"/><path d="M8 4v20M14 4v20M22 4v20" opacity="0.6"/></svg>`,
  brush: `${SVG_OPEN}<path d="M18 5l5 5L10 23l-6 1 1-6z"/><path d="M15 8l5 5"/></svg>`,
  highlighter: `${SVG_OPEN}<path d="M6 20L20 6l3 3L9 23z"/><path d="M4 24h20" opacity="0.6"/></svg>`,
  rect: `${SVG_OPEN}<rect x="6" y="8" width="16" height="12" rx="1"/></svg>`,
  rotatedRect: `${SVG_OPEN}<rect x="7" y="9" width="14" height="10" rx="1" transform="rotate(-18 14 14)"/></svg>`,
  circle: `${SVG_OPEN}<circle cx="14" cy="14" r="9"/><circle cx="14" cy="14" r="1.5"/></svg>`,
  ellipse: `${SVG_OPEN}<ellipse cx="14" cy="14" rx="10" ry="6"/></svg>`,
  triangle: `${SVG_OPEN}<path d="M14 6L24 22H4z"/></svg>`,
  arc: `${SVG_OPEN}<path d="M6 22a10 10 0 0 1 16 0"/><circle cx="6" cy="22" r="1.6"/><circle cx="22" cy="22" r="1.6"/></svg>`,
  curve: `${SVG_OPEN}<path d="M5 20Q14 4 23 20"/></svg>`,
  path: `${SVG_OPEN}<path d="M5 22L10 12l5 6 4-9 4 10"/><circle cx="5" cy="22" r="1.5"/><circle cx="23" cy="19" r="1.5"/></svg>`,
  polyline: `${SVG_OPEN}<path d="M5 21L11 11l6 8 6-11"/><circle cx="5" cy="21" r="1.5"/><circle cx="11" cy="11" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>`,
  arrow: `${SVG_OPEN}<path d="M6 22L21 7"/><path d="M13 8l8-1-1 8"/></svg>`,
  text: `${SVG_OPEN}<path d="M8 7h12M14 7v14M11 21h6"/></svg>`,
  anchoredText: `${SVG_OPEN}<path d="M8 7h12M14 7v12" opacity="0.8"/><circle cx="14" cy="23" r="2"/></svg>`,
  note: `${SVG_OPEN}<rect x="6" y="6" width="16" height="13" rx="2"/><path d="M10 19l-2 5 6-5"/></svg>`,
  callout: `${SVG_OPEN}<path d="M20 5a6 6 0 0 1 0 12h-9l-5 4V11a6 6 0 0 1 6-6z"/></svg>`,
  comment: `${SVG_OPEN}<rect x="5" y="6" width="18" height="12" rx="2"/><path d="M9 11h10M9 14h6"/></svg>`,
  priceLabel: `${SVG_OPEN}<path d="M4 14h14l6-4v8l-6 4z" transform="rotate(90 14 14)"/></svg>`,
  flag: `${SVG_OPEN}<path d="M8 4v20"/><path d="M8 5h12l-3 4 3 4H8"/></svg>`,
  measure: `${SVG_OPEN}<path d="M6 8h16v8H6z"/><path d="M10 8v3M14 8v4M18 8v3"/></svg>`,
  dateRange: `${SVG_OPEN}<rect x="5" y="7" width="18" height="15" rx="2"/><path d="M5 11h18M10 4v5M18 4v5"/></svg>`,
  priceRange: `${SVG_OPEN}<path d="M7 5v18M7 8h14M7 14h14M7 20h14" opacity="0.8"/></svg>`,
  forecast: `${SVG_OPEN}<path d="M5 20L13 12l4 4 6-9" opacity="0.9"/><path d="M13 23h10" stroke-dasharray="2 3"/></svg>`,
  longPosition: `${SVG_OPEN}<rect x="5" y="9" width="18" height="10" rx="1"/><path d="M14 19v5M11 21.5L14 24l3-2.5"/></svg>`,
  shortPosition: `${SVG_OPEN}<rect x="5" y="9" width="18" height="10" rx="1"/><path d="M14 9V4M11 6.5L14 4l3 2.5"/></svg>`,
  elliottImpulse: `${SVG_OPEN}<path d="M4 22l4-10 4 6 4-10 4 8 4-6"/><circle cx="4" cy="22" r="1.4"/><circle cx="12" cy="18" r="1.4"/><circle cx="20" cy="26" r="1.4" opacity="0.6"/></svg>`,
  elliottCorrection: `${SVG_OPEN}<path d="M5 18l5-8 4 10 5-6" stroke-dasharray="1 0"/><circle cx="5" cy="18" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="14" cy="20" r="1.4"/><circle cx="19" cy="14" r="1.4"/></svg>`,
  xabcd: `${SVG_OPEN}<path d="M5 10l5 10 5-12 5 12 3-8"/><circle cx="5" cy="10" r="1.4"/><circle cx="10" cy="20" r="1.4"/><circle cx="15" cy="8" r="1.4"/><circle cx="20" cy="20" r="1.4"/></svg>`,
  eraser: `${SVG_OPEN}<path d="M16 5l7 7-11 11H7l-3-3z"/><path d="M11 20h13"/></svg>`,
  magnet: `${SVG_OPEN}<path d="M8 4v8a6 6 0 0 0 12 0V4"/><path d="M8 4h5v6H8zM15 4h5v6h-5z"/></svg>`,
  lock: `${SVG_OPEN}<rect x="7" y="12" width="14" height="10" rx="2"/><path d="M10 12V8a4 4 0 0 1 8 0v4"/></svg>`,
  hide: `${SVG_OPEN}<path d="M4 14s4-6 10-6 10 6 10 6-4 6-10 6S4 14 4 14z"/><path d="M5 5l18 18"/></svg>`,
  remove: `${SVG_OPEN}<path d="M6 8h16M11 8V5h6v3M9 8l1 14h8l1-14"/></svg>`,
  settings: `${SVG_OPEN}<circle cx="14" cy="14" r="3"/><path d="M14 4v3M14 21v3M4 14h3M21 14h3M6.9 6.9l2.1 2.1M19 19l2.1 2.1M21.1 6.9L19 9M9 19l-2.1 2.1"/></svg>`,
  tool: `${SVG_OPEN}<path d="M17 4a5 5 0 0 0-6.6 6.6L5 16l6 6 5.4-5.4A5 5 0 0 0 24 11l-4 4-4-1-1-4 4-4a5 5 0 0 0-2-2z"/></svg>`
}

/** Inline SVG markup for an icon id — generic 'tool' glyph as fallback. */
export function getDrawingIcon (iconId: DrawingIconId | undefined): string {
  if (iconId !== undefined && iconId in ICONS) {
    return ICONS[iconId]
  }
  return ICONS.tool
}

/** Every registered icon id — hosts enumerate for icon pickers. */
export function listDrawingIconIds (): string[] {
  return Object.keys(ICONS)
}
