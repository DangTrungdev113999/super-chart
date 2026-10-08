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

import type {
  OverlayCreateFiguresCallbackParams,
  OverlayFigure
} from '../../../component/Overlay'

import { isNumber, isValid } from '../../../common/utils/typeChecks'
import { createAnchorFigures } from '../../interaction/anchors'

import { patternStrokeOf, TV_LINE_WIDTH } from './patternCommon'
import type { PatternExtendData } from './patternCommon'

/**
 * TradingView Elliott degree table (`N` in line-tool-elliott source):
 * per label group — base font size and circled-decoration radius.
 * Group = floor((14 − degree) / 3); decoration = ['', 'brackets', 'circle'][
 * (14 − degree) % 3]; labels bold on odd groups (TV `!!(i % 2)`).
 */
const ELLIOTT_GROUP_STYLE: ReadonlyArray<{ font: number, circle: number }> = [
  { font: 11, circle: 14 },
  { font: 16, circle: 22 },
  { font: 18, circle: 22 },
  { font: 20, circle: 28 },
  { font: 24, circle: 36 }
]

export const ELLIOTT_DEFAULT_DEGREE = 7
export const ELLIOTT_LABEL_Y_OFFSET = 10

/**
 * Per-tool vertex label groups — five casing variants indexed by the degree
 * group (TV `labelsGroup`). Impulse e.g. 0,1,2,3,4,5 → (0)–(5) at the
 * default Intermediate degree.
 */
export const ELLIOTT_IMPULSE_LABELS: readonly string[][] = [
  ['0', '1', '2', '3', '4', '5'],
  ['0', 'i', 'ii', 'iii', 'iv', 'v'],
  ['0', '1', '2', '3', '4', '5'],
  ['0', 'I', 'II', 'III', 'IV', 'V'],
  ['0', '1', '2', '3', '4', '5']
]

export const ELLIOTT_TRIANGLE_LABELS: readonly string[][] = [
  ['0', 'A', 'B', 'C', 'D', 'E'],
  ['0', 'a', 'b', 'c', 'd', 'e'],
  ['0', 'A', 'B', 'C', 'D', 'E'],
  ['0', 'a', 'b', 'c', 'd', 'e'],
  ['0', 'A', 'B', 'C', 'D', 'E']
]

export const ELLIOTT_CORRECTION_LABELS: readonly string[][] = [
  ['0', 'A', 'B', 'C'],
  ['0', 'a', 'b', 'c'],
  ['0', 'A', 'B', 'C'],
  ['0', 'a', 'b', 'c'],
  ['0', 'A', 'B', 'C']
]

/**
 * Catalog anchor counts (6/7) exceed TradingView's own double/triple combo
 * point counts (4/6) — the label sets keep TV's combo lettering extended
 * across every vertex: `X` separators continue alternating between named
 * swings, so a 6-anchor WXY combo reads 0·W·X·Y·X·Z and a 7-anchor WXYZ
 * combo reads 0·W·X·Y·X·Z·X.
 */
export const ELLIOTT_DOUBLE_COMBO_LABELS: readonly string[][] = [
  ['0', 'W', 'X', 'Y', 'X', 'Z'],
  ['0', 'w', 'x', 'y', 'x', 'z'],
  ['0', 'W', 'X', 'Y', 'X', 'Z'],
  ['0', 'w', 'x', 'y', 'x', 'z'],
  ['0', 'W', 'X', 'Y', 'X', 'Z']
]

export const ELLIOTT_TRIPLE_COMBO_LABELS: readonly string[][] = [
  ['0', 'W', 'X', 'Y', 'X', 'Z', 'X'],
  ['0', 'w', 'x', 'y', 'x', 'z', 'x'],
  ['0', 'W', 'X', 'Y', 'X', 'Z', 'X'],
  ['0', 'w', 'x', 'y', 'x', 'z', 'x'],
  ['0', 'W', 'X', 'Y', 'X', 'Z', 'X']
]

interface ElliottLabelSpec {
  label: string
  decoration: '' | 'brackets' | 'circle'
  group: number
}

/** TV `label(e)` — degree → casing group + decoration + glyph. */
function elliottLabelSpec (
  labelsGroup: readonly string[][],
  degree: number,
  index: number
): ElliottLabelSpec | null {
  const clamped = Math.max(0, Math.min(14, Math.round(degree)))
  const t = 15 - clamped - 1
  const group = Math.floor(t / 3)
  const decorations: Array<ElliottLabelSpec['decoration']> = ['', 'brackets', 'circle']
  const groupLabels = labelsGroup[group]
  if (!isValid(groupLabels) || index >= groupLabels.length) {
    return null
  }
  return {
    label: groupLabels[index],
    decoration: decorations[t % 3],
    group
  }
}

