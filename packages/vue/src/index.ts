// export * from "@snail-js/theme"
export * from "./components";
import * as components from "./components";

// 引入样式
// import "@snail-js/theme/index.scss";

export default {
  install(app:any) {
    Object.entries(components).forEach(([key, value]) => {
      app.component(key, value);
    });
  },
};