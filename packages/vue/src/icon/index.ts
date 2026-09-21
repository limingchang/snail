/**
 * `icon/` 目录的 barrel。
 *
 * `SIcon` 是运行时解析的包装组件；所有 `Icon*` 导出都是普通的 SVG 组件。组件自身没有
 * `install` 副作用 —— 由插件（`src/index.ts`）注册它们，这样单个组件既能被直接 import，
 * 又不会把插件一起拖进来，同时也让 `noUnusedLocals` 保持有效。
 *
 * Barrel for `icon/`.
 *
 * `SIcon` is the runtime-resolving wrapper; every `Icon*` export is a plain SVG
 * component. There is no `install` side effect on the components themselves — the
 * plugin (`src/index.ts`) registers them, which keeps a component importable without
 * dragging the plugin in and keeps `noUnusedLocals` honest.
 */
export { default as SIcon } from "./icon.vue";
export * from "./icons";
