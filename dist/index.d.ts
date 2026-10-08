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
export type Nullable<T> = T | null;
export interface NeighborData<D> {
	prev: D;
	current: D;
	next: D;
}
export type Timestamp = number;
export interface KLineData {
	timestamp: Timestamp;
	open: number;
	high: number;
	low: number;
	close: number;
	volume?: number;
	turnover?: number;
	[key: string]: unknown;
}
export interface Margin {
	marginLeft: number;
	marginTop: number;
	marginRight: number;
	marginBottom: number;
}
export interface Padding {
	paddingLeft: number;
	paddingTop: number;
	paddingRight: number;
	paddingBottom: number;
}
export interface Offset {
	offsetLeft: number;
	offsetTop: number;
	offsetRight: number;
	offsetBottom: number;
}
/**
 * line type
 */
export type LineType = "dashed" | "solid";
export interface LineStyle {
	style: LineType;
	size: number;
	color: string;
	dashedValue: number[];
}
export interface SmoothLineStyle extends LineStyle {
	smooth: boolean | number;
}
export interface StateLineStyle extends LineStyle {
	show: boolean;
}
export type PathType = "stroke" | "fill";
export interface PathStyle {
	style: PathType;
	color: string;
	lineWidth: number;
}
export type PolygonType = PathType | "stroke_fill";
export interface PolygonStyle {
	style: PolygonType;
	color: string | CanvasGradient;
	borderColor: string;
	borderSize: number;
	borderStyle: LineType;
	borderDashedValue: number[];
}
export interface RectStyle extends PolygonStyle {
	borderRadius: number | number[];
}
export interface TextStyle extends Padding {
	style: PolygonType;
	color: string;
	size: number;
	family: string;
	weight: number | string;
	borderStyle: LineType;
	borderDashedValue: number[];
	borderSize: number;
	borderColor: string;
	borderRadius: number | number[];
	backgroundColor: string | CanvasGradient;
}
export interface StateTextStyle extends TextStyle {
	show: boolean;
}
export type LastValueMarkTextStyle = Omit<StateTextStyle, "backgroundColor">;
export type TooltipShowRule = "always" | "follow_cross" | "none";
export type TooltipShowType = "standard" | "rect";
export interface ChangeColor {
	upColor: string;
	downColor: string;
	noChangeColor: string;
}
export interface GradientColor {
	offset: number;
	color: string;
}
export type FeatureType = "path" | "icon_font";
export interface FeaturePathStyle extends Omit<PathStyle, "color"> {
	path: string;
}
export interface FeatureIconFontStyle {
	family: string;
	code: string;
}
export interface FeatureStyle extends Padding, Margin {
	id: string;
	backgroundColor: string;
	activeBackgroundColor: string;
	size: number;
	color: string;
	activeColor: string;
	borderRadius: number | number[];
	type: FeatureType;
	content: FeaturePathStyle | FeatureIconFontStyle;
}
export interface GridStyle {
	show: boolean;
	horizontal: StateLineStyle;
	vertical: StateLineStyle;
}
export type TooltipTextStyle = Pick<TextStyle, "color" | "size" | "family" | "weight"> & Margin;
export type TooltipTitleStyle = TooltipTextStyle & {
	show: boolean;
};
export type TooltipLegendStyle = TooltipTextStyle & {
	defaultValue: string;
};
export interface TooltipLegendChild {
	text: string;
	color: string;
}
export interface TooltipLegend {
	title: string | TooltipLegendChild;
	value: string | TooltipLegendChild;
}
export type TooltipFeaturePosition = "left" | "middle" | "right";
export interface TooltipFeatureStyle extends FeatureStyle {
	position: TooltipFeaturePosition;
}
export interface TooltipStyle extends Offset {
	showRule: TooltipShowRule;
	showType: TooltipShowType;
	features: TooltipFeatureStyle[];
}
export interface CandleAreaPointStyle {
	show: boolean;
	color: string;
	radius: number;
	rippleColor: string;
	rippleRadius: number;
	animation: boolean;
	animationDuration: number;
}
export interface CandleAreaStyle {
	lineSize: number;
	lineColor: string;
	value: string;
	smooth: boolean;
	backgroundColor: string | GradientColor[];
	point: CandleAreaPointStyle;
}
export interface CandleHighLowPriceMarkStyle {
	show: boolean;
	color: string;
	textOffset: number;
	textSize: number;
	textFamily: string;
	textWeight: string;
}
export type CandleLastPriceMarkLineStyle = Omit<StateLineStyle, "color">;
export type CandleLastPriceMarkExtendTextPosition = "above_price" | "below_price" | "left_price";
export type CandleLastPriceMarkExtendTextStyle = LastValueMarkTextStyle & {
	position: CandleLastPriceMarkExtendTextPosition;
	updateInterval: number;
	backgroundColor?: string;
};
export interface CandleLastPriceMarkStyle extends ChangeColor {
	show: boolean;
	compareRule: CandleColorCompareRule;
	line: CandleLastPriceMarkLineStyle;
	text: LastValueMarkTextStyle;
	extendTexts: CandleLastPriceMarkExtendTextStyle[];
}
export interface CandlePriceMarkStyle {
	show: boolean;
	high: CandleHighLowPriceMarkStyle;
	low: CandleHighLowPriceMarkStyle;
	last: CandleLastPriceMarkStyle;
}
export type CandleTooltipRectPosition = "fixed" | "pointer";
export interface CandleTooltipRectStyle extends Omit<RectStyle, "style" | "borderDashedValue" | "borderStyle">, Padding, Offset {
	position: CandleTooltipRectPosition;
}
export type CandleTooltipLegendsCustomCallback = (data: NeighborData<Nullable<KLineData>>, styles: CandleStyle) => TooltipLegend[];
export interface CandleTooltipStyle extends TooltipStyle {
	title: TooltipTitleStyle & {
		template: string;
	};
	legend: TooltipLegendStyle & {
		template: CandleTooltipLegendsCustomCallback | TooltipLegend[];
	};
	rect: CandleTooltipRectStyle;
}
export type CandleType = "candle_solid" | "candle_stroke" | "candle_up_stroke" | "candle_down_stroke" | "ohlc" | "area";
export type CandleColorCompareRule = "current_open" | "previous_close";
export interface CandleBarColor extends ChangeColor {
	compareRule: CandleColorCompareRule;
	upBorderColor: string;
	downBorderColor: string;
	noChangeBorderColor: string;
	upWickColor: string;
	downWickColor: string;
	noChangeWickColor: string;
}
export interface CandleStyle {
	type: CandleType;
	bar: CandleBarColor;
	area: CandleAreaStyle;
	priceMark: CandlePriceMarkStyle;
	tooltip: CandleTooltipStyle;
}
export type IndicatorPolygonStyle = Omit<PolygonStyle, "color" | "borderColor"> & ChangeColor;
export interface IndicatorLastValueMarkStyle {
	show: boolean;
	text: LastValueMarkTextStyle;
}
export interface IndicatorTooltipStyle extends TooltipStyle {
	title: TooltipTitleStyle & {
		showName: boolean;
		showParams: boolean;
	};
	legend: TooltipLegendStyle;
}
export interface IndicatorStyle {
	ohlc: Pick<CandleBarColor, "compareRule" | "upColor" | "downColor" | "noChangeColor">;
	bars: IndicatorPolygonStyle[];
	lines: SmoothLineStyle[];
	circles: IndicatorPolygonStyle[];
	lastValueMark: IndicatorLastValueMarkStyle;
	tooltip: IndicatorTooltipStyle;
	[key: string]: unknown;
}
export type AxisLineStyle = Omit<StateLineStyle, "style" | "dashedValue">;
export interface AxisTickLineStyle extends AxisLineStyle {
	length: number;
}
export interface AxisTickTextStyle extends Pick<StateTextStyle, "show" | "color" | "weight" | "family" | "size"> {
	marginStart: number;
	marginEnd: number;
}
export interface AxisStyle {
	show: boolean;
	size: number | "auto";
	axisLine: AxisLineStyle;
	tickLine: AxisTickLineStyle;
	tickText: AxisTickTextStyle;
}
export interface CrosshairDirectionStyle {
	show: boolean;
	line: StateLineStyle;
	text: StateTextStyle;
}
export interface CrosshairStyle {
	show: boolean;
	horizontal: CrosshairDirectionStyle & {
		features: TooltipFeatureStyle[];
	};
	vertical: CrosshairDirectionStyle;
}
export interface OverlayPointStyle {
	color: string;
	borderColor: string;
	borderSize: number;
	radius: number;
	activeColor: string;
	activeBorderColor: string;
	activeBorderSize: number;
	activeRadius: number;
}
export interface OverlayStyle {
	point: OverlayPointStyle;
	line: SmoothLineStyle;
	rect: RectStyle;
	polygon: PolygonStyle;
	circle: PolygonStyle;
	arc: LineStyle;
	text: TextStyle;
	[key: string]: unknown;
}
export interface SeparatorStyle {
	size: number;
	color: string;
	fill: boolean;
	activeBackgroundColor: string;
}
export interface Styles {
	grid: GridStyle;
	candle: CandleStyle;
	indicator: IndicatorStyle;
	xAxis: AxisStyle;
	yAxis: AxisStyle;
	separator: SeparatorStyle;
	crosshair: CrosshairStyle;
	overlay: OverlayStyle;
}
declare function merge(target: any, source: any): void;
declare function clone<T>(target: T): T;
declare function isArray<T = unknown>(value: unknown): value is T[];
declare function isFunction<T = (...args: unknown[]) => unknown>(value: unknown): value is T;
declare function isObject(value: unknown): value is object;
declare function isNumber(value: unknown): value is number;
declare function isValid<T>(value: T | null | undefined): value is T;
declare function isBoolean(value: unknown): value is boolean;
declare function isString(value: unknown): value is string;
declare function formatValue(data: unknown, key: string, defaultValue?: unknown): unknown;
declare function formatTimestampByTemplate(dateTimeFormat: Intl.DateTimeFormat, timestamp: number, template: string): string;
declare function formatPrecision(value: string | number, precision?: number): string;
declare function formatBigNumber(value: string | number): string;
declare function formatThousands(value: string | number, sign: string): string;
declare function formatFoldDecimal(value: string | number, threshold: number): string;
declare function calcTextWidth(text: string, size?: number, weight?: string | number, family?: string): number;
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
export type ActionCallback = (data?: unknown) => void;
export type ActionType = "onZoom" | "onScroll" | "onVisibleRangeChange" | "onCandleTooltipFeatureClick" | "onIndicatorTooltipFeatureClick" | "onCrosshairFeatureClick" | "onCrosshairChange" | "onCandleBarClick" | "onPaneDrag" | "onIndicatorShapeClick" | "onIndicatorShapeDoubleClick" | "onExtendTextClick" | "onSectorLabelClick" | "onOverlayChange" | "onSymbolChange" | "onPeriodChange";
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
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends Array<infer U> ? Array<DeepPartial<U>> : T[P] extends ReadonlyArray<infer X> ? ReadonlyArray<DeepPartial<X>> : T[P] extends object ? DeepPartial<T[P]> : T[P];
};
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
export type PickRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
export type ExcludePickPartial<T, K extends keyof T> = PickRequired<Partial<T>, K>;
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
export interface Bounding {
	width: number;
	height: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
}
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
export interface BarSpace {
	bar: number;
	halfBar: number;
	gapBar: number;
	halfGapBar: number;
}
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
export interface Coordinate {
	x: number;
	y: number;
}
export interface Crosshair extends Partial<Coordinate> {
	paneId?: string;
	realX?: number;
	timestamp?: number;
	kLineData?: KLineData;
	dataIndex?: number;
	realDataIndex?: number;
}
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
export interface SymbolInfo {
	ticker: string;
	pricePrecision: number;
	volumePrecision: number;
	[key: string]: unknown;
}
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
export type PeriodType = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";
export interface Period {
	type: PeriodType;
	span: number;
}
export type DataLoadType = "init" | "forward" | "backward" | "update";
export type DataLoadMore = boolean | {
	backward?: boolean;
	forward?: boolean;
};
export interface DataLoaderGetBarsParams {
	type: DataLoadType;
	timestamp: Nullable<number>;
	symbol: SymbolInfo;
	period: Period;
	callback: (data: KLineData[], more?: DataLoadMore) => void;
}
export interface DataLoaderSubscribeBarParams {
	symbol: SymbolInfo;
	period: Period;
	callback: (data: KLineData) => void;
}
export type DataLoaderUnsubscribeBarParams = Omit<DataLoaderSubscribeBarParams, "callback">;
export interface DataLoader {
	getBars: (params: DataLoaderGetBarsParams) => void | Promise<void>;
	subscribeBar?: (params: DataLoaderSubscribeBarParams) => void;
	unsubscribeBar?: (params: DataLoaderUnsubscribeBarParams) => void;
}
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
export interface VisibleRange {
	readonly from: number;
	readonly to: number;
	readonly realFrom: number;
	readonly realTo: number;
}
export interface MouseTouchEvent extends Coordinate {
	/** Viewport (page) coordinates — for DOM overlays positioned outside canvas space. */
	pageX: number;
	pageY: number;
	/**
	 * True for touch-originated events. Touch hits need larger targets —
	 * templates should use ~13px anchor half-size vs ~6px for mouse.
	 */
	isTouch?: boolean;
	shiftKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	metaKey?: boolean;
	preventDefault?: () => void;
}
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
export type PickPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
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
export interface Point {
	dataIndex: number;
	timestamp: number;
	value: number;
}
export type PaneState = "normal" | "maximize" | "minimize";
export interface PaneOptions {
	id?: string;
	height?: number;
	minHeight?: number;
	dragEnabled?: boolean;
	order?: number;
	state?: PaneState;
	axis?: Partial<AxisCreate>;
}
export type YAxisTemplate = AxisTemplate;
export interface YAxis extends Axis, Required<YAxisTemplate> {
	isFromZero: () => boolean;
	isInCandle: () => boolean;
	convertToNicePixel: (value: number) => number;
}
export interface Store {
	setStyles: (value: string | DeepPartial<Styles>) => void;
	getStyles: () => Styles;
	setFormatter: (formatter: Partial<Formatter>) => void;
	getFormatter: () => Formatter;
	setLocale: (locale: string) => void;
	getLocale: () => string;
	setTimezone: (timezone: string) => void;
	getTimezone: () => string;
	setThousandsSeparator: (thousandsSeparator: Partial<ThousandsSeparator>) => void;
	getThousandsSeparator: () => ThousandsSeparator;
	setDecimalFold: (decimalFold: Partial<DecimalFold>) => void;
	getDecimalFold: () => DecimalFold;
	setSymbol: (symbol: PickPartial<SymbolInfo, "pricePrecision" | "volumePrecision">) => void;
	getSymbol: () => Nullable<SymbolInfo>;
	setPeriod: (period: Period) => void;
	getPeriod: () => Nullable<Period>;
	getDataList: () => KLineData[];
	setOffsetRightDistance: (distance: number) => void;
	getOffsetRightDistance: () => number;
	setMaxOffsetLeftDistance: (distance: number) => void;
	setMaxOffsetRightDistance: (distance: number) => void;
	setLeftMinVisibleBarCount: (barCount: number) => void;
	setRightMinVisibleBarCount: (barCount: number) => void;
	setBarSpace: (space: number, options?: {
		notExecuteAction?: boolean;
	}) => void;
	getBarSpace: () => BarSpace;
	getVisibleRange: () => VisibleRange;
	setDataLoader: (dataLoader: DataLoader) => void;
	overrideIndicator: (override: IndicatorCreate) => boolean;
	removeIndicator: (filter?: IndicatorFilter) => boolean;
	overrideOverlay: (override: Partial<OverlayCreate>) => boolean;
	removeOverlay: (filter?: OverlayFilter) => boolean;
	setZoomEnabled: (enabled: boolean) => void;
	isZoomEnabled: () => boolean;
	setZoomAnchor: (behavior: ZoomAnchor) => void;
	getZoomAnchor: () => ZoomAnchor;
	setScrollEnabled: (enabled: boolean) => void;
	isScrollEnabled: () => boolean;
	resetData: () => void;
}
export type OverlayMode = "normal" | "weak_magnet" | "strong_magnet";
export interface OverlayPerformEventParams {
	currentStep: number;
	mode: OverlayMode;
	points: Array<Partial<Point>>;
	performPointIndex: number;
	performPoint: Partial<Point>;
	prevPoints: Array<Partial<Point>>;
	/** Key of the figure that triggered the drag (from OverlayFigure.key) */
	figureKey?: string;
	/**
	 * Raw mouse/touch event for the move — carries modifier keys so templates
	 * can implement Shift-snapping, axis locks and clone drags.
	 * Absent during restore/replay (override-driven perform calls).
	 */
	event?: Partial<MouseTouchEvent>;
}
export interface OverlayEventCollection<E> {
	onDrawStart: Nullable<OverlayEventCallback<E>>;
	onDrawing: Nullable<OverlayEventCallback<E>>;
	onDrawEnd: Nullable<OverlayEventCallback<E>>;
	onRemoved: Nullable<OverlayEventCallback<E>>;
	onClick: Nullable<OverlayEventCallback<E>>;
	onDoubleClick: Nullable<OverlayEventCallback<E>>;
	onRightClick: Nullable<OverlayEventCallback<E>>;
	onPressedMoveStart: Nullable<OverlayEventCallback<E>>;
	onPressedMoving: Nullable<OverlayEventCallback<E>>;
	onPressedMoveEnd: Nullable<OverlayEventCallback<E>>;
	onMouseMove: Nullable<OverlayEventCallback<E>>;
	onMouseEnter: Nullable<OverlayEventCallback<E>>;
	onMouseLeave: Nullable<OverlayEventCallback<E>>;
	onSelected: Nullable<OverlayEventCallback<E>>;
	onDeselected: Nullable<OverlayEventCallback<E>>;
}
export declare function checkOverlayFigureEvent(targetEventType: keyof Omit<OverlayEventCollection<unknown>, "onDrawStart" | "onDrawing" | "onDrawEnd" | "onRemoved">, figure: Nullable<OverlayFigure>): boolean;
export type OverlayFigureMoveDirection = "both" | "horz" | "vert";
/**
 * Pixel-space axis-aligned rect a figure may declare for viewport culling.
 * Opt-in — figures without bounds are never culled.
 */
