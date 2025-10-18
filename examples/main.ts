import { createApp } from "vue";
import App from "./App.vue";
import "element-plus/dist/index.css";

import { SIconSvgs } from "@snail-js/vue";

// import "@snail-js/vue/dist/index.css"
import "@snail-js/vue/index.css"

// 引入 Snail Editor 样式
import "@snail-js/editor/index.css"

const app = createApp(App);

for (const [key, component] of Object.entries(SIconSvgs)) {
  app.component(key, component);
}

app.mount("#app");
