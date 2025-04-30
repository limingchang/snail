import type { App } from "vue";
import Tab from "./Tab.vue";
import TabItem from "./TabItem.vue";

Tab.install = (app:App) => {
  app.component(Tab.name || "s-tab", Tab);
};
export const STab = Tab;

TabItem.install = (app:App) => {
  app.component(TabItem.name || "s-tab-item", TabItem);
}
export const STabItem = TabItem;