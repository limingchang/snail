/**
 * `@snail-js/editor` 的公开类型。
 *
 * 按主题而不是按扩展切分，使用者因此可以只思考**模型**（一张纸、一个变量、一个
 * 模板），而不必知道它恰好由哪个扩展实现；下面的三个模块分别对应纸张、变量与组件
 * 契约。
 *
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
