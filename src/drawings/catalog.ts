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
/**
 * A style write target: `[root, ...keys]` where root selects the overlay
 * property (`styles` or `extendData`) the path is applied under. Recipes
 * MUST name a path the tool's renderer actually reads — the role→path
 * defaults only cover the `styles.line/polygon/rect/text` convention.
 */
export type StylePath = [target: 'styles' | 'extendData', ...keys: string[]]

/**
 * Per-tool override map for the toolbar/schema style surface — keys are
 * semantic slots, values the live read/write path for that tool.
 */
export interface DrawingStylePaths {
  lineColor?: StylePath
  lineWidth?: StylePath
  lineStyle?: StylePath
  fillColor?: StylePath
  backgroundColor?: StylePath
  textColor?: StylePath
  textSize?: StylePath
  textWeight?: StylePath
  textStyle?: StylePath
  textAlign?: StylePath
}

export type ToolbarControl =
  | { kind: 'templates' }
  | { kind: 'color', role: 'line' | 'fill' | 'text' | 'background', path?: StylePath }
  | { kind: 'style', role: 'line' | 'text', path?: StylePath }
  | { kind: 'width', path?: StylePath }
  | { kind: 'levels' }
  | { kind: 'text', path?: StylePath }
  | { kind: 'textAlign', path?: StylePath }
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
  /** Flyout hint text (TV shows '⌥ T'); defaults to `hotkey` when unset. */
  hotkeyLabel?: string
  capabilities: DrawingToolCapabilities
  toolbarRecipe: ToolbarControl[]
  /** Live read/write path overrides for the recipe's style controls — the
   * toolbar and settings schema both resolve through this map. */
  stylePaths?: DrawingStylePaths
  /** False while a tool is planned but not yet shipped — hosts dim it. */
  available: boolean
  /**
   * Non-drawing entries (cursor modes, eraser, zoom) — they change chart
   * interaction state instead of arming an overlay template.
   */
  nonTool?: boolean
  /**
   * Arm-time extendData forwarded to `api.activate` — extra-group tools
   * (host-registered templates) seed their own defaults this way.
   */
  extendData?: unknown
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
  /**
   * Single-item rail button (TV's measure/zoom) — no caret, no flyout,
   * clicking arms/dispatches the item directly.
   */
  standalone?: boolean
  /** Render a hairline separator above this group (TV's rail dividers). */
  separatorBefore?: boolean
}

const BASE: Pick<DrawingToolCapabilities, 'cloneable' | 'snap45'> = {
  cloneable: true,
  snap45: true
}

function caps (partial: Partial<DrawingToolCapabilities> & Pick<DrawingToolCapabilities, 'anchorCount'>): DrawingToolCapabilities {
  return { freehand: false, hasText: false, multiline: false, ...BASE, ...partial }
}

// TV floating-toolbar tail: quick controls first, then
// settings | lock | remove | more (hide/clone live inside the ⋯ menu).
const TAIL: ToolbarControl[] = [
  { kind: 'settings' }, { kind: 'lock' }, { kind: 'remove' }, { kind: 'more' }
]

const LINE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'width' }, { kind: 'style', role: 'line' },
  { kind: 'snap45' }, ...TAIL
]

const FIB_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'levels' }, { kind: 'style', role: 'line' },
  { kind: 'width' }, ...TAIL
]

/**
 * Tools that pin every figure color (level.color / FIB_TREND_*) and only read
 * `styles.line.size` — the line color/style controls would be dead UI.
 */
const FIB_LEVELS_RECIPE: ToolbarControl[] = [
  { kind: 'levels' }, { kind: 'width' }, ...TAIL
]

/**
 * Stroke/fill live under `styles.<channel>.border*` / `.color` — the channel
 * is per-tool (rect | circle | polygon | arc), so the recipe is a factory.
 */
function shapeRecipe (channel: 'rect' | 'circle' | 'polygon' | 'arc', fill: 'rect' | 'circle' | 'polygon' | 'arc' = channel): ToolbarControl[] {
  return [
    { kind: 'color', role: 'line', path: ['styles', channel, 'borderColor'] },
    { kind: 'color', role: 'fill', path: ['styles', fill, 'color'] },
    { kind: 'width', path: ['styles', channel, 'borderSize'] },
    { kind: 'style', role: 'line', path: ['styles', channel, 'borderStyle'] },
    ...TAIL
  ]
}

