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
 * Empirical textarea↔canvas letter-spacing compensation (verbatim from
 * TradingView module 488679). Key = `${fontSize}${b}${i}_${normalizedDpr}`.
 * Matching the native textarea's wrapping to the canvas measurement is
 * pixel-sensitive — keep the table exact and DO NOT add fallbacks.
 */
const LETTER_SPACING_BY_FONT_AND_DPR = new Map<string, number>([
  ['10b_2', 0.15], ['10bi_2', 0.15], ['12_3', 0.8],
  ['12b_2', 0.5], ['12bi_2', 0.45], ['14b_2', 0.65],
  ['14bi_2', 0.65], ['16_2.5', 0.8], ['16b_2', 0.8],
  ['16bi_2', 0.75], ['16b_2.5', 0.8], ['16bi_2.5', 0.75],
  ['16bi_3', 0.65], ['20_2', 1], ['20b_2', 0.8],
  ['20bi_2', 0.75], ['20bi_3', 0.55], ['20_2.5', 0.25],
  ['20_3', 0.8], ['24_2.5', 0.95], ['24_3', 0.95],
  ['28_2', 1.4], ['28_2.5', 1.38], ['28_3', 1.38],
  ['32_2', 1.6], ['32_2.5', 1.6], ['32_3', 1.6]
])

export function normalizedDevicePixelRatio (dpr: number): number {
  if (dpr <= 2 || dpr >= 3) {
    return dpr
  }
  return dpr < 2.5 ? 2 : 2.5
}

/**
 * Letter-spacing compensation for the invisible textarea — undefined means
 * the font/dpr combo has no calibrated entry and 'normal' should be used
 * (the original deliberately has no fallback).
 */
export function getEditorLetterSpacing (font: string, fontSize: number, dpr: number): number | undefined {
  const boldSuffix = font.includes('bold') ? 'b' : ''
  const italicSuffix = font.includes('italic') ? 'i' : ''
  return LETTER_SPACING_BY_FONT_AND_DPR.get(
    `${fontSize}${boldSuffix}${italicSuffix}_${normalizedDevicePixelRatio(dpr)}`
  )
}
