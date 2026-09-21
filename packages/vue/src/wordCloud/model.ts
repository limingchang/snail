/**
 * `SWordCloud` 背后的纯模型：词的归一化、权重、颜色、均匀球面系数，以及旋转
 * 数学。
 *
 * 这个文件里的所有内容都刻意不依赖 Vue、DOM 和定时器，因此可以在普通 Node
 * 进程里做单元测试 —— 这也是本包测试套件唯一具备的环境，而且是有意为之
 * （见 `vitest.config.ts`：这里真正重要的 DOM 行为需要真实布局，jsdom 并不
 * 实现它）。
 *
 * The pure model behind `SWordCloud`: word normalisation, weights, colours, the
 * uniform-sphere coefficients and the rotation maths.
 *
 * Everything in this file is deliberately free of Vue, DOM and timers so it can be
 * unit-tested in a plain Node process — which is the only environment this package's
 * test suite has, on purpose (see `vitest.config.ts`: the DOM behaviour that matters
 * here needs real layout, and jsdom does not implement it).
 *
 * ## The look that had to be preserved
 *
 * The cloud is the legacy package's one original visual. Words are distributed over a
 * *uniform sphere* by taking `coefficient = (2(i + 1) - 1) / n - 1` per word, turning
 * it into a polar angle (`theta = acos(coefficient)`) and an azimuth spread over a
 * golden-angle-like `theta * sqrt(n * PI)`, then projecting with `scale = D / (D - z)`.
 * Those formulae are reproduced exactly; only the *motion* around that sphere changed.
 */

import type { WordCloudFontSizeRange, WordCloudWord, WordCloudWordInput } from "./type";

/**
 * 词云三维空间中的一个点或方向。
 *
 * A point or direction in the cloud's 3D space.
 */
export interface SphereVector {
  /** X 分量。 / X component. */
  x: number;
  /** Y 分量。 / Y component. */
  y: number;
  /** Z 分量。 / Z component. */
  z: number;
}

/**
 * 一个标签投影后，单帧产生的结果。
 *
 * What the projection of one tag produces for a single frame.
 */
export interface SphereProjection {
  /**
   * 投影后的 X 坐标，相对于球心的本地像素空间。
   *
   * Projected X in local pixel space, relative to the sphere centre.
   */
  x: number;
  /**
   * 投影后的 Y 坐标，相对于球心的本地像素空间。
   *
   * Projected Y in local pixel space, relative to the sphere centre.
   */
  y: number;
  /**
   * 景深；`-radius` 最远，`+radius` 最近。
   *
   * Depth; `-radius` is farthest, `+radius` nearest.
   */
  z: number;
  /**
   * `D / (D - z)` —— 经典的透视缩放系数。
   *
   * `D / (D - z)` — the classic perspective scale.
   */
  scale: number;
  /**
   * 景深提示量，取值 `0…1`。
   *
   * `0…1` depth cue.
   */
  opacity: number;
}

/**
 * 使用方没有传入 `colors` 时使用的循环色板。
 *
 * 这里放的是 Element Plus 的 token 引用，而不是字面颜色，因此词云无需重新
 * 构建就能跟随应用的换肤。旧色板把主色列了两次，只是让某个品牌色出现的概率
 * 翻倍。
 *
 * Cycle used when the caller supplies no `colors`.
 *
 * Element Plus token *references* rather than literal colours, so the cloud follows
 * an application's theme without a rebuild. The legacy palette listed its primary
 * colour twice, which only made one brand colour twice as likely.
 */
export const DEFAULT_WORD_CLOUD_PALETTE: readonly string[] = [
  "var(--s-color-primary)",
  "var(--s-color-success)",
  "var(--s-color-info)",
  "var(--s-color-warning)",
  "var(--s-color-danger)"
];

/**
 * 把 `value` 钳制到 `[min, max]`；`NaN` 会变成 `min`。
 *
 * Clamp `value` into `[min, max]`; `NaN` becomes `min`.
 */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (min > max) return clamp(value, max, min);
  return value < min ? min : value > max ? max : value;
}

/**
 * 第 `index` 个词（共 `count` 个）在均匀球面上的系数。
 *
 * 与旧实现逐字节一致：它把 `count` 个取值均匀铺在 `(-1, 1)` 上，每个词一个。
 *
 * The uniform-sphere coefficient for word `index` of `count`.
 *
 * Reproduced from the legacy implementation byte for byte: it spreads `count` values
 * evenly over `(-1, 1)`, one per word.
 */
export function sphereCoefficient(index: number, count: number): number {
  if (count <= 0) return 0;
  return (2 * (index + 1) - 1) / count - 1;
}

