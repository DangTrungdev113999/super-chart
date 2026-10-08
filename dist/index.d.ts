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
	pageX: number;
	pageY: number;
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
export interface Options {
	locale?: string;
	timezone?: string;
	styles?: string | DeepPartial<Styles>;
	formatter?: Partial<Formatter>;
	thousandsSeparator?: Partial<ThousandsSeparator>;
	decimalFold?: Partial<DecimalFold>;
	zoomAnchor?: ZoomAnchorType | Partial<ZoomAnchor>;
	layout?: LayoutChild[];
}
export type YAxisTemplate = AxisTemplate;
export interface YAxis extends Axis, Required<YAxisTemplate> {
	isFromZero: () => boolean;
	isInCandle: () => boolean;
	convertToNicePixel: (value: number) => number;
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
	coordinates: Coordinate[];
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
	 * Whether it is locked. When it is true, it will not respond to events
	 */
	lock: boolean;
	/**
	 * Whether the overlay is a ghost (mirror of an overlay being drawn on
	 * another chart). Ghosts render in the normal overlay list even while
	 * incomplete, never occupy the drawing-progress slot, and are locked.
	 */
	ghost: boolean;
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
export type OverlayCreate<E = unknown> = ExcludePickPartial<Omit<Overlay<E>, "currentStep" | "totalStep" | "createPointFigures" | "createXAxisFigures" | "createYAxisFigures" | "performEventPressedMove" | "performEventMoveForDrawing" | "isDrawing" | "isStart" | "forceComplete" | "invalidateFigures" | "figuresRev">, "name">;
export type OverlayOverride<E = unknown> = Partial<Omit<Overlay<E>, "currentStep" | "totalStep" | "createPointFigures" | "createXAxisFigures" | "createYAxisFigures" | "performEventPressedMove" | "performEventMoveForDrawing" | "isDrawing" | "isStart" | "forceComplete" | "invalidateFigures" | "figuresRev">>;
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
	 * Extra signature material — include anything the template reads that is
	 * NOT covered by coordinates/figuresRev/selection (e.g. derived style
	 * flags computed outside override()).
	 */
	extraKey?: (params: OverlayCreateFiguresCallbackParams<E>) => string;
}
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
	LineStyle$1 as RegressionTrendLineStyle,
	VisibilityRange as RegressionVisibilityRange,
};

export as namespace superChart;

export {};
