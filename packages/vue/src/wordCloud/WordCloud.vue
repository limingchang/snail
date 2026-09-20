<template>
  <div
    ref="rootRef"
    class="s-word-cloud"
    :style="rootStyle"
    @mouseenter="onPointerEnter"
    @mouseleave="onPointerLeave"
  >
    <WordTag
      v-for="(word, index) in words"
      :key="`${index}:${word.text}`"
      :ref="(instance) => setTagRef(index, instance)"
      :text="word.text"
      :color="colors[index]"
      @click="onWordClick(index, $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import WordTag from "./WordTag.vue";
import {
  clamp,
  normaliseWords,
  projectDirection,
  resolveFontSize,
  resolveWordColor,
  rotateDirection,
  seededUnit,
  sphereCoefficient,
  sphereDirection,
  withNormalisedWeights
} from "./model";
import type { SphereVector } from "./model";
import type {
  WordCloudEmits,
  WordCloudExposed,
  WordCloudProps,
  WordCloudWordInput,
  WordTagHandle
} from "./type";

/**
 * `SWordCloud` — a rotating 3D word cloud.
 *
 * The spherical projection look is the feature and is preserved exactly (see
 * `model.ts`); everything about *how* it animates was rebuilt:
 *
 * - **One** `requestAnimationFrame` loop for the whole cloud. The legacy version ran
 *   a `setInterval` per tag on a `15 ms` period, and every tag's `style` getter read
 *   `offsetWidth`/`offsetHeight` on each tick — N timers and N forced reflows per
 *   frame, forever.
 * - Directions are rotated and renormalised, so a tag can never leave the sphere.
 *   The legacy loop fed an already-mutated `z` into the next rotation and never
 *   renormalised: `scale = D / (D - z)` ran away as `z` approached `2R` and the tag
 *   was flung out of the box.
 * - Sizes are measured once per layout change (`ResizeObserver`, fonts ready, props
 *   change), never per frame.
 * - Colours are derived from the word index, so a re-render does not reshuffle the
 *   cloud (the legacy `randomColor()` was called *during* render).
 * - The loop stops while the pointer is over the cloud (`pauseOnHover`), while the
 *   cloud is off-screen (`IntersectionObserver`), while the tab is hidden, and
 *   entirely under `prefers-reduced-motion`, in which case a static cloud is painted
 *   once. The legacy `onUnmounted` cleared one of its two timers, so the animation
 *   kept running after the component was destroyed.
 */
defineOptions({ name: "SWordCloud" });

const props = withDefaults(defineProps<WordCloudProps>(), {
  baseFontSize: 16,
  speed: 5,
  pauseOnHover: true
});

const emit = defineEmits<WordCloudEmits>();

const rootRef = ref<HTMLElement | null>(null);
const running = ref(false);

/** Per-tag animation state. Kept out of `ref` on purpose — see `tags` below. */
interface TagState {
  /** Unit direction on the sphere. Position is derived from it every frame. */
  direction: SphereVector;
  /** Angular velocity about the X axis, radians per second. */
  omegaX: number;
  /** Angular velocity about the Y axis, radians per second. */
  omegaY: number;
  /** Rendered width at the base font size, in pixels. */
  baseWidth: number;
  /** Rendered height at the base font size, in pixels. */
  baseHeight: number;
  /** Normalised `0…1` weight. */
  weight: number;
}

/**
 * Tag handles, in word order.
 *
 * A plain array, not a `ref`: the cloud writes to these elements directly every
 * frame, and making them reactive would schedule one component update per tag per
 * frame for values the template never reads.
 */
const tags: Array<WordTagHandle | undefined> = [];

let tagStates: TagState[] = [];
let layoutRadius = 0;
let rafId: number | undefined;
let lastTimestamp = 0;
let reducedMotion = false;
let inViewport = true;
let documentHidden = false;
let pointerInside = false;
let resizeObserver: ResizeObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let motionQuery: MediaQueryList | undefined;

const sourceWords = computed<readonly WordCloudWordInput[]>(
  () => props.words ?? props.hotWords ?? []
);

