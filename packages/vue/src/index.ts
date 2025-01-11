// export * from "@snail-js/theme"
export * from "./components";
import * as components from "./components";

// 函数式组件
// export * from "./popupMenu"

// 导出类型
export * from "./aliCaptcha/type"
export * from "./icon/type"
export * from "./popupMenu/type"

// 引入样式
// import "@snail-js/theme/index.scss";

export default {
  install(app:any) {
    Object.entries(components).forEach(([key, value]) => {
      app.component(key, value);
    });
  },
};