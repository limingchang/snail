export * from "@snail-js/theme"
export * from "./src/components";
import * as components from "./src/components";

// 引入样式
import "@snail-js/theme/index.scss";

export default {
  install(app:any) {
    Object.entries(components).forEach(([key, value]) => {
      app.component(key, value);
    });
  },
};