/**
 * 系数的极角：`theta = acos(coefficient)`。
 *
 * Polar angle of a coefficient: `theta = acos(coefficient)`.
 */
export function sphereTheta(coefficient: number): number {
  return Math.acos(clamp(coefficient, -1, 1));
}

/**
 * 一条带的方位角：`psi = theta * sqrt(count * PI)`。
 *
 * Azimuth of a band: `psi = theta * sqrt(count * PI)`.
 */
export function spherePsi(theta: number, count: number): number {
  return theta * Math.sqrt(Math.max(count, 0) * Math.PI);
}

/**
 * 一个词在球面上的单位长度方向。
 *
 * 词云动画的是*方向*，绘制时才乘以半径，而不是直接动画位置。这正是真正的修复
 * 点：旧循环旋转位置向量，把已被改写的 `z` 用于下一个轴，且从不重新归一化，
 * 于是 `|v|` 每个 tick 都偏离半径一点，直到 `z` 逼近直径时
 * `scale = D / (D - z)` 爆炸，标签被甩出方框。
 *
 * Unit-length direction of a word on the sphere.
 *
 * The cloud animates *directions* and multiplies by the radius when painting, rather
 * than animating positions. That is the actual bug fix: the legacy loop rotated the
 * position vector, reused the already-mutated `z` for the next axis, and never
 * renormalised, so `|v|` crept away from the radius every tick until `scale =
 * D / (D - z)` blew up as `z` approached the diameter and the tag flew off the box.
 */
export function sphereDirection(coefficient: number, count: number): SphereVector {
  const theta = sphereTheta(coefficient);
  const psi = spherePsi(theta, count);
  const sinTheta = Math.sin(theta);
  return {
    x: Math.cos(psi) * sinTheta,
    y: Math.sin(psi) * sinTheta,
    z: Math.cos(theta)
  };
}

/**
 * 先把方向绕 X 轴旋转，再绕 Y 轴旋转。
 *
 * 两个轴都作用在*原始*分量上：旧代码先写 `z`，下一行又把它读回来。结果会重新
 * 归一化，因为旋转只在精确算术下保持长度不变，而这个函数在组件存活期间每秒
 * 要被调用六十次。
 *
 * Rotate a direction about X and then about Y.
 *
 * Both axes are applied to the *original* components: the legacy code wrote `z` and
 * then read it back on the next line. The result is renormalised because rotation
 * preserves length only in exact arithmetic, and this is called sixty times a second
 * for the lifetime of the component.
 */
export function rotateDirection(direction: SphereVector, angleX: number, angleY: number): SphereVector {
  const cosX = Math.cos(angleX);
  const sinX = Math.sin(angleX);
  const y1 = direction.y * cosX - direction.z * sinX;
  const z1 = direction.z * cosX + direction.y * sinX;

  const cosY = Math.cos(angleY);
  const sinY = Math.sin(angleY);
  const x2 = direction.x * cosY - z1 * sinY;
  const z2 = z1 * cosY + direction.x * sinY;

  const length = Math.hypot(x2, y1, z2);
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return { x: x2 / length, y: y1 / length, z: z2 / length };
}

/**
 * 把单位方向投影到词云的 `2 * radius` 方框上。
 *
 * Project a unit direction onto the cloud's `2 * radius` box.
 */
export function projectDirection(direction: SphereVector, radius: number): SphereProjection {
  const x = direction.x * radius;
  const y = direction.y * radius;
  const z = direction.z * radius;
  const diameter = radius * 2;
  const depth = diameter - z;

  // `z` is bounded by `[-radius, radius]`, so `depth` is bounded by
  // `[radius, 3 * radius]` and the scale never leaves `[2/3, 2]` — as long as the
  // direction stayed unit length, which `rotateDirection` guarantees.
  const scale = depth === 0 ? 1 : diameter / depth;

  // The legacy opacity was `(z + radius) / 2 * radius + 0.05`, which reaches 1.05 at
  // the front. Values above 1 are clamped by the browser, so the near half of the
  // cloud all rendered at the same opacity and the depth cue was lost.
  const opacity = radius <= 0 ? 1 : clamp(0.2 + 0.8 * ((z + radius) / (radius * 2)), 0, 1);

  return { x, y, z, scale: clamp(scale, 0.5, 2.5), opacity };
}

/**
 * 把使用方输入归一化成词记录。
 *
 * 纯字符串就是一个使用默认权重的词；对象写法可以带权重和可选颜色。
 *
 * Normalise caller input into word records.
 *
 * A bare string is a word with the default weight; the object form carries a weight
 * and an optional colour.
 */
