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

const TAIL: ToolbarControl[] = [
  { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' },
  { kind: 'settings' }, { kind: 'remove' }, { kind: 'more' }
]

const LINE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'style', role: 'line' }, { kind: 'width' },
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
    { kind: 'style', role: 'line', path: ['styles', channel, 'borderStyle'] },
    { kind: 'width', path: ['styles', channel, 'borderSize'] },
    ...TAIL
  ]
}

/** Line-drawn freehand/curve tools read styles.line.* — same surface as
 * LINE_RECIPE minus the 45° snap control. */
const PATH_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'style', role: 'line' }, { kind: 'width' },
  ...TAIL
]

const TEXT_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'text' }, { kind: 'style', role: 'text' }, { kind: 'text' },
  { kind: 'textAlign' }, { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' },
  { kind: 'settings' }, { kind: 'remove' }, { kind: 'more' }
]

/** Measure/range tools style via extendData — generic roles resolve through
 * each item's stylePaths, so the recipe stays family-shaped. */
const MEASURE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'color', role: 'background' }, { kind: 'text' },
  { kind: 'lock' }, { kind: 'visibility' }, { kind: 'clone' }, { kind: 'settings' },
  { kind: 'remove' }, { kind: 'more' }
]

const RANGE_RECIPE: ToolbarControl[] = [
  { kind: 'color', role: 'line' }, { kind: 'style', role: 'line' }, { kind: 'width' },
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
  extra?: Partial<Pick<DrawingToolItem, 'hotkey' | 'available' | 'nonTool' | 'stylePaths'>>
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
            item('infoLine', 'infoLine', 'Info Line', 'trendLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('extendedLine', 'straightLine', 'Extended Line', 'extendedLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('trendAngle', 'trendAngle', 'Trend Angle', 'trendLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('horizontalLine', 'horizontalStraightLine', 'Horizontal Line', 'horizontalLine', caps({ anchorCount: 1 }), LINE_RECIPE, { hotkey: 'H' }),
            item('horizontalRay', 'horizontalRayLine', 'Horizontal Ray', 'horizontalRay', caps({ anchorCount: 1 }), LINE_RECIPE),
            item('horizontalSegment', 'horizontalSegment', 'Horizontal Segment', 'horizontalLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('verticalLine', 'verticalStraightLine', 'Vertical Line', 'verticalLine', caps({ anchorCount: 1 }), LINE_RECIPE, { hotkey: 'V' }),
            item('verticalSegment', 'verticalSegment', 'Vertical Segment', 'verticalLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('verticalRay', 'verticalRayLine', 'Vertical Ray Line', 'verticalLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('crossLine', 'crossLine', 'Cross Line', 'cross', caps({ anchorCount: 1 }), LINE_RECIPE),
            item('priceLine', 'priceLine', 'Price Line', 'horizontalLine', caps({ anchorCount: 1 }), LINE_RECIPE),
            item('arrow', 'arrowLine', 'Arrow', 'arrow', caps({ anchorCount: 2 }), LINE_RECIPE)
          ]
        },
        {
          id: 'channels',
          items: [
            item('parallelChannel', 'parallelStraightLine', 'Parallel Channel', 'parallelChannel', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('priceChannel', 'priceChannelLine', 'Price Channel', 'priceChannel', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('flatTopBottom', 'flatTopBottom', 'Flat Top/Bottom', 'flatTopBottom', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('disjointChannel', 'disjointChannel', 'Disjoint Channel', 'disjointChannel', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('regressionTrend', 'regressionTrend', 'Regression Trend', 'parallelChannel', caps({ anchorCount: 2 }), LINE_RECIPE)
          ]
        },
        {
          id: 'pitchforks',
          items: [
            item('pitchfork', 'pitchfork', 'Pitchfork', 'pitchfork', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('schiffPitchfork', 'schiffPitchfork', 'Schiff Pitchfork', 'pitchfork', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('modifiedSchiffPitchfork', 'modifiedSchiffPitchfork', 'Modified Schiff', 'pitchfork', caps({ anchorCount: 3 }), LINE_RECIPE),
            item('insidePitchfork', 'insidePitchfork', 'Inside Pitchfork', 'pitchfork', caps({ anchorCount: 3 }), LINE_RECIPE)
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
            item('fibRetracement', 'fibonacciLine', 'Fib Retracement', 'fibRetracement', caps({ anchorCount: 2 }), FIB_LEVELS_RECIPE, { hotkey: 'F' }),
            item('fibTimeZone', 'fibTimeZone', 'Fib Time Zone', 'fibTimeZone', caps({ anchorCount: 2 }), FIB_LEVELS_RECIPE),
            item('fibChannel', 'fibChannel', 'Fib Channel', 'parallelChannel', caps({ anchorCount: 3 }), FIB_LEVELS_RECIPE),
            item('fibCircles', 'fibCircles', 'Fib Circles', 'circle', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('fibSpeedFan', 'fibSpeedFan', 'Fib Speed Resistance Fan', 'trendLine', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('fibSpeedArcs', 'fibSpeedArcs', 'Fib Speed Resistance Arcs', 'arc', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('fibSpiral', 'fibSpiral', 'Fib Spiral', 'arc', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('fibWedge', 'fibWedge', 'Fib Wedge', 'triangle', caps({ anchorCount: 3 }), FIB_RECIPE),
            item('fibExtension', 'fibExtension', 'Trend-Based Fib Extension', 'fibRetracement', caps({ anchorCount: 3 }), FIB_LEVELS_RECIPE),
            item('fibTimeExtension', 'fibTimeExtension', 'Trend-Based Fib Time', 'fibTimeZone', caps({ anchorCount: 3 }), FIB_LEVELS_RECIPE)
          ]
        },
        {
          id: 'gann',
          items: [
            item('gannFan', 'gannFan', 'Gann Fan', 'trendLine', caps({ anchorCount: 2 }), FIB_LEVELS_RECIPE),
            item('gannBox', 'gannBox', 'Gann Box', 'rect', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('gannSquare', 'gannSquare', 'Gann Square', 'rect', caps({ anchorCount: 2 }), FIB_RECIPE),
            item('gannFixed', 'gannFixed', 'Gann Square Fixed', 'rect', caps({ anchorCount: 1 }), FIB_RECIPE),
            item('gannComplex', 'gannComplex', 'Gann Complex', 'rect', caps({ anchorCount: 2 }), FIB_RECIPE)
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
            item('xabcd', 'xabcd', 'XABCD Pattern', 'xabcd', caps({ anchorCount: 5 }), LINE_RECIPE),
            item('cypher', 'cypher', 'Cypher Pattern', 'xabcd', caps({ anchorCount: 5 }), LINE_RECIPE),
            item('headAndShoulders', 'headAndShoulders', 'Head and Shoulders', 'elliottCorrection', caps({ anchorCount: 7 }), LINE_RECIPE),
            item('abcd', 'abcd', 'ABCD Pattern', 'xabcd', caps({ anchorCount: 4 }), LINE_RECIPE),
            item('threeDrives', 'threeDrives', 'Three Drives', 'elliottImpulse', caps({ anchorCount: 7 }), LINE_RECIPE),
            item('trianglePattern', 'trianglePattern', 'Triangle Pattern', 'triangle', caps({ anchorCount: 4 }), LINE_RECIPE)
          ]
        },
        {
          id: 'elliott',
          items: [
            item('elliottImpulse', 'elliottImpulse', 'Elliott Impulse (12345)', 'elliottImpulse', caps({ anchorCount: 6 }), LINE_RECIPE),
            item('elliottCorrection', 'elliottCorrection', 'Elliott Correction (ABC)', 'elliottCorrection', caps({ anchorCount: 4 }), LINE_RECIPE),
            item('elliottTriangle', 'elliottTriangle', 'Elliott Triangle (ABCDE)', 'elliottCorrection', caps({ anchorCount: 6 }), LINE_RECIPE),
            item('elliottDoubleCombo', 'elliottDoubleCombo', 'Elliott Double Combo (WXY)', 'elliottCorrection', caps({ anchorCount: 6 }), LINE_RECIPE),
            item('elliottTripleCombo', 'elliottTripleCombo', 'Elliott Triple Combo (WXYZ)', 'elliottCorrection', caps({ anchorCount: 7 }), LINE_RECIPE)
          ]
        },
        {
          id: 'cycles',
          items: [
            item('cyclicLines', 'cyclicLines', 'Cyclic Lines', 'verticalLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('timeCycles', 'timeCycles', 'Time Cycles', 'verticalLine', caps({ anchorCount: 2 }), LINE_RECIPE),
            item('sineLine', 'sineLine', 'Sine Line', 'curve', caps({ anchorCount: 2 }), LINE_RECIPE)
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
            item('forecast', 'forecast', 'Forecast', 'forecast', caps({ anchorCount: 2 }), MEASURE_RECIPE, { stylePaths: FORECAST_STYLE_PATHS }),
            item('projection', 'projection', 'Projection', 'forecast', caps({ anchorCount: 3 }), PROJECTION_RECIPE, { stylePaths: PROJECTION_STYLE_PATHS }),
            item('barsPattern', 'barsPattern', 'Bars Pattern', 'path', caps({ anchorCount: 2 }), COLOR_ONLY_RECIPE, { stylePaths: BARS_PATTERN_STYLE_PATHS }),
            item('ghostFeed', 'ghostFeed', 'Ghost Feed', 'path', caps({ anchorCount: 2 }), ZONE_COLORS_RECIPE, { stylePaths: GHOST_FEED_STYLE_PATHS })
          ]
        },
        {
          id: 'measurers',
          items: [
            item('measure', 'measure', 'Measure', 'measure', caps({ anchorCount: 0, freehand: true, snap45: false }), ZONE_COLORS_RECIPE, { stylePaths: MEASURE_STYLE_PATHS }),
            item('dateRange', 'dateRange', 'Date Range', 'dateRange', caps({ anchorCount: 2 }), RANGE_RECIPE, { stylePaths: RANGE_STYLE_PATHS }),
            item('priceRange', 'priceRange', 'Price Range', 'priceRange', caps({ anchorCount: 2 }), RANGE_RECIPE, { stylePaths: RANGE_STYLE_PATHS }),
            item('dateAndPriceRange', 'dateAndPriceRange', 'Date and Price Range', 'dateRange', caps({ anchorCount: 2 }), RANGE_RECIPE, { stylePaths: RANGE_STYLE_PATHS }),
            item('longPosition', 'longPosition', 'Long Position', 'longPosition', caps({ anchorCount: 1 }), POSITION_RECIPE, { stylePaths: POSITION_STYLE_PATHS }),
            item('shortPosition', 'shortPosition', 'Short Position', 'shortPosition', caps({ anchorCount: 1 }), POSITION_RECIPE, { stylePaths: POSITION_STYLE_PATHS })
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
            item('brush', 'brush', 'Brush', 'brush', caps({ anchorCount: 0, freehand: true, snap45: false }), PATH_RECIPE),
            item('highlighter', 'highlighter', 'Highlighter', 'highlighter', caps({ anchorCount: 0, freehand: true, snap45: false }), HIGHLIGHTER_RECIPE, { stylePaths: HIGHLIGHTER_STYLE_PATHS }),
            item('path', 'path', 'Path', 'path', caps({ anchorCount: -1, snap45: false }), PATH_RECIPE)
          ]
        },
        {
          id: 'arrows',
          items: [
            item('arrowMarkUp', 'arrowMarkUp', 'Arrow Mark Up', 'arrow', caps({ anchorCount: 1, snap45: false }), COLOR_ONLY_RECIPE, { stylePaths: MARK_STYLE_PATHS }),
            item('arrowMarkDown', 'arrowMarkDown', 'Arrow Mark Down', 'arrow', caps({ anchorCount: 1, snap45: false }), COLOR_ONLY_RECIPE, { stylePaths: MARK_STYLE_PATHS }),
            item('arrowMarkLeft', 'arrowMarkLeft', 'Arrow Mark Left', 'arrow', caps({ anchorCount: 1, snap45: false }), COLOR_ONLY_RECIPE, { stylePaths: MARK_STYLE_PATHS }),
            item('arrowMarkRight', 'arrowMarkRight', 'Arrow Mark Right', 'arrow', caps({ anchorCount: 1, snap45: false }), COLOR_ONLY_RECIPE, { stylePaths: MARK_STYLE_PATHS }),
            item('arrowMarker', 'arrowMarker', 'Arrow Marker', 'arrow', caps({ anchorCount: 2, snap45: false }), COLOR_ONLY_RECIPE, { stylePaths: MARK_STYLE_PATHS })
          ]
        },
        {
          id: 'shapes',
          items: [
            item('rect', 'rect', 'Rectangle', 'rect', caps({ anchorCount: 2 }), shapeRecipe('rect')),
            item('rotatedRect', 'rotatedRect', 'Rotated Rectangle', 'rotatedRect', caps({ anchorCount: 3 }), shapeRecipe('polygon')),
            item('parallelogram', 'parallelogram', 'Parallelogram', 'rect', caps({ anchorCount: 3 }), shapeRecipe('polygon')),
            item('circle', 'circle', 'Circle', 'circle', caps({ anchorCount: 2 }), shapeRecipe('circle')),
            item('ellipse', 'ellipse', 'Ellipse', 'ellipse', caps({ anchorCount: 2 }), shapeRecipe('circle')),
            item('triangle', 'triangle', 'Triangle', 'triangle', caps({ anchorCount: 3 }), shapeRecipe('polygon')),
            // Arc's stroke channel is arc.{color,style,size} (not
            // border*) — the generic shapeRecipe would write dead keys.
            item('arc', 'arc', 'Arc', 'arc', caps({ anchorCount: 3 }), [
              { kind: 'color', role: 'line', path: ['styles', 'arc', 'color'] },
              { kind: 'color', role: 'fill', path: ['styles', 'polygon', 'color'] },
              { kind: 'style', role: 'line', path: ['styles', 'arc', 'style'] },
              { kind: 'width', path: ['styles', 'arc', 'size'] },
              ...TAIL
            ]),
            item('curve', 'curve', 'Curve', 'curve', caps({ anchorCount: 2 }), PATH_RECIPE),
            item('doubleCurve', 'doubleCurve', 'Double Curve', 'curve', caps({ anchorCount: 2 }), PATH_RECIPE),
            item('polyline', 'polyline', 'Polyline', 'polyline', caps({ anchorCount: -1 }), shapeRecipe('polygon'))
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
            item('anchoredText', 'anchoredText', 'Anchored Text', 'anchoredText', caps({ anchorCount: 1, hasText: true, multiline: true, snap45: false }), TEXT_RECIPE),
            item('note', 'simpleTag', 'Note', 'note', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('anchoredNote', 'anchoredNote', 'Anchored Note', 'note', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('signpost', 'signpost', 'Signpost', 'flag', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('comment', 'comment', 'Comment', 'comment', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE)
          ]
        },
        {
          id: 'content',
          items: [
            item('callout', 'callout', 'Callout', 'callout', caps({ anchorCount: 2, hasText: true, multiline: true, snap45: false }), TEXT_RECIPE),
            item('priceLabel', 'priceLabel', 'Price Label', 'priceLabel', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            item('priceNote', 'simpleAnnotation', 'Price Note', 'priceLabel', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE),
            // flagMark styles live under styles.flagMark (flagColor/poleColor)
            // — the generic text recipe wrote dead styles.text.* paths.
            item('flag', 'flagMark', 'Flag Mark', 'flag', caps({ anchorCount: 1, snap45: false }), ZONE_COLORS_RECIPE, { stylePaths: { fillColor: ['styles', 'flagMark', 'flagColor'], backgroundColor: ['styles', 'flagMark', 'poleColor'] } }),
            item('table', 'table', 'Table', 'note', caps({ anchorCount: 1, hasText: true, snap45: false }), TEXT_RECIPE, { stylePaths: { textAlign: ['styles', 'table', 'textAlign'] } })
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
