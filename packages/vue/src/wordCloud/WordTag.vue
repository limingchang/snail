<template>
  <span ref="tagRef" class="s-word-cloud__tag" :style="{ color }" @click="onClick">{{ text }}</span>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { WordTagFrame, WordTagHandle } from "./type";

/**
 * `SWordTag` —— 词云里的一个词。
 *
 * 它刻意保持「笨」：不持有定时器、旋转状态和测量循环。父级词云在同一个
 * `requestAnimationFrame` 回调里算好每个标签的一帧，然后逐个句柄调用
 * {@link place}。
 *
 * 这种反转正是对旧 `wordTag.vue` 的修复：旧版*每个标签*一个 `setInterval`
 * （一朵云 N 个定时器，``up to 200 Hz``），而且它的 `style` 计算属性每 tick
 * 都读 `offsetWidth` / `offsetHeight` —— 每个标签每帧一次强制重排，读操作
 * 还夹在样式写操作之间，浏览器无法批处理。
 *
 * 根元素是静态的：只有 `transform`、`opacity`、`font-size`、`font-weight`
 * 和 `z-index` 由父级命令式写入。
 *
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
  /**
   * 词语文本。
   *
   * Word text.
   */
  text: string;
  /**
   * 已解析的颜色；已经从调色板中选出，或由使用方固定。
   *
   * Resolved colour; already picked from the palette or pinned by the caller.
   */
  color: string;
}>();

const emit = defineEmits<{
  /**
   * 标签被点击；原生事件原样转发。
   *
   * The tag was clicked; the native event is forwarded unchanged.
   */
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
  /** 应用一帧，一次写完不回读。 / Apply one frame; write-only, never read back. */
  place,
  /** 当前渲染尺寸，单位为像素。 / Current rendered size in pixels. */
  measure,
  /** 清除内联字号，便于重新测量。 / Drop the inline font size before measuring. */
  reset,
  /** 标签元素；挂载前为 `null`。 / The tag element, or `null` before mount. */
  get element(): HTMLElement | null {
    return tagRef.value;
  }
});
</script>
