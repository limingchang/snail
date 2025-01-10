import WordCloud from "./src/index.vue";

WordCloud.install = (app:any) => {
  app.component(WordCloud.name || "s-word-cloud", WordCloud);
};

export const SWordCloud = WordCloud;