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

import type { DrawingIconId } from './icons'

/**
 * Drawing-tool catalog — the single registry a host toolbar/settings UI
 * reads from. Structure mirrors TradingView's `groups → sections → items`
 * so a host can render the same flyout hierarchy, and every item carries
 * the metadata the floating toolbar + settings surface need
 * (`capabilities`, `toolbarRecipe`) so per-tool chrome stays data-driven.
 */

export interface DrawingToolCapabilities {
  /** Anchors the tool collects; 0 = freehand stroke, -1 = unlimited clicks. */
  anchorCount: number
  freehand: boolean
  /** Has editable text → text controls appear in the floating toolbar. */
  hasText: boolean
  /** Supports the 45°-align modifier/persistent toggle. */
  snap45: boolean
  /** Can be cloned via Ctrl/Cmd+drag. */
  cloneable: boolean
  /** Multi-line text box vs a single caption. */
  multiline: boolean
}

/**
 * Floating-toolbar control recipe — per-tool-family property map. A host
 * renders controls in this order; each control is a self-describing slot
 * so no consumer hard-codes button wiring.
 */
export type ToolbarControl =
  | { kind: 'color', role: 'line' | 'fill' | 'text' | 'background' }
  | { kind: 'style', role: 'line' | 'text' }
  | { kind: 'width' }
  | { kind: 'levels' }
  | { kind: 'text' }
  | { kind: 'textAlign' }
  | { kind: 'geometry', options: Array<'rect' | 'rotated' | 'ellipse'> }
  | { kind: 'lock' }
  | { kind: 'visibility' }
  | { kind: 'clone' }
  | { kind: 'settings' }
  | { kind: 'remove' }
  | { kind: 'anchor' }
  | { kind: 'alert' }
  | { kind: 'snap45' }
  | { kind: 'more' }

export interface DrawingToolItem {
  /** Stable catalog id — NOT the kernel overlay name (see `overlayName`). */
  id: string
  /** Kernel template name passed to `chart.createOverlay`; '' for non-tool entries. */
  overlayName: string
  title: string
  iconId: DrawingIconId
  /** Single-key hotkey hint (host may bind). */
  hotkey?: string
  capabilities: DrawingToolCapabilities
  toolbarRecipe: ToolbarControl[]
  /** False while a tool is planned but not yet shipped — hosts dim it. */
  available: boolean
  /**
   * Non-drawing entries (cursor modes, eraser, zoom) — they change chart
   * interaction state instead of arming an overlay template.
   */
  nonTool?: boolean
}

export interface DrawingToolSection {
  id: string
  items: DrawingToolItem[]
}

export interface DrawingToolGroup {
  id: string
  /** Icon shown on the group's flyout button. */
  iconId: DrawingIconId
  sections: DrawingToolSection[]
}

const BASE: Pick<DrawingToolCapabilities, 'cloneable' | 'snap45'> = {
  cloneable: true,
  snap45: true
}

function caps (partial: Partial<DrawingToolCapabilities> & Pick<DrawingToolCapabilities, 'anchorCount'>): DrawingToolCapabilities {
  return { freehand: false, hasText: false, multiline: false, ...BASE, ...partial }
}

const LINE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'style', role: 'line' }, { kind: 'width' },
  { kind: 'snap45' }, { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' },
  { kind: 'settings' }, { kind: 'remove' }, { kind: 'more' }
]

const FIB_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'levels' }, { kind: 'style', role: 'line' },
  { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' }, { kind: 'settings' },
  { kind: 'remove' }, { kind: 'more' }
]

const SHAPE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'color', role: 'fill' }, { kind: 'style', role: 'line' },
  { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' }, { kind: 'settings' },
  { kind: 'remove' }, { kind: 'more' }
]

const TEXT_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'text' }, { kind: 'style', role: 'text' }, { kind: 'text' },
  { kind: 'textAlign' }, { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' },
  { kind: 'settings' }, { kind: 'remove' }, { kind: 'more' }
]

const MEASURE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'color', role: 'background' }, { kind: 'text' },
  { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' }, { kind: 'settings' },
  { kind: 'remove' }, { kind: 'more' }
]

function item (
  id: string,
  overlayName: string,
  title: string,
  iconId: DrawingIconId,
  capabilities: DrawingToolCapabilities,
  toolbarRecipe: ToolbarControl[],
  extra?: Partial<Pick<DrawingToolItem, 'hotkey' | 'available' | 'nonTool'>>
): DrawingToolItem {
  return { id, overlayName, title, iconId, capabilities, toolbarRecipe, available: true, ...extra }
}

