/**
 * Regression Trend (Xu hướng hồi quy) - ExtendData types
 *
 * Data-driven channel tool: linear regression fitted over the bar range
 * between 2 control points, with optional upper/lower deviation bands.
 */

export type RegressionSource =
  | 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4'

export type RegressionTrendLineStyle = 'solid' | 'dashed' | 'dotted'

export interface VisibilityRange {
  enabled: boolean
  min: number
  max: number
}

/**
 * Flat 21-field schema — matches BRD §4.3. Bar indices (#17/#18) live
 * on `overlay.points` as `dataIndex`, not on ExtendData.
 */
export interface RegressionTrendExtendData {
  // ─── Tab 1 — Các đầu vào (Inputs) ─────────────────────
  upperDeviation?: number // #1  default  2
  lowerDeviation?: number // #2  default -2
  useUpperDeviation?: boolean // #3  default true
  useLowerDeviation?: boolean // #4  default true
  source?: RegressionSource // #5  default 'close'

  // ─── Tab 2 — Định dạng (Style) ────────────────────────
  baseVisible?: boolean // #6  default true
  baseColor?: string // #7  default '#F44336'
  baseStyle?: RegressionTrendLineStyle // #8  default 'dashed'

  upperVisible?: boolean // #9  default true
  upperColor?: string // #10 default '#2962FF'
  upperStyle?: RegressionTrendLineStyle // #11 default 'solid'

  lowerVisible?: boolean // #12 default true
  lowerColor?: string // #13 default '#2962FF'
  lowerStyle?: RegressionTrendLineStyle // #14 default 'solid'

  extendLines?: boolean // #15 default false (right edge only)
  pearsonR?: boolean // #16 default true

  // ─── Tab 4 — Hiển thị (Visibility) ────────────────────
  vis_ticks?: VisibilityRange // #19
  vis_hours?: VisibilityRange // #20
  vis_days?: VisibilityRange // #21
  vis_weeks?: VisibilityRange // #22
  vis_months?: VisibilityRange // #23
}
