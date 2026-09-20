/**
 * The word cloud's pure model.
 *
 * `src/wordCloud/model.ts` has no Vue, no DOM and no timers, so the parts of the cloud
 * that were actually broken can be tested exactly here — while the parts that need real
 * layout (measuring a tag, the rotation loop) are not testable in this environment at
 * all and are deliberately not faked.
 *
 * The rotation tests are the important ones: the legacy loop rotated a *position*
 * vector, fed the already-mutated `z` into the second rotation and never renormalised,
 * so tags slowly left the sphere and `scale = D / (D - z)` diverged.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORD_CLOUD_PALETTE,
  clamp,
  normaliseWords,
  projectDirection,
  resolveFontSize,
  resolveWordColor,
  rotateDirection,
  seededUnit,
  sphereCoefficient,
  sphereDirection,
  sphereTheta,
  withNormalisedWeights
} from "../../src/wordCloud/model";

describe("sphere coefficients", () => {
  it("spreads evenly over (-1, 1)", () => {
    const count = 5;
    const coefficients = Array.from({ length: count }, (_, index) =>
      sphereCoefficient(index, count)
    );

    // Rounded because `(2(i + 1) - 1) / n - 1` is a chain of divisions: 1/5 - 1 is not
    // bit-identical to the literal -0.8, and the assertion is about the layout, not
    // about the last bit of a double.
    expect(coefficients.map((value) => Number(value.toFixed(6)))).toEqual([
      -0.8, -0.4, 0, 0.4, 0.8
    ]);
  });

  it("is strictly increasing in the index", () => {
    const count = 12;
    const coefficients = Array.from({ length: count }, (_, index) =>
      sphereCoefficient(index, count)
    );

    for (let index = 1; index < coefficients.length; index += 1) {
      expect(coefficients[index]).toBeGreaterThan(coefficients[index - 1]);
    }
    expect(coefficients[0]).toBeCloseTo(-1 + 1 / count);
    expect(coefficients[count - 1]).toBeCloseTo(1 - 1 / count);
  });

  it("returns a usable coefficient for an empty cloud", () => {
    expect(sphereCoefficient(0, 0)).toBe(0);
    expect(sphereTheta(0)).toBeCloseTo(Math.PI / 2);
  });

  it("clamps an out-of-range coefficient before acos", () => {
    expect(sphereTheta(4)).toBe(0);
    expect(sphereTheta(-4)).toBeCloseTo(Math.PI);
  });
});

describe("sphereDirection", () => {
  it("is a unit vector for every word", () => {
    const count = 24;
    for (let index = 0; index < count; index += 1) {
      const direction = sphereDirection(sphereCoefficient(index, count), count);
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 12);
    }
  });
});

describe("rotateDirection", () => {
  it("stays on the sphere over thousands of steps", () => {
    let direction = sphereDirection(sphereCoefficient(3, 40), 40);

    for (let step = 0; step < 5_000; step += 1) {
      direction = rotateDirection(direction, 0.013, -0.007);
    }

    expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1, 12);
  });

  it("rotates about X and then Y, reading the original components", () => {
    const angleX = 0.4;
    const angleY = -0.9;
    const start = { x: 0.2, y: -0.3, z: 0.5 };
    const length = Math.hypot(start.x, start.y, start.z);

    // The hand-computed value: y and z rotate first, then x and the *new* z rotate
    // about Y. Reusing a mutated `z` for the second axis is what the legacy loop did.
    const y1 = start.y * Math.cos(angleX) - start.z * Math.sin(angleX);
    const z1 = start.z * Math.cos(angleX) + start.y * Math.sin(angleX);
    const x2 = start.x * Math.cos(angleY) - z1 * Math.sin(angleY);
    const z2 = z1 * Math.cos(angleY) + start.x * Math.sin(angleY);

    const result = rotateDirection(start, angleX, angleY);

    expect(result.x).toBeCloseTo(x2 / length, 12);
    expect(result.y).toBeCloseTo(y1 / length, 12);
    expect(result.z).toBeCloseTo(z2 / length, 12);
  });

  it("renormalises a direction that is not unit length", () => {
    const result = rotateDirection({ x: 0, y: 0, z: 10 }, 0, 0);

    expect(Math.hypot(result.x, result.y, result.z)).toBeCloseTo(1, 12);
  });

  it("is degenerate-safe at the origin", () => {
    expect(rotateDirection({ x: 0, y: 0, z: 0 }, 0.3, 0.4)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("projectDirection", () => {
  it("keeps scale and opacity inside their documented ranges", () => {
    const radius = 120;
    for (let index = 0; index < 40; index += 1) {
      const projection = projectDirection(sphereDirection(sphereCoefficient(index, 40), 40), radius);

      expect(projection.scale).toBeGreaterThanOrEqual(2 / 3 - 1e-9);
      expect(projection.scale).toBeLessThanOrEqual(2 + 1e-9);
      // The legacy opacity reached 1.05 and was clamped by the browser, flattening the
      // depth cue across the whole near half of the cloud.
      expect(projection.opacity).toBeGreaterThanOrEqual(0);
      expect(projection.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("scales the near pole up and the far pole down", () => {
    const radius = 100;
    const near = projectDirection({ x: 0, y: 0, z: 1 }, radius);
    const far = projectDirection({ x: 0, y: 0, z: -1 }, radius);

    expect(near.scale).toBeCloseTo(2);
    expect(near.opacity).toBeCloseTo(1);
    expect(far.scale).toBeCloseTo(2 / 3);
    expect(far.opacity).toBeCloseTo(0.2);
  });

  it("degrades gracefully for a zero radius", () => {
    expect(projectDirection({ x: 0, y: 0, z: 1 }, 0)).toMatchObject({ scale: 1, opacity: 1 });
  });
});

describe("normaliseWords / withNormalisedWeights", () => {
  it("expands strings and objects into word records", () => {
    const words = normaliseWords(["a", { text: "b", weight: 9, color: "#fff" }]);

    expect(words).toEqual([
      { text: "a", weight: 1, index: 0 },
      { text: "b", weight: 9, color: "#fff", index: 1 }
    ]);
  });

  it("treats a non-finite weight as the default", () => {
    expect(normaliseWords([{ text: "a", weight: Number.NaN }])[0].weight).toBe(1);
    expect(normaliseWords([{ text: "a", weight: Number.POSITIVE_INFINITY }])[0].weight).toBe(1);
  });

  it("handles missing input", () => {
    expect(normaliseWords(undefined)).toEqual([]);
    expect(normaliseWords([])).toEqual([]);
  });

  it("ranks weights into 0…1", () => {
    const words = withNormalisedWeights(normaliseWords([
      { text: "low", weight: 1 },
      { text: "mid", weight: 50 },
      { text: "high", weight: 4000 }
    ]));

    expect(words.map((word) => word.weight)).toEqual([0, 0.5, 1]);
  });

  it("gives equal weights the top of the range rather than dividing by zero", () => {
    const words = withNormalisedWeights(normaliseWords(["a", "b", "c"]));
    expect(words.map((word) => word.weight)).toEqual([1, 1, 1]);
  });

  it("keeps an empty cloud empty", () => {
    expect(withNormalisedWeights([])).toEqual([]);
  });
});

describe("resolveWordColor", () => {
  it("is deterministic per index and cycles the palette", () => {
    const first = resolveWordColor(0);
    const repeated = resolveWordColor(0);
    const next = resolveWordColor(DEFAULT_WORD_CLOUD_PALETTE.length);

    expect(first).toBe(repeated);
    expect(next).toBe(first);
    expect(resolveWordColor(1)).toBe(DEFAULT_WORD_CLOUD_PALETTE[1]);
  });

  it("lets an explicit colour win over the palette", () => {
    expect(resolveWordColor(3, "#123456", ["#ffffff"])).toBe("#123456");
  });

  it("uses a caller palette when one is given", () => {
    expect(resolveWordColor(1, undefined, ["#a", "#b"])).toBe("#b");
    expect(resolveWordColor(3, undefined, ["#a", "#b"])).toBe("#b");
  });

  it("is safe for an empty caller palette and a negative index", () => {
    expect(resolveWordColor(0, undefined, [])).toBe(DEFAULT_WORD_CLOUD_PALETTE[0]);
    expect(resolveWordColor(-1, undefined, ["#a", "#b"])).toBe("#b");
  });
});

describe("resolveFontSize", () => {
  it("honours the base font size", () => {
    // The legacy tag sampled `12px` from an unmounted ref and ignored `baseFontSize`
    // entirely, so the prop never reached the DOM.
    expect(resolveFontSize(20, 1, 1)).toBeCloseTo(25);
    expect(resolveFontSize(10, 1, 1)).toBeCloseTo(12.5);
  });

  it("nudges by weight without competing with the depth scale", () => {
    expect(resolveFontSize(16, 1, 0)).toBeCloseTo(12);
    expect(resolveFontSize(16, 1, 1)).toBeCloseTo(20);
  });

  it("clamps to the range, whichever order it was given in", () => {
    expect(resolveFontSize(16, 2, 1, [14, 18])).toBe(18);
    expect(resolveFontSize(16, 0.5, 0, [18, 14])).toBe(14);
  });

  it("never returns a non-positive size", () => {
    expect(resolveFontSize(0, 2, 1)).toBeGreaterThan(0);
    expect(resolveFontSize(16, 0, 0, [0, 0])).toBeGreaterThan(0);
  });
});

describe("seededUnit", () => {
  it("is deterministic and inside [0, 1)", () => {
    for (let index = 0; index < 50; index += 1) {
      const value = seededUnit(index, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(seededUnit(index, 3)).toBe(value);
    }
  });

  it("differs between indices and between salts", () => {
    expect(seededUnit(0, 0)).not.toBe(seededUnit(1, 0));
    expect(seededUnit(0, 0)).not.toBe(seededUnit(0, 1));
  });
});

describe("clamp", () => {
  it("clamps, swaps a reversed range and survives NaN", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(5, 3, 0)).toBe(3);
    expect(clamp(Number.NaN, 1, 3)).toBe(1);
  });
});
