/**
 * `@snail-js/vue` — the package entry point.
 *
 * Three things happen here and nothing else:
 *
 * 1. Every component and every public type is re-exported from its folder barrel, so
 *    `import { SClickCopy } from "@snail-js/vue"` is one hop and remains tree-shakeable.
 * 2. The stylesheet is imported, so the library build emits a single `dist/style.css`
 *    (a consumer imports `@snail-js/vue/style.css` once).
 * 3. A Vue plugin is default-exported, which registers the static map from
 *    `./components` globally for applications that prefer `<s-click-copy>` in a
 *    template without importing anything.
 *
 * Nothing else is exposed: in particular the flattened component map is *not*
 * re-exported, because that would hand consumers the icon set as one giant namespace —
 * exactly the shape that made the legacy package impossible to tree-shake.
 */
import type { App, Plugin } from "vue";
import { components } from "./components";
import "./theme/index.scss";

export * from "./icon";
export * from "./clickCopy";
export * from "./popupMenu";
export * from "./aliCaptcha";
export * from "./wordCloud";

/**
 * Kept in sync with `package.json` by hand.
 *
 * Deliberate: the shared library build defines no `__VERSION__`, and importing
 * `package.json` would pull a JSON module (and the whole file) into `dist`.
 */
const PACKAGE_VERSION = "1.0.0";

const SnailVuePlugin = {
  /** Identifies the plugin in Vue's own devtools output. */
  name: "SnailVue",
  version: PACKAGE_VERSION,
  install(app: App): void {
    for (const [name, component] of Object.entries(components)) {
      app.component(name, component);
    }
  }
} satisfies Plugin & { name: string; version: string };

export default SnailVuePlugin;
