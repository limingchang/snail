/**
 * `aliCaptcha/` 的汇总导出入口。
 *
 * loader 与组件一起导出是刻意的：使用方若需要在挂件进入 DOM 之前预加载验证码
 * 脚本，可以用 `acquireScript` 请求组件将要用到的同一个 URL，而带引用计数的池会
 * 让两者共用同一个 `<script>`。
 *
 * Barrel for `aliCaptcha/`.
 *
 * The loader is exported alongside the component on purpose: a consumer that needs to
 * preload a captcha script (before the widget is in the DOM) can `acquireScript` the
 * same URL the component will ask for, and the refcounted pool makes the two share one
 * `<script>`.
 */
export { default as AliCaptcha } from "./AliCaptcha.vue";
export * from "./type";
export * from "./error";
export * from "./loader";
