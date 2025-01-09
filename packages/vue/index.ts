export * from "./src/theme-chalk"
export * from "./src/components";
import * as components from "./src/components";

// 引入样式
import "./src/theme-chalk/index.scss";

export default {
  install(app:any) {
    Object.entries(components).forEach(([key, value]) => {
      app.component(key, value);
    });
  },
};