const words = computed(() => withNormalisedWeights(normaliseWords(sourceWords.value)));

const colors = computed(() =>
  words.value.map((word) => resolveWordColor(word.index, word.color, props.colors))
);

const rootStyle = computed<CSSProperties>(() => {
  const base = { fontSize: `${props.baseFontSize}px` };
  if (props.radius !== undefined) {
    const size = `${props.radius * 2}px`;
    return { ...base, width: size, height: size };
  }
  // No radius: fill the parent's width and take the radius from it, so the cloud
  // works in a fluid layout without the caller doing arithmetic.
  return { ...base, width: "100%", aspectRatio: "1 / 1" };
});

// The legacy prop name stays supported; warn once rather than silently picking one.
let warnedAboutAlias = false;
watch(
  () => [props.words, props.hotWords] as const,
  () => {
    if (warnedAboutAlias) return;
    if (props.words?.length && props.hotWords?.length && import.meta.env.DEV) {
      warnedAboutAlias = true;
      console.warn(
        "[SWordCloud] `hotWords` is deprecated and ignored: pass `words` instead (both were provided)."
      );
    }
  },
  { immediate: true }
);

/** Receive a tag handle from the template's function ref. */
function setTagRef(index: number, instance: unknown): void {
  const handle = instance as Partial<WordTagHandle> | null;
  if (handle && typeof handle.place === "function") {
    tags[index] = handle as WordTagHandle;
    return;
  }
  tags[index] = undefined;
}

/** Build or refresh the per-tag animation state after the word list changes. */
function rebuildTagStates(): void {
  const list = words.value;
  const count = list.length;
  tags.length = count;

  const previous = tagStates;
  const speed = clamp(props.speed, 1, 10);
  // `speed: 5` works out at ~0.4 rad/s, which is what the legacy 15 ms interval with
  // its random ±PI/500 step produced on average.
  const baseOmega = 0.08 * speed;

  tagStates = list.map((word, index) => {
    const existing = previous[index];
    const direction =
      existing?.direction ?? sphereDirection(sphereCoefficient(index, count), count);
    const signX = seededUnit(index, 1) < 0.5 ? -1 : 1;
    const signY = seededUnit(index, 2) < 0.5 ? -1 : 1;
    return {
      direction,
      omegaX: signX * baseOmega * 0.6 * (0.3 + 0.7 * seededUnit(index, 3)),
      omegaY: signY * baseOmega * (0.3 + 0.7 * seededUnit(index, 4)),
      baseWidth: existing?.baseWidth ?? 0,
      baseHeight: existing?.baseHeight ?? 0,
      weight: word.weight
    };
  });
}

/** Write every tag's current frame to the DOM. */
function paint(): void {
  const radius = layoutRadius;
  if (radius <= 0) return;
  const base = props.baseFontSize;

  for (let index = 0; index < tagStates.length; index += 1) {
    const tag = tags[index];
    const state = tagStates[index];
    if (!tag || !state) continue;

    const projection = projectDirection(state.direction, radius);
    const fontSize = resolveFontSize(base, projection.scale, state.weight, props.fontSizeRange);
    const ratio = base > 0 ? fontSize / base : 1;

    tag.place({
      translateX: radius + projection.x - (state.baseWidth * ratio) / 2,
      translateY: radius + projection.y - (state.baseHeight * ratio) / 2,
      opacity: projection.opacity,
      fontSize,
      zIndex: Math.floor(projection.scale * 100),
      fontWeight: clamp(Math.round(projection.scale * 400), 300, 900)
    });
  }
}

/**
 * Measure the cloud and every tag, then repaint.
 *
 * Runs on mount, on container resize, when webfonts finish loading and whenever the
 * word list or the sizing props change — never inside the animation loop.
 */
