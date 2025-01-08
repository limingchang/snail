export * from "./src/theme-chalk"

export * from "./src/components";
import * as components from "./src/components";

export default {
  install(app:any) {
    Object.entries(components).forEach(([key, value]) => {
      app.component(key, value);
    });
  },
};