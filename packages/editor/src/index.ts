import type { App } from "vue";
import Editor from "./editor.vue";

Editor.install = (app: App) => {
  app.component(Editor.name || "s-editor", Editor);
};

export const SEditor = Editor;