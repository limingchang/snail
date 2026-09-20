<template>
  <!--
    One root element, always. The legacy component rendered two `v-if` roots, so
    Vue could not fall through `class`, `style` or `@click` from the consumer (it
    warns rather than guesses), and every state change replaced the node the user
    had just activated.

    `role="button"` + `tabindex` rather than a real `<button>`: the component is
    usually dropped *inside* a `<button>`/`<a>`/table cell in the host page, where a
    nested interactive element is invalid HTML.
  -->
  <span
    class="s-click-copy"
    :class="{
      'is-success': state === 'success',
      'is-error': state === 'error',
      'is-disabled': disabled
    }"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled ? 'true' : undefined"
    :aria-label="disabled ? undefined : label"
    @click="onActivate"
    @keydown="onKeydown"
  >
    <span ref="contentRef" class="s-click-copy__content">
      <slot :state="state" :label="displayLabel" :copy="copy">
        <SIcon class="s-click-copy__icon">
          <!-- Inline glyphs on purpose: the bundled icon set only contains icons
               Element Plus does not ship, and `Copy`/`Check` are two of those. -->
          <svg v-if="state !== 'success'" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
          </svg>
        </SIcon>
        <!-- The live region is the label itself: the text swap *is* the feedback,
             and a second visually hidden node would double-announce it. -->
        <span class="s-click-copy__label" aria-live="polite" aria-atomic="true">{{
          displayLabel
        }}</span>
      </slot>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useSlots } from "vue";
import { SIcon } from "../icon";
import type {
  ClickCopyEmits,
  ClickCopyProps,
  ClickCopySource,
  ClickCopyState
} from "./type";

/**
 * `SClickCopy` — copy to the clipboard with visible, announced feedback.
 *
 * ## What was wrong with the legacy component
 *
 * - Two `v-if` roots: consumer `class`/`@click` were dropped with a warning.
 * - `await navigator.clipboard.writeText(text)` with no fallback, no `catch`, and no
 *   `return` check. On a plain-http origin `navigator.clipboard` is `undefined`, so
 *   the click threw asynchronously and the UI never reacted at all; a denied
 *   permission or a missing user activation rejected just as silently.
 * - `clearTimeout(timer)` was called *inside* the timer's own callback, which cannot
 *   do anything, and the pending timer was never cleared on unmount.
 * - `parentElement.classList.add("s-click-copy-parent")` mutated the consumer's DOM
 *   permanently, purely so a hover rule in the library stylesheet could find it.
 * - The `success` flag swapped the root element, so the focused node disappeared and
 *   focus went to `<body>`; nothing was announced to assistive technology.
 * - Only a required `text` prop could be copied, and only as plain text.
 *
 * ## Migration from `s-click-copy`
 *
 * The `.s-click-copy-parent` hook is gone. For the old "reveal a copy button in the
 * corner of a container" look, put `class="is-overlay"` on the component and make
 * the container `position: relative`.
 */
defineOptions({ name: "SClickCopy" });

const props = withDefaults(defineProps<ClickCopyProps>(), {
  source: "text",
  label: "复制",
  successMessage: "复制成功",
  errorMessage: "复制失败",
  duration: 1500,
  disabled: false
});

const emit = defineEmits<ClickCopyEmits>();
const slots = useSlots();

const state = ref<ClickCopyState>("idle");
const contentRef = ref<HTMLElement | null>(null);

/**
 * The pending reset timer.
 *
 * A single instance field, always cleared before a new one starts and again on
 * unmount, so a double click cannot leave an orphaned timer that later resets a
 * fresh message.
 */
let timer: ReturnType<typeof setTimeout> | undefined;

const displayLabel = computed<string>(() => {
  if (state.value === "success") return props.successMessage;
  if (state.value === "error") return props.errorMessage;
  return props.label;
});