function measureLayout(): void {
  const element = rootRef.value;
  if (!element) return;

  const radius = props.radius ?? element.clientWidth / 2;
  if (!Number.isFinite(radius) || radius <= 0) return;
  layoutRadius = radius;

  // Read/write split: reset every inline font size first (one write batch), then read
  // every box (one layout). Interleaving the two would lay the page out once per tag.
  for (const tag of tags) tag?.reset();
  const sizes = tags.map((tag) => tag?.measure() ?? { width: 0, height: 0 });
  for (let index = 0; index < sizes.length; index += 1) {
    const state = tagStates[index];
    if (!state) continue;
    state.baseWidth = sizes[index].width;
    state.baseHeight = sizes[index].height;
  }

  paint();
}

/** Rotate every direction by one time step. */
function advance(deltaSeconds: number): void {
  for (const state of tagStates) {
    state.direction = rotateDirection(
      state.direction,
      state.omegaX * deltaSeconds,
      state.omegaY * deltaSeconds
    );
  }
}

function tick(timestamp: number): void {
  rafId = requestAnimationFrame(tick);
  const previous = lastTimestamp;
  lastTimestamp = timestamp;
  if (previous === 0) return;
  // Clamp the step: a hidden tab or a long paint can hand back a multi-second gap,
  // and one huge rotation makes the cloud visibly jump.
  advance(Math.min((timestamp - previous) / 1000, 0.05));
  paint();
}

function canAnimate(): boolean {
  if (typeof requestAnimationFrame !== "function") return false;
  if (reducedMotion || documentHidden || !inViewport) return false;
  if (props.pauseOnHover && pointerInside) return false;
  return true;
}

/** Start the loop, or leave it stopped, according to every pause condition. */
function sync(): void {
  if (canAnimate()) start();
  else stop();
}

/** Start (or resume) the loop. No-op while a pause condition holds. */
function start(): void {
  if (rafId !== undefined || !canAnimate()) return;
  lastTimestamp = 0;
  rafId = requestAnimationFrame(tick);
  running.value = true;
}

/** Stop the loop, leaving every tag where it is. Safe to call twice. */
function stop(): void {
  if (rafId !== undefined) {
    cancelAnimationFrame(rafId);
    rafId = undefined;
  }
  running.value = false;
}

function onPointerEnter(): void {
  pointerInside = true;
  sync();
}

function onPointerLeave(): void {
  pointerInside = false;
  sync();
}

function onVisibilityChange(): void {
  documentHidden = document.visibilityState === "hidden";
  sync();
}

function onMotionChange(event: MediaQueryListEvent): void {
  reducedMotion = event.matches;
  // Reduced motion shows the static cloud, which is already painted.
  if (reducedMotion) stop();
  else sync();
}

function onWordClick(index: number, event: MouseEvent): void {
  const word = words.value[index];
  if (!word) return;
  emit("wordClick", { text: word.text, index, weight: word.weight, event });
}

function setupObservers(): void {
  if (typeof ResizeObserver === "function" && rootRef.value) {
    resizeObserver = new ResizeObserver(() => measureLayout());
    resizeObserver.observe(rootRef.value);
  }

  if (typeof IntersectionObserver === "function" && rootRef.value) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        inViewport = entry ? entry.isIntersecting : true;
        sync();
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(rootRef.value);
  }

  if (typeof document !== "undefined") {
    documentHidden = document.visibilityState === "hidden";
    document.addEventListener("visibilitychange", onVisibilityChange);
    // Webfonts change every tag's box; re-measure once they are in.
    void document.fonts?.ready.then(() => measureLayout());
  }

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = motionQuery.matches;
    motionQuery.addEventListener("change", onMotionChange);
  }
}

onMounted(() => {
  setupObservers();
  void nextTick(() => {
    rebuildTagStates();
    measureLayout();
    sync();
  });
});

watch(
  () => [sourceWords.value, props.radius, props.baseFontSize, props.fontSizeRange] as const,
  () => {
    void nextTick(() => {
      rebuildTagStates();
      measureLayout();
      sync();
    });
  }
);

onBeforeUnmount(() => {
  stop();
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  resizeObserver = undefined;
  intersectionObserver = undefined;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  motionQuery?.removeEventListener("change", onMotionChange);
  motionQuery = undefined;
});

defineExpose<WordCloudExposed>({
  start,
  stop,
  get isRunning(): boolean {
    return running.value;
  }
});
</script>
