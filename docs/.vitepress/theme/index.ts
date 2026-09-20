/**
 * VitePress theme for the `@snail-js` documentation site.
 *
 * The site used to document a single package (`@snail-js/api`) and shipped no theme
 * at all — which was fine while every page was prose. `@snail-js/editor` and
 * `@snail-js/vue` are component libraries, and the requirement is that their docs
 * show the **real component** next to its source, so the site now needs a theme that
 * can render live examples.
 *
 * ## Why Element Plus is registered globally here
 *
 * `@snail-js/editor` declares `element-plus` as a peer: a consumer provides it. The
 * docs site *is* such a consumer, so it installs Element Plus and registers it once
 * for the whole site. Doing it here rather than inside each demo keeps the demos
 * readable — they look exactly like the snippets printed beneath them, which is the
 * point of showing the source at all.
 *
 * Element Plus's stylesheet comes first so the site's own rules win where they
 * overlap.
 */
import DefaultTheme from "vitepress/theme";
import ElementPlus, { ID_INJECTION_KEY, ZINDEX_INJECTION_KEY } from "element-plus";
import SnailVue from "@snail-js/vue";
import type { Theme } from "vitepress";

import "element-plus/dist/index.css";
import "@snail-js/vue/style.css";
import "@snail-js/editor/style.css";
import "./styles/docs.css";

import DemoBlock from "./components/DemoBlock.vue";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // VitePress renders every page to HTML first and hydrates it in the browser, so
    // Element Plus's generated ids and z-indexes must be identical on both sides.
    // Without these two providers it warns loudly at build time
    // (`[IdInjection]` / `[ZIndexInjection]`) and assigns them from a counter that
    // starts differently in the two runs — which is exactly a hydration mismatch.
    app.provide(ID_INJECTION_KEY, { prefix: 1024, current: 0 });
    app.provide(ZINDEX_INJECTION_KEY, { current: 0 });
    app.use(ElementPlus);
    // Installed, not merely imported, so the docs exercise the library the way a
    // consumer does — including `<SIcon icon="IconVariable">`, which resolves an icon by
    // its registered name and therefore needs the set registered to work at all.
    app.use(SnailVue);
    // Registered globally so a page can use it without an import statement in every
    // `<script setup>` block.
    app.component("DemoBlock", DemoBlock);
  }
} satisfies Theme;
