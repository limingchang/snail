/**
 * Barrel for `wordCloud/`.
 *
 * `SWordTag` is exported because it is genuinely useful on its own (a positioned,
 * depth-scaled label) and because the cloud's public contract is expressed in terms
 * of it, but it is not registered as a component by the plugin unless the consumer
 * asked for it — see `src/components.ts`.
 */
export { default as SWordCloud } from "./WordCloud.vue";
export { default as SWordTag } from "./WordTag.vue";
export * from "./type";
// The sphere maths and colour model in `./model` are deliberately *not* re-exported
// here: they are the cloud's internals, and every one of them takes numbers rather
// than component data. They stay importable by path for anyone who needs them.
