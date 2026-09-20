/**
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
