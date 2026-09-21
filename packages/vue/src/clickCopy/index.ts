/**
 * `clickCopy/` 的聚合导出文件。
 *
 * 组件只以唯一的名字 `SClickCopy` 导出 —— 旧包既注册了 kebab-case 的 `.name`，
 * 又导出了一个带 `S` 前缀的常量，同一个组件因此有两条访问路径，使用方不得不猜
 * 文档里指的是哪一个。
 *
 * Barrel for `clickCopy/`.
 *
 * The component is exported under exactly one name (`SClickCopy`) — the legacy
 * package registered a kebab-case `.name` *and* exported an `S`-prefixed constant,
 * so the same component could be reached two different ways and consumers had to
 * guess which one the docs meant.
 */
export { default as SClickCopy } from "./ClickCopy.vue";
export * from "./type";
