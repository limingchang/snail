/**
 * 测量p元素中自动换行后每行的字符数，连续数字/英文单词不断行
 */
export interface MeasuredLine {
  text: string;
  width: number;
  segments: string[];
}
const WORD_CHAR_PATTERN = /^[A-Za-z0-9.\-_]$/;

let sharedContext: CanvasRenderingContext2D | null = null;
function getContext(
  context?: CanvasRenderingContext2D
): CanvasRenderingContext2D {
  if (context) {
    return context;
  }

  if (!sharedContext) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "Canvas 2D context is not supported in the current environment."
      );
    }
    sharedContext = ctx;
  }

  return sharedContext;
}

type FontDefinition = Partial<
  Pick<
    CSSStyleDeclaration,
    "fontStyle" | "fontWeight" | "fontSize" | "fontFamily"
  >
>;
function toFontStyle(style: FontDefinition): string {
  const fontStyle = style.fontStyle ?? "normal";
  const fontWeight = style.fontWeight ?? "normal";
  const fontSize = style.fontSize ?? "15px";
  const fontFamily = style.fontFamily ?? "serif";
  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

function getLineWidthLimit(
  isFirstLine: boolean,
  width: number,
  indent: number
): number {
  const limit = isFirstLine ? width - indent : width;
  return limit > 0 ? limit : 0;
}

export interface StyledRun {
  text: string;
  style: FontDefinition;
  parentTagName: string | null;
}

function* iterateStyledRuns(
  node: Node,
  inherited: FontDefinition = {}
): Generator<StyledRun> {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\r?\n/g, "") ?? "";
    if (!text) {
      return;
    }
    const parent = node.parentNode;
    const parentTag = parent instanceof Element ? parent.tagName : null;
    yield { text, style: inherited, parentTagName: parentTag };
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;

  if (element.tagName === "BR") {
    yield { text: "\n", style: inherited, parentTagName: "BR" };
    return;
  }

  const computed = getComputedStyle(element);
  if (computed.display === "none") {
    return;
  }

  const nextStyle: FontDefinition = { ...inherited };

  if (computed.fontStyle) {
    nextStyle.fontStyle = computed.fontStyle;
  }
  if (computed.fontWeight) {
    nextStyle.fontWeight = computed.fontWeight;
  }
  if (computed.fontSize) {
    nextStyle.fontSize = computed.fontSize;
  }
  if (computed.fontFamily) {
    nextStyle.fontFamily = computed.fontFamily;
  }

  for (const child of Array.from(element.childNodes)) {
    yield* iterateStyledRuns(child, nextStyle);
  }
}

function defaultSegmentText(text: string): string[] {
  if (!text) {
    return [];
  }

  const segments: string[] = [];
  let buffer = "";

  for (const char of Array.from(text)) {
    if (WORD_CHAR_PATTERN.test(char)) {
      buffer += char;
      continue;
    }

    if (buffer) {
      segments.push(buffer);
      buffer = "";
    }
    segments.push(char);
  }

  if (buffer) {
    segments.push(buffer);
  }

  return segments;
}

function parseCssLength(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const trimmed = value.trim();

  if (trimmed.endsWith("px")) {
    const numeric = parseFloat(trimmed.slice(0, -2));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  if (trimmed.endsWith("em")) {
    const numeric = parseFloat(trimmed.slice(0, -2));
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    const base = parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
    return numeric * (Number.isFinite(base) ? base : 16);
  }

  if (trimmed.endsWith("rem")) {
    const numeric = parseFloat(trimmed.slice(0, -3));
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    const base = parseFloat(getComputedStyle(document.documentElement).fontSize || "16");
    return numeric * (Number.isFinite(base) ? base : 16);
  }

  const numeric = parseFloat(trimmed);
  return Number.isFinite(numeric) ? numeric : 0;
}

function pushLine(
  lines: MeasuredLine[],
  collectedSegments: string[],
  width: number,
  force: boolean
): void {
  if (!force && collectedSegments.length === 0) {
    return;
  }

  lines.push({
    text: collectedSegments.join(""),
    width,
    segments: [...collectedSegments],
  });
}

export interface MeasureLinesOptions {
  /**
   * Optional canvas rendering context. If omitted a shared off-screen canvas is used.
   * 可选，canvas渲染上下文。如果省略，则使用共享的屏幕外画布。
   */
  context?: CanvasRenderingContext2D;
  /**
   * Optional text segmentation strategy. Return value should keep characters in display order.
   * 可选，文本分割策略。返回值应保持字符的显示顺序。
   */
  segmentText?: (text: string) => string[];
  /**
   * Override element width in pixels.
   * 可选，元素宽度px。
   */
  width?: number;
  /**
   * Override first-line text indent in pixels.
   * 可选，第一行文本缩进值，px。
   */
  textIndent?: number;

}

export function measureParagraphLines(
  element: HTMLParagraphElement,
  options: MeasureLinesOptions = {}
): MeasuredLine[] {
  const ctx = getContext(options.context);
  const computedStyle = getComputedStyle(element);
  const widthFromStyle = parseCssLength(computedStyle.width);
  const width =
    typeof options.width === "number"
      ? options.width
      : Number.isFinite(widthFromStyle) && widthFromStyle > 0
      ? widthFromStyle
      : element.clientWidth;
  const indent =
    typeof options.textIndent === "number"
      ? options.textIndent
      : parseFloat(computedStyle.textIndent);
  console.log('indent:', indent)
  console.log('width:', width)
  const segmenter = options.segmentText ?? defaultSegmentText;

  const lines: MeasuredLine[] = [];
  let isFirstLine = true;
  let currentWidth = 0;
  let currentSegments: string[] = [];

  for (const run of iterateStyledRuns(element)) {
    if (run.text === "\n") {
      pushLine(lines, currentSegments, currentWidth, true);
      currentSegments = [];
      currentWidth = 0;
      isFirstLine = false;
      continue;
    }

    if (run.parentTagName === "P" && run.text === "  ") {
      continue;
    }

    ctx.font = toFontStyle(run.style);

    for (const segment of segmenter(run.text)) {
      if (!segment) {
        continue;
      }
      // 小数超过0.5px向上取整，小于0.5px用原始值
      const charsWidth = ctx.measureText(segment).width
      const segmentWidth =Math.max(Math.round(charsWidth),charsWidth)
      // const segmentWidth = Math.round(ctx.measureText(segment).width);
      console.log('segmentWidth:', segmentWidth,'segment:', segment)
      let limit = getLineWidthLimit(isFirstLine, width, indent);
      console.log('limitWidth:', limit)
      if (currentSegments.length && currentWidth + segmentWidth > limit) {
        pushLine(lines, currentSegments, currentWidth, false);
        currentSegments = [];
        currentWidth = 0;
        isFirstLine = false;
        limit = getLineWidthLimit(isFirstLine, width, indent);
      }

      currentSegments.push(segment);
      currentWidth += segmentWidth;

      // Keep lines tight when limit is reached exactly on the first segment.
      if (currentWidth === limit) {
        pushLine(lines, currentSegments, currentWidth, false);
        currentSegments = [];
        currentWidth = 0;
        isFirstLine = false;
      }
    }
  }
  if (currentSegments.length) {
    pushLine(lines, currentSegments, currentWidth, false);
  }

  return lines;
}
