/**
 * `SWordCloud` / `SWordTag` 的公开类型定义。
 *
 * 旧的词云把 props 内联书写，点击事件没有对应的载荷类型（它根本没有事件），
 * 而标签组件自身的 props 又把内部的 `coefficient` / `count` 记账字段泄漏到公开
 * 接口；这里把这些都收敛成显式类型。
 *
 * Public types for `SWordCloud` / `SWordTag`.
 *
 * The legacy word cloud typed its props inline, exported no payload type for the
 * click event (it had none) and let the tag component's own props leak the internal
 * `coefficient`/`count` bookkeeping into its public surface.
 */

/**
 * 使用方书写一个词的方式：纯字符串，或带附加信息的对象。
 *
 * A word as the caller writes it: a bare string, or an object with extras.
 */
export type WordCloudWordInput = string | WordCloudWordObject;

/**
 * 词的「对象」写法。
 *
 * The object form of a word.
 */
export interface WordCloudWordObject {
  /**
   * 标签上渲染的文本。
   *
   * The text rendered on the tag.
   */
  text: string;
  /**
   * 相对重要程度。任意正数量级都可以（`12` 和 `1200` 等价）；该值会在整朵云里
   * 参与排名，所以直接传原始词频也没问题。默认值为 `1`。
   *
   * Relative importance. Any positive scale works (`12` and `1200` are equally
   * valid); the value is ranked across the cloud, so raw frequencies are fine.
   * Defaults to `1`.
   */
  weight?: number;
  /**
   * 固定该词的颜色，覆盖 `colors` 与内置调色板。
   *
   * Pins this word's colour, overriding both `colors` and the built-in palette.
   */
  color?: string;
}

/**
 * 归一化之后的词：序号、`0…1` 的权重，以及可选颜色。
 *
 * A word after normalisation: index, a `0…1` weight and an optional colour.
 */
export interface WordCloudWord {
  /**
   * 标签上渲染的文本。
   *
   * The text rendered on the tag.
   */
  text: string;
  /**
   * 权重按排名在整朵云内归一化到 `0…1`（最轻的词为 `0`）。
   *
   * Weight normalised to `0…1` by rank across the cloud (the lightest word is `0`).
   */
  weight: number;
  /**
   * 使用方传入的颜色（如果有）。
   *
   * Caller-supplied colour, if any.
   */
  color?: string;
  /**
   * 在输入数组中的位置，同时也是确定颜色的索引。
   *
   * Position in the input array; also the deterministic colour index.
   */
  index: number;
}

/**
 * 字号范围 `[min, max]`，单位为像素。两个值会被排序，所以顺序无所谓。
 *
 * `[min, max]` font size in pixels. The pair is sorted, so order does not matter.
 */
export type WordCloudFontSizeRange = readonly [number, number];

/**
 * `SWordCloud` 接受的 props。
 *
 * Props accepted by `SWordCloud`.
 */
export interface WordCloudProps {
  /**
   * 要渲染的词列表。
   *
   * The words to render.
   */
  words?: readonly WordCloudWordInput[];

  /**
   * `words` 的已废弃别名，保留它只是为了让旧的调用方式仍能通过编译。两者同时
   * 提供时 `words` 优先，并在开发环境打印一条警告。
   *
   * Deprecated alias for `words`, kept so the legacy call shape still compiles.
   * `words` wins when both are supplied; a development warning is logged.
   */
  hotWords?: readonly string[];

  /**
   * 球体半径，单位为像素。
   *
   * 省略该 prop 时，词云会填满父元素宽度，并据此推导半径
   * （`aspect-ratio: 1`）；这正是大多数布局想要的。旧组件则强制要求
   * 该 prop，并渲染一个 `2 * radius` 的方框。
   *
   * Radius of the sphere in pixels.
   *
   * When omitted the cloud fills its parent's width and derives the radius from it
   * (`aspect-ratio: 1`), which is what most layouts want. The legacy component
   * required the prop and rendered a `2 * radius` box.
   */
  radius?: number;

  /**
   * `scale === 1` 时的字号，单位为像素。默认为 `16`。
   *
   * Font size at `scale === 1`, in pixels. Defaults to `16`.
   */
  baseFontSize?: number;

  /**
   * 在 `baseFontSize` 与景深缩放之后，再对每帧字号做钳制。
   *
   * Clamps the per-frame font size, after `baseFontSize` and the depth scale.
   */
  fontSizeRange?: WordCloudFontSizeRange;

