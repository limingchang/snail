/**
 * `@snail-js/vue` 的包入口。
 *
 * 这里只做三件事：
 *
 * 1. 从各目录的 barrel 重导出全部组件与公共类型，所以
 *    `import { SClickCopy } from "@snail-js/vue"` 只需一跳，并且依然可被摇树。
 * 2. 导入样式表，使库构建产出单一的 `dist/style.css`（使用方只需引入一次
 *    `@snail-js/vue/style.css`）。
 * 3. 默认导出一个 Vue 插件，把 `./components` 里的静态组件表全局注册，方便使用方
 *    在模板中直接写 `<s-click-copy>`，无需逐个 import。
 *
 * 除此之外不再暴露任何东西：尤其是扁平后的组件表**刻意不**再导出，否则等于把整个
 * 图标集当作一个大命名空间交给使用方 —— 这正是旧包无法摇树的原因。
 *
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
 * 手工与 `package.json` 保持同步的版本号。
 *
 * 这是刻意的：共享的库构建没有定义 `__VERSION__`，而导入 `package.json` 会把一个 JSON
 * 模块（以及整个文件）拉进 `dist`。
 *
 * Kept in sync with `package.json` by hand.
 *
 * Deliberate: the shared library build defines no `__VERSION__`, and importing
 * `package.json` would pull a JSON module (and the whole file) into `dist`.
 */
const PACKAGE_VERSION = "1.0.0";

/**
 * 本包默认导出的 Vue 插件。
 *
 * 它存在的唯一目的是全局注册：应用执行 `app.use(SnailVue)` 之后，模板里可以直接写
 * `<s-click-copy>`，不必先 import 组件。它同时注册整套图标组件，这也是
 * `<SIcon icon="IconVariable" />` 用**字符串**就能解析到组件的原因。
 *
 * The Vue plugin this package exports by default.
 *
 * Its only job is global registration: after `app.use(SnailVue)` an application can write
 * `<s-click-copy>` in a template without importing the component. It also registers the
 * whole icon set, which is what makes `<SIcon icon="IconVariable" />` resolve a *string*.
 */
const SnailVuePlugin = {
  /**
   * 在 Vue 自身的 devtools 输出中标识本插件。
   *
   * Identifies the plugin in Vue's own devtools output.
   */
  name: "SnailVue",
  /**
   * 插件版本，取自上面的 `PACKAGE_VERSION`。
   *
   * The plugin version, taken from `PACKAGE_VERSION` above.
   */
  version: PACKAGE_VERSION,
  /**
   * 把静态组件表里的每个组件注册为全局组件。
   *
   * @param app 应用 `app.use(SnailVue)` 传入的 Vue 应用实例。 / The Vue app instance
   *   `app.use(SnailVue)` passes in.
   */
  install(app: App): void {
    for (const [name, component] of Object.entries(components)) {
      app.component(name, component);
    }
  }
} satisfies Plugin & { name: string; version: string };

export default SnailVuePlugin;
