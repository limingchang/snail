/**
 * `popupMenu/` 的出口文件。
 *
 * 这里刻意分成三层，彼此可以独立使用：
 *
 * - `menu.ts` —— 纯状态机（`createItemSnapshot`、`resolveItems`、
 *   `runCommand`）。不涉及 DOM，也不涉及 Vue：测试可以直接复用，
 *   任何想搭建其他菜单外观的调用方也能复用。
 * - `ContextMenu.vue` / `MenuItem.vue` —— 外观层。`SContextMenu`
 *   可以用已解析好的行数据直接渲染。
 * - `SPopUpMenu.ts` —— 命令式工厂。`createContextMenu` 是当前的名字；
 *   `SPopUpMenu` 是同一个函数的旧名字，因此现有的 `SPopUpMenu(options, items)`
 *   调用点仍然可以编译通过。
 *
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
