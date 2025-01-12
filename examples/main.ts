import { createApp } from "vue";
import App from "./App.vue";
import "element-plus/dist/index.css";

import * as SIcons from "@snail-js/theme"



const app = createApp(App);

for (const [key, component] of Object.entries(SIcons)) {
  app.component(key, component)
}


app.mount("#app");

