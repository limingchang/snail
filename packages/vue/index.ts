export * from "./src/theme-chalk"
// export * from "./components/rightKeyMenu";
// export { default as SnailClickCopy } from "./components/clickCopy/index.vue";
// export { default as SnailWordCloud } from "./components/wordCloud/index.vue";
// export { default as SnailWord } from "./word/index.vue";
// export { default as SnailWordDesign } from "./word/design.vue";

export * from "./src/components";
import * as components from "./src/components";

export default {
  install(app:any) {
    Object.entries(components).forEach(([key, value]) => {
      app.component(key, value);
    });
  },
};