export interface OverlayFigureBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface OverlayFigure {
	key?: string;
	type: string;
	attrs: unknown;
	styles?: unknown;
	ignoreEvent?: boolean | Array<keyof Omit<OverlayEventCollection<unknown>, "onDrawStart" | "onDrawing" | "onDrawEnd" | "onRemoved">>;
	/**
	 * When set, this custom figure behaves like a control point with the given index.
	 * Dragging it will call eventPressedPointMove(point, pointIndex) instead of eventPressedOtherMove.
	 */
	pointIndex?: number;
	/**
	 * Axis constraint applied when this figure is dragged: 'horz' keeps the
	 * dragged value (y) unchanged, 'vert' keeps the dragged time/index (x)
	 * unchanged. Mirrors TradingView's PossibleMovingDirections.
	 */
	moveDirection?: OverlayFigureMoveDirection;
	/**
	 * Custom CSS cursor when hovering over this figure.
	 * Defaults to 'pointer' if not set.
	 */
	cursor?: string;
	/**
	 * Declared pixel-space bounds — used by the drawings viewport-cull
	 * pipeline to skip off-screen figures. Optional.
	 */
	bounds?: OverlayFigureBounds;
}
export interface OverlayCreateFiguresCallbackParams<E> {
	chart: Chart;
	overlay: Overlay<E>;
	/**
	 * Point positions converted to pane-local CSS pixels — same space that
	 * figure `attrs` are drawn in. NOT device pixels (DPR scaling is applied
	 * by the view) and NOT data values.
	 */
	coordinates: Coordinate[];
	/**
	 * The pane's visible rect in CSS pixels (`width`/`height` only — the
	 * origin is always the pane's top-left). Use for viewport culling, not
	 * for positioning: figure attrs are already pane-local.
	 */
	bounding: Bounding;
	xAxis: Nullable<XAxis>;
	yAxis: Nullable<YAxis>;
	/**
	 * Whether the overlay is currently selected (clicked). Templates use this
	 * to render selection anchors / control handles instead of reaching into
	 * internal store state.
	 */
	isSelected?: boolean;
	/**
	 * Whether the pointer is currently hovering over the overlay.
	 */
	isHovered?: boolean;
	/**
	 * `key` of the figure currently under the pointer, if the pointer is over
	 * a figure of this overlay. Lets templates render per-anchor hover rings.
	 */
	hoveredFigureKey?: string;
}
export interface OverlayEvent<E> extends Partial<MouseTouchEvent> {
	figure?: OverlayFigure;
	overlay: Overlay<E>;
	chart: Chart;
}
export type OverlayEventCallback<E> = (event: OverlayEvent<E>) => void;
export type OverlayCreateFiguresCallback<E> = (params: OverlayCreateFiguresCallbackParams<E>) => OverlayFigure | OverlayFigure[];
export interface Overlay<E = unknown> extends OverlayEventCollection<E> {
	/**
	 * Unique identification
	 */
	id: string;
	/**
	 * Group id
	 */
	groupId: string;
	/**
	 * Pane id
	 */
	paneId: string;
	/**
	 * Name
	 */
	name: string;
	/**
	 * Total number of steps required to complete mouse operation
	 */
	totalStep: number;
	/**
	 * Current step
	 */
	currentStep: number;
	/**
	 * Whether it is locked. Locked overlays skip ALL pointer interaction —
	 * no hover, no press/drag, no freehand stroke, no anchor figures. They
	 * still render and are still selectable via API (TradingView shows a
	 * non-interactive selection outline instead of anchors).
	 */
	lock: boolean;
	/**
	 * Whether the overlay is a ghost (mirror of an overlay being drawn on
	 * another chart). Ghosts render in the normal overlay list even while
	 * incomplete, never occupy the drawing-progress slot, and are locked.
	 */
	ghost: boolean;
	/**
	 * Transient overlays render and interact normally but are excluded from
	 * persistence, undo history, and drawings.list() — e.g. the measure
	 * ruler, which vanishes on deselect by design.
	 */
	transient?: boolean;
	/**
	 * Whether the overlay was mirrored onto this chart by a chart-sync layer
	 * (as opposed to created by this chart's own user/persistence). Hosts can
	 * use this to skip duplicate persistence/history bookkeeping for mirrors.
	 */
	synced: boolean;
	/**
	 * Host-set directive: when true, chart-sync layers must not propagate this
	 * overlay's lifecycle events (e.g. `remove` during a symbol-switch wipe)
	 * to peer charts. Never serialized onto mirrors.
	 */
	suppressSync?: boolean;
	/**
	 * Per-call `override()` directive: skip the `performEventMoveForDrawing`
	 * replay loop. Callers passing already-normalized points (sync mirrors)
	 * use this to avoid O(points) step replays on unbounded-step overlays.
	 * Never persisted onto the instance.
	 */
	skipDrawReplay?: boolean;
	/**
	 * Set by the sync engine on a peer overlay right before it is removed on
	 * behalf of the source chart. Host `onRemoved` handlers use it to
	 * distinguish a remote-originated removal (skip the shared-store delete —
	 * the owner already deleted it) from a user deleting a synced mirror
	 * (the shared entry must go).
	 */
	syncRemoved?: boolean;
	/**
	 * Whether the overlay is visible
	 */
	visible: boolean;
	/**
	 * Draw level
	 */
	zLevel: number;
	/**
	 * Whether the default figure corresponding to the point is required
	 */
	needDefaultPointFigure: boolean;
	/**
	 * Whether the default figure on the Y axis is required
	 */
	needDefaultXAxisFigure: boolean;
	/**
	 * Whether the default figure on the X axis is required
	 */
	needDefaultYAxisFigure: boolean;
	/**
	 * Mode
	 */
	mode: OverlayMode;
	/**
	 * When mode is weak_magnet is the response distance
	 */
	modeSensitivity: number;
	/**
	 * Time and value information
	 */
	points: Array<Partial<Point>>;
	/**
	 * Extended Data
	 */
	extendData: E;
	/**
	 * The style information and format are consistent with the overlay in the unified configuration
	 */
	styles: Nullable<DeepPartial<OverlayStyle>>;
	/**
	 * Create figures corresponding to points
	 */
	createPointFigures: Nullable<OverlayCreateFiguresCallback<E>>;
	/**
	 * Create figures on the Y axis
	 */
	createXAxisFigures: Nullable<OverlayCreateFiguresCallback<E>>;
	/**
	 * Create figures on the X axis
	 */
	createYAxisFigures: Nullable<OverlayCreateFiguresCallback<E>>;
	/**
	 * Special handling callbacks when pressing events
	 */
	performEventPressedMove: Nullable<(params: OverlayPerformEventParams) => void>;
	/**
	 * Whole-body translate hook — fired while a non-point figure (e.g. a
	 * midpoint handle) drags the overlay, AFTER the kernel has applied the
	 * axis-constrained point diff. Templates use it to maintain derived
	 * extendData during body moves and to read `event` modifier keys (e.g.
	 * Shift → 45° snap). performPointIndex/performPoint are omitted — they
	 * are meaningless for a translate.
	 */
	performEventBodyMove: Nullable<(params: Omit<OverlayPerformEventParams, "performPointIndex" | "performPoint">) => void>;
	/**
	 * In drawing, special handling callback when moving events
	 */
	performEventMoveForDrawing: Nullable<(params: OverlayPerformEventParams) => void>;
	/**
	 * Whether the overlay is still in its drawing steps
	 */
	isDrawing: () => boolean;
	/**
	 * Whether no point has been committed yet
	 */
	isStart: () => boolean;
	/**
	 * Finish the remaining drawing steps immediately (e.g. unlimited-step tools
	 * like path/polyline completing on Esc or double-click).
	 */
	forceComplete: () => void;
	/**
	 * Freehand drawing mode (brush/highlighter/measure): the overlay collects
	 * points while the pointer is PRESSED instead of per click. Mouse-down
	 * starts the stroke, moves append points (decimated by
	 * `freehandMinDistance`), mouse-up force-completes.
	 */
	freehand?: boolean;
	/**
	 * Minimum pointer distance (px) between appended points in freehand mode.
	 * Default 4.
	 */
	freehandMinDistance?: number;
	/**
	 * Figure-cache revision — bumped by override() whenever styles/extendData
	 * change and by invalidateFigures(). The drawings subsystem's figure cache
	 * keys on this; templates MUST NOT write it.
	 */
	readonly figuresRev: number;
	/**
	 * Invalidate the cached figure result — call after mutating extendData in
	 * place (inside performEvent* callbacks) when using the drawings figure
	 * cache wrapper.
	 */
	invalidateFigures: () => void;
}
export type OverlayTemplate<E = unknown> = ExcludePickPartial<Omit<Overlay<E>, "id" | "groupId" | "paneId" | "points" | "currentStep" | "isDrawing" | "isStart" | "forceComplete" | "invalidateFigures" | "figuresRev">, "name">;
export type OverlayCreate<E = unknown> = ExcludePickPartial<Omit<Overlay<E>, "currentStep" | "totalStep" | "createPointFigures" | "createXAxisFigures" | "createYAxisFigures" | "performEventPressedMove" | "performEventBodyMove" | "performEventMoveForDrawing" | "isDrawing" | "isStart" | "forceComplete" | "invalidateFigures" | "figuresRev">, "name">;
export type OverlayOverride<E = unknown> = Partial<Omit<Overlay<E>, "currentStep" | "totalStep" | "createPointFigures" | "createXAxisFigures" | "createYAxisFigures" | "performEventPressedMove" | "performEventBodyMove" | "performEventMoveForDrawing" | "isDrawing" | "isStart" | "forceComplete" | "invalidateFigures" | "figuresRev">>;
/**
 * Lifecycle stream emitted through the `onOverlayChange` action.
 * `create`   — an overlay was created (armed for drawing or already finished).
 * `progress` — points changed while drawing or while a point/figure is dragged.
 * `update`   — an existing overlay was overridden via overrideOverlay.
 * `remove`   — an overlay was removed (also fires for cancelled drawings).
 * `drawEnd`  — the progress overlay finished its last step and was committed.
 * `select`/`deselect` — click-selection changed.
 * `editStart`/`editEnd` — a point/figure drag gesture bracketed. Consumers
 *             use the pair as the commit boundary for undo and persistence
 *             (one gesture = one commit, not one commit per progress event).
 */