/** Line-drawn freehand/curve tools read styles.line.* — same surface as
 * LINE_RECIPE minus the 45° snap control. */
const PATH_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'width' }, { kind: 'style', role: 'line' },
  ...TAIL
]

const TEXT_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'text' }, { kind: 'style', role: 'text' }, { kind: 'text' },
  { kind: 'textAlign' }, ...TAIL
]

/** Measure/range tools style via extendData — generic roles resolve through
 * each item's stylePaths, so the recipe stays family-shaped. */
const MEASURE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'color', role: 'background' }, { kind: 'text' },
  ...TAIL
]

const RANGE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'width' }, { kind: 'style', role: 'line' },
  ...TAIL
]

const POSITION_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'color', role: 'fill' },
  { kind: 'color', role: 'background' }, { kind: 'color', role: 'text' },
  { kind: 'text' }, ...TAIL
]

/** ExtendData style-path maps for tools whose renderers never read
 * styles.line.* — writing the default paths used to be dead code. */
const RANGE_STYLE_PATHS: DrawingStylePaths = {
  lineColor: ['extendData', 'color'],
  lineStyle: ['extendData', 'lineStyle'],
  lineWidth: ['extendData', 'lineWidth']
}

const MARK_STYLE_PATHS: DrawingStylePaths = {
  lineColor: ['extendData', 'color']
}

const HIGHLIGHTER_STYLE_PATHS: DrawingStylePaths = {
  lineColor: ['extendData', 'color'],
  lineWidth: ['extendData', 'lineWidth']
}

const BARS_PATTERN_STYLE_PATHS: DrawingStylePaths = {
  lineColor: ['extendData', 'color']
}

const GHOST_FEED_STYLE_PATHS: DrawingStylePaths = {
  fillColor: ['extendData', 'upColor'],
  backgroundColor: ['extendData', 'downColor']
}

const POSITION_STYLE_PATHS: DrawingStylePaths = {
  lineColor: ['extendData', 'lineColor'],
  fillColor: ['extendData', 'profitBackground'],
  backgroundColor: ['extendData', 'stopBackground'],
  textColor: ['extendData', 'textColor'],
  textSize: ['extendData', 'fontSize']
}

const FORECAST_STYLE_PATHS: DrawingStylePaths = {
  lineColor: ['extendData', 'lineColor'],
  backgroundColor: ['extendData', 'sourceBgColor'],
  textColor: ['extendData', 'targetTextColor']
}

const PROJECTION_STYLE_PATHS: DrawingStylePaths = {
  lineColor: ['extendData', 'lineColor'],
  lineWidth: ['extendData', 'lineWidth'],
  fillColor: ['extendData', 'color1'],
  backgroundColor: ['extendData', 'color2']
}

const PROJECTION_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'width' },
  { kind: 'color', role: 'fill' }, { kind: 'color', role: 'background' },
  ...TAIL
]

const COLOR_ONLY_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, ...TAIL
]

const HIGHLIGHTER_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'width' }, ...TAIL
]

const ZONE_COLORS_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'fill' }, { kind: 'color', role: 'background' }, ...TAIL
]

const MEASURE_STYLE_PATHS: DrawingStylePaths = {
  lineColor: ['extendData', 'color'],
  fillColor: ['extendData', 'upColor'],
  backgroundColor: ['extendData', 'downColor']
}

function item (
  id: string,
  overlayName: string,
  title: string,
  iconId: DrawingIconId,
  capabilities: DrawingToolCapabilities,
  toolbarRecipe: ToolbarControl[],
  extra?: Partial<Pick<DrawingToolItem, 'hotkey' | 'hotkeyLabel' | 'available' | 'nonTool' | 'stylePaths' | 'extendData'>>
): DrawingToolItem {
  return { id, overlayName, title, iconId, capabilities, toolbarRecipe, available: true, ...extra }
}

