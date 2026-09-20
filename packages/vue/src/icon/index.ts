/**
 * Barrel for `icon/`.
 *
 * `SIcon` is the runtime-resolving wrapper; every `Icon*` export is a plain SVG
 * component. There is no `install` side effect on the components themselves — the
 * plugin (`src/index.ts`) registers them, which keeps a component importable without
 * dragging the plugin in and keeps `noUnusedLocals` honest.
 */
export { default as SIcon } from "./icon.vue";
export * from "./icons";
