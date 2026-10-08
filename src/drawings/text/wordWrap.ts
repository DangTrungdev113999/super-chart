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

import { measureText, type TextWidthCache } from './measure'

/**
 * TradingView's wordWrap algorithm (module 691695) — ported verbatim.
 * Preserves explicit line breaks, wraps long lines by word tokens, splits
 * overlong words by binary search, and marks trailing-whitespace chunks as
 * hidden lines (skippable). Positions are UTF-16 code-unit indexes, matching
 * textarea selectionStart/End semantics.
 */

export interface WrappedLine {
  text: string
  /**
   * Hidden lines carry the whitespace tail of an overfull line — invisible
   * but still consume string positions (caret/selection math needs them).
   */
  hidden: boolean
  /** Line produced by wrapping (not an explicit source line). */
  wrappedLinePart: boolean
  /** Final part of a wrapped sequence — the newline belongs to it. */
  wrappedLineEnd: boolean
}

interface WordToken {
  word: string
  spaces: string
}

function splitWordsAndSpaces (text: string): WordToken[] {
  const tokens: WordToken[] = []
  do {
    const match = /\s+/.exec(text)
    if (match === null) {
      tokens.push({ word: text, spaces: '' })
      break
    }
    tokens.push({ word: text.slice(0, match.index), spaces: match[0] })
    text = text.slice(match.index + match[0].length)
  } while (text.length > 0)
  return tokens
}

function upperbound (items: number[], value: number, predicate: (value: number, item: number) => boolean, start: number, end: number): number {
  let left = start
  let right = end
  while (left < right) {
    const mid = (left + right) >>> 1
    if (predicate(value, items[mid])) {
      right = mid
    } else {
      left = mid + 1
    }
  }
  return left
}

/**
 * Find the longest fitting prefix by binary search. Keeps at least one code
 * unit so the loop progresses even if a single character exceeds maxWidth.
 */
function splitIntoFittingChunks (text: string, font: string, metricsCache: TextWidthCache | undefined, maxWidth: number): string[] {
  const chunks: string[] = []
  const characterIndices: number[] = []
  for (let index = 0; index < text.length; ++index) {
    characterIndices.push(index)
  }
  while (text.length > 0) {
    const sourceText = text
    const prefixLength = Math.max(
      1,
      upperbound(
        characterIndices,
        maxWidth,
        (widthLimit, characterIndex) =>
          measureText(sourceText.slice(0, characterIndex + 1), font, metricsCache).width > widthLimit,
        0,
        sourceText.length
      )
    )
    chunks.push(sourceText.slice(0, prefixLength))
    text = sourceText.slice(prefixLength)
  }
  return chunks
}

export function wordWrap (
  text: string,
  font: string,
  metricsCache?: TextWidthCache,
  skipHiddenLines = true,
  wrapWidth?: number
): WrappedLine[] {
  if (typeof wrapWidth === 'string') {
    wrapWidth = parseInt(wrapWidth)
  }
  // Preserve explicit line breaks.
  const sourceLines: WrappedLine[] = text.split(/\r\n|\r|\n|$/).map(lineText => ({
    text: lineText,
    hidden: false,
    wrappedLinePart: false,
    wrappedLineEnd: false
  }))
  if (typeof wrapWidth !== 'number' || !isFinite(wrapWidth) || wrapWidth <= 0) {
    return sourceLines
  }
  if (measureText('x', font, metricsCache).width > wrapWidth) {
    return sourceLines
  }

  const wrappedLines: WrappedLine[] = []
  for (const sourceLine of sourceLines) {
    if (measureText(sourceLine.text, font, metricsCache).width <= wrapWidth) {
      wrappedLines.push(sourceLine)
      continue
    }

    const tokens = splitWordsAndSpaces(sourceLine.text)
    const isWrappedLine = true
    let pendingText = ''
    let tokenIndex = 0
    while (tokenIndex < tokens.length) {
      const token = tokens[tokenIndex]
      let candidateText = `${pendingText}${token.word}`
      let candidateWidth = measureText(candidateText, font, metricsCache).width

      if (candidateWidth > wrapWidth) {
        if (pendingText !== '') {
          wrappedLines.push({
            text: pendingText,
            hidden: false,
            wrappedLinePart: isWrappedLine,
            wrappedLineEnd: false
          })
          pendingText = ''
        } else if (candidateText.length === 1) {
          wrappedLines.push({
            text: candidateText,
            hidden: false,
            wrappedLinePart: isWrappedLine,
            wrappedLineEnd: true
          })
          token.word = ''
        } else {
          const wordChunks = splitIntoFittingChunks(candidateText, font, metricsCache, wrapWidth)
          for (let chunkIndex = 0; chunkIndex < wordChunks.length - 1; chunkIndex += 1) {
            wrappedLines.push({
              text: wordChunks[chunkIndex],
              hidden: false,
              wrappedLinePart: isWrappedLine,
              wrappedLineEnd: false
            })
          }
          token.word = wordChunks[wordChunks.length - 1]
        }
        continue // Retry the same token with the remaining word/pending text.
      }

      candidateText = `${pendingText}${token.word}${token.spaces}`
      candidateWidth = measureText(candidateText, font, metricsCache).width
      if (candidateWidth < wrapWidth) {
        pendingText = candidateText
        tokenIndex += 1
        continue
      }

      const chunks = splitIntoFittingChunks(candidateText, font, metricsCache, wrapWidth)
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunkText = chunks[chunkIndex]
        const line: WrappedLine = {
          text: chunkText,
          hidden: chunkIndex > 0,
          wrappedLinePart: isWrappedLine,
          wrappedLineEnd: tokenIndex === tokens.length - 1 && chunkIndex === chunks.length - 1
        }
        if (!(line.hidden && skipHiddenLines)) {
          wrappedLines.push(line)
        }
      }
      pendingText = ''
      tokenIndex += 1
    }
    if (pendingText !== '') {
      wrappedLines.push({
        text: pendingText,
        wrappedLinePart: isWrappedLine,
        hidden: false,
        wrappedLineEnd: true
      })
    }
  }
  return wrappedLines
}
