#!/usr/bin/env node
/**
 * Build `@snail-js/vue`.
 *
 * The four build steps live in `scripts/build-vue-lib.mjs` at the repository root,
 * shared with `@snail-js/editor` so the two packages cannot drift apart.
 *
 * `vite` and `@vitejs/plugin-vue` are imported **here**, not inside that shared file,
 * because pnpm's isolated linker installs them into this package's own
 * `node_modules`; importing them from the repository root would fail to resolve, and
 * resolving them manually would pick Vite's CommonJS entry.
 */
import { fileURLToPath } from "node:url";
import { build } from "vite";
import vue from "@vitejs/plugin-vue";
import { buildVueLibrary } from "../../../scripts/build-vue-lib.mjs";

await buildVueLibrary(fileURLToPath(new URL("..", import.meta.url)), { build, vue });
