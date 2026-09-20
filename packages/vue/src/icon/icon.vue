<template>
  <i class="s-icon" :class="{ 'is-spin': spin }" :style="iconStyle" @click="onClick">
    <component :is="icon" v-if="icon" />
    <slot v-else />
  </i>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Component, CSSProperties } from "vue";
import type { IconName } from "./icons";

/**
 * `SIcon` — the one wrapper every icon goes through.
 *
 * It exists for the case a plain SVG cannot cover: the icon is *not known at build
 * time*, so it has to be resolved at runtime. Typical uses:
 *
 * ```vue
 * <!-- an icon from this package, imported -->
 * <SIcon :icon="IconVariable" />
 *
 * <!-- an Element Plus icon, used directly -->
 * <SIcon :icon="ElIconEdit" />
 *
 * <!-- an Element Plus icon inside Element Plus's own wrapper -->
 * <el-icon><SIcon :icon="ElIconEdit" /></el-icon>
 *
 * <!-- a globally registered name, e.g. after `app.use(SnailVue)` -->
 * <SIcon icon="IconVariable" />
 *
 * <!-- anything at all, via the slot -->
 * <SIcon color="#1e80ff"><svg …/></SIcon>
 * ```
 *
 * ## Why the wrapper is a plain `<i>` and not an `ElIcon`
 *
 * The package's whole point is to supply icons Element Plus does **not** have, so it
 * must not depend on Element Plus to render them. `<SIcon>` therefore inherits
 * `color`/`font-size` like `<el-icon>` does and nests inside one happily, but works
 * in an application that never installs Element Plus.
 *
 * ## Sizing
 *
 * Every bundled icon already carries `width="1em" height="1em"`, so an icon is
 * correctly sized with no stylesheet at all. `size` overrides that box for the one
 * call site; `inheritAttrs` is left on so `class`, `style` and ARIA attributes land
 * on the root element as a consumer expects.
 */
defineOptions({ name: "SIcon" });

const props = withDefaults(
  defineProps<{
    /**
     * A component (imported icon, Element Plus icon, or anything else) or the name
     * of a globally registered icon component.
     *
     * `IconName` is the union of this package's own icon names, so a string literal
     * gets autocomplete; the `string & {}` arm keeps any other registered name legal.
     */
    icon?: IconName | Component | (string & {});

    /** Overrides the inherited text colour. */
    color?: string;

    /** Sets the icon box; a number is read as pixels. */
    size?: string | number;

    /** Continuous rotation, for a loading or progress icon. */
    spin?: boolean;
  }>(),
  {
    icon: undefined,
    color: undefined,
    size: undefined,
    spin: false
  }
);

const emit = defineEmits<{
  /** The icon was clicked; the native event is forwarded unchanged. */
  click: [event: MouseEvent];
}>();

const iconStyle = computed<CSSProperties>(() => ({
  color: props.color,
  fontSize: typeof props.size === "number" ? `${props.size}px` : props.size
}));

function onClick(event: MouseEvent): void {
  emit("click", event);
}
</script>
