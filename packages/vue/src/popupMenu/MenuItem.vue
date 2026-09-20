<template>
  <li class="s-context-menu__item" role="none">
    <!--
      `aria-disabled` rather than the `disabled` attribute: a disabled menu item
      should still be discoverable by a screen reader and reachable by click-focus,
      which is what the WAI-ARIA menu pattern asks for. Keyboard navigation skips it
      and the click handler refuses it.
    -->
    <button
      class="s-context-menu__button"
      :class="{ 'is-active': active, 'is-danger': item.danger }"
      type="button"
      role="menuitem"
      :data-item-id="item.id"
      tabindex="-1"
      :aria-disabled="item.enabled ? 'false' : 'true'"
      :aria-busy="busy ? 'true' : undefined"
      :aria-haspopup="hasChildren ? 'menu' : undefined"
      :aria-expanded="hasChildren ? (expanded ? 'true' : 'false') : undefined"
      @click="onClick"
      @mouseenter="emit('hover')"
      @focus="emit('hover')"
    >
      <span v-if="busy" class="s-context-menu__icon">
        <span class="s-context-menu__busy" aria-hidden="true"></span>
      </span>
      <SIcon v-else-if="resolvedIcon" class="s-context-menu__icon" :icon="resolvedIcon" />
      <span class="s-context-menu__label">{{ item.label }}</span>
      <span v-if="hasChildren" class="s-context-menu__arrow" aria-hidden="true"></span>
    </button>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Component } from "vue";
import { SIcon } from "../icon";
import { iconComponents } from "../icon/icons";
import type { ContextMenuIcon, MenuItemEmits, MenuItemProps } from "./type";

/**
 * One row of the context menu.
 *
 * The row is a real `<button role="menuitem">` inside a `<li role="none">`. Keyboard
 * activation therefore comes from the platform (Enter/Space produce a click on a
 * button), and only arrow/Home/End navigation has to be implemented by the list.
 *
 * The submenu itself is *not* rendered here: `SContextMenu` owns the open state and
 * renders the nested panel, which is what makes arbitrary nesting work. The legacy
 * `PopupMenuItem.vue` rendered its children as a nested `<ul>` revealed by a CSS
 * `:hover` rule, so submenus were unreachable by keyboard, invisible on touch, and
 * exactly one level deep (`renderChild` dropped any grandchildren).
 */
defineOptions({ name: "SContextMenuItem" });

const props = defineProps<MenuItemProps>();
const emit = defineEmits<MenuItemEmits>();

const hasChildren = computed(() => props.item.children.length > 0);

/**
 * `item.icon` resolved to something `SIcon` can render.
 *
 * A string is looked up in the bundled icon registry first, so an item can say
 * `icon: "IconVariable"` and work in an application that never installed the plugin.
 * If it is not one of ours it is passed through unchanged for Vue to resolve as a
 * globally registered component.
 *
 * The legacy implementation registered every Element Plus icon and every local icon
 * on a fresh application *every time a menu opened* — which is also why it needed a
 * dependency on `@element-plus/icons-vue` that this package does not have.
 */
const resolvedIcon = computed<Component | string | undefined>(() => {
  const icon: ContextMenuIcon | undefined = props.item.icon;
  if (icon === undefined) return undefined;
  if (typeof icon !== "string") return icon;
  // The double assertion is deliberate: `iconComponents` is a frozen literal whose
  // keys are known, and this lookup is the one place that needs it as a dictionary.
  const registry = iconComponents as unknown as Record<string, Component | undefined>;
  return registry[icon] ?? icon;
});

function onClick(): void {
  if (!props.item.enabled || props.busy) return;
  emit("activate");
}
</script>