function buildCatalog (): DrawingToolGroup[] {
  return [
    {
      id: 'cursor',
      iconId: 'cursor',
      sections: [{
        id: 'main',
        items: [
          item('cursor', '', 'Cursor', 'cursor', caps({ anchorCount: 0 }), [], { nonTool: true }),
          item('cross', '', 'Cross', 'cross', caps({ anchorCount: 0 }), [], { nonTool: true }),
          item('dot', '', 'Dot', 'cursor', caps({ anchorCount: 0 }), [], { nonTool: true }),
          item('arrowCursor', '', 'Arrow Cursor', 'cursor', caps({ anchorCount: 0 }), [], { nonTool: true }),
          item('eraser', '', 'Eraser', 'eraser', caps({ anchorCount: 0 }), [], { nonTool: true }),
          item('zoom', '', 'Zoom', 'cross', caps({ anchorCount: 0 }), [], { nonTool: true })
        ]
      }]
    },
    {
      id: 'trend-line',
      iconId: 'trendLine',
      sections: [
        {
          id: 'lines',
          items: [
            item('trendLine', 'segment', 'Trend Line', 'trendLine', caps({ anchorCount: 2 }), LINE_RECIPE, { hotkey: 'T' }),
            item('ray', 'rayLine', 'Ray', 'ray', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('infoLine', 'infoLine', 'Info Line', 'trendLine', caps({ anchorCount: 2 }), LINE_RECIPE, { available: false }),
            item('extendedLine', 'straightLine', 'Extended Line', 'extendedLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('trendAngle', 'trendAngle', 'Trend Angle', 'trendLine', caps({ anchorCount: 2 }), LINE_RECIPE, { available: false }),
            item('horizontalLine', 'horizontalStraightLine', 'Horizontal Line', 'horizontalLine', caps({ anchorCount: 1 }), LINE_RECIPE, { hotkey: 'H' }),
            item('horizontalRay', 'horizontalRayLine', 'Horizontal Ray', 'horizontalRay', caps({ anchorCount: 1 }), LINE_RECIPE),
            item('horizontalSegment', 'horizontalSegment', 'Horizontal Segment', 'horizontalLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('verticalLine', 'verticalStraightLine', 'Vertical Line', 'verticalLine', caps({ anchorCount: 1 }), LINE_RECIPE, { hotkey: 'V' }),
            item('verticalSegment', 'verticalSegment', 'Vertical Segment', 'verticalLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('crossLine', 'crossLine', 'Cross Line', 'cross', caps({ anchorCount: 1 }), LINE_RECIPE, { available: false }),
            item('priceLine', 'priceLine', 'Price Line', 'horizontalLine', caps({ anchorCount: 1 }), LINE_RECIPE),
            item('arrow', 'arrowLine', 'Arrow', 'arrow', caps({ anchorCount: 2 }), LINE_RECIPE, { available: false })
          ]
        },
        {
          id: 'channels',
          items: [
            item('parallelChannel', 'parallelStraightLine', 'Parallel Channel', 'parallelChannel', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('priceChannel', 'priceChannelLine', 'Price Channel', 'priceChannel', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('flatTopBottom', 'flatTopBottom', 'Flat Top/Bottom', 'flatTopBottom', caps({ anchorCount: 2 }), LINE_RECIPE, { available: false }),
            item('disjointChannel', 'disjointChannel', 'Disjoint Channel', 'disjointChannel', caps({ anchorCount: 3 }), LINE_RECIPE, { available: false }),
            item('regressionTrend', 'regressionTrend', 'Regression Trend', 'parallelChannel', caps({ anchorCount: 2 }), LINE_RECIPE)
          ]
        },
        {
          id: 'pitchforks',
          items: [
            item('pitchfork', 'pitchfork', 'Pitchfork', 'pitchfork', caps({ anchorCount: 3 }), LINE_RECIPE, { available: false }),
            item('schiffPitchfork', 'schiffPitchfork', 'Schiff Pitchfork', 'pitchfork', caps({ anchorCount: 3 }), LINE_RECIPE, { available: false }),
            item('modifiedSchiffPitchfork', 'modifiedSchiffPitchfork', 'Modified Schiff', 'pitchfork', caps({ anchorCount: 3 }), LINE_RECIPE, { available: false }),
            item('insidePitchfork', 'insidePitchfork', 'Inside Pitchfork', 'pitchfork', caps({ anchorCount: 3 }), LINE_RECIPE, { available: false })
          ]
        }
      ]
    },
    {
      id: 'gann-fib',
      iconId: 'fibRetracement',
      sections: [
        {
          id: 'fibonacci',
          items: [
            item('fibRetracement', 'fibonacciLine', 'Fib Retracement', 'fibRetracement', caps({ anchorCount: 2 }), FIB_RECIPE, { hotkey: 'F' }),
            item('fibTimeZone', 'fibTimeZone', 'Fib Time Zone', 'fibTimeZone', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('fibChannel', 'fibChannel', 'Fib Channel', 'parallelChannel', caps({ anchorCount: 3 }), FIB_RECIPE, { available: false }),
            item('fibCircles', 'fibCircles', 'Fib Circles', 'circle', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('fibSpeedFan', 'fibSpeedFan', 'Fib Speed Resistance Fan', 'trendLine', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('fibSpeedArcs', 'fibSpeedArcs', 'Fib Speed Resistance Arcs', 'arc', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('fibSpiral', 'fibSpiral', 'Fib Spiral', 'arc', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('fibWedge', 'fibWedge', 'Fib Wedge', 'triangle', caps({ anchorCount: 3 }), FIB_RECIPE, { available: false }),
            item('fibExtension', 'fibExtension', 'Trend-Based Fib Extension', 'fibRetracement', caps({ anchorCount: 3 }), FIB_RECIPE, { available: false }),
            item('fibTimeExtension', 'fibTimeExtension', 'Trend-Based Fib Time', 'fibTimeZone', caps({ anchorCount: 3 }), FIB_RECIPE, { available: false })
          ]
        },
        {
          id: 'gann',
          items: [
            item('gannFan', 'gannFan', 'Gann Fan', 'trendLine', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('gannBox', 'gannBox', 'Gann Box', 'rect', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('gannSquare', 'gannSquare', 'Gann Square', 'rect', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('gannFixed', 'gannFixed', 'Gann Square Fixed', 'rect', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false }),
            item('gannComplex', 'gannComplex', 'Gann Complex', 'rect', caps({ anchorCount: 2 }), FIB_RECIPE, { available: false })
          ]
        }
      ]
    },
    {
      id: 'patterns',
      iconId: 'elliottImpulse',
      sections: [
        {
          id: 'chart-patterns',
          items: [
            item('xabcd', 'xabcd', 'XABCD Pattern', 'xabcd', caps({ anchorCount: 5 }), LINE_RECIPE, { available: false }),
            item('cypher', 'cypher', 'Cypher Pattern', 'xabcd', caps({ anchorCount: 5 }), LINE_RECIPE, { available: false }),
            item('headAndShoulders', 'headAndShoulders', 'Head and Shoulders', 'elliottCorrection', caps({ anchorCount: 7 }), LINE_RECIPE, { available: false }),
            item('abcd', 'abcd', 'ABCD Pattern', 'xabcd', caps({ anchorCount: 4 }), LINE_RECIPE, { available: false }),
            item('threeDrives', 'threeDrives', 'Three Drives', 'elliottImpulse', caps({ anchorCount: 7 }), LINE_RECIPE, { available: false }),
            item('trianglePattern', 'trianglePattern', 'Triangle Pattern', 'triangle', caps({ anchorCount: 4 }), LINE_RECIPE, { available: false })
          ]
        },
        {
          id: 'elliott',
          items: [
            item('elliottImpulse', 'elliottImpulse', 'Elliott Impulse (12345)', 'elliottImpulse', caps({ anchorCount: 6 }), LINE_RECIPE, { available: false }),
            item('elliottCorrection', 'elliottCorrection', 'Elliott Correction (ABC)', 'elliottCorrection', caps({ anchorCount: 4 }), LINE_RECIPE, { available: false }),
            item('elliottTriangle', 'elliottTriangle', 'Elliott Triangle (ABCDE)', 'elliottCorrection', caps({ anchorCount: 6 }), LINE_RECIPE, { available: false }),
            item('elliottDoubleCombo', 'elliottDoubleCombo', 'Elliott Double Combo (WXY)', 'elliottCorrection', caps({ anchorCount: 6 }), LINE_RECIPE, { available: false }),
            item('elliottTripleCombo', 'elliottTripleCombo', 'Elliott Triple Combo (WXYZ)', 'elliottCorrection', caps({ anchorCount: 7 }), LINE_RECIPE, { available: false })
          ]
        },
        {
          id: 'cycles',
          items: [
            item('cyclicLines', 'cyclicLines', 'Cyclic Lines', 'verticalLine', caps({ anchorCount: 2 }), LINE_RECIPE, { available: false }),
            item('timeCycles', 'timeCycles', 'Time Cycles', 'verticalLine', caps({ anchorCount: 2 }), LINE_RECIPE, { available: false }),
            item('sineLine', 'sineLine', 'Sine Line', 'curve', caps({ anchorCount: 2 }), LINE_RECIPE, { available: false })
          ]
        }
      ]
    },
    {
      id: 'prediction-measure',
      iconId: 'measure',
      sections: [
        {
          id: 'forecast',
          items: [
            item('forecast', 'forecast', 'Forecast', 'forecast', caps({ anchorCount: 2 }), MEASURE_RECIPE),
            item('projection', 'projection', 'Projection', 'forecast', caps({ anchorCount: 2 }), MEASURE_RECIPE, { available: false }),
            item('barsPattern', 'barsPattern', 'Bars Pattern', 'path', caps({ anchorCount: 2 }), MEASURE_RECIPE, { available: false }),
            item('ghostFeed', 'ghostFeed', 'Ghost Feed', 'path', caps({ anchorCount: 2 }), MEASURE_RECIPE, { available: false })
          ]
        },
        {
          id: 'measurers',
          items: [
            item('measure', 'measure', 'Measure', 'measure', caps({ anchorCount: 2, snap45: false }), MEASURE_RECIPE, { available: false }),
            item('dateRange', 'dateRange', 'Date Range', 'dateRange', caps({ anchorCount: 2 }), MEASURE_RECIPE, { available: false }),
            item('priceRange', 'priceRange', 'Price Range', 'priceRange', caps({ anchorCount: 2 }), MEASURE_RECIPE, { available: false }),
            item('dateAndPriceRange', 'dateAndPriceRange', 'Date and Price Range', 'dateRange', caps({ anchorCount: 2 }), MEASURE_RECIPE, { available: false }),
            item('longPosition', 'longPosition', 'Long Position', 'longPosition', caps({ anchorCount: 1 }), MEASURE_RECIPE),
            item('shortPosition', 'shortPosition', 'Short Position', 'shortPosition', caps({ anchorCount: 1 }), MEASURE_RECIPE)
          ]
        }
      ]
    },
    {
      id: 'shapes',
      iconId: 'rect',
      sections: [
        {
          id: 'brushes',
          items: [
            item('brush', 'brush', 'Brush', 'brush', caps({ anchorCount: 0, freehand: true, snap45: false }), SHAPE_RECIPE, { available: false }),
            item('highlighter', 'highlighter', 'Highlighter', 'highlighter', caps({ anchorCount: 0, freehand: true, snap45: false }), SHAPE_RECIPE, { available: false }),
            item('path', 'path', 'Path', 'path', caps({ anchorCount: -1, snap45: false }), SHAPE_RECIPE, { available: false })
          ]
        },
        {
          id: 'arrows',
          items: [
            item('arrowMarkUp', 'arrowMarkUp', 'Arrow Mark Up', 'arrow', caps({ anchorCount: 1, snap45: false }), SHAPE_RECIPE, { available: false }),
            item('arrowMarkDown', 'arrowMarkDown', 'Arrow Mark Down', 'arrow', caps({ anchorCount: 1, snap45: false }), SHAPE_RECIPE, { available: false }),
            item('arrowMarkLeft', 'arrowMarkLeft', 'Arrow Mark Left', 'arrow', caps({ anchorCount: 1, snap45: false }), SHAPE_RECIPE, { available: false }),
            item('arrowMarkRight', 'arrowMarkRight', 'Arrow Mark Right', 'arrow', caps({ anchorCount: 1, snap45: false }), SHAPE_RECIPE, { available: false }),
            item('arrowMarker', 'arrowMarker', 'Arrow Marker', 'arrow', caps({ anchorCount: 1, snap45: false }), SHAPE_RECIPE, { available: false })
          ]
        },
        {
          id: 'shapes',
          items: [
            item('rect', 'rect', 'Rectangle', 'rect', caps({ anchorCount: 2 }), SHAPE_RECIPE),
            item('rotatedRect', 'rotatedRect', 'Rotated Rectangle', 'rotatedRect', caps({ anchorCount: 3 }), SHAPE_RECIPE, { available: false }),
            item('parallelogram', 'parallelogram', 'Parallelogram', 'rect', caps({ anchorCount: 3 }), SHAPE_RECIPE, { available: false }),
            item('circle', 'circle', 'Circle', 'circle', caps({ anchorCount: 2 }), SHAPE_RECIPE),
            item('ellipse', 'ellipse', 'Ellipse', 'ellipse', caps({ anchorCount: 2 }), SHAPE_RECIPE),
            item('triangle', 'triangle', 'Triangle', 'triangle', caps({ anchorCount: 3 }), SHAPE_RECIPE, { available: false }),
            item('arc', 'arc', 'Arc', 'arc', caps({ anchorCount: 2 }), SHAPE_RECIPE, { available: false }),
            item('curve', 'curve', 'Curve', 'curve', caps({ anchorCount: 2 }), SHAPE_RECIPE, { available: false }),
            item('doubleCurve', 'doubleCurve', 'Double Curve', 'curve', caps({ anchorCount: 3 }), SHAPE_RECIPE, { available: false }),
            item('polyline', 'polyline', 'Polyline', 'polyline', caps({ anchorCount: -1 }), SHAPE_RECIPE, { available: false })
          ]
        }
      ]
    },
    {
      id: 'annotation',
      iconId: 'text',
      sections: [
        {
          id: 'text-notes',
          items: [
            item('text', 'text', 'Text', 'text', caps({ anchorCount: 1, hasText: true, multiline: true, snap45: false }), TEXT_RECIPE, { hotkey: 'X' }),
            item('anchoredText', 'anchoredText', 'Anchored Text', 'anchoredText', caps({ anchorCount: 1, hasText: true, multiline: true, snap45: false }), TEXT_RECIPE, { available: false }),
            item('note', 'simpleTag', 'Note', 'note', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('anchoredNote', 'anchoredNote', 'Anchored Note', 'note', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE, { available: false }),
            item('signpost', 'signpost', 'Signpost', 'flag', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE, { available: false }),
            item('comment', 'comment', 'Comment', 'comment', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE, { available: false })
          ]
        },
        {
          id: 'content',
          items: [
            item('callout', 'callout', 'Callout', 'callout', caps({ anchorCount: 2, hasText: true, multiline: true, snap45: false }), TEXT_RECIPE, { available: false }),
            item('priceLabel', 'priceLabel', 'Price Label', 'priceLabel', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE, { available: false }),
            item('priceNote', 'simpleAnnotation', 'Price Note', 'priceLabel', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('flag', 'flagMark', 'Flag Mark', 'flag', caps({ anchorCount: 1, snap45: false }), TEXT_RECIPE, { available: false }),
            item('table', 'table', 'Table', 'note', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE, { available: false })
          ]
        }
      ]
    }
  ]
}

let catalogGroups: DrawingToolGroup[] | null = null

/** The full tool catalog — lazily built, stable reference per call. */
export function getDrawingCatalog (): DrawingToolGroup[] {
  catalogGroups ??= buildCatalog()
  return catalogGroups
}

/** Find a catalog item by its stable id. */
export function findCatalogItem (id: string): DrawingToolItem | null {
  for (const group of getDrawingCatalog()) {
    for (const section of group.sections) {
      const found = section.items.find(i => i.id === id)
      if (found != null) return found
    }
  }
  return null
}

/** Find a catalog item by kernel overlay name — reverse lookup for `list()`. */
export function findCatalogItemByOverlay (overlayName: string): DrawingToolItem | null {
  for (const group of getDrawingCatalog()) {
    for (const section of group.sections) {
      const found = section.items.find(i => i.overlayName === overlayName)
      if (found != null) return found
    }
  }
  return null
}

/**
 * Override a catalog entry's availability — P3 swarm flips tools to
 * `available: true` as each group ships. Returns false for unknown ids.
 */
export function setCatalogItemAvailable (id: string, available: boolean): boolean {
  const found = findCatalogItem(id)
  if (found == null) return false
  found.available = available
  return true
}

/** Toolbar chrome — chart-level toggle actions (TV left-toolbar footer). */
export interface DrawingChromeItem {
  id: 'magnet' | 'stayInDrawing' | 'lockAll' | 'hideAll' | 'removeAll'
  title: string
  iconId: DrawingIconId
  /** Toggles render pressed state; actions fire once. */
  kind: 'toggle' | 'action'
}

export const DRAWING_CHROME: DrawingChromeItem[] = [
  { id: 'magnet', title: 'Magnet Mode', iconId: 'magnet', kind: 'toggle' },
  { id: 'stayInDrawing', title: 'Stay in Drawing Mode', iconId: 'cursor', kind: 'toggle' },
  { id: 'lockAll', title: 'Lock All Drawings', iconId: 'lock', kind: 'toggle' },
  { id: 'hideAll', title: 'Hide All Drawings', iconId: 'hide', kind: 'toggle' },
  { id: 'removeAll', title: 'Remove All Drawings', iconId: 'remove', kind: 'action' }
]
