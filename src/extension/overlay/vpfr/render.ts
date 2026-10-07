/**
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { OverlayFigure } from '../../../component/Overlay'
import type { YAxis } from '../../../component/YAxis'
import type { RectAttrs } from '../../figure/rect'

import type { VPFRProfile, VPFRExtendData } from './types'

interface RenderParams {
  profile: VPFRProfile
  settings: VPFRExtendData
  leftX: number
  rightX: number
  boundingWidth: number
  yAxis: YAxis
  isSelected: boolean
  isHovered: boolean
  isDarkTheme: boolean
  cp1: { x: number; y: number }
  cp2: { x: number; y: number }
}

/**
 * Generate all OverlayFigure[] for the VPFR histogram, POC line,
 * selection border, and control points.
 */
export function renderVPFRFigures (params: RenderParams): OverlayFigure[] {
  const {
    profile, settings, leftX, rightX,
    yAxis, isSelected, isHovered, isDarkTheme, cp1, cp2
  } = params

  const figures: OverlayFigure[] = []
  const { rows, pocIndex, vahIndex, valIndex, maxRowVolume, profileHigh, profileLow } = profile

  if (rows.length === 0 || maxRowVolume === 0) return figures

  let topY = yAxis.convertToPixel(profileHigh)
  let bottomY = yAxis.convertToPixel(profileLow)
  const rangeWidth = Math.abs(rightX - leftX)
  const maxBarWidth = rangeWidth * (settings.widthPercent / 100)

  // Safeguard: ensure each row has at least 5px height
  const MIN_ROW_HEIGHT = 5
  const minProfileHeight = rows.length * MIN_ROW_HEIGHT
  const rawHeight = Math.abs(bottomY - topY)
  if (rawHeight < minProfileHeight) {
    const midY = (topY + bottomY) / 2
    topY = midY - minProfileHeight / 2
    bottomY = midY + minProfileHeight / 2
  }

  // Ignore pressed-move events on hit area and histogram bars
  // so body drag falls through to chart pan
  const ignoreBodyDrag: Array<'onPressedMoveStart' | 'onPressedMoving' | 'onPressedMoveEnd'> = [
    'onPressedMoveStart', 'onPressedMoving', 'onPressedMoveEnd'
  ]

  // 1. Hit area (transparent rect covering full range box) — click-to-select
  const hitAreaMinY = Math.min(topY, bottomY)
  const hitAreaMaxY = Math.max(topY, bottomY)
  const hitAreaAttrs: RectAttrs = {
    x: leftX,
    y: hitAreaMinY,
    width: rangeWidth,
    height: Math.max(1, hitAreaMaxY - hitAreaMinY)
  }
  figures.push({
    key: 'vpfr_hitArea',
    type: 'rect',
    attrs: hitAreaAttrs,
    styles: { style: 'fill', color: 'transparent' },
    ignoreEvent: ignoreBodyDrag
  })

  // 2. Background fill behind histogram (always shown, semi-transparent)
  const bgFillColor = settings.boxColor !== 'transparent'
    ? settings.boxColor
    : 'rgba(33, 150, 243, 0.08)'
  const boxAttrs: RectAttrs = {
    x: leftX,
    y: hitAreaMinY,
    width: rangeWidth,
    height: Math.max(1, hitAreaMaxY - hitAreaMinY)
  }
  figures.push({
    key: 'vpfr_box',
    type: 'rect',
    attrs: boxAttrs,
    styles: { style: 'fill', color: bgFillColor },
    ignoreEvent: true
  })

  // Shared coordinate mapping for histogram bars and POC line
  const profileRange = profileHigh - profileLow
  const adjustedPxHeight = Math.abs(bottomY - topY)
  const adjustedPxTop = Math.min(topY, bottomY)

  // 3. Histogram bars — 4 batched rect groups
  if (settings.showProfile) {
    const upOutsideRects: RectAttrs[] = []
    const downOutsideRects: RectAttrs[] = []
    const vaUpRects: RectAttrs[] = []
    const vaDownRects: RectAttrs[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.totalVol === 0) continue

      // Map row price bounds to adjusted pixel coordinates
      const rowTopY = profileRange > 0
        ? adjustedPxTop + ((profileHigh - row.high) / profileRange) * adjustedPxHeight
        : adjustedPxTop
      const rowBottomY = profileRange > 0
        ? adjustedPxTop + ((profileHigh - row.low) / profileRange) * adjustedPxHeight
        : adjustedPxTop + adjustedPxHeight
      const barHeight = Math.max(1, Math.abs(rowBottomY - rowTopY) - 1)
      const barY = Math.min(rowTopY, rowBottomY) + 0.5

      const relWidth = row.totalVol / maxRowVolume
      const totalBarWidth = relWidth * maxBarWidth

      // Buy/sell split widths
      const buyWidth = row.totalVol > 0 ? (row.buyVol / row.totalVol) * totalBarWidth : 0
      const sellWidth = totalBarWidth - buyWidth

      const isInVA = i >= valIndex && i <= vahIndex
      const isPlacementLeft = settings.placement === 'left'

      // Determine bar X position based on placement
      // 'left' = bars grow from leftX to the right
      // 'right' = bars grow from rightX to the left
      let buyX = 0
      let sellX = 0

      if (isPlacementLeft) {
        buyX = leftX
        sellX = leftX + buyWidth
      } else {
        sellX = rightX - totalBarWidth
        buyX = sellX + sellWidth
      }

      if (buyWidth > 0) {
        const rect: RectAttrs = { x: buyX, y: barY, width: buyWidth, height: barHeight }
        if (isInVA) {
          vaUpRects.push(rect)
        } else {
          upOutsideRects.push(rect)
        }
      }

      if (sellWidth > 0) {
        const rect: RectAttrs = { x: sellX, y: barY, width: sellWidth, height: barHeight }
        if (isInVA) {
          vaDownRects.push(rect)
        } else {
          downOutsideRects.push(rect)
        }
      }
    }

    // Push batched figures — 4 draw calls for all histogram bars
    if (upOutsideRects.length > 0) {
      figures.push({
        key: 'vpfr_upOutside',
        type: 'rect',
        attrs: upOutsideRects,
        styles: { style: 'fill', color: settings.upVolumeColor },
        ignoreEvent: true
      })
    }
    if (downOutsideRects.length > 0) {
      figures.push({
        key: 'vpfr_downOutside',
        type: 'rect',
        attrs: downOutsideRects,
        styles: { style: 'fill', color: settings.downVolumeColor },
        ignoreEvent: true
      })
    }
    if (vaUpRects.length > 0) {
      figures.push({
        key: 'vpfr_vaUp',
        type: 'rect',
        attrs: vaUpRects,
        styles: { style: 'fill', color: settings.vaUpColor },
        ignoreEvent: true
      })
    }
    if (vaDownRects.length > 0) {
      figures.push({
        key: 'vpfr_vaDown',
        type: 'rect',
        attrs: vaDownRects,
        styles: { style: 'fill', color: settings.vaDownColor },
        ignoreEvent: true
      })
    }
  }

  // 4. POC line — solid, within drawn range only
  if (settings.showPOC && pocIndex < rows.length) {
    const pocPrice = rows[pocIndex].mid
    const pocY = profileRange > 0
      ? adjustedPxTop + ((profileHigh - pocPrice) / profileRange) * adjustedPxHeight
      : adjustedPxTop + adjustedPxHeight / 2

    figures.push({
      key: 'vpfr_poc',
      type: 'line',
      attrs: {
        coordinates: [
          { x: leftX, y: pocY },
          { x: rightX, y: pocY }
        ]
      },
      styles: {
        color: settings.pocColor,
        size: Math.max(settings.pocLineWidth, 2)
      },
      ignoreEvent: ignoreBodyDrag
    })
  }

  // 5. Control points — same style as rectangle (theme-aware fill, blue border)
  if (isSelected || isHovered) {
    const cpFill = isDarkTheme ? '#131722' : '#ffffff'
    const cpBorder = '#1592E6'
    const cpRadius = 5
    const cpBorderSize = 1.5
    const cpR = cpRadius + cpBorderSize

    // CP1 — top-left (start time, high price) → nwse-resize cursor
    figures.push({
      key: 'vpfr_cp1',
      type: 'circle',
      attrs: {
        x: cp1.x,
        y: cp1.y,
        r: cpR
      },
      styles: {
        style: 'stroke_fill',
        color: cpFill,
        borderColor: cpBorder,
        borderSize: cpBorderSize
      },
      pointIndex: 0,
      cursor: 'nwse-resize'
    })

    // CP2 — bottom-right (end time, low price) → nwse-resize cursor
    figures.push({
      key: 'vpfr_cp2',
      type: 'circle',
      attrs: {
        x: cp2.x,
        y: cp2.y,
        r: cpR
      },
      styles: {
        style: 'stroke_fill',
        color: cpFill,
        borderColor: cpBorder,
        borderSize: cpBorderSize
      },
      pointIndex: 1,
      cursor: 'nwse-resize'
    })
  }

  return figures
}
