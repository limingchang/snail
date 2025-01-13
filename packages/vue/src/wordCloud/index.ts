import type { App } from "vue";
import WordCloud from "./WordCloud.vue";

WordCloud.install = (app:App) => {
  app.component(WordCloud.name || "s-word-cloud", WordCloud);
};

export const SWordCloud = WordCloud;