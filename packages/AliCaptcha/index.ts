import Captcha from "./src/AliCaptcha.vue";

Captcha.install = (app:any) => {
  app.component(Captcha.name || "ali-captcha", Captcha);
};
export const AliCaptcha = Captcha;
export * from "./src/type";
export default AliCaptcha;