function buildCatalog (): DrawingToolGroup[] {
  // Structure mirrors the TradingView drawing rail exactly — same groups,
  // section order, item order, and hotkey hints as the reference template.
  // Tools TV does not ship (horizontalSegment, verticalSegment, verticalRay,
  // priceLine, priceChannel, parallelogram, arrowMarkLeft/Right) stay
  // registered as overlay templates but are not offered in the palette.
  return [
    {
      id: 'cursor',
      iconId: 'linetool-group-cursors',
      sections: [{
        id: 'main',
        items: [
          item('cursor', '', 'Cross Cursor', 'cursor', caps({ anchorCount: 0, snap45: false }), [], { nonTool: true }),
          item('dot', '', 'Dot Cursor', 'dot', caps({ anchorCount: 0, snap45: false }), [], { nonTool: true }),
          item('arrowCursor', '', 'Arrow Cursor', 'arrow', caps({ anchorCount: 0, snap45: false }), [], { nonTool: true }),
          item('demonstration', '', 'Demonstration', 'demonstration', caps({ anchorCount: 0, snap45: false }), [], { nonTool: true }),
          item('eraser', '', 'Eraser', 'eraser', caps({ anchorCount: 0, snap45: false }), [], { nonTool: true })
        ]
      }]
    },
    {
      id: 'trend-line',
      iconId: 'linetool-group-trend-line',
      sections: [
        {
          id: 'lines',
          items: [
            item('trendLine', 'segment', 'Trend Line', 'LineToolTrendLine', caps({ anchorCount: 2 }), LINE_RECIPE, { hotkey: 'T', hotkeyLabel: '⌥ T' }),
            item('ray', 'rayLine', 'Ray', 'LineToolRay', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('infoLine', 'infoLine', 'Info Line', 'LineToolInfoLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('extendedLine', 'straightLine', 'Extended Line', 'LineToolExtended', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('trendAngle', 'trendAngle', 'Trend Angle', 'LineToolTrendAngle', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('horizontalLine', 'horizontalStraightLine', 'Horizontal Line', 'LineToolHorzLine', caps({ anchorCount: 1 }), LINE_RECIPE, { hotkey: 'H', hotkeyLabel: '⌥ H' }),
            item('horizontalRay', 'horizontalRayLine', 'Horizontal Ray', 'LineToolHorzRay', caps({ anchorCount: 1 }), LINE_RECIPE, { hotkey: 'J', hotkeyLabel: '⌥ J' }),
            item('verticalLine', 'verticalStraightLine', 'Vertical Line', 'LineToolVertLine', caps({ anchorCount: 1 }), LINE_RECIPE, { hotkey: 'V', hotkeyLabel: '⌥ V' }),
            item('crossLine', 'crossLine', 'Cross Line', 'LineToolCrossLine', caps({ anchorCount: 1 }), LINE_RECIPE, { hotkey: 'C', hotkeyLabel: '⌥ C' })
          ]
        },
        {
          id: 'channels',
          items: [
            item('parallelChannel', 'parallelStraightLine', 'Parallel Channel', 'LineToolParallelChannel', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('regressionTrend', 'regressionTrend', 'Regression Trend', 'LineToolRegressionTrend', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('flatTopBottom', 'flatTopBottom', 'Flat Top/Bottom', 'LineToolFlatBottom', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('disjointChannel', 'disjointChannel', 'Disjoint Channel', 'LineToolDisjointAngle', caps({ anchorCount: 3 }), LINE_RECIPE)
          ]
        },
        {
          id: 'pitchforks',
          items: [
            item('pitchfork', 'pitchfork', 'Pitchfork', 'LineToolPitchfork', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('schiffPitchfork', 'schiffPitchfork', 'Schiff Pitchfork', 'LineToolSchiffPitchfork2', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('modifiedSchiffPitchfork', 'modifiedSchiffPitchfork', 'Modified Schiff Pitchfork', 'LineToolSchiffPitchfork', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('insidePitchfork', 'insidePitchfork', 'Inside Pitchfork', 'LineToolInsidePitchfork', caps({ anchorCount: 3 }), LINE_RECIPE)
          ]
        }
      ]
    },
    {
      id: 'gann-fib',
      iconId: 'linetool-group-gann-and-fibonacci',
      sections: [
        {
          id: 'fibonacci',
          items: [
            item('fibRetracement', 'fibonacciLine', 'Fib Retracement', 'LineToolFibRetracement', caps({ anchorCount: 2 }), FIB_LEVELS_RECIPE, { hotkey: 'F', hotkeyLabel: '⌥ F' }),
            item('fibExtension', 'fibExtension', 'Trend-Based Fib Extension', 'LineToolTrendBasedFibExtension', caps({ anchorCount: 3 }), FIB_LEVELS_RECIPE),
            item('fibChannel', 'fibChannel', 'Fib Channel', 'LineToolFibChannel', caps({ anchorCount: 3 }), FIB_LEVELS_RECIPE),
            item('fibTimeZone', 'fibTimeZone', 'Fib Time Zone', 'LineToolFibTimeZone', caps({ anchorCount: 2 }), FIB_LEVELS_RECIPE),
            item('fibSpeedFan', 'fibSpeedFan', 'Fib Speed Resistance Fan', 'LineToolFibSpeedResistanceFan', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('fibTimeExtension', 'fibTimeExtension', 'Trend-Based Fib Time', 'LineToolTrendBasedFibTime', caps({ anchorCount: 3 }), FIB_LEVELS_RECIPE),
            item('fibCircles', 'fibCircles', 'Fib Circles', 'LineToolFibCircles', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('fibSpiral', 'fibSpiral', 'Fib Spiral', 'LineToolFibSpiral', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('fibSpeedArcs', 'fibSpeedArcs', 'Fib Speed Resistance Arcs', 'LineToolFibSpeedResistanceArcs', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('fibWedge', 'fibWedge', 'Fib Wedge', 'LineToolFibWedge', caps({ anchorCount: 3 }), FIB_RECIPE),
            item('pitchfan', 'pitchfan', 'Pitchfan', 'LineToolPitchfan', caps({ anchorCount: 3 }), FIB_RECIPE)
          ]
        },
        {
          id: 'gann',
          items: [
            item('gannBox', 'gannBox', 'Gann Box', 'LineToolGannSquare', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('gannFixed', 'gannFixed', 'Gann Square Fixed', 'LineToolGannFixed', caps({ anchorCount: 1 }), FIB_RECIPE),
            item('gannComplex', 'gannComplex', 'Gann Square', 'LineToolGannComplex', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('gannFan', 'gannFan', 'Gann Fan', 'LineToolGannFan', caps({ anchorCount: 2 }), FIB_LEVELS_RECIPE)
          ]
        }
      ]
    },
    {
      id: 'patterns',
      iconId: 'linetool-group-patterns',
      sections: [
        {
          id: 'chart-patterns',
          items: [
            item('xabcd', 'xabcd', 'XABCD Pattern', 'LineTool5PointsPattern', caps({ anchorCount: 5 }), LINE_RECIPE),
            item('cypher', 'cypher', 'Cypher Pattern', 'LineToolCypherPattern', caps({ anchorCount: 5 }), LINE_RECIPE),
            item('headAndShoulders', 'headAndShoulders', 'Head and Shoulders', 'LineToolHeadAndShoulders', caps({ anchorCount: 7 }), LINE_RECIPE),
            item('abcd', 'abcd', 'ABCD Pattern', 'LineToolABCD', caps({ anchorCount: 4 }), LINE_RECIPE),
            item('trianglePattern', 'trianglePattern', 'Triangle Pattern', 'LineToolTrianglePattern', caps({ anchorCount: 4 }), LINE_RECIPE),
            item('threeDrives', 'threeDrives', 'Three Drives', 'LineToolThreeDrivers', caps({ anchorCount: 7 }), LINE_RECIPE)
          ]
        },
        {
          id: 'elliott',
          items: [
            item('elliottImpulse', 'elliottImpulse', 'Elliott Impulse Wave (12345)', 'LineToolElliottImpulse', caps({ anchorCount: 6 }), LINE_RECIPE),
            item('elliottCorrection', 'elliottCorrection', 'Elliott Correction Wave (ABC)', 'LineToolElliottCorrection', caps({ anchorCount: 4 }), LINE_RECIPE),
            item('elliottTriangle', 'elliottTriangle', 'Elliott Triangle Wave (ABCDE)', 'LineToolElliottTriangle', caps({ anchorCount: 6 }), LINE_RECIPE),
            item('elliottDoubleCombo', 'elliottDoubleCombo', 'Elliott Double Combo Wave (WXY)', 'LineToolElliottDoubleCombo', caps({ anchorCount: 6 }), LINE_RECIPE),
            item('elliottTripleCombo', 'elliottTripleCombo', 'Elliott Triple Combo Wave (WXYXZ)', 'LineToolElliottTripleCombo', caps({ anchorCount: 7 }), LINE_RECIPE)
          ]
        },
        {
          id: 'cycles',
          items: [
            item('cyclicLines', 'cyclicLines', 'Cyclic Lines', 'LineToolCircleLines', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('timeCycles', 'timeCycles', 'Time Cycles', 'LineToolTimeCycles', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('sineLine', 'sineLine', 'Sine Line', 'LineToolSineLine', caps({ anchorCount: 2 }), LINE_RECIPE)
          ]
        }
      ]
    },
    {
      id: 'prediction-measure',
      iconId: 'linetool-group-prediction-and-measurement',
      sections: [
        {
          id: 'forecast',
          items: [
            item('longPosition', 'longPosition', 'Long Position', 'LineToolRiskRewardLong', caps({ anchorCount: 1 }), POSITION_RECIPE, { stylePaths: POSITION_STYLE_PATHS }),
            item('shortPosition', 'shortPosition', 'Short Position', 'LineToolRiskRewardShort', caps({ anchorCount: 1 }), POSITION_RECIPE, { stylePaths: POSITION_STYLE_PATHS }),
            item('forecast', 'forecast', 'Forecast', 'LineToolPrediction', caps({ anchorCount: 2 }), MEASURE_RECIPE, { stylePaths: FORECAST_STYLE_PATHS }),
            item('barsPattern', 'barsPattern', 'Bars Pattern', 'LineToolBarsPattern', caps({ anchorCount: 2 }), COLOR_ONLY_RECIPE, { stylePaths: BARS_PATTERN_STYLE_PATHS }),
            item('ghostFeed', 'ghostFeed', 'Ghost Feed', 'LineToolGhostFeed', caps({ anchorCount: 2 }), ZONE_COLORS_RECIPE, { stylePaths: GHOST_FEED_STYLE_PATHS }),
            item('projection', 'projection', 'Projection', 'LineToolProjection', caps({ anchorCount: 3 }), PROJECTION_RECIPE, { stylePaths: PROJECTION_STYLE_PATHS })
          ]
        },
        {
          id: 'volume',
          items: [
            item('anchoredVWAP', 'anchoredVWAP', 'Anchored VWAP', 'LineToolAnchoredVWAP', caps({ anchorCount: 1 }), LINE_RECIPE, { available: false }),
            item('vpfr', 'vpfr', 'Fixed Range Volume Profile', 'LineToolFixedRangeVolumeProfile', caps({ anchorCount: 2 }), COLOR_ONLY_RECIPE),
            item('anchoredVolumeProfile', 'anchoredVolumeProfile', 'Anchored Volume Profile', 'LineToolAnchoredVolumeProfile', caps({ anchorCount: 1 }), COLOR_ONLY_RECIPE, { available: false })
          ]
        },
        {
          id: 'measurers',
          items: [
            item('priceRange', 'priceRange', 'Price Range', 'LineToolPriceRange', caps({ anchorCount: 2 }), RANGE_RECIPE, { stylePaths: RANGE_STYLE_PATHS }),
            item('dateRange', 'dateRange', 'Date Range', 'LineToolDateRange', caps({ anchorCount: 2 }), RANGE_RECIPE, { stylePaths: RANGE_STYLE_PATHS }),
            item('dateAndPriceRange', 'dateAndPriceRange', 'Date and Price Range', 'LineToolDateAndPriceRange', caps({ anchorCount: 2 }), RANGE_RECIPE, { stylePaths: RANGE_STYLE_PATHS })
          ]
        }
      ]
    },
    {
      id: 'shapes',
      iconId: 'linetool-group-geometric-shapes',
      sections: [
        {
          id: 'brushes',
          items: [
            item('brush', 'brush', 'Brush', 'LineToolBrush', caps({ anchorCount: 0, freehand: true, snap45: false }), PATH_RECIPE),
            item('highlighter', 'highlighter', 'Highlighter', 'LineToolHighlighter', caps({ anchorCount: 0, freehand: true, snap45: false }), HIGHLIGHTER_RECIPE, { stylePaths: HIGHLIGHTER_STYLE_PATHS })
          ]
        },
        {
          id: 'arrows',
          items: [
            item('arrowMarker', 'arrowMarker', 'Arrow Marker', 'LineToolArrowMarker', caps({ anchorCount: 2, snap45: false }), COLOR_ONLY_RECIPE, { stylePaths: MARK_STYLE_PATHS }),
            item('arrow', 'arrowLine', 'Arrow', 'LineToolArrow', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('arrowMarkUp', 'arrowMarkUp', 'Arrow Mark Up', 'LineToolArrowMarkUp', caps({ anchorCount: 1, snap45: false }), COLOR_ONLY_RECIPE, { stylePaths: MARK_STYLE_PATHS }),
            item('arrowMarkDown', 'arrowMarkDown', 'Arrow Mark Down', 'LineToolArrowMarkDown', caps({ anchorCount: 1, snap45: false }), COLOR_ONLY_RECIPE, { stylePaths: MARK_STYLE_PATHS })
          ]
        },
        {
          id: 'shapes',
          items: [
            item('rect', 'rect', 'Rectangle', 'LineToolRectangle', caps({ anchorCount: 2 }), shapeRecipe('rect'), { hotkey: 'R', hotkeyLabel: '⌥ ⇧ R' }),
            item('rotatedRect', 'rotatedRect', 'Rotated Rectangle', 'LineToolRotatedRectangle', caps({ anchorCount: 3 }), shapeRecipe('polygon')),
            item('path', 'path', 'Path', 'LineToolPath', caps({ anchorCount: -1, snap45: false }), PATH_RECIPE),
            item('circle', 'circle', 'Circle', 'LineToolCircle', caps({ anchorCount: 2 }), shapeRecipe('circle')),
            item('ellipse', 'ellipse', 'Ellipse', 'LineToolEllipse', caps({ anchorCount: 2 }), shapeRecipe('circle')),
            item('polyline', 'polyline', 'Polyline', 'LineToolPolyline', caps({ anchorCount: -1 }), shapeRecipe('polygon')),
            item('triangle', 'triangle', 'Triangle', 'LineToolTriangle', caps({ anchorCount: 3 }), shapeRecipe('polygon')),
            item('arc', 'arc', 'Arc', 'LineToolArc', caps({ anchorCount: 3 }), [
              { kind: 'color', role: 'line', path: ['styles', 'arc', 'color'] },
              { kind: 'color', role: 'fill', path: ['styles', 'polygon', 'color'] },
              { kind: 'style', role: 'line', path: ['styles', 'arc', 'style'] },
              { kind: 'width', path: ['styles', 'arc', 'size'] },
              ...TAIL
            ]),
            item('curve', 'curve', 'Curve', 'LineToolBezierQuadro', caps({ anchorCount: 2 }), PATH_RECIPE),
            item('doubleCurve', 'doubleCurve', 'Double Curve', 'LineToolBezierCubic', caps({ anchorCount: 2 }), PATH_RECIPE)
          ]
        }
      ]
    },
    {
      id: 'annotation',
      iconId: 'linetool-group-annotation',
      sections: [
        {
          id: 'text-notes',
          items: [
            item('text', 'text', 'Text', 'LineToolText', caps({ anchorCount: 1, hasText: true, multiline: true, snap45: false }), TEXT_RECIPE, { hotkey: 'X' }),
            item('anchoredText', 'anchoredText', 'Anchored Text', 'LineToolTextAbsolute', caps({ anchorCount: 1, hasText: true, multiline: true, snap45: false }), TEXT_RECIPE),
            item('textNote', 'anchoredNote', 'Note', 'LineToolTextNote', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('priceNote', 'simpleAnnotation', 'Price Note', 'LineToolPriceNote', caps({ anchorCount: 2, hasText: true, snap45: true }), TEXT_RECIPE),
            item('note', 'simpleTag', 'Pin', 'LineToolNote', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('table', 'table', 'Table', 'LineToolTable', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE, { stylePaths: { textAlign: ['styles', 'table', 'textAlign'] } }),
            item('callout', 'callout', 'Callout', 'LineToolCallout', caps({ anchorCount: 2, hasText: true, multiline: true, snap45: false }), TEXT_RECIPE),
            item('comment', 'comment', 'Comment', 'LineToolComment', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('priceLabel', 'priceLabel', 'Price Label', 'LineToolPriceLabel', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('signpost', 'signpost', 'Signpost', 'LineToolSignpost', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('flag', 'flagMark', 'Flag Mark', 'LineToolFlagMark', caps({ anchorCount: 1, snap45: false }), ZONE_COLORS_RECIPE, { stylePaths: { fillColor: ['styles', 'flagMark', 'flagColor'], backgroundColor: ['styles', 'flagMark', 'poleColor'] } })
          ]
        },
        {
          id: 'content',
          items: [
            item('image', 'image', 'Image', 'LineToolImage', caps({ anchorCount: 1, snap45: false }), TAIL, { available: false }),
            item('tweet', 'tweet', 'Tweet', 'LineToolTweet', caps({ anchorCount: 1, snap45: false }), TAIL, { available: false }),
            item('idea', 'idea', 'Idea', 'LineToolIdea', caps({ anchorCount: 1, snap45: false }), TAIL, { available: false })
          ]
        }
      ]
    },
    {
      id: 'font-icons',
      iconId: 'linetool-group-font-icons',
      sections: [{
        id: 'icons',
        items: [
          item('emojiPicker', '', 'Icons', 'linetool-group-font-icons', caps({ anchorCount: 0, snap45: false }), [], { nonTool: true })
        ]
      }]
    },
    {
      id: 'measure',
      iconId: 'measure',
      standalone: true,
      separatorBefore: true,
      sections: [{
        id: 'main',
        items: [
          item('measure', 'measure', 'Measure', 'measure', caps({ anchorCount: 0, freehand: true, snap45: false }), ZONE_COLORS_RECIPE, { stylePaths: MEASURE_STYLE_PATHS })
        ]
      }]
    },
    {
      id: 'zoom',
      iconId: 'zoom',
      standalone: true,
      sections: [{
        id: 'main',
        items: [
          item('zoom', '', 'Zoom', 'zoom', caps({ anchorCount: 0, snap45: false }), [], { nonTool: true })
        ]
      }]
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

/** Find a catalog item by keyboard hotkey — TradingView bare-letter shortcuts. */
export function findCatalogItemByHotkey (key: string): DrawingToolItem | null {
  const needle = key.toLowerCase()
  for (const group of getDrawingCatalog()) {
    for (const section of group.sections) {
      const found = section.items.find(i => i.hotkey?.toLowerCase() === needle && i.available && !(i.nonTool ?? false))
      if (found != null) return found
    }
  }
  return null
}

/** Find a catalog item by kernel overlay name — reverse lookup for `list()`. */
export function findCatalogItemByOverlay (overlayName: string): DrawingToolItem | null {
  // nonTool entries (cursor/eraser/zoom…) share overlayName '' — matching an
  // empty name would return 'cursor' and activate a nonexistent overlay.
  if (overlayName === '') {
    return null
  }
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
  id: 'magnet' | 'stayInDrawing' | 'lockAll' | 'hideAll' | 'drawingSync' | 'removeAll'
  title: string
  iconId: DrawingIconId
  /** Toggles render pressed state; actions fire once. */
  kind: 'toggle' | 'action'
  /** Render a hairline separator above this chrome button. */
  separatorBefore?: boolean
}

// Order matches TV's rail footer: toggles, sync toggle, separator, trash.
export const DRAWING_CHROME: DrawingChromeItem[] = [
  { id: 'magnet', title: 'Magnet Mode', iconId: 'magnet-button', kind: 'toggle' },
  { id: 'stayInDrawing', title: 'Stay in Drawing Mode', iconId: 'drawginmode', kind: 'toggle' },
  { id: 'lockAll', title: 'Lock All Drawings', iconId: 'lock-all', kind: 'toggle' },
  { id: 'hideAll', title: 'Hide All Drawings', iconId: 'hide-all', kind: 'toggle' },
  { id: 'drawingSync', title: 'Sync Drawings', iconId: 'drawingSyncMode-button', kind: 'toggle' },
  { id: 'removeAll', title: 'Remove All Drawings', iconId: 'removeAllDrawingTools', kind: 'action', separatorBefore: true }
]