export function normaliseWords(input: readonly WordCloudWordInput[] | undefined): WordCloudWord[] {
  if (!input || input.length === 0) return [];
  return input.map((entry, index) => {
    if (typeof entry === "string") return { text: entry, weight: 1, index };
    const weight = typeof entry.weight === "number" && Number.isFinite(entry.weight) ? entry.weight : 1;
    return { text: entry.text, weight, color: entry.color, index };
  });
}

/**
 * 把原始权重替换成它在整朵云中的排名，并归一化到 `0…1`。
 *
 * 用排名而不是 min/max 缩放：真实的词频有很长的长尾，min/max 缩放会把除最大
 * 那个词以外的所有词都压到尺寸区间最底部的一小段里。权重全部相等时统一取 `1`
 * （区间顶端），而不是除以零。
 *
 * Replace raw weights with their rank across the cloud, normalised to `0…1`.
 *
 * Rank rather than min/max scaling: real word frequencies have a long tail, and a
 * min/max scale would squash every word but the single biggest one into the bottom
 * few percent of the size range. Equal weights all become `1` (the top of the range)
 * rather than dividing by zero.
 */
export function withNormalisedWeights(words: readonly WordCloudWord[]): WordCloudWord[] {
  if (words.length === 0) return [];
  const distinct = Array.from(new Set(words.map((word) => word.weight))).sort((a, b) => a - b);
  if (distinct.length < 2) return words.map((word) => ({ ...word, weight: 1 }));

  const ranks = new Map<number, number>();
  distinct.forEach((value, rank) => ranks.set(value, rank / (distinct.length - 1)));
  return words.map((word) => ({ ...word, weight: ranks.get(word.weight) ?? 1 }));
}

/**
 * 一个词的颜色。
 *
 * 由词的索引确定，是确定性的：旧的 `randomColor()` 是在渲染函数内部调用的，
 * 所以每次重渲染（悬停、尺寸变化、父组件一次无关更新）都会把整朵云的颜色
 * 重新洗牌。
 *
 * The colour for one word.
 *
 * Deterministic, from the word's index: the legacy `randomColor()` was called from
 * inside the render function, so every re-render — a hover, a resize, an unrelated
 * parent update — reshuffled the entire cloud's colours.
 */
export function resolveWordColor(
  index: number,
  explicit?: string,
  colors?: readonly string[]
): string {
  if (explicit) return explicit;
  const palette = colors && colors.length > 0 ? colors : DEFAULT_WORD_CLOUD_PALETTE;
  const slot = ((index % palette.length) + palette.length) % palette.length;
  return palette[slot];
}

/**
 * 一个标签的字号：基准字号、景深缩放、权重因子，最后做使用方指定的钳制。
 *
 * 旧组件从模板 ref（尚未挂载）上取到一个 `12px` 默认值，然后按标签覆盖它，
 * 所以 `baseFontSize` 实际上从未到达 DOM。
 *
 * Font size for one tag: base size, depth scale, weight factor, then the caller's
 * clamp.
 *
 * The legacy component sampled a `12px` default from an unmounted template ref and
 * then overrode it per tag, so `baseFontSize` never actually reached the DOM.
 */
export function resolveFontSize(
  baseFontSize: number,
  scale: number,
  weight: number,
  range?: WordCloudFontSizeRange
): number {
  // `weight` is `0…1`; the factor spans `0.75…1.25` so weight is a nudge, not a
  // second scale competing with depth.
  const raw = baseFontSize * scale * (0.75 + 0.5 * clamp(weight, 0, 1));
  if (!range) return Math.max(raw, 1);
  const min = Math.min(range[0], range[1]);
  const max = Math.max(range[0], range[1]);
  return clamp(raw, Math.max(min, 1), Math.max(max, 1));
}

/**
 * 由 `(index, salt)` 得到确定性的 `[0, 1)` 值。
 *
 * 用于每个标签的角速度。挂载时若调用 `Math.random()`，每次渲染的运动都会不同；
 * 用哈希则稳定，且无需引入带种子的 PRNG 实例。
 *
 * A deterministic `[0, 1)` value for `(index, salt)`.
 *
 * Used for the per-tag angular velocities. `Math.random()` at mount made the motion
 * different on every render; a hash keeps it stable without a seeded PRNG instance.
 */
export function seededUnit(index: number, salt = 0): number {
  let hash = Math.imul(index + 1, 0x9e3779b1) + Math.imul(salt + 1, 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
  hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 0x100000000;
}
