/**
 * Render `src/index.ts` — the barrel consumers import from.
 *
 * ## Why the barrel exists at all
 *
 * The point of the generated code is `import { petApi } from "./src"`. Without a
 * barrel the consumer has to know the file layout, which is an implementation detail
 * that changes when a tag is added. The barrel is also the only file that lists every
 * generated api, so it doubles as the thing to diff when the document changes.
 *
 * ## Why only the *instances* are re-exported
 *
 * The api classes are an implementation detail: constructing one directly bypasses
 * `@Server` configuration and produces a second, plugin-less server. The ready
 * instance is the supported entry point, so that is all the barrel exposes. Types are
 * available separately through `src/types`.
 */

import type { OperationGroup } from "../openapi/operations.js";
import { withHeader } from "./format.js";

/** Render the api barrel, one `export` per generated api file. */
export function renderBarrelFile(groups: readonly OperationGroup[]): string {
  if (groups.length === 0) {
    return withHeader(
      "// 没有生成任何 api：文档中没有可用的操作。\n" +
        "// 请检查 --input 指向的文档是否包含 paths。"
    );
  }

  const lines = [...groups]
    .sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0))
    // The `.ts` extension is dropped for the same reason the api files import
    // `"../types/pet"`: the generated code is TypeScript compiled by the consumer's
    // bundler, which resolves extensionless specifiers. Keeping the extension would
    // require `allowImportingTsExtensions`, which not every project sets.
    .map((group) => `export { ${group.instanceName} } from "./apis/${group.fileName.replace(/\.ts$/, "")}";`);

  return withHeader(lines.join("\n"));
}
