<template>
  <span ref="tagRef" class="s-word-cloud__tag" :style="{ color }" @click="onClick">{{ text }}</span>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { WordTagFrame, WordTagHandle } from "./type";

/**
 * `SWordTag` — one word in the cloud.
 *
 * It is deliberately dumb: it owns no timer, no rotation state and no measurement
 * loop. The parent cloud computes every tag's frame in one `requestAnimationFrame`
 * callback and calls {@link place} on each handle.
 *
 * That inversion is the fix for the legacy `wordTag.vue`, which owned a `setInterval`
 * *per tag* (N timers per cloud, ``up to 200 Hz``) and whose `style` computed getter
 * read `offsetWidth`/`offsetHeight` on every tick — one forced reflow per tag per
 * frame, with the reads interleaved between style writes so the browser could not
 * batch them.
 *
 * The root element is static: only `transform`, `opacity`, `font-size`,
 * `font-weight` and `z-index` are written imperatively by the parent.
 */
defineOptions({ name: "SWordTag" });

defineProps<{
  /** Word text. */
  text: string;
  /** Resolved colour; already picked from the palette or pinned by the caller. */
  color: string;
}>();

const emit = defineEmits<{
  /** The tag was clicked; the native event is forwarded unchanged. */
  click: [event: MouseEvent];
}>();

const tagRef = ref<HTMLElement | null>(null);

/** Apply one frame. Everything is written in one go, never read back. */
function place(frame: WordTagFrame): void {
  const element = tagRef.value;
  if (!element) return;
  element.style.transform = `translate3d(${frame.translateX}px, ${frame.translateY}px, 0)`;
  element.style.opacity = `${frame.opacity}`;
  element.style.fontSize = `${frame.fontSize}px`;
  element.style.fontWeight = `${frame.fontWeight}`;
  element.style.zIndex = `${frame.zIndex}`;
}

/**
 * Rendered size at the current font size.
 *
 * Called once per layout change (mount, container resize, font load, word change),
 * never per frame.
 */
function measure(): { width: number; height: number } {
  const element = tagRef.value;
  if (!element) return { width: 0, height: 0 };
  return { width: element.offsetWidth, height: element.offsetHeight };
}

/**
 * Drop the inline font size so the tag measures at the inherited base size.
 *
 * Without this, the second measurement would measure the depth-scaled font size of
 * the previous frame and the tags would grow (or shrink) a little on every resize.
 */
function reset(): void {
  if (tagRef.value) tagRef.value.style.fontSize = "";
}

function onClick(event: MouseEvent): void {
  emit("click", event);
}

defineExpose<WordTagHandle>({
  place,
  measure,
  reset,
  get element(): HTMLElement | null {
    return tagRef.value;
  }
});
</script>