export type OverlayChangeEventType = "create" | "progress" | "update" | "remove" | "drawEnd" | "select" | "deselect" | "editStart" | "editEnd";
export interface OverlayChangeEvent<E = unknown> {
	type: OverlayChangeEventType;
	overlay: Overlay<E>;
}
export type OverlayFilter<E = unknown> = Partial<Pick<Overlay<E>, "id" | "groupId" | "name" | "paneId">>;
export type OverlayConstructor<E = unknown> = new () => Overlay<E>;
export declare const OVERLAY_ID_PREFIX = "overlay_";
export declare const OVERLAY_FIGURE_KEY_PREFIX = "overlay_figure_";
/**
 * Serialized drawing v2 — the persistence + shadow-state schema.
 *
 * Deliberately serializes DATA-level identity, not view state:
 * - points carry timestamp+value (+ optional dataIndex hint); restore
 *   re-derives dataIndex from timestamp so drawings survive data reloads.
 * - transient sync fields (ghost/synced/suppressSync/syncRemoved/
 *   skipDrawReplay) are NEVER serialized — a mirrored overlay is owned by
 *   the peer chart, persisting it would fork the source of truth.
 */
export interface SerializedDrawingPoint extends Partial<Point> {
	/** Per-point interval override (drawings anchored to another timeframe). */
	interval?: string;
	/** Per-point bar offset — anchored notes/measure windows. */
	offset?: number;
}
export interface SerializedDrawing<E = unknown> {
	schemaVersion: 2;
	id: string;
	name: string;
	/** Omit/undefined = the candle pane. */
	paneId?: string;
	groupId?: string;
	points: SerializedDrawingPoint[];
	styles?: DeepPartial<OverlayStyle>;
	lock?: boolean;
	visible?: boolean;
	mode?: OverlayMode;
	modeSensitivity?: number;
	zLevel?: number;
	extendData?: E;
	/** Whether creation finished — in-progress drawings are never persisted. */
	completed: boolean;
	/** Position-as-percent-of-viewport for anchored notes (survives symbol switch). */
	positionPercents?: number[];
	/** Source-authored timestamps — server merges on updatedAt, not write order. */
	createdAt: number;
	updatedAt: number;
}
/**
 * Persistence contract — local-first, server-optional.
 *
 * The manager talks to ONE DrawingStore. Compose:
 *   createCompositeStore({ local: idbAdapter, remote: httpAdapter })
 * for local-first + queued-server behavior; wrap the result in
 * withBroadcastSync() to fan changes across tabs.
 *
 * Hosts implement load/apply; subscribe/flush/setIdentity are optional.
 */
export interface DrawingScope {
	/** Primary partition — usually the symbol (e.g. 'BTCUSDT'). */
	symbol: string;
	/** Optional sub-partition when multiple charts share a symbol. */
	chartId?: string;
}
export interface DrawingChangeSet {
	upsert?: SerializedDrawing[];
	/** Ids — tombstoned by durable adapters so deletes propagate. */
	remove?: string[];
}
export interface DrawingStoreEvent {
	type: "upsert" | "remove" | "snapshot";
	scope: DrawingScope;
	/** upsert/remove carry changed entries; snapshot carries the full scope state. */
	drawings: SerializedDrawing[];
	/** Tombstone ids on remove events. */
	removedIds?: string[];
}
export interface DrawingStoreLoadResult {
	drawings: SerializedDrawing[];
	/** Opaque revision for conflict detection (server adapters). */
	revision?: string | number;
}
export interface DrawingStoreApplyMeta {
	/** True when this change originated from a remote/peer event — adapters may skip re-broadcasting it. */
	remote?: boolean;
}
export interface DrawingStore {
	load: (scope: DrawingScope) => Promise<DrawingStoreLoadResult>;
	apply: (scope: DrawingScope, changes: DrawingChangeSet, meta?: DrawingStoreApplyMeta) => Promise<void>;
	/** External changes (another tab, server push). */
	subscribe?: (cb: (event: DrawingStoreEvent) => void) => () => void;
	/** Force pending writes durably (pagehide/beforeunload). */
	flush?: (scope?: DrawingScope) => Promise<void>;
	/** Identity switch (login/logout) — server adapters re-key rows. */
	setIdentity?: (identity: string | null) => void;
}
/**
 * DrawingManager — OBSERVE + shadow state.
 *
 * The manager does NOT own the overlay list: the chart store remains the
 * source of truth for rendering and hit-testing. The manager subscribes
 * to `onOverlayChange`, keeps a serialized shadow map of every committed
 * drawing, and turns commit boundaries (drawEnd / editEnd / remove) into
 * undo commands + debounced persistence writes.
 *
 * Non-drawings — sync mirrors (synced), in-flight ghosts (ghost), armed
 * in-progress tools, and templates flagged `transient` — are tracked for
 * correctness but never persisted or undone.
 */
