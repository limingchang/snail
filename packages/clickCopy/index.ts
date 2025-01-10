import ClickCopy from "./src/clickCopy.vue";

ClickCopy.install = (app:any) => {
  app.component(ClickCopy.name || "s-click-copy", ClickCopy);
};
export const SClickCopy = ClickCopy;

export default SClickCopy;