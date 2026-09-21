/**
 * VitePress theme for the `@snail-js` documentation site.
 *
 * The site used to document a single package (`@snail-js/api`) and shipped no theme
 * at all — which was fine while every page was prose. `@snail-js/editor` and
 * `@snail-js/vue` are component libraries, and the requirement is that their docs
 * show the **real component** next to its source, so the site now needs a theme that
 * can render live examples.
 *
 * ## Why Element Plus is *not* registered globally here
 *
 * `@snail-js/editor` declares `element-plus` as a peer (a consumer provides it), and it imports the
 * components and the component styles it renders itself. Registering the whole library here would
 * hide that: the site would look right because *the site* installed Element Plus globally, and a
 * consumer following the same instructions would ship the entire library for one editor.
 *
 * So the docs are the reference consumer: they add `element-plus` to `package.json`, import
 * `@snail-js/editor/style.css`, and nothing else. `element-plus/dist/index.css` is deliberately not
 * imported either — the editor's stylesheet carries the component styles it needs.
 *
 * The two injection keys are still provided: VitePress renders every page to HTML first and
 * hydrates it in the browser, so Element Plus's generated ids and z-indexes must be identical on
 * both sides, and without them the build warns (`[IdInjection]` / `[ZIndexInjection]`) and assigns
 * from a counter that starts differently in the two runs — which is exactly a hydration mismatch.
 */
import DefaultTheme from "vitepress/theme";
import { ID_INJECTION_KEY, ZINDEX_INJECTION_KEY } from "element-plus";
import SnailVue from "@snail-js/vue";
import type { Theme } from "vitepress";

import "@snail-js/vue/style.css";
import "@snail-js/editor/style.css";
import "./styles/docs.css";

import DemoBlock from "./components/DemoBlock.vue";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.provide(ID_INJECTION_KEY, { prefix: 1024, current: 0 });
    app.provide(ZINDEX_INJECTION_KEY, { current: 0 });
    // Installed, not merely imported, so the docs exercise the library the way a
    // consumer does — including `<SIcon icon="IconVariable">`, which resolves an icon by
    // its registered name and therefore needs the set registered to work at all.
    app.use(SnailVue);
    // Registered globally so a page can use it without an import statement in every
    // `<script setup>` block.
    app.component("DemoBlock", DemoBlock);
  }
} satisfies Theme;
