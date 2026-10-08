# Drawing tool authoring contract (P3 swarm)

Every drawing tool is a kernel `OverlayTemplate` living under
`src/drawings/tools/<group>/<tool>.ts`, default-exported as a plain object.
This file is the ONLY shared spec — read it fully before writing a tool.

## Template shape

```ts
import type { OverlayTemplate } from '../../component/Overlay'

const myTool: OverlayTemplate<MyExtendData> = {
  name: 'myOverlayName',          // MUST equal catalog `overlayName`
  totalStep: 3,                    // = anchorCount + 1 (each click = one step;
                                   //  step N writes point N-1, then finishes)
  needDefaultPointFigure: false,   // we draw our own — never true for new tools
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: { /* DeepPartial<OverlayStyle> defaults */ },
  createPointFigures: (params) => OverlayFigure[],
  performEventPressedMove?,       // anchor-drag adjustments
  performEventMoveForDrawing?,    // in-progress draw adjustments
  performEventBodyMove?,          // whole-body translate adjustments
  onDrawStart? / onDrawing? / onDrawEnd? / onDoubleClick? / onRemoved? / ...
  freehand?: boolean,             // brush/highlighter only
  freehandMinDistance?: number    // px decimation, default 4
}
```

`OverlayTemplate` omits `id/groupId/paneId/points/currentStep/isDrawing/
isStart/forceComplete/invalidateFigures/figuresRev` — everything else on
`Overlay` is a valid template field (see `src/component/Overlay.ts`).

## createPointFigures params (`OverlayCreateFiguresCallbackParams`)

- `chart`, `overlay` (typed `Overlay<E>`), `coordinates: Coordinate[]` —
  pane-local CSS pixels (NOT device px, NOT data values).
- `bounding` — pane rect for viewport culling only.
- `xAxis`, `yAxis` (nullable) — axis conversion/formatting.
- `isSelected`, `isHovered`, `hoveredFigureKey` — for anchor rendering.

Return `OverlayFigure[]`. Each figure:
```ts
{ key?, type, attrs, styles?, ignoreEvent?, pointIndex?, moveDirection?, cursor?, bounds? }
```
- `type` is a registered figure primitive: `line`, `circle`, `polygon`,
  `rect`, `text`, `arc`, `path`, plus drawings `richText`.
  Attrs come in ARRAY form (`attrs: LineAttrs[]`) or single object —
  check `src/extension/figure/<type>.ts` `FigureAttrs` + draw/hit fns.
- `ignoreEvent: true` for decorative figures (skips hit-test/closure alloc).
- `pointIndex` makes a custom figure act as that anchor on drag.
- `moveDirection: 'horz'|'vert'` constrains anchor drag axis (TV
  PossibleMovingDirections).
- `key` MUST be set — the figure cache + hover + drag identity all key on it.
- `bounds` optional pixel rect → viewport culling.

## Anchors — ALWAYS via the factory

```ts
import { createAnchorFigures } from '../interaction/anchors'

figures.push(...createAnchorFigures({
  coordinates,
  pointIndexes?,        // which coords get anchors (default all)
  isSelected, isHovered,
  isDrawing: overlay.isDrawing(),
  lock: overlay.lock,
  keyPrefix: 'anchor_',
  midPoint?,            // { aIndex, bIndex } → midpoint drag handle
  cursorFor?            // (from, to) => css cursor override
}))
```
The factory already implements the TV visibility rules (selected, or
hovered+unlocked), locked→outline, in-progress suppression, 6px/13px
mouse/touch hit areas. Do NOT hand-roll anchor circles.
`createSelectionOutlineFigures` exists for the locked-selected outline.

## Kernel behaviors you get for free — do NOT reimplement

- Per-point drag → `eventPressedPointMove` → `performEventPressedMove`
  (params: `{currentStep, points, mode, performPointIndex, performPoint,
  prevPoints, figureKey, event}` — `event` has shiftKey/ctrlKey/metaKey).
- Body drag → `eventPressedOtherMove` (axis-constrained point diff)
  → `performEventBodyMove` (no performPointIndex).
- In-progress point writes → `eventMoveForDrawing` →
  `performEventMoveForDrawing` (params include `event` — read shiftKey for
  45° snap inside perform; use `snap45Coordinate` from
  `../interaction/snap45`).
- `overlay.isDrawing()` / `forceComplete()` / `invalidateFigures()`.
- Unlimited-step tools: `totalStep: Number.MAX_SAFE_INTEGER` and
  `freehand: true` for press-drag collection; Esc/double-click already
  force-complete (kernel).
