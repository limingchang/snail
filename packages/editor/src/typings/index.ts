/**
 * Public types for `@snail-js/editor`.
 *
 * Split by subject rather than by extension, so a consumer can reason about the
 * *model* (a page, a variable, a template) without knowing which extension happens to
 * implement it:
 *
 * - {@link ./paper} — sheets, orientation, margins
 * - {@link ./variable} — the variable model and its values
 * - {@link ./editor} — the component contract, templates and modes
 */
export * from "./paper";
export * from "./variable";
export * from "./editor";
