/**
 * Regression Trend (Xu hướng hồi quy) — constants
 *
 * Defaults, figure keys, control-point sizing, dash map, and narrow
 * chart-store accessor interface. Mirrors the `forecast` / `rect`
 * patterns used elsewhere in this extension pack.
 */

import type { EventOverlayInfo } from '../../../Store'
import type { RegressionTrendLineStyle, RegressionTrendExtendData } from './types'

// ═══════════════════════════════════════
// Defaults (BRD §4.3 + TAD §3)
// ═══════════════════════════════════════

export const REGRESSION_TREND_DEFAULTS: Required<RegressionTrendExtendData> = {
  upperDeviation: 2,
  lowerDeviation: -2,
  useUpperDeviation: true,
  useLowerDeviation: true,
  source: 'close',

  baseVisible: true,
  baseColor: '#F44336',
  baseStyle: 'dashed',

  upperVisible: true,
  upperColor: '#2962FF',
  upperStyle: 'solid',

  lowerVisible: true,
  lowerColor: '#2962FF',
  lowerStyle: 'solid',

  extendLines: false,
  pearsonR: true,

  vis_ticks: { enabled: true, min: 1, max: 59 },
  vis_hours: { enabled: true, min: 1, max: 24 },
  vis_days: { enabled: true, min: 1, max: 366 },
  vis_weeks: { enabled: true, min: 1, max: 52 },
  vis_months: { enabled: true, min: 1, max: 12 }
}

// ═══════════════════════════════════════
// Figure keys (stable identifiers for hit-testing + drag routing)
// ═══════════════════════════════════════

export const RT_PREVIEW = 'rt_preview'
export const RT_UPPER_FILL = 'rt_upper_fill'
export const RT_LOWER_FILL = 'rt_lower_fill'
export const RT_CENTER_LINE = 'rt_center_line'
export const RT_UPPER_LINE = 'rt_upper_line'
export const RT_LOWER_LINE = 'rt_lower_line'
export const RT_PEARSON_R = 'rt_pearson_r'
export const RT_CP_0 = 'rt_cp_0'
export const RT_CP_1 = 'rt_cp_1'

/** Figure keys that participate in whole-body drag (translate both anchors). */
export const BODY_DRAG_KEYS = new Set<string>([
  RT_UPPER_FILL,
  RT_LOWER_FILL,
  RT_CENTER_LINE,
  RT_UPPER_LINE,
  RT_LOWER_LINE
])

// ═══════════════════════════════════════
// Dash map (pixel pattern per RegressionTrendLineStyle)
// ═══════════════════════════════════════

export const DASH: Record<RegressionTrendLineStyle, number[]> = {
  solid: [],
  dashed: [6, 4],
  dotted: [2, 2]
}

// ═══════════════════════════════════════
// Control point sizing (match rect / forecast conventions)
// ═══════════════════════════════════════

export const CP_COLOR = '#1592E6'
export const CP_RADIUS = 5
export const CP_CIRCLE_BORDER = 1.5

// ═══════════════════════════════════════
// Preview line (Mode A / Mode B) — thin solid
// ═══════════════════════════════════════

export const PREVIEW_LINE_WIDTH = 1
export const PREVIEW_FALLBACK_COLOR = '#888888'

// ═══════════════════════════════════════
// Pearson R label
// ═══════════════════════════════════════

export const PEARSON_FONT_SIZE = 12
export const PEARSON_LABEL_OFFSET_X = 10 // distance to the LEFT of regS.x

// ═══════════════════════════════════════
// Non-BRD constants (not exposed in dialog — BRD §4.3)
// ═══════════════════════════════════════

export const BASE_LINE_WIDTH = 1
export const UPPER_LINE_WIDTH = 1
export const LOWER_LINE_WIDTH = 1
export const FILL_OPACITY = 0.2

// ═══════════════════════════════════════
// Narrow chart-store accessor (pattern from forecast / rect / vpfr)
// ═══════════════════════════════════════

export interface ChartInternal {
  getChartStore: () => {
    getClickOverlayInfo: () => EventOverlayInfo
    getHoverOverlayInfo: () => EventOverlayInfo
    getPressedOverlayInfo: () => EventOverlayInfo
  }
}
