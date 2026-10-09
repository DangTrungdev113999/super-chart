/**
 * Ellipse (Hình elip) — ExtendData types
 *
 * 2-point shape: `overlay.points[0]` and `overlay.points[1]` are the diagonal
 * corners of the bounding box. The ellipse is inscribed in that bbox.
 *
 * Flat 18-field schema — matches BRD §4.
 */

export type EllipseLineStyle = 'solid' | 'dashed' | 'dotted'

export interface EllipseVisibilityRange {
  enabled: boolean
  min: number
  max: number
}

export interface EllipseExtendData {
  // ─── Tab 1 — Định dạng (Style) ────────────────────────
  borderColor?: string // '#F44336'
  borderStyle?: EllipseLineStyle // 'solid'
  borderWidth?: number // 1 (1–4)
  fillEnabled?: boolean // true
  fillColor?: string // '#F44336'
  fillOpacity?: number // 0.2 (pinned)

  // ─── Tab 2 — Văn bản (Text) ───────────────────────────
  textEnabled?: boolean // false (master gate)
  text?: string // ''
  textColor?: string // '#F44336'
  textSize?: number // 14
  isBold?: boolean // false
  isItalic?: boolean // false
  isEditing?: boolean // transient

  // ─── Tab 3 — Hiển thị (Visibility) ────────────────────
  vis_ticks?: EllipseVisibilityRange // { true, 1, 59 }
  vis_hours?: EllipseVisibilityRange // { true, 1, 24 }
  vis_days?: EllipseVisibilityRange // { true, 1, 366 }
  vis_weeks?: EllipseVisibilityRange // { true, 1, 52 }
  vis_months?: EllipseVisibilityRange // { true, 1, 12 }
}