export type DrawingsEventType = "select" | "deselect" | "toolChange" | "change" | "editStart" | "editEnd";
export type DrawingsEventCallback = (payload: {
	overlay?: Overlay;
	tool?: string | null;
}) => void;
export interface DrawingManager {
	/** Arm a drawing tool — subsequent clicks collect its points. */
	activate: (name: string, opts?: {
		continuous?: boolean;
		extendData?: unknown;
		points?: OverlayCreate["points"];
	}) => Nullable<string>;
	deactivate: () => void;
	activeTool: () => string | null;
	/** Programmatic create — already-finished overlays (AI / restore paths). */
	create: (spec: OverlayCreate) => Nullable<string>;
	update: (id: string, patch: Partial<Pick<OverlayCreate, "points" | "styles" | "extendData" | "lock" | "visible" | "mode" | "modeSensitivity" | "zLevel">>) => boolean;
	remove: (id: string) => boolean;
	list: () => SerializedDrawing[];
	get: (id: string) => Nullable<Overlay>;
	select: (id: Nullable<string>) => void;
	deselect: () => void;
	undo: () => boolean;
	redo: () => boolean;
	canUndo: () => boolean;
	canRedo: () => boolean;
	attachStore: (store: DrawingStore | null) => void;
	flush: () => Promise<void>;
	/**
	 * Bulk-apply suppression — wrap restore/sync batch writes so the flood
	 * of 'create'/'update' events doesn't push undo commands or persist
	 * entries the caller already owns.
	 */
	beginApply: () => void;
	endApply: () => void;
	on: (type: DrawingsEventType, cb: DrawingsEventCallback) => () => void;
	destroy: () => void;
}
export interface ToolbarSourceAction {
	title: string;
	iconId?: string;
	onClick: (overlay: Overlay) => void;
}
export interface FloatingToolbarHooks {
	/** Settings gear — DP-6c dialog or host-side panel. */
	onSettings?: (overlay: Overlay) => void;
	/** Alert action hook — host wires its alerting UI. */
	onAlert?: (overlay: Overlay) => void;
	/** Text edit shortcut — host/lib opens the text editor. */
	onTextEdit?: (overlay: Overlay) => void;
	/** Per-tool action injection (TV's source-actions slot). */
	additionalActions?: (overlay: Overlay) => ToolbarSourceAction[];
}
export type FormatDateType = "tooltip" | "crosshair" | "xAxis";
export interface FormatDateParams {
	dateTimeFormat: Intl.DateTimeFormat;
	timestamp: number;
	template: string;
	type: FormatDateType;
}
export type FormatDate = (params: FormatDateParams) => string;
export type FormatBigNumber = (value: string | number) => string;
export type ExtendTextType = "last_price";
export interface FormatExtendTextParams {
	type: ExtendTextType;
	data: KLineData;
	index: number;
}
export type FormatExtendText = (params: FormatExtendTextParams) => string;
export interface Formatter {
	formatDate: FormatDate;
	formatBigNumber: FormatBigNumber;
	formatExtendText: FormatExtendText;
}
export interface Locales {
	time: string;
	open: string;
	high: string;
	low: string;
	close: string;
	volume: string;
	change: string;
	turnover: string;
	second: string;
	minute: string;
	hour: string;
	day: string;
	week: string;
	month: string;
	year: string;
	[key: string]: string;
}
export type LayoutChildType = "candle" | "indicator" | "xAxis";
export interface LayoutChild {
	type: LayoutChildType;
	content?: Array<string | IndicatorCreate>;
	options?: PaneOptions;
}
export interface DecimalFold {
	threshold: number;
	format: (value: string | number) => string;
}
export interface ThousandsSeparator {
	sign: string;
	format: (value: string | number) => string;
}
export type ZoomAnchorType = "cursor" | "last_bar";
export interface ZoomAnchor {
	main: ZoomAnchorType;
	xAxis: ZoomAnchorType;
}
export interface DrawingsOptions {
	/** Persistence adapter — omit for in-memory-only drawings. */
	store?: DrawingStore | null;
	/** Floating toolbar: `false` disables, object supplies hooks. */
	toolbar?: boolean | FloatingToolbarHooks;
	/** Shared drawing keyboard layer — `false` disables (default on). */
	keyboard?: boolean;
	/** Persistence partition override — defaults to chart symbol. */
	scope?: () => DrawingScope;
	/** Tool names that render but are never listed/persisted/undone. */
	isTransient?: (name: string) => boolean;
	/** Persistence write debounce (ms). Default 300. */
	saveDebounceMs?: number;
	/** Undo/redo stack depth. */
	maxHistory?: number;
}
export interface Options {
	locale?: string;
	timezone?: string;
	styles?: string | DeepPartial<Styles>;
	formatter?: Partial<Formatter>;
	thousandsSeparator?: Partial<ThousandsSeparator>;
	decimalFold?: Partial<DecimalFold>;
	zoomAnchor?: ZoomAnchorType | Partial<ZoomAnchor>;
	layout?: LayoutChild[];
	/** Drawing subsystem configuration — see `chart.drawings`. */
	drawings?: DrawingsOptions;
}
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
 * Inline SVG icon registry — TradingView-style stroke icons.
 *
 * All icons render on a 28×28 viewBox with `stroke="currentColor"` and no
 * hard-coded fills, so toolbars inherit the host theme color. Paths are
 * authored in the same geometry language as TV's line-tools-icons set
 * (thin diagonal strokes for lines, level ticks for fib, loops for waves).
 *
 * `getDrawingIcon` resolves an iconId to markup; unknown ids get the
 * generic 'tool' glyph so a tool is never invisible in a toolbar.
 */
export type DrawingIconId = string;
/**
 * Drawing-tool catalog — the single registry a host toolbar/settings UI
 * reads from. Structure mirrors TradingView's `groups → sections → items`
 * so a host can render the same flyout hierarchy, and every item carries
 * the metadata the floating toolbar + settings surface need
 * (`capabilities`, `toolbarRecipe`) so per-tool chrome stays data-driven.
 */
export interface DrawingToolCapabilities {
	/** Anchors the tool collects; 0 = freehand stroke, -1 = unlimited clicks. */
	anchorCount: number;
	freehand: boolean;
	/** Has editable text → text controls appear in the floating toolbar. */
	hasText: boolean;
	/** Supports the 45°-align modifier/persistent toggle. */
	snap45: boolean;
	/** Can be cloned via Ctrl/Cmd+drag. */
	cloneable: boolean;
	/** Multi-line text box vs a single caption. */
	multiline: boolean;
}
/**
 * Floating-toolbar control recipe — per-tool-family property map. A host
 * renders controls in this order; each control is a self-describing slot
 * so no consumer hard-codes button wiring.
 */
export type ToolbarControl = {
	kind: "color";
	role: "line" | "fill" | "text" | "background";
} | {
	kind: "style";
	role: "line" | "text";
} | {
	kind: "width";
} | {
	kind: "levels";
} | {
	kind: "text";
} | {
	kind: "textAlign";
} | {
	kind: "geometry";
	options: Array<"rect" | "rotated" | "ellipse">;
} | {
	kind: "lock";
} | {
	kind: "visibility";
} | {
	kind: "clone";
} | {
	kind: "settings";
} | {
	kind: "remove";
} | {
	kind: "anchor";
} | {
	kind: "alert";
} | {
	kind: "snap45";
} | {
	kind: "more";
};
export interface DrawingToolItem {
	/** Stable catalog id — NOT the kernel overlay name (see `overlayName`). */
	id: string;
	/** Kernel template name passed to `chart.createOverlay`; '' for non-tool entries. */
	overlayName: string;
	title: string;
	iconId: DrawingIconId;
	/** Single-key hotkey hint (host may bind). */
	hotkey?: string;
	capabilities: DrawingToolCapabilities;
	toolbarRecipe: ToolbarControl[];
	/** False while a tool is planned but not yet shipped — hosts dim it. */
	available: boolean;
	/**
	 * Non-drawing entries (cursor modes, eraser, zoom) — they change chart
	 * interaction state instead of arming an overlay template.
	 */
	nonTool?: boolean;
}
export interface DrawingToolSection {
	id: string;
	items: DrawingToolItem[];
}
export interface DrawingToolGroup {
	id: string;
	/** Icon shown on the group's flyout button. */
	iconId: DrawingIconId;
	sections: DrawingToolSection[];
}
/**
 * `chart.drawings` — the public facade over the drawing subsystem.
 *
 * Wraps the DrawingManager (observe + shadow + history + persistence) with
 * the catalog registry and a semantic/AI-friendly create surface. Hosts use
 * `catalog()` to render toolbars; automation uses `addLine`/`addHLine`/
 * `addZone`/`addFibRetracement` (correct point contracts built in) or the
 * validating `create()` for arbitrary tools.
 */
