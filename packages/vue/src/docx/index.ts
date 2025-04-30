import type { App } from "vue";
import DocxDesign from "./DocxDesign.vue"
import DocxViewer from "./DocxViewer.vue";

DocxDesign.install = (app:App) => {
  app.component(DocxDesign.name || "s-docx-design", DocxDesign);
};
export const SDocxDesign = DocxDesign;

DocxViewer.install = (app:App) => {
  app.component(DocxViewer.name || "s-docx-viewer", DocxViewer);
}
export const SDocxViewer = DocxViewer;