- Mutating `overlay.extendData` in place inside perform* callbacks → call
  `overlay.invalidateFigures()` after (figure cache key).

## Data contract (serialization/persistence/settings)

- `overlay.points: Array<Partial<Point>>` where `Point = {timestamp?,
  dataIndex?, value?}` — the ONLY persisted geometry. Keep count stable:
  template declares N anchors → exactly N point slots; write with
  `overlay.points[i] = {...}` never push beyond contract.
- `extendData` — JSON-safe only (no functions/class instances/Path2D).
  Everything persisted + synced. Typed per tool, exported interface.
- `styles` — `DeepPartial<OverlayStyle>` (see `src/common/Styles.ts`
  OverlayStyle). Tools that render text put text props under `styles.text`.
- **Level-editable tools** (fib/gann/pitchfork): store levels as
  `extendData.levels: Array<{visible, coeff, color, ...}>` (or
  `data.levels`) — the settings dialog's levels tab binds this shape
  verbatim; use whole-array replacement, never per-index merge.
- `mode`/`modeSensitivity` default weak_magnet — leave unset unless the
  tool needs strong magnet.

## Behavioral rules (TV parity)

- In-progress (`isDrawing()`) → suppress anchors for the point being
  placed; the factory handles it given `isDrawing` — pass it through.
- `overlay.lock` → factory emits outline instead of anchors; your
  `performEvent*` may still run for API-driven moves — do not gate on lock
  there (kernel already gates pointer interaction).
- Ghost/synced overlays: never open editors/dialogs in hooks — guard with
  `overlay.ghost || overlay.synced` (see `tools/text.ts`).
- `onDrawEnd` / `onDoubleClick` for editor-launch only (text tools).
- Precision: use `chart.getSymbol()?.pricePrecision` on candle panes;
  `overlay.paneId` + `chart.getIndicators({paneId})` for indicator panes
  (mirror `extension/overlay/fibonacciLine.ts`).

## Conventions

- Apache license header (copy from `tools/text.ts`).
- NO exported classes — `--fail-on-class` breaks dts. Plain objects,
  factory functions, `export interface`/`export type` only.
- `import type` for type-only imports; `??`/`?.` over `||`/nested checks;
  no `delete` (assign `undefined`); no unused vars; `no-multi-spaces`.
- ES5 target — no `??`/`?.` restrictions (transpiled) but NO
  `Array.prototype.flat`, `Object.fromEntries`, `String.matchAll` —
  they're not in the ES5 lib; check existing utils instead.
- Keep each tool self-contained in one file unless the group genuinely
  shares math — shared helpers go in the group dir (e.g.
  `tools/fibonacci/fibCommon.ts`), not in `interaction/`.

## Shared files — DO NOT EDIT

Integration owns these; editing them races the other agents:
- `src/drawings/tools/index.ts` (registration)
- `src/drawings/catalog.ts` (available flips)
- `src/drawings/icons.ts`, `src/drawings/index.ts`
- Anything outside `src/drawings/tools/<your-group>/`

Instead, end your report with a manifest:

```
MANIFEST
files: src/drawings/tools/<group>/<tool>.ts (overlayName, catalog id)
icons-needed: <iconId>: <short desc>   # only if no suitable existing icon
notes: <contract deviations, if any>
```

## Verify before reporting

```bash
cd /Users/trungdt/Desktop/ATX/Finpath/super-chart
npx tsc --noEmit -p tsconfig.json
npx eslint 'src/drawings/tools/<group>/**/*.ts'
```
Both must be clean. Then run the repo lint on your files only — the
pre-existing `no-multi-spaces` debt in `src/extension/**` is NOT yours to
fix.

## Reference material (read-only)

- Exemplar: `src/drawings/tools/text.ts` (1-pt text tool, anchors factory,
  editor launch, ghost guard).
- Kernel exemplars: `src/extension/overlay/fibonacciLine.ts`,
  `src/extension/overlay/rect/index.ts`,
  `src/extension/overlay/regressionTrend/index.ts` (channel math).
- Behavior reference (React code — port BEHAVIOR not structure):
  `/Users/trungdt/Desktop/contents_pro/src/components/market-chart/drawings/overlays/<group>/`
- TV ground truth (when consumer code disagrees or misses a case):
  `/Users/trungdt/Desktop/tradingview-text-study-2026-10-07/modern-drawing/`
  and `.../full-esm/` (search by class name, e.g. `PitchforkLineTool`).

## Status signals

End with `STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`
then the manifest.
