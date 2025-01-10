import Captcha from "./AliCaptcha.vue";

Captcha.install = (app:any) => {
  app.component(Captcha.name || "ali-captcha", Captcha);
};
export const AliCaptcha = Captcha;
export * from "./type";
export default AliCaptcha;