  /**
   * 旋转速度，档位为 `1…10`，数值越大越快；超出范围会被钳制。默认值为 `5`。
   *
   * Rotation speed on a `1…10` scale; higher is faster. Values outside the range are
   * clamped. Defaults to `5`.
   */
  speed?: number;

  /**
   * 在词之间循环使用的调色板；缺省时回退到主题的状态色。
   *
   * Palette cycled across the words. Falls back to the theme's status colours.
   */
  colors?: readonly string[];

  /**
   * 指针悬停在词云上时暂停。默认为 `true`。
   *
   * Pause while the pointer is over the cloud. Defaults to `true`.
   */
  pauseOnHover?: boolean;
}

/**
 * `wordClick` 事件的载荷。
 *
 * Payload of the `wordClick` event.
 */
export interface WordCloudClickPayload {
  /**
   * 被点击词条的文本。
   *
   * Text of the clicked word.
   */
  text: string;
  /**
   * 它在解析后的词列表中的索引。
   *
   * Its index in the resolved word list.
   */
  index: number;
  /**
   * 它归一化后的 `0…1` 权重。
   *
   * Its normalised `0…1` weight.
   */
  weight: number;
  /**
   * 原生点击事件。
   *
   * The native click event.
   */
  event: MouseEvent;
}

/**
 * `SWordCloud` 抛出的事件。
 *
 * Events emitted by `SWordCloud`.
 */
export interface WordCloudEmits {
  /**
   * 某个词条被点击。
   *
   * A tag was clicked.
   */
  wordClick: [payload: WordCloudClickPayload];
}

/**
 * 单个标签在一帧内的计算结果，由 `SWordTag` 写入 DOM。
 *
 * A single computed frame for one tag, applied to the DOM by `SWordTag`.
 */
export interface WordTagFrame {
  /**
   * X 轴的绝对平移量，位于词云的本地像素空间。
   *
   * Absolute translate on the X axis, in the cloud's local pixel space.
   */
  translateX: number;
  /**
   * Y 轴的绝对平移量，位于词云的本地像素空间。
   *
   * Absolute translate on the Y axis, in the cloud's local pixel space.
   */
  translateY: number;
  /**
   * 景深提示量，取值 `0…1`。
   *
   * `0…1`, derived from depth.
   */
  opacity: number;
  /**
   * 最终字号，单位为像素，已经过景深缩放与钳制。
   *
   * Final font size in pixels, already depth-scaled and clamped.
   */
  fontSize: number;
  /**
   * 堆叠顺序；越远的标签越靠后。
   *
   * Stacking order; farther tags sit behind nearer ones.
   */
  zIndex: number;
  /**
   * 渲染字形的字重，由同一个景深缩放推导得到。
   *
   * Weight of the rendered glyphs, derived from the same depth scale.
   */
  fontWeight: number;
}

/**
 * `SWordTag` 对外暴露的命令式句柄。
 *
 * 词云把这些句柄保存在一个普通（非响应式）数组里并直接驱动它们；如果改用响应式
 * prop 传递每帧更新，就会为那些模板从不读取的值，让每个标签每帧都触发一次组件
 * 重渲染。
 *
 * Imperative handle exposed by `SWordTag`.
 *
 * The cloud keeps these handles in a plain (non-reactive) array and drives them
 * directly. Routing a per-frame update through reactive props instead would schedule
 * one component re-render per tag per frame for values that are never read by the
 * template.
 */
export interface WordTagHandle {
  /**
   * 把一帧计算结果应用到标签元素上。
   *
   * Apply one computed frame to the tag's element.
   */
  place: (frame: WordTagFrame) => void;
  /**
   * 当前渲染尺寸，单位为像素，在基准字号下测量。
   *
   * Current rendered size in pixels, at the base font size.
   */
  measure: () => { width: number; height: number };
  /**
   * 清除内联字号，让标签按继承的基准字号测量。
   *
   * Drop the inline font size so the tag measures at the inherited base size.
   */
  reset: () => void;
  /**
   * 标签元素；挂载前为 `null`。
   *
   * The tag element, or `null` before mount.
   */
  readonly element: HTMLElement | null;
}

/**
 * `SWordCloud` 对外暴露的命令式句柄。
 *
 * Imperative handle exposed by `SWordCloud`.
 */
export interface WordCloudExposed {
  /**
   * 启动（或恢复）旋转循环。
   *
   * Start (or resume) the rotation loop.
   */
  start: () => void;
  /**
   * 停止循环，标签停在原地。
   *
   * Stop the loop, leaving the tags where they are.
   */
  stop: () => void;
  /**
   * 循环当前是否已排程。
   *
   * Whether the loop is currently scheduled.
   */
  readonly isRunning: boolean;
}
