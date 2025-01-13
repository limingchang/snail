import type { App } from "vue";
import Captcha from "./AliCaptcha.vue";

Captcha.install = (app:App) => {
  app.component(Captcha.name || "ali-captcha", Captcha);
};
export const AliCaptcha = Captcha;
export * from "./type";
export default AliCaptcha;