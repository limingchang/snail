<script setup lang="ts">
/**
 * `DemoBlock` — one live example plus its source, which is how the
 * `@snail-js/editor` and `@snail-js/vue` pages document their components.
 *
 * ## Why the source arrives as a prop instead of a markdown snippet
 *
 * VitePress can inject a file's contents with `<<<`, but only where markdown is being
 * processed. Inside a component's slot — which is where the code block has to live so
 * it can sit *after* the live demo — the snippet syntax is not guaranteed to run, and
 * a docs site that silently renders a literal `<<<` is worse than one with plain
 * monospace.
 *
 * A page therefore does this instead, which is deterministic. The page's own script
 * block imports the example **twice** — once as a component and once with Vite's
 * `?raw` suffix for its text — and hands both to this component:
 *
 *     import Basic from "../examples/click-copy/basic.vue";
 *     import basicSource from "../examples/click-copy/basic.vue?raw";
 *
 *     <DemoBlock title="基础用法" :code="basicSource">
 *       <Basic />
 *     </DemoBlock>
 *
 * (Those tags are written as an indented block rather than inside a fenced one on
 * purpose: a literal SFC block tag here would be scanned by Vue's single-file-component
 * parser and break this very file.)
 *
 * `?raw` is Vite's own import, so the shown source is literally the file that ran —
 * it cannot drift out of sync with the demo the way a copied snippet does.
 *
 * ## Why there is a copy button
 *
 * It is `SClickCopy` from `@snail-js/vue`, so the documentation exercises the
 * component it documents. If the copy button is broken, the docs say so out loud.
 */
import { computed, ref } from "vue";
import { SClickCopy } from "@snail-js/vue";

const props = withDefaults(
  defineProps<{
    /** Heading above the example. */
    title?: string;
    /** One line under the heading. */
    description?: string;
    /** The example's source, normally imported with `?raw`. */
    code?: string;
    /** Show the source without the reader having to expand it. */
    defaultOpen?: boolean;
  }>(),
  {
    title: undefined,
    description: undefined,
    code: undefined,
    defaultOpen: false
  }
);

const open = ref(props.defaultOpen);

/** Trim the trailing blank line `?raw` leaves behind so the block does not grow. */
const source = computed(() => (props.code ?? "").replace(/\s+$/, ""));
</script>

<template>
  <section class="demo-block">
    <header v-if="title || description" class="demo-block__header">
      <h4 v-if="title" class="demo-block__title">{{ title }}</h4>
      <p v-if="description" class="demo-block__description">{{ description }}</p>
    </header>

    <div class="demo-block__stage">
      <slot />
    </div>

    <div v-if="source" class="demo-block__code">
      <button
        type="button"
        class="demo-block__toggle"
        :aria-expanded="open"
        @click="open = !open"
      >
        <span class="demo-block__chevron" :data-open="open" aria-hidden="true">▸</span>
        {{ open ? "收起代码" : "查看代码" }}
      </button>

      <div v-if="open" class="demo-block__code-body">
        <SClickCopy class="demo-block__copy" :text="source" label="复制代码" />
        <pre><code>{{ source }}</code></pre>
      </div>
    </div>
  </section>
</template>

<style scoped>
.demo-block {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
}

.demo-block__header {
  padding: 12px 16px 0;
}

.demo-block__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  border: none;
  padding: 0;
}

.demo-block__description {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

/* The stage is deliberately not padded uniformly: a demo that renders a full
   editor needs the whole width, while a button demo should not float in space. */
.demo-block__stage {
  padding: 16px;
}

.demo-block__code {
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.demo-block__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.demo-block__toggle:hover {
  color: var(--vp-c-brand-1);
}

.demo-block__chevron {
  display: inline-block;
  transition: transform 0.15s ease;
}

.demo-block__chevron[data-open="true"] {
  transform: rotate(90deg);
}

.demo-block__code-body {
  position: relative;
}

.demo-block__copy {
  position: absolute;
  top: 8px;
  right: 12px;
  z-index: 1;
}

.demo-block__code-body pre {
  margin: 0;
  padding: 12px 16px 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
  background: transparent;
}

.demo-block__code-body code {
  font-family: var(--vp-font-family-mono);
}
</style>
