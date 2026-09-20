/**
 * Barrel for `popupMenu/`.
 *
 * Three layers, deliberately separable:
 *
 * - `menu.ts` — the pure state machine (`createItemSnapshot`, `resolveItems`,
 *   `runCommand`). No DOM, no Vue: reused by the tests and by anyone building a
 *   different menu surface.
 * - `ContextMenu.vue` / `MenuItem.vue` — the surface. `SContextMenu` can be rendered
 *   directly with resolved rows.
 * - `SPopUpMenu.ts` — the imperative factory. `createContextMenu` is the current name;
 *   `SPopUpMenu` is the same function under the legacy name, so existing
 *   `SPopUpMenu(options, items)` call sites keep compiling.
 */
export { default as SContextMenu } from "./ContextMenu.vue";
export { default as SContextMenuItem } from "./MenuItem.vue";
export { createContextMenu, SPopUpMenu, closeAllContextMenus } from "./SPopUpMenu";
export { createItemSnapshot, resolveItems, runCommand } from "./menu";
export * from "./type";
