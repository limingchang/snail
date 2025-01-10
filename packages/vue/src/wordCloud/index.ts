import WordCloud from "./WordCloud.vue";

WordCloud.install = (app:any) => {
  app.component(WordCloud.name || "s-word-cloud", WordCloud);
};

export const SWordCloud = WordCloud;