/** ms timestamp (number) or ISO-8601 string — normalized to ms internally. */
export type DrawingTimeInput = number | string;
export interface DrawingPointInput {
	time?: DrawingTimeInput;
	dataIndex?: number;
	value?: number;
}
export type DrawingCreateIfExists = "ignore" | "update" | "replace";
export interface DrawingCreateSpec extends Omit<OverlayCreate, "points" | "name"> {
	/** Optional here because `create(name, spec)` carries it separately. */
	name?: string;
	points?: DrawingPointInput[];
	/** Behavior when `id` already exists. Default 'update'. */
	ifExists?: DrawingCreateIfExists;
}
export interface DrawingListFilter {
	name?: string;
	ids?: string[];
	paneId?: string;
	/** Keep drawings with any point timestamp inside [from, to] (ms). */
	inRange?: {
		from: DrawingTimeInput;
		to: DrawingTimeInput;
	};
	/** Keep drawings intersecting the current visible bar range. */
	intersectsVisible?: boolean;
}
export interface DrawingClearFilter {
	ids?: string[];
	name?: string;
	/** Locked drawings survive clear() unless explicitly included. */
	includeLocked?: boolean;
}
export interface DrawingsConfigureOptions {
	/** Swap/attach a persistence store at runtime. `null` detaches. */
	store?: DrawingStore | null;
}
export interface SemanticDrawingBase {
	id?: string;
	paneId?: string;
	styles?: OverlayCreate["styles"];
	extendData?: unknown;
	lock?: boolean;
	visible?: boolean;
	ifExists?: DrawingCreateIfExists;
}
export interface DrawingsApi extends DrawingManager {
	/** The tool catalog (groups → sections → items) for host toolbars. */
	catalog: () => DrawingToolGroup[];
	/**
	 * Arm a tool by catalog id ('trendLine') or kernel name ('segment').
	 * Catalog ids resolve through the registry; unknown ids fall through to
	 * the raw overlay name for extension templates.
	 */
	activate: (tool: string, opts?: {
		continuous?: boolean;
		extendData?: unknown;
		points?: OverlayCreate["points"];
	}) => Nullable<string>;
	/**
	 * Validating programmatic create.
	 * - `create('segment', { points })` / `create({ name, points })` → id
	 * - `create(spec[])` → ids (invalid entries skipped with a warning)
	 * Point count must match the template's anchor contract.
	 */
	create: {
		(name: string, spec?: DrawingCreateSpec): Nullable<string>;
		(spec: DrawingCreateSpec): Nullable<string>;
		(specs: DrawingCreateSpec[]): Array<Nullable<string>>;
	};
	/** Trend line between two points. `name` selects the kernel template. */
	addLine: (args: {
		from: DrawingPointInput;
		to: DrawingPointInput;
		name?: string;
	} & SemanticDrawingBase) => Nullable<string>;
	/** Horizontal line at a value. `time` defaults to mid-visible-range. */
	addHLine: (args: {
		value: number;
		time?: DrawingTimeInput;
		label?: string;
	} & SemanticDrawingBase) => Nullable<string>;
	/** Filled zone (rectangle) between a time range and two price levels. */
	addZone: (args: {
		from: DrawingTimeInput;
		to: DrawingTimeInput;
		top: number;
		bottom: number;
	} & SemanticDrawingBase) => Nullable<string>;
	/** Fibonacci retracement between two points. */
	addFibRetracement: (args: {
		from: DrawingPointInput;
		to: DrawingPointInput;
	} & SemanticDrawingBase) => Nullable<string>;
	list: (filter?: DrawingListFilter) => SerializedDrawing[];
	/** Bulk remove — returns removed ids. Locked drawings are skipped by default. */
	clear: (filter?: DrawingClearFilter) => string[];
	/** Open the library settings dialog for a drawing (DP-6c). */
	openSettings: (id: string) => boolean;
	configure: (opts: DrawingsConfigureOptions) => void;
}
export type DomPosition = "root" | "main" | "yAxis";
export interface ConvertFilter {
	paneId?: string;
	absolute?: boolean;
}
export interface Chart extends Store {
	id: string;
	getDom: (paneId?: string, position?: DomPosition) => Nullable<HTMLElement>;
	getSize: (paneId?: string, position?: DomPosition) => Nullable<Bounding>;
	createIndicator: (value: string | IndicatorCreate, isStack?: boolean, paneOptions?: PaneOptions) => Nullable<string>;
	getIndicators: (filter?: IndicatorFilter) => Indicator[];
	createOverlay: (value: string | OverlayCreate | Array<string | OverlayCreate>) => Nullable<string> | Array<Nullable<string>>;
	getOverlays: (filter?: OverlayFilter) => Overlay[];
	getOverlayById: (id: Nullable<string>) => Nullable<Overlay>;
	selectOverlay: (id: Nullable<string>) => void;
	setPaneOptions: (options: PaneOptions) => void;
	getPaneOptions: (id?: string) => Nullable<PaneOptions> | PaneOptions[];
	scrollByDistance: (distance: number, animationDuration?: number) => void;
	scrollToRealTime: (animationDuration?: number) => void;
	scrollToDataIndex: (dataIndex: number, animationDuration?: number) => void;
	scrollToTimestamp: (timestamp: number, animationDuration?: number) => void;
	zoomAtCoordinate: (scale: number, coordinate?: Coordinate, animationDuration?: number) => void;
	zoomAtDataIndex: (scale: number, dataIndex: number, animationDuration?: number) => void;
	zoomAtTimestamp: (scale: number, timestamp: number, animationDuration?: number) => void;
	convertToPixel: (points: Partial<Point> | Array<Partial<Point>>, filter?: ConvertFilter) => Partial<Coordinate> | Array<Partial<Coordinate>>;
	convertFromPixel: (coordinates: Array<Partial<Coordinate>>, filter?: ConvertFilter) => Partial<Point> | Array<Partial<Point>>;
	executeAction: (type: ActionType, data?: unknown) => void;
	subscribeAction: (type: ActionType, callback: ActionCallback) => void;
	unsubscribeAction: (type: ActionType, callback?: ActionCallback) => void;
	getConvertPictureUrl: (includeOverlay?: boolean, type?: "png" | "jpeg" | "bmp", backgroundColor?: string) => string;
	resize: () => void;
	/** Drawing subsystem facade — catalog, tools, history, persistence, AI helpers. */
	readonly drawings: DrawingsApi;
}
export interface AxisTick {
	coord: number;
	value: number | string;
	text: string;
}
export interface AxisRange extends VisibleRange {
	readonly range: number;
	readonly realRange: number;
	readonly displayFrom: number;
	readonly displayTo: number;
	readonly displayRange: number;
}
export interface AxisGap {
	top?: number;
	bottom?: number;
}
export type AxisPosition = "left" | "right";
export interface AxisValueToValueParams {
	range: AxisRange;
}
export type AxisValueToValueCallback = (value: number, params: AxisValueToValueParams) => number;
export interface AxisCreateRangeParams {
	chart: Chart;
	paneId: string;
	defaultRange: AxisRange;
}
export type AxisCreateRangeCallback = (params: AxisCreateRangeParams) => AxisRange;
export interface AxisCreateTicksParams {
	range: AxisRange;
	bounding: Bounding;
	defaultTicks: AxisTick[];
}
export type AxisCreateTicksCallback = (params: AxisCreateTicksParams) => AxisTick[];
export type AxisMinSpanCallback = (value: number) => number;
export interface AxisTemplate {
	name: string;
	reverse?: boolean;
	inside?: boolean;
	position?: AxisPosition;
	scrollZoomEnabled?: boolean;
	gap?: AxisGap;
	valueToRealValue?: AxisValueToValueCallback;
	realValueToDisplayValue?: AxisValueToValueCallback;
	displayValueToRealValue?: AxisValueToValueCallback;
	realValueToValue?: AxisValueToValueCallback;
	displayValueToText?: (value: number, precision: number) => string;
	minSpan?: AxisMinSpanCallback;
	createRange?: AxisCreateRangeCallback;
	createTicks?: AxisCreateTicksCallback;
}
export interface Axis {
	override: (axis: AxisTemplate) => void;
	getTicks: () => AxisTick[];
	getRange: () => AxisRange;
	getAutoSize: () => number;
	convertToPixel: (value: number) => number;
	convertFromPixel: (px: number) => number;
}
export type AxisCreate = Omit<AxisTemplate, "displayValueToText" | "valueToRealValue" | "realValueToDisplayValue" | "displayValueToRealValue" | "realValueToValue">;
export type XAxisTemplate = Pick<AxisTemplate, "name" | "scrollZoomEnabled" | "createTicks">;
export interface XAxis extends Axis, Required<XAxisTemplate> {
	convertTimestampFromPixel: (pixel: number) => Nullable<number>;
	convertTimestampToPixel: (timestamp: number) => number;
}
export interface Figure<A = unknown, S = unknown> {
	name: string;
	attrs: A;
	styles: S;
	draw: (ctx: CanvasRenderingContext2D, attrs: A, styles: S) => void;
	checkEventOn: (coordinate: Coordinate, attrs: A, styles: S) => boolean;
}
export type FigureTemplate<A = unknown, S = unknown> = Pick<Figure<A, S>, "name" | "draw" | "checkEventOn">;
export type FigureCreate<A = unknown, S = unknown> = Pick<Figure<A, S>, "name" | "attrs" | "styles">;
export type FigureConstructor<A = unknown, S = unknown> = new (figure: FigureCreate<A, S>) => ({
	draw: (ctx: CanvasRenderingContext2D) => void;
});
declare function checkCoordinateOnCircle(coordinate: Coordinate, attrs: CircleAttrs | CircleAttrs[]): boolean;
export interface CircleAttrs {
	x: number;
	y: number;
	r: number;
}
declare function checkCoordinateOnArc(coordinate: Coordinate, attrs: ArcAttrs | ArcAttrs[]): boolean;
export interface ArcAttrs extends CircleAttrs {
	startAngle: number;
	endAngle: number;
}
declare function checkCoordinateOnRect(coordinate: Coordinate, attrs: RectAttrs | RectAttrs[]): boolean;
export interface RectAttrs {
	x: number;
	y: number;
	width: number;
	height: number;
}
declare function checkCoordinateOnText(coordinate: Coordinate, attrs: TextAttrs | TextAttrs[], styles: Partial<TextStyle>): boolean;
export interface TextAttrs {
	x: number;
	y: number;
	text: string;
	width?: number;
	height?: number;
	align?: CanvasTextAlign;
	baseline?: CanvasTextBaseline;
	/** Rotation angle in radians, applied around (x, y) */
	rotation?: number;
}
export type IndicatorSeries = "normal" | "price" | "volume";
export type IndicatorFigureStyle = Partial<Omit<SmoothLineStyle, "style">> & Partial<Omit<RectStyle, "style">> & Partial<TextStyle> & Partial<{
	style: LineType[keyof LineType];
}> & Record<string, unknown>;
export type IndicatorFigureAttrs = Partial<ArcAttrs> & Partial<LineStyle> & Partial<RectAttrs> & Partial<TextAttrs> & Record<string, unknown>;
export interface IndicatorFigureAttrsCallbackParams<D> {
	data: NeighborData<Nullable<D>>;
	coordinate: NeighborData<Record<keyof D, number> & {
		x: number;
	}>;
	bounding: Bounding;
	barSpace: BarSpace;
	xAxis: XAxis;
	yAxis: YAxis;
}
export interface IndicatorFigureStylesCallbackParams<D> {
	data: NeighborData<Nullable<D>>;
	indicator: Indicator<D>;
	defaultStyles?: IndicatorStyle;
}
export type IndicatorFigureAttrsCallback<D> = (params: IndicatorFigureAttrsCallbackParams<D>) => IndicatorFigureAttrs;
export type IndicatorFigureStylesCallback<D> = (params: IndicatorFigureStylesCallbackParams<D>) => IndicatorFigureStyle;
export interface IndicatorFigure<D = unknown> {
	key: string;
	title?: string;
	type?: string;
	baseValue?: number;
	attrs?: IndicatorFigureAttrsCallback<D>;
	styles?: IndicatorFigureStylesCallback<D>;
}
export type IndicatorRegenerateFiguresCallback<D, C> = (calcParams: C[]) => Array<IndicatorFigure<D>>;
export interface IndicatorTooltipData {
	name: string;
	calcParamsText: string;
	features: TooltipFeatureStyle[];
	legends: TooltipLegend[];
}
export interface IndicatorCreateTooltipDataSourceParams<D> {
	chart: Chart;
	indicator: Indicator<D>;
	bounding: Bounding;
	crosshair: Crosshair;
	xAxis: XAxis;
	yAxis: YAxis;
}
export type IndicatorCreateTooltipDataSourceCallback<D> = (params: IndicatorCreateTooltipDataSourceParams<D>) => IndicatorTooltipData;
export interface IndicatorDrawParams<D, C, E> {
	ctx: CanvasRenderingContext2D;
	chart: Chart;
	indicator: Indicator<D, C, E>;
	bounding: Bounding;
	xAxis: XAxis;
	yAxis: YAxis;
}
export type IndicatorDrawCallback<D, C, E> = (params: IndicatorDrawParams<D, C, E>) => boolean;
export type IndicatorCalcCallback<D, C, E> = (dataList: KLineData[], indicator: Indicator<D, C, E>) => Promise<D[]> | D[];
export type IndicatorShouldUpdateCallback<D, C, E> = (prev: Indicator<D, C, E>, current: Indicator<D, C, E>) => (boolean | {
	calc: boolean;
	draw: boolean;
});
export interface Indicator<D = unknown, C = unknown, E = unknown> {
	/**
	 * Unique id
	 */
	id: string;
	/**
	 * Pane id
	 */
	paneId: string;
	/**
	 * Indicator name
	 */
	name: string;
	/**
	 * Short name, for display
	 */
	shortName: string;
	/**
	 * Precision
	 */
	precision: number;
	/**
	 * Calculation parameters
	 */
	calcParams: C[];
	/**
	 * Whether ohlc column is required
	 */
	shouldOhlc: boolean;
	/**
	 * Whether large data values need to be formatted, starting from 1000, for example, whether 100000 needs to be formatted with 100K
	 */
	shouldFormatBigNumber: boolean;
	/**
	 * Whether the indicator is visible
	 */
	visible: boolean;
	/**
	 * Z index
	 */
	zLevel: number;
	/**
	 * Extend data
	 */
	extendData: E;
	/**
	 * Indicator series
	 */
	series: IndicatorSeries;
	/**
	 * Figure configuration information
	 */
	figures: Array<IndicatorFigure<D>>;
	/**
	 * Specified minimum value
	 */
	minValue: Nullable<number>;
	/**
	 * Specified maximum value
	 */
	maxValue: Nullable<number>;
	/**
	 * Style configuration
	 */
	styles: Nullable<DeepPartial<IndicatorStyle>>;
	/**
	 *  Should update, should calc or draw
	 */
	shouldUpdate: Nullable<IndicatorShouldUpdateCallback<D, C, E>>;
	/**
	 * Indicator calculation
	 */
	calc: IndicatorCalcCallback<D, C, E>;
	/**
	 * Regenerate figure configuration
	 */
	regenerateFigures: Nullable<IndicatorRegenerateFiguresCallback<D, C>>;
	/**
	 * Create custom tooltip text
	 */
	createTooltipDataSource: Nullable<IndicatorCreateTooltipDataSourceCallback<D>>;
	/**
	 * Custom draw (runs BEFORE default figures)
	 */
	draw: Nullable<IndicatorDrawCallback<D, C, E>>;
	/**
	 * Custom draw that runs AFTER default figures are rendered.
	 * Use for decorations (dots, markers) that must appear on top of the line.
	 */
	postDraw: Nullable<IndicatorDrawCallback<D, C, E>>;
	/**
	 * Calculation result
	 */
	result: D[];
}
export type IndicatorTemplate<D = unknown, C = unknown, E = unknown> = ExcludePickPartial<Omit<Indicator<D, C, E>, "result" | "paneId">, "name" | "calc">;
export type IndicatorCreate<D = unknown, C = unknown, E = unknown> = ExcludePickPartial<Omit<Indicator<D, C, E>, "result">, "name">;
export type IndicatorFilter = Partial<Pick<Indicator, "id" | "paneId" | "name">>;
declare function checkCoordinateOnLine(coordinate: Coordinate, attrs: LineAttrs | LineAttrs[]): boolean;
declare function getLinearYFromSlopeIntercept(kb: Nullable<number[]>, coordinate: Coordinate): number;
declare function getLinearYFromCoordinates(coordinate1: Coordinate, coordinate2: Coordinate, targetCoordinate: Coordinate): number;
declare function getLinearSlopeIntercept(coordinate1: Coordinate, coordinate2: Coordinate): Nullable<number[]>;
export interface LineAttrs {
	coordinates: Coordinate[];
}
declare function checkCoordinateOnPolygon(coordinate: Coordinate, attrs: PolygonAttrs | PolygonAttrs[]): boolean;
export interface PolygonAttrs {
	coordinates: Coordinate[];
}
export declare function getSupportedFigures(): string[];
export declare function registerFigure<A = unknown, S = unknown>(figure: FigureTemplate<A, S>): void;
export declare function getFigureClass<A = unknown, S = unknown>(name: string): Nullable<FigureConstructor<A, S>>;
export declare function registerIndicator<D = unknown, C = unknown, E = unknown>(indicator: IndicatorTemplate<D, C, E>): void;
export declare function getSupportedIndicators(): string[];
export declare function registerLocale(locale: string, ls: Locales): void;
export declare function getSupportedLocales(): string[];
export declare function registerOverlay<E = unknown>(template: OverlayTemplate<E>): void;
export declare function getOverlayClass(name: string): Nullable<OverlayConstructor>;
export declare function getSupportedOverlays(): string[];
export interface SegmentExtendData {
	extendLeft?: boolean;
	extendRight?: boolean;
	leftEnd?: number;
	rightEnd?: number;
	showMiddlePoint?: boolean;
	showPriceLabels?: boolean;
	showLabel?: boolean;
	text?: string;
	textcolor?: string;
	fontsize?: number;
	bold?: boolean;
	italic?: boolean;
	horzLabelsAlign?: string;
	vertLabelsAlign?: string;
	showPriceRange?: boolean;
	showPercentPriceRange?: boolean;
	showBarsRange?: boolean;
	showDateTimeRange?: boolean;
	showDistance?: boolean;
	showAngle?: boolean;
	alwaysShowStats?: boolean;
	statsPosition?: number;
}
export interface PathAttrs {
	x: number;
	y: number;
	width: number;
	height: number;
	path: string;
}
/**
 * Regression Trend (Xu hướng hồi quy) - ExtendData types
 *
 * Data-driven channel tool: linear regression fitted over the bar range
 * between 2 control points, with optional upper/lower deviation bands.
 */
export type RegressionSource = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";
type LineStyle$1 = "solid" | "dashed" | "dotted";
interface VisibilityRange {
	enabled: boolean;
	min: number;
	max: number;
}
/**
 * Flat 21-field schema — matches BRD §4.3. Bar indices (#17/#18) live
 * on `overlay.points` as `dataIndex`, not on ExtendData.
 */
export interface RegressionTrendExtendData {
	upperDeviation?: number;
	lowerDeviation?: number;
	useUpperDeviation?: boolean;
	useLowerDeviation?: boolean;
	source?: RegressionSource;
	baseVisible?: boolean;
	baseColor?: string;
	baseStyle?: LineStyle$1;
	upperVisible?: boolean;
	upperColor?: string;
	upperStyle?: LineStyle$1;
	lowerVisible?: boolean;
	lowerColor?: string;
	lowerStyle?: LineStyle$1;
	extendLines?: boolean;
	pearsonR?: boolean;
	vis_ticks?: VisibilityRange;
	vis_hours?: VisibilityRange;
	vis_days?: VisibilityRange;
	vis_weeks?: VisibilityRange;
	vis_months?: VisibilityRange;
}
/**
 * Ellipse (Hình elip) — ExtendData types
 *
 * 2-point shape: `overlay.points[0]` and `overlay.points[1]` are the diagonal
 * corners of the bounding box. The ellipse is inscribed in that bbox.
 *
 * Flat 18-field schema — matches BRD §4.
 */
export type EllipseLineStyle = "solid" | "dashed" | "dotted";
export interface EllipseVisibilityRange {
	enabled: boolean;
	min: number;
	max: number;
}
export interface EllipseExtendData {
	borderColor?: string;
	borderStyle?: EllipseLineStyle;
	borderWidth?: number;
	fillEnabled?: boolean;
	fillColor?: string;
	fillOpacity?: number;
	textEnabled?: boolean;
	text?: string;
	textColor?: string;
	textSize?: number;
	isBold?: boolean;
	isItalic?: boolean;
	isEditing?: boolean;
	vis_ticks?: EllipseVisibilityRange;
	vis_hours?: EllipseVisibilityRange;
	vis_days?: EllipseVisibilityRange;
	vis_weeks?: EllipseVisibilityRange;
	vis_months?: EllipseVisibilityRange;
}
export declare function registerStyles(name: string, ss: DeepPartial<Styles>): void;
export declare function registerXAxis(axis: XAxisTemplate): void;
export declare function registerYAxis(axis: YAxisTemplate): void;
/**
 * KTR step per level, in percent of OP. Hand-set per symbol on crazii's side
 * (constant across every day observed), keyed by crazii's ticker.
 */
export declare const KTR_STEP_PERCENT: Readonly<Record<string, number>>;
/**
 * KCX lookback (bars) per symbol, keyed by crazii's ticker. Same value on
 * every timeframe checked (5m, 15m, 1D).
 */
export declare const KCX_PERIOD: Readonly<Record<string, number>>;
/**
 * Options the host passes through `indicator.extendData`.
 *
 * `dailyBars` matters: MLP needs the previous day and KCB needs months of
 * daily opens, while an intraday chart only loads a few days. Without it the
 * indicators fall back to days rebuilt from the visible bars, which leaves the
 * first loaded day without MLP and drops older untouched opens from KCB.
 */
export interface CraziiLevelsExtendData {
	dailyBars?: KLineData[];
}
/**
 * Synchronizable channels. All default to `true` when a chart is attached.
 */
export type ChartSyncChannel = "crosshair" | "timeRange" | "zoom" | "drawings" | "symbol" | "period";
export type ChartSyncChannels = Partial<Record<ChartSyncChannel, boolean>>;
/**
 * Suggested default palette for group indicators. Host apps may map these
 * onto their own design tokens.
 */
export declare const SYNC_GROUP_COLORS: string[];
export interface ChartSyncOptions {
	channels?: ChartSyncChannels;
	/**
	 * The library never fetches data. When a symbol/period change must be
	 * propagated to peer charts, the host receives the peer chart plus the
	 * new value and is expected to call `chart.setSymbol(...)`/`setPeriod(...)`
	 * (or its own reload routine) on it.
	 */
	onApplySymbol?: (chart: Chart, symbol: SymbolInfo) => void;
	onApplyPeriod?: (chart: Chart, period: Period) => void;
}
export interface ChartSyncAttachOptions {
	/**
	 * Charts sharing the same non-null group id synchronize with each other.
	 * Charts without a group never sync.
	 */
	groupId?: string | null;
	/**
	 * When true (default for a chart that hasn't finished loading), symbol /
	 * period / visible-range emits during the initial setup burst are treated
	 * as the chart's baseline and are not propagated — prevents a freshly
	 * mounted chart from hijacking its peers while its data pipeline performs
	 * `setSymbol`/`setPeriod`/`resetData`. The burst is detected via a short
	 * quiet window; the first emit after the chart settles propagates normally.
	 * Pass `false` when attaching to a chart that is already fully loaded.
	 */
	skipInitialEmits?: boolean;
}
export interface ChartSync {
	attach: (chart: Chart, options?: ChartSyncAttachOptions) => void;
	detach: (chart: Chart) => void;
	setGroup: (chart: Chart, groupId: Nullable<string>) => void;
	setChannel: (channel: ChartSyncChannel, enabled: boolean) => void;
	dispose: () => void;
}
/**
 * Group-scoped multi-chart synchronization. Everything runs at the library
 * action level — no framework, no React — so per-frame interactions
 * (crosshair, drags, drawing progress) propagate without a render loop.
 */
export declare function createChartSync(options?: ChartSyncOptions): ChartSync;
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
 * Shared drawing-state contract (DP-0b). Every rebuilt drawing tool carries
 * this state on `overlay.extendData.common` so persistence, the floating
 * toolbar, and interval-visibility menus can treat tools uniformly.
 *
 * The full serialized record (schema v2) is defined by the persistence
 * layer (DP-5); this is the runtime shape tools rely on.
 */
export interface DrawingCommonState {
	/**
	 * Timeframes/resolutions the drawing is visible on, e.g. ['1m','5m','1D'].
	 * `undefined` or empty = visible on all intervals (TradingView
	 * intervalsVisibilities default).
	 */
	visibleIntervals?: string[];
	/**
	 * Optional per-point interval pinning — point i is only meaningful on
	 * these resolutions. Used by timeframe-tied tools (alerts, markers).
	 */
	pointIntervals?: Array<string[] | undefined>;
	/**
	 * Display z-order hint within the overlay zLevel — mirrors TradingView's
	 * visual-order zorder field. The overlay's `zLevel` remains the render
	 * authority; this preserves the user's "bring forward/back" stack order.
	 */
	visualOrder?: number;
}
/**
 * ExtendData envelope every library-owned drawing uses: tool payloads live
 * under `extendData` directly, shared cross-tool state under `.common`.
 * Helpers below keep access type-safe.
 */
export interface DrawingExtendData<T = unknown> {
	common?: DrawingCommonState;
	data?: T;
}
export declare function getCommonState(overlay: {
	extendData?: unknown;
}): DrawingCommonState;
export declare function isVisibleOnInterval(overlay: {
	extendData?: unknown;
}, interval: string): boolean;
export declare const ANCHOR_KEY_PREFIX = "anchor_";
export declare const ANCHOR_MID_KEY = "anchor_mid";
/**
 * TradingView anchor sizing: ~6px grab radius on mouse, ~13px on touch.
 * The figure IS the hit target, so touch anchors are physically bigger —
 * no separate tolerance plumbing needed.
 */
export declare const ANCHOR_HALF_MOUSE = 6;
export declare const ANCHOR_HALF_TOUCH = 13;
export interface AnchorFigureStyle {
	/** Anchor border color (default '#1592E6'). */
	borderColor?: string;
	/** Anchor fill (default '#ffffff'). */
	backColor?: string;
	/** Border width px (default 1.5). */
	borderSize?: number;
	/** Locked-selection marker color (default '#787B86'). */
	lockedBorderColor?: string;
}
export interface AnchorFiguresParams {
	/**
	 * Point coordinates in pane space — one anchor per entry.
	 */
	coordinates: Coordinate[];
	isSelected?: boolean;
	isHovered?: boolean;
	/**
	 * Locked overlays render a non-interactive selection outline instead of
	 * draggable anchors (TradingView `SelectionRenderer` behavior).
	 */
	lock?: boolean;
	/**
	 * While the overlay is still drawing, the last (in-progress) point's
	 * anchor is suppressed (TradingView `lineBeingCreated` behavior).
	 */
	isDrawing?: boolean;
	/**
	 * Use touch-sized anchors (13px half-size instead of 6px).
	 */
	isTouch?: boolean;
	/**
	 * Draw a midpoint translate handle between the two points of a 2-point
	 * tool. The handle is an 'other'-type figure — dragging it translates
	 * the whole overlay.
	 */
	midPoint?: boolean;
	/**
	 * Anchor shape. 'square' = resize handles (default), 'circle' = round.
	 */
	shape?: "square" | "circle";
	/**
	 * Per-point CSS cursor (e.g. from computeResizeCursor). Falls back to
	 * 'pointer'.
	 */
	cursors?: Array<string | undefined>;
	/**
	 * Per-point axis-constrained drag direction. Falls back to 'both'.
	 */
	moveDirections?: Array<OverlayFigureMoveDirection | undefined>;
	styles?: AnchorFigureStyle;
	/**
	 * Key prefix for generated figures (default 'anchor_'); the midpoint
	 * handle uses `${prefix}mid` unless overridden.
	 */
	keyPrefix?: string;
	/**
	 * Which point indexes get anchors. Defaults to all coordinates.
	 */
	pointIndexes?: number[];
}
/**
 * Build the draggable control-point figures for an overlay. Returns [] when
 * the overlay should show no anchors (not selected, not hovered-unlocked).
 * For a LOCKED selected overlay call {@link createSelectionOutlineFigures}.
 */
