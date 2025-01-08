import DefaultTheme from "vitepress/theme";

import "@snail-js/theme-chalk/style/index.scss"
import "@snail-js/theme-chalk/style/snailVariables.scss"
// import { SIcon } from "@snail-js/vue";
import 'element-plus/dist/index.css'

export default {
  ...DefaultTheme,
  // enhanceApp: async ({ app, router, siteData }) => {
  //   app.use(SIcon);
  // },
};
