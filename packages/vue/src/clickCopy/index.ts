/**
 * Barrel for `clickCopy/`.
 *
 * The component is exported under exactly one name (`SClickCopy`) — the legacy
 * package registered a kebab-case `.name` *and* exported an `S`-prefixed constant,
 * so the same component could be reached two different ways and consumers had to
 * guess which one the docs meant.
 */
export { default as SClickCopy } from "./ClickCopy.vue";
export * from "./type";