export declare function createAnchorFigures(params: AnchorFiguresParams): OverlayFigure[];
/**
 * Locked-selection outline: non-interactive corner markers so a locked
 * drawing still reads as "selected but frozen" — TradingView renders a
 * SelectionRenderer instead of LineAnchorRenderer for locked sources.
 */
export declare function createSelectionOutlineFigures(params: {
	coordinates: Coordinate[];
	isTouch?: boolean;
	/** Suppress the in-progress tail marker while drawing. */
	isDrawing?: boolean;
	styles?: AnchorFigureStyle;
	keyPrefix?: string;
}): OverlayFigure[];
/**
 * 8-way resize cursor for a handle of a segment: buckets the segment angle
 * into 22.5° steps and maps it to a CSS directional cursor — the TradingView
 * `anchorResizeCursorType` behavior.
 */
export declare function computeResizeCursor(from: Coordinate, to: Coordinate): string;
/**
 * Persistent per-chart interaction state. Kept in a WeakMap so the kernel
 * `Chart`/`Store` types stay untouched; the floating toolbar toggles
 * `align45` through setAlign45Enabled().
 */
export interface DrawingInteractionState {
	/**
	 * TradingView's "snap to 45°" persistent toggle (toolbar magnet menu).
	 * When true, every drawn/dragged point snaps — as if Shift were held.
	 */
	align45: boolean;
}
export declare function getDrawingInteractionState(chart: Chart): DrawingInteractionState;
export declare function setAlign45Enabled(chart: Chart, enabled: boolean): void;
export declare function isAlign45Enabled(chart: Chart): boolean;
/**
 * Whether a move should snap to 45° increments — Shift held during the
 * gesture, or the persistent toolbar toggle.
 */
export declare function isSnap45Active(chart: Chart, event?: Partial<MouseTouchEvent>): boolean;
/**
 * Snap `to` onto the nearest 45° ray from `from`, preserving distance.
 * Operates in pixel space — convert Point↔Coordinate at the call site.
 */
export declare function snap45Coordinate(to: Coordinate, from: Coordinate): Coordinate;
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
 * Shared drawing keyboard layer. One binding feeds the drawings manager;
 * individual tools never attach their own listeners.
 *
 * TradingView key map:
 *   Esc               — cancel in-progress drawing (unlimited-step tools
 *                       complete instead); commit open text edits
 *   Delete/Backspace  — remove the selected drawing
 *   Ctrl/Cmd+Z        — undo last committed gesture
 *   Ctrl/Cmd+Shift+Z  — redo
 *   Ctrl/Cmd+C / V    — copy / paste-clone the selection
 */
export interface DrawingKeyboardHandlers {
	onEscape?: () => void;
	onDelete?: () => void;
	onUndo?: () => void;
	onRedo?: () => void;
	onCopy?: () => void;
	onPaste?: () => void;
}
export interface DrawingKeyboardOptions {
	/**
	 * Optional gate — return false to skip dispatch (e.g. chart not focused,
	 * another pane owns the keys). Defaults to always dispatch.
	 */
	isActive?: () => boolean;
	/** Binding target — defaults to `document` (SSR-safe no-op). */
	target?: Document | HTMLElement;
}
/**
 * Bind the shared keyboard layer. Returns an unbind function.
 * Guards: editable DOM targets and IME composition never reach handlers.
 */
export declare function bindDrawingKeyboard(handlers: DrawingKeyboardHandlers, options?: DrawingKeyboardOptions): () => void;
export interface FigureCacheOptions<E> {
	/**
	 * Extra signature material — MANDATORY for anything the template reads
	 * that is NOT covered by coordinates/figuresRev/selection/lock/bounding/
	 * currentStep (e.g. textual values that change sub-pixel, time-derived
	 * labels, external flags).
	 */
	extraKey?: (params: OverlayCreateFiguresCallbackParams<E>) => string;
}
/**
 * CONTRACT: the returned array is SHARED — the view and every subsequent
 * createFigures call see the same instance until the signature changes.
 * Templates must treat it as read-only (never push/splice/mutate figure
 * attrs on the result).
 */
export declare function withFigureCache<E>(fn: OverlayCreateFiguresCallback<E>, options?: FigureCacheOptions<E>): OverlayCreateFiguresCallback<E>;
export interface ViewportCullOptions {
	/**
	 * Expand the viewport by this many px before dropping figures — keeps
	 * partially-visible decorations (labels, line caps) alive near edges.
	 * Default 24.
	 */
	margin?: number;
}
/**
 * Drop figures that declare `bounds` fully outside the viewport. Figures
 * without bounds are always kept (opt-in per figure).
 */
export declare function withViewportCull<E>(fn: OverlayCreateFiguresCallback<E>, options?: ViewportCullOptions): OverlayCreateFiguresCallback<E>;
/**
 * Convenience: cache → cull. The composition order matters — cull is inner
 * so off-screen figures never enter the cache output.
 */
export declare function withPerfPipeline<E>(fn: OverlayCreateFiguresCallback<E>, options?: FigureCacheOptions<E> & ViewportCullOptions): OverlayCreateFiguresCallback<E>;
export interface DomLayerMountOptions {
	/**
	 * Interactive children receive pointer-events:auto and swallow all chart
	 * gesture events. Non-interactive children are display-only.
	 */
	interactive?: boolean;
	/**
	 * Decide per event whether to stopPropagation. Default: always stop when
	 * interactive. The text editor uses this to let the opening click pass
	 * through during its first ~500ms (TradingView's ResetClick window).
	 */
	isolate?: (e: Event) => boolean;
	className?: string;
	/** z-index inside the layer (default 0). */
	zIndex?: number;
}
export interface PaneDomLayer {
	getElement: () => HTMLElement;
	/**
	 * Mount a DOM element in the layer. Returns an unmount function.
	 */
	mount: (element: HTMLElement, options?: DomLayerMountOptions) => () => void;
	detach: (element: HTMLElement) => void;
	/**
	 * Remove every mounted element (the layer itself stays).
	 */
	clear: () => void;
	destroy: () => void;
}
/**
 * Resolve (creating on first use) the DOM layer for a pane's main widget.
 * Returns null when the pane does not exist — SSR-safe when chart is gone.
 */
export declare function getPaneDomLayer(chart: Chart, paneId: string): PaneDomLayer | null;
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
 * Text measurement engine (DP-2) — ported from TradingView's
 * TextWidthCache + canvasUtils.measureText with one fix: TV's cache resets
 * its entire buffer whenever the context font changes, which thrashes when
 * a chart hosts multiple text fonts. Ours keeps a per-font cache.
 */
export interface MinTextMetrics {
	width: number;
	actualBoundingBoxAscent?: number;
	actualBoundingBoxDescent?: number;
	fontBoundingBoxAscent?: number;
	fontBoundingBoxDescent?: number;
}
export declare function getMinTextMetrics(metrics: TextMetrics): MinTextMetrics;
/**
 * Per-font width cache. TV keys a single buffer by text and resets on font
 * switch; we key caches by font so fonts coexist (mixed-font documents no
 * longer evict each other).
 */
export interface TextWidthCache {
	measureText: (context: CanvasRenderingContext2D, text: string, options?: {
		mono?: boolean;
	}) => number;
	yMidCorrection: (context: CanvasRenderingContext2D, text: string) => number;
	getMetrics: (context: CanvasRenderingContext2D, text: string) => MinTextMetrics;
	reset: () => void;
}
export declare function createTextWidthCache(capacity?: number): TextWidthCache;
/**
 * Measure text against the shared measurement context.
 * Pass a TextWidthCache to cache by (font, text).
 */
export declare function measureText(text: string, font: string, widthCache?: TextWidthCache): MinTextMetrics;
/**
 * TradingView's wordWrap algorithm (module 691695) — ported verbatim.
 * Preserves explicit line breaks, wraps long lines by word tokens, splits
 * overlong words by binary search, and marks trailing-whitespace chunks as
 * hidden lines (skippable). Positions are UTF-16 code-unit indexes, matching
 * textarea selectionStart/End semantics.
 */
export interface WrappedLine {
	text: string;
	/**
	 * Hidden lines carry the whitespace tail of an overfull line — invisible
	 * but still consume string positions (caret/selection math needs them).
	 */
	hidden: boolean;
	/** Line produced by wrapping (not an explicit source line). */
	wrappedLinePart: boolean;
	/** Final part of a wrapped sequence — the newline belongs to it. */
	wrappedLineEnd: boolean;
}
export declare function wordWrap(text: string, font: string, metricsCache?: TextWidthCache, skipHiddenLines?: boolean, wrapWidth?: number): WrappedLine[];
/**
 * Caret/selection geometry (module 824940) — ported to return CSS-pixel
 * rectangles instead of drawing to canvas. The text editor renders these as
 * DOM nodes on the pane DOM layer, so caret blinking and selection changes
 * cost ZERO canvas repaints.
 */
export type TextAlignOption = "left" | "center" | "right" | "start" | "end";
interface CaretPosition$1 {
	/** x offset of the caret inside the text box (CSS px, pre-rotation). */
	x: number;
	/** y offset of the caret top inside the text box. */
	y: number;
	/** Index of the visible line the caret sits on. */
	lineNumber: number;
}
export interface TextLayoutOptions {
	/** String position (UTF-16 code units) to map, 0..text.length. */
	symbolPosition: number;
	/** Total text box width (CSS px) — lines are aligned inside it. */
	textWidth: number;
	/** wordWrap() output for the CURRENT text (hidden lines included). */
	lines: WrappedLine[];
	font: string;
	/** Line height in CSS px. */
	lineHeight: number;
	lineSpacing?: number;
	textAlign: TextAlignOption;
	/** Right-to-left text direction. */
	rtl?: boolean;
	widthCache?: TextWidthCache;
}
/**
 * Map a string position through wrapped and hidden line segments to caret
 * coordinates. A caret at a wrap boundary advances to the next visible line.
 */
