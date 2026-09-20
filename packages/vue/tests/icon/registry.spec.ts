/**
 * Guards the generated icon registry.
 *
 * ## Why this test reads the source instead of importing it
 *
 * `src/icon/icons/index.ts` imports 70 `.vue` files. The test project is a plain Node
 * environment with no Vue plugin in `vitest.config.ts` (deliberately: the DOM
 * behaviour worth testing needs real layout, which jsdom does not implement), so
 * importing the barrel would fail at transform time on the first `.vue` file.
 *
 * That constraint happens to line up with what is worth asserting. The barrel is
 * *generated* (`node ./scripts/generate-icons.mjs`) and says so in its header, so the
 * valuable invariants are structural: the barrel is in sync with the `.vue` files on
 * disk, has no duplicates, and matches the map the plugin registers from. A
 * hand-edited or half-regenerated barrel breaks this test; the runtime object it would
 * produce is exactly the thing the structure determines.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testsDir = dirname(fileURLToPath(import.meta.url));
const iconDir = join(testsDir, "..", "..", "src", "icon");
const iconsDir = join(iconDir, "icons");

const barrelSource = readFileSync(join(iconsDir, "index.ts"), "utf8");
const iconBarrelSource = readFileSync(join(iconDir, "index.ts"), "utf8");

/**
 * Slice the body of the first `marker … terminator` block after `marker`.
 *
 * The terminator is a parameter because the generated barrel closes its two blocks
 * differently: the named export list ends with `};` while the registry ends with
 * `} as const;`.
 */
function blockAfter(source: string, marker: string, terminator = "};"): string {
  const start = source.indexOf(marker);
  expect(start, `expected to find ${marker}`).toBeGreaterThan(-1);
  const end = source.indexOf(terminator, start);
  expect(end, `expected ${terminator} after ${marker}`).toBeGreaterThan(start);
  return source.slice(start + marker.length, end);
}

/** Every `Icon*` identifier in a block, in order. */
function iconIdentifiers(block: string): string[] {
  return block.match(/\bIcon[A-Za-z0-9_]*\b/g) ?? [];
}

const imported = Array.from(
  barrelSource.matchAll(/^import (\w+) from "\.\/(\w+)\.vue";$/gm),
  (match) => ({ local: match[1], file: match[2] })
);
const namedExports = iconIdentifiers(blockAfter(barrelSource, "export {"));
const registeredKeys = iconIdentifiers(
  blockAfter(barrelSource, "export const iconComponents = {", "} as const;")
);
const filesOnDisk = readdirSync(iconsDir)
  .filter((name) => name.endsWith(".vue"))
  .sort();
const expectedCount = 70;

describe("icon registry barrel", () => {
  it("ships exactly the expected number of icons", () => {
    expect(filesOnDisk).toHaveLength(expectedCount);
    expect(imported).toHaveLength(expectedCount);
    expect(namedExports).toHaveLength(expectedCount);
    expect(registeredKeys).toHaveLength(expectedCount);
  });

  it("has no duplicate names", () => {
    expect(new Set(namedExports).size).toBe(namedExports.length);
    expect(new Set(registeredKeys).size).toBe(registeredKeys.length);
    expect(new Set(imported.map((entry) => entry.local)).size).toBe(imported.length);
  });

  it("exports exactly what it registers", () => {
    // The plugin registers `iconComponents`; the named exports are what a consumer
    // imports. Drift between the two means `SIcon icon="IconX"` resolves for one
    // audience and not the other.
    expect([...namedExports].sort()).toEqual([...registeredKeys].sort());
    expect([...imported.map((entry) => entry.local)].sort()).toEqual([...registeredKeys].sort());
  });

  it("names every registered key with the Icon prefix", () => {
    for (const key of registeredKeys) {
      expect(key, `${key} must start with "Icon"`).toMatch(/^Icon[A-Z][A-Za-z0-9]*$/);
    }
  });

  it("imports every .vue file in the directory, one entry each", () => {
    expect([...imported.map((entry) => `${entry.file}.vue`)].sort()).toEqual(filesOnDisk);
  });

  it("keeps the IconName type derived from the registry", () => {
    expect(barrelSource).toMatch(/export type IconName = keyof typeof iconComponents;/);
  });
});

describe("icon folder barrel", () => {
  it("exports SIcon from icon.vue", () => {
    expect(iconBarrelSource).toMatch(/export \{ default as SIcon \} from "\.\/icon\.vue";/);
  });

  it("re-exports the icon set rather than re-listing it", () => {
    expect(iconBarrelSource).toMatch(/export \* from "\.\/icons";/);
  });
});