/**
 * Shared Elliott renderer — TradingView `ElliottLabelsPaneView` semantics:
 *
 * - `showWave` (default true) draws the solid zigzag polyline.
 * - One label per vertex; the vertex-0 label only appears while anchors are
 *   visible (selected/hovered — `areAnchorsVisible` in the source); the
 *   in-progress last vertex gets no label while drawing
 *   (`lineBeingCreated`).
 * - Label side alternates (`a = -a` each step) starting from
 *   `sign(points[2].y - points[1].y)` → 'top' (below) when that leg descends.
 * - Labels are draggable vertex handles in TV (HitTarget.ChangePoint) —
 *   mirrored via `pointIndex` so dragging a label moves the vertex.
 * - `circle` decoration additionally outlines a ring around the glyph.
 */
export function elliottWaveFigures (
  labelsGroup: readonly string[][],
  params: OverlayCreateFiguresCallbackParams<PatternExtendData>,
  fallbackColor: string
): OverlayFigure[] {
  const { chart, coordinates, overlay, isSelected, isHovered, isTouch } = params
  const ext: PatternExtendData = isValid(overlay.extendData) ? overlay.extendData : {}
  const stroke = patternStrokeOf(overlay, chart, ext, fallbackColor, TV_LINE_WIDTH)

  const figures: OverlayFigure[] = []
  const showWave = ext.showWave ?? true
  if (showWave && coordinates.length >= 2) {
    figures.push({
      key: 'ell_wave',
      type: 'line',
      attrs: { coordinates },
      styles: {
        style: stroke.style,
        color: stroke.color,
        size: stroke.size,
        dashedValue: stroke.dashedValue
      },
      ignoreEvent: true
    })
  }

  const showLabels = ext.showLabels ?? true
  if (showLabels) {
    const anchorsVisible = isSelected === true || (isHovered === true && !overlay.lock)
    const drawing = overlay.isDrawing()
    // TV: vertex 0's label only renders while anchors are visible; while the
    // tool is being created the last (in-progress) vertex has no label.
    const firstLabelIndex = anchorsVisible ? 0 : 1
    const lastLabelIndex = coordinates.length - (drawing ? 1 : 0)

    // Alternation seed — sign of the first interior leg's screen direction.
    let side = 1
    if (coordinates.length > 2) {
      side = coordinates[2].y - coordinates[1].y >= 0 ? 1 : -1
    }

    const degree = isNumber(ext.degree) ? ext.degree : ELLIOTT_DEFAULT_DEGREE
    for (let i = 0; i < lastLabelIndex; i++, side = -side) {
      if (i < firstLabelIndex) {
        continue
      }
      const spec = elliottLabelSpec(labelsGroup, degree, i)
      if (!isValid(spec)) {
        continue
      }
      const text = spec.decoration === 'brackets' ? `(${spec.label})` : spec.label
      const groupStyle = ELLIOTT_GROUP_STYLE[spec.group] ?? ELLIOTT_GROUP_STYLE[2]
      const bold = spec.group % 2 === 1
      // TV vertAlign 'top' → label below the vertex, 'bottom' → above.
      const below = side === 1
      const centerY = below
        ? coordinates[i].y + ELLIOTT_LABEL_Y_OFFSET + groupStyle.circle / 2
        : coordinates[i].y - ELLIOTT_LABEL_Y_OFFSET - groupStyle.circle / 2
      figures.push({
        key: `ell_label_${i}`,
        type: 'text',
        attrs: {
          x: coordinates[i].x,
          y: centerY,
          text,
          align: 'center',
          baseline: 'middle'
        },
        styles: {
          color: stroke.color,
          size: groupStyle.font,
          weight: bold ? 'bold' : 'normal'
        },
        pointIndex: i,
        cursor: 'pointer'
      })
      if (spec.decoration === 'circle') {
        figures.push({
          key: `ell_label_ring_${i}`,
          type: 'circle',
          attrs: { x: coordinates[i].x, y: centerY, r: groupStyle.circle / 2 },
          styles: {
            style: 'stroke',
            borderColor: stroke.color,
            borderSize: 1
          },
          pointIndex: i,
          cursor: 'pointer'
        })
      }
    }
  }

  figures.push(...createAnchorFigures({
    coordinates,
    isSelected,
    isHovered,
    isDrawing: overlay.isDrawing(),
    lock: overlay.lock,
    isTouch
  }))

  return figures
}