export declare function getCaretPosition(options: TextLayoutOptions): CaretPosition$1;
export interface SelectionRect {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface SelectionRectsOptions {
	/** Caret positions for both ends (from getCaretPosition). */
	start: CaretPosition$1;
	end: CaretPosition$1;
	lines: WrappedLine[];
	font: string;
	/** Text box left edge x (CSS px). */
	left: number;
	/** Text box right edge x (CSS px). */
	right: number;
	lineHeight: number;
	lineSpacing?: number;
	textAlign: TextAlignOption;
	rtl?: boolean;
	widthCache?: TextWidthCache;
}
/**
 * Selection rectangles per visible line — including the space width that an
 * explicit newline contributes at a line end. Same math as drawSelection,
 * returned as data so the editor can render DOM nodes.
 */
export declare function getSelectionRects(options: SelectionRectsOptions): SelectionRect[];
/**
 * In-place text editor (DP-3) — TradingView's invisible-textarea pattern:
 * a real <textarea> mounted over the renderer-measured text box provides
 * IME, clipboard, selection and a11y for free while staying opacity:0. The
 * canvas keeps painting the text; the caret and selection highlights are
 * DOM nodes on the pane layer so blinking costs zero canvas repaints.
 *
 * Close semantics: EVERY close path commits the session's final value
 * (Escape included — the approved TradingView behavior). The caller
 * receives (reason, finalValue) and decides empty-text removal / undo
 * bookkeeping — a session is exactly one history unit.
 */
export type TextEditorCloseReason = "hotkey" | "blur" | "external";
/**
 * Renderer-measured geometry of the text under edit, in pane-local CSS px.
 * Produced by the tool's own text renderer — never measured separately in
 * the DOM (mismatch = caret drift, the #1 defect in ad hoc editors).
 */
export interface TextEditorInfo {
	font: string;
	fontSize: number;
	textLeft: number;
	textTop: number;
	textRight: number;
	textBottom: number;
	textAlign: TextAlignOption;
	/** Extra px between lines (lineHeight = fontSize + lineSpacing). */
	lineSpacing: number;
	centerRotation?: {
		x: number;
		y: number;
		angle: number;
	};
	rtl?: boolean;
}
export interface TextEditorLayout {
	info: TextEditorInfo;
	/** wordWrap() output for the current value (hidden lines included). */
	lines: WrappedLine[];
}
export interface TextEditorSessionOptions {
	chart: Chart;
	paneId: string;
	value: string;
	placeholder?: string;
	maxLength?: number;
	/** Single-line fields: Enter closes instead of inserting a break. */
	forbidLineBreaks?: boolean;
	/** Word-wrap enabled — drives the letter-spacing compensation table. */
	wordWrapEnabled?: boolean;
	/** Re-layout the text as the value changes (wrap may alter the box). */
	layout: (value: string) => TextEditorLayout;
	onClose: (reason: TextEditorCloseReason, finalValue: string) => void;
	onSelectionChange?: (sel: {
		start: number;
		end: number;
	}) => void;
	/** Selection highlight color (default TradingView blue, ~40% alpha). */
	selectionColor?: string;
	/** Caret color — defaults to a dark tone matching chart text. */
	caretColor?: string;
}
export interface TextEditorSession {
	readonly value: string;
	readonly closed: boolean;
	/**
	 * End the session — commits finalValue exactly once via onClose.
	 */
	close: (reason?: TextEditorCloseReason) => void;
}
export declare function createTextEditorSession(options: TextEditorSessionOptions): TextEditorSession;
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
export declare function normalizedDevicePixelRatio(dpr: number): number;
/**
 * Letter-spacing compensation for the invisible textarea — undefined means
 * the font/dpr combo has no calibrated entry and 'normal' should be used
 * (the original deliberately has no fallback).
 */
export declare function getEditorLetterSpacing(font: string, fontSize: number, dpr: number): number | undefined;
/**
 * Text-box layout engine — ported from TradingView's TextRenderer
 * (_getBox / _getBoxSize / _getInternalData / getLinesInfo), minus the
 * decorator system (TV forbids decorators together with wordWrapWidth, and
 * none of our tools use them).
 *
 * This is the SINGLE source of geometry for both the canvas figure and the
 * DOM text editor — the editor's layout() callback consumes this output so
 * caret, selection and the invisible textarea always agree with painted
 * pixels (the #1 defect of ad hoc editors is re-measuring in the DOM).
 */
export declare const CHART_FONT_FAMILY = "'Trebuchet MS', Roboto, Ubuntu, sans-serif";
export type TextBoxHorzAlign = "left" | "center" | "right";
export type TextBoxVertAlign = "top" | "middle" | "bottom";
export interface TextBoxData {
	text: string;
	fontSize?: number;
	bold?: boolean;
	italic?: boolean;
	fontFamily?: string;
	/** Wrap width in px — presence enables word wrapping inside the box. */
	wordWrapWidth?: number;
	/** Limit the number of visible wrapped lines by pixel height. */
	maxHeight?: number;
	/** Box anchor alignment (where the anchor point sits on the box). */
	horzAlign?: TextBoxHorzAlign;
	vertAlign?: TextBoxVertAlign;
	/** Text alignment inside the box (defaults to horzAlign). */
	horzTextAlign?: TextBoxHorzAlign;
	offsetX?: number;
	offsetY?: number;
	/** Rotation around the alignment-dependent rotation point, radians. */
	angle?: number;
	/** Inner padding; defaults to fontSize / 3 per TradingView. */
	boxPadding?: number;
	boxPaddingVert?: number;
	boxPaddingHorz?: number;
	boxPaddingLeft?: number;
	boxPaddingRight?: number;
	/** Explicit box size overrides (auto-measured otherwise). */
	boxWidth?: number;
	boxHeight?: number;
	/** Extra pixels between lines (lineHeight = fontSize + lineSpacing). */
	lineSpacing?: number;
	/** Right-to-left text direction. */
	rtl?: boolean;
}
export interface TextBoxLinesInfo {
	/** All wrapped lines including hidden continuation segments. */
	linesIncludingHidden: WrappedLine[];
	/** Visible lines only (hidden + maxHeight-truncated removed). */
	lines: WrappedLine[];
	linesMaxWidth: number;
}
export interface TextBoxLayout {
	/** `${bold}${italic}${fontSize}px ${family}` canvas font string. */
	font: string;
	fontSize: number;
	lineSpacing: number;
	/** Outer box (includes padding) in media (CSS px) coordinates. */
	boxLeft: number;
	boxTop: number;
	boxWidth: number;
	boxHeight: number;
	/** Auto-measured box size before explicit overrides. */
	textBoxWidth: number;
	textBoxHeight: number;
	/** Inner text area inside padding. */
	textLeft: number;
	textTop: number;
	textRight: number;
	textBottom: number;
	/** fillText anchor relative to (boxLeft, boxTop). */
	textHorizStart: number;
	textVertStart: number;
	/** Canvas textAlign value ('start' | 'center' | 'end'). */
	textAlign: CanvasTextAlign;
	textBaseline: CanvasTextBaseline;
	linesInfo: TextBoxLinesInfo;
	/** Rotation pivot — follows horz/vert box alignment (TV parity). */
	rotationPoint: Coordinate;
	/** Text center rotated around rotationPoint — editor rotation anchor. */
	centerTextRotation: {
		x: number;
		y: number;
		angle: number;
	};
	/** Rotated box corners for hit testing. */
	polygonPoints: Coordinate[];
}
export declare function textBoxFont(data: TextBoxData): string;
/**
 * Compute the full text-box layout for `data` anchored at `anchor`
 * (media/CSS-px coordinates). Deterministic and context-free: the same
 * input always produces the same geometry for renderer, hit test, caret
 * and selection.
 */
export declare function computeTextBoxLayout(data: TextBoxData, anchor: Coordinate, widthCache?: TextWidthCache): TextBoxLayout;
/**
 * Whether the layout output (given the same anchor) can differ — used by
 * figure-cache invalidation. Mirrors TV's geometry-affecting field list.
 */
export declare function textBoxDataEqual(a: TextBoxData, b: TextBoxData): boolean;
/**
 * Bridge between an overlay's text payload and the in-place editor. The
 * editor's layout() re-runs computeTextBoxLayout for the live value with
 * the SAME data the figure paints from — the invisible textarea therefore
 * always lands exactly over the rendered text.
 */
export interface OverlayTextEditorOptions {
	chart: Chart;
	overlay: Overlay;
	/**
	 * Text + box geometry for the CURRENT overlay value. Called on every
	 * keystroke — read fresh extendData/styles each time.
	 */
	data: () => TextBoxData;
	/**
	 * Pane-local anchor point. Defaults to convertToPixel(points[0]).
	 */
	anchor?: () => Coordinate;
	paneId?: string;
	wordWrapEnabled?: boolean;
	forbidLineBreaks?: boolean;
	maxLength?: number;
	selectionColor?: string;
	caretColor?: string;
	/** Commit a non-empty final value (e.g. override extendData.text). */
	onCommit: (value: string) => void;
	/** Final value trimmed empty — default removes the overlay. */
	onEmpty?: () => void;
}
export declare function openOverlayTextEditor(options: OverlayTextEditorOptions): TextEditorSession;
export type WordWrapFn = (text: string, font: string, metricsCache?: TextWidthCache, skipHiddenLines?: boolean, wrapWidth?: number) => WrappedLine[];
export declare function createCachedWordWrap(): WordWrapFn;
/**
 * 'richText' figure — TradingView TextRenderer parity: a padded (optionally
 * word-wrapped, rotated, bordered, shadowed) text box. Unlike the built-in
 * 'text' figure it shares geometry with the DOM text editor through
 * computeTextBoxLayout(), so what the canvas paints is exactly what the
 * editor positions its textarea/caret/selection over.
 */
export interface RichTextStyle {
	color?: string;
	backgroundColor?: string;
	borderColor?: string;
	borderWidth?: number;
	/** Rounded-corner radius for background + border. */
	backgroundRoundRect?: number;
	boxShadow?: {
		color: string;
		blur: number;
		offsetX?: number;
		offsetY?: number;
	};
	/** Extra outline outside the border (TV outlineBorder). */
	outlineBorder?: {
		width: number;
		color: string;
	};
}
export interface RichTextAttrs extends TextBoxData {
	x: number;
	y: number;
}
export declare function getRichTextLayout(attrs: RichTextAttrs): TextBoxLayout;
export declare function checkCoordinateOnRichText(coordinate: Coordinate, attrs: RichTextAttrs): boolean;
export declare function drawRichText(ctx: CanvasRenderingContext2D, attrs: RichTextAttrs, styles: RichTextStyle): void;
/**
 * 'text' — the TradingView Text tool: click to place, type immediately
 * (the editor opens on drawEnd), double-click to re-edit. Escape and blur
 * both COMMIT the text; empty text removes the overlay. The box auto-grows
 * with content unless extendData.wordWrapWidth fixes it.
 */
export interface TextToolExtendData {
	text?: string;
	/** Fixed wrap width (px) — presence enables word wrapping. */
	wordWrapWidth?: number;
	/** Box anchor alignment. */
	horzAlign?: "left" | "center" | "right";
	vertAlign?: "top" | "middle" | "bottom";
	horzTextAlign?: "left" | "center" | "right";
	angle?: number;
	boxWidth?: number;
	boxHeight?: number;
	maxHeight?: number;
	rtl?: boolean;
}
export interface TextToolStyle extends RichTextStyle {
	fontSize?: number;
	bold?: boolean;
	italic?: boolean;
	fontFamily?: string;
	boxPadding?: number;
	boxPaddingVert?: number;
	boxPaddingHorz?: number;
	lineSpacing?: number;
}
declare const textNote: OverlayTemplate<TextToolExtendData>;
/**
 * Chart version
 * @return {string}
 */
export declare function version(): string;
/**
 * Init chart instance
 * @param ds
 * @param options
 * @returns {Chart}
 */
export declare function init(ds: HTMLElement | string, options?: Options): Nullable<Chart>;
/**
 * Destroy chart instance
 * @param dcs
 */
export declare function dispose(dcs: HTMLElement | Chart | string): void;
export declare const utils: {
	clone: typeof clone;
	merge: typeof merge;
	isString: typeof isString;
	isNumber: typeof isNumber;
	isValid: typeof isValid;
	isObject: typeof isObject;
	isArray: typeof isArray;
	isFunction: typeof isFunction;
	isBoolean: typeof isBoolean;
	formatValue: typeof formatValue;
	formatPrecision: typeof formatPrecision;
	formatBigNumber: typeof formatBigNumber;
	formatDate: typeof formatTimestampByTemplate;
	formatThousands: typeof formatThousands;
	formatFoldDecimal: typeof formatFoldDecimal;
	calcTextWidth: typeof calcTextWidth;
	getLinearSlopeIntercept: typeof getLinearSlopeIntercept;
	getLinearYFromSlopeIntercept: typeof getLinearYFromSlopeIntercept;
	getLinearYFromCoordinates: typeof getLinearYFromCoordinates;
	checkCoordinateOnArc: typeof checkCoordinateOnArc;
	checkCoordinateOnCircle: typeof checkCoordinateOnCircle;
	checkCoordinateOnLine: typeof checkCoordinateOnLine;
	checkCoordinateOnPolygon: typeof checkCoordinateOnPolygon;
	checkCoordinateOnRect: typeof checkCoordinateOnRect;
	checkCoordinateOnText: typeof checkCoordinateOnText;
};

export {
	CaretPosition$1 as CaretPosition,
	LineStyle$1 as RegressionTrendLineStyle,
	VisibilityRange as RegressionVisibilityRange,
	textNote as textNoteTool,
};

export as namespace superChart;

export {};
