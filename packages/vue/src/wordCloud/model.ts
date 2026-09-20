/**
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

/** A point or direction in the cloud's 3D space. */
export interface SphereVector {
  x: number;
  y: number;
  z: number;
}

/** What the projection of one tag produces for a single frame. */
export interface SphereProjection {
  /** Projected X in local pixel space, relative to the sphere centre. */
  x: number;
  /** Projected Y in local pixel space, relative to the sphere centre. */
  y: number;
  /** Depth; `-radius` is farthest, `+radius` nearest. */
  z: number;
  /** `D / (D - z)` — the classic perspective scale. */
  scale: number;
  /** `0…1` depth cue. */
  opacity: number;
}

/**
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

/** Clamp `value` into `[min, max]`; `NaN` becomes `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (min > max) return clamp(value, max, min);
  return value < min ? min : value > max ? max : value;
}

/**
 * The uniform-sphere coefficient for word `index` of `count`.
 *
 * Reproduced from the legacy implementation byte for byte: it spreads `count` values
 * evenly over `(-1, 1)`, one per word.
 */
export function sphereCoefficient(index: number, count: number): number {
  if (count <= 0) return 0;
  return (2 * (index + 1) - 1) / count - 1;
}

/** Polar angle of a coefficient: `theta = acos(coefficient)`. */
export function sphereTheta(coefficient: number): number {
  return Math.acos(clamp(coefficient, -1, 1));
}

/** Azimuth of a band: `psi = theta * sqrt(count * PI)`. */
export function spherePsi(theta: number, count: number): number {
  return theta * Math.sqrt(Math.max(count, 0) * Math.PI);
}

/**
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

/** Project a unit direction onto the cloud's `2 * radius` box. */
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