/** The slot's rendered text, with the surrounding whitespace flattened. */
function readSlotText(): string {
  return (contentRef.value?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Resolve the text/html pair the current props describe. */
function resolvePayload(): { text: string; html?: string; source: ClickCopySource } {
  const explicit = props.text ?? "";
  if (props.source === "slot") {
    return { text: readSlotText() || explicit, html: props.html, source: "slot" };
  }
  if (explicit.trim().length > 0) {
    return { text: explicit, html: props.html, source: "text" };
  }
  // No usable `text` prop: read the slot, so `<SClickCopy><span>…</span></SClickCopy>`
  // works without the caller knowing about `source`.
  return { text: slots.default ? readSlotText() : "", html: props.html, source: "slot" };
}

/**
 * `navigator.clipboard`, or `undefined`.
 *
 * The property is typed as always present, but it is genuinely absent outside a
 * secure context — plain `http`, most WebViews, and any non-top-level frame that has
 * not been granted clipboard-write. Reading it lazily keeps this module importable in
 * Node.
 */
function getClipboard(): Clipboard | undefined {
  if (typeof navigator === "undefined") return undefined;
  const clipboard: Clipboard | undefined = navigator.clipboard;
  return clipboard;
}

/** Rich copy. Returns `false` — never throws — whenever the platform declines. */
async function writeRich(payload: { text: string; html?: string }): Promise<boolean> {
  if (typeof payload.html !== "string" || payload.html.length === 0) return false;
  const clipboard = getClipboard();
  if (!clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    await clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([payload.html], { type: "text/html" }),
        "text/plain": new Blob([payload.text], { type: "text/plain" })
      })
    ]);
    return true;
  } catch {
    // A rich copy is a bonus. Any failure here must fall through to the plain path
    // rather than fail the interaction.
    return false;
  }
}

/** Plain async copy. Throws so the caller can report *why* it failed. */
async function writePlain(text: string): Promise<void> {
  const clipboard = getClipboard();
  if (!clipboard?.writeText) {
    throw new Error("navigator.clipboard.writeText is unavailable in this context");
  }
  await clipboard.writeText(text);
}

/**
 * The pre-`navigator.clipboard` path: a temporary textarea plus the deprecated
 * `document.execCommand("copy")`.
 *
 * It is ugly and deprecated, but it is the only thing that works on an insecure
 * origin, which is exactly where the modern API is missing. Returns whether the
 * command actually reported success — the legacy code assumed it had.
 */
function writeLegacy(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  // Off-screen, not `display: none`: a display-none node cannot be selected.
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.left = "-1000px";
  area.style.opacity = "0";
  document.body.appendChild(area);
  const selection = document.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  try {
    area.select();
    // iOS Safari ignores `select()` on a textarea whose content was set
    // programmatically unless the range is set explicitly.
    area.setSelectionRange(0, area.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    // Restore the user's selection: stealing it is a visible side effect on the page.
    if (selection && previousRange) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
}

/** Replace any pending reset timer with a fresh one. */
function flash(next: Exclude<ClickCopyState, "idle">): void {
  clearFlashTimer();
  state.value = next;
  timer = setTimeout(() => {
    timer = undefined;
    state.value = "idle";
  }, Math.max(props.duration, 0));
}

function clearFlashTimer(): void {
  if (timer === undefined) return;
  clearTimeout(timer);
  timer = undefined;
}

function reportError(error: unknown, text: string): void {
  emit("error", { error, text });
  flash("error");
}

/**
 * Copy the resolved payload.
 *
 * Tries, in order: rich write, plain async write, legacy `execCommand`. Success is
 * reported only when one of them genuinely returned success.
 */
async function copy(): Promise<boolean> {
  if (props.disabled) return false;

  const payload = resolvePayload();
  if (payload.text.length === 0 && !payload.html) {
    reportError(
      new Error(
        "SClickCopy has nothing to copy: pass the `text` prop or render content in the default slot"
      ),
      ""
    );
    return false;
  }

  let copied = false;
  let failure: unknown;

  if (payload.html) copied = await writeRich(payload);
  if (!copied) {
    try {
      await writePlain(payload.text);
      copied = true;
    } catch (error) {
      failure = error;
    }
  }
  if (!copied) copied = writeLegacy(payload.text);

  if (!copied) {
    reportError(failure ?? new Error("no clipboard strategy succeeded"), payload.text);
    return false;
  }

  emit("success", { text: payload.text, html: payload.html, source: payload.source });
  flash("success");
  return true;
}

function onActivate(): void {
  if (props.disabled) return;
  void copy();
}

function onKeydown(event: KeyboardEvent): void {
  // Space would otherwise scroll the page, and both keys must behave like a click
  // because the root is a `role="button"` span, not a real button.
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
  event.preventDefault();
  onActivate();
}

onBeforeUnmount(clearFlashTimer);

defineExpose({ copy, state });
</script>
