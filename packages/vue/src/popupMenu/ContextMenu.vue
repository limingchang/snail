<template>
  <!--
    Teleported to `<body>` and positioned with `strategy: "fixed"`. Both halves are
    needed: a `position: relative; overflow: hidden` (or `transform`) ancestor clips a
    fixed-position descendant only if the element stays inside it, and the legacy menu
    both stayed inside and positioned with `position: fixed` — so it was clipped by any
    transformed ancestor *and* measured against the wrong origin.
  -->
  <Teleport to="body">
    <ul
      ref="listRef"
      class="s-context-menu"
      role="menu"
      aria-orientation="vertical"
      :aria-busy="loading ? 'true' : undefined"
      :style="[floatingStyles, panelStyle, positioned ? null : hiddenStyle]"
      @keydown="onKeydown"
      @mouseenter="emit('keepOpen')"
      @mouseleave="scheduleSubmenuClose"
    >
      <!--
        Shown only while resolution is in flight *and* nothing is visible yet. Rows
        whose `display` is still unresolved are hidden (fail-closed), so without this
        the menu would open as an empty box.
      -->
      <li v-if="showLoading" class="s-context-menu__loading" role="presentation" aria-live="polite">
        {{ loadingText }}
      </li>

      <template v-for="row in rows" :key="row.id">
        <li v-if="row.separator" class="s-context-menu__separator" role="separator" />
        <MenuItem
          v-else
          :item="row"
          :active="row.id === activeId"
          :busy="row.id === busyId"
          :expanded="row.id === openSubmenuId"
          @hover="onItemHover(row)"
          @activate="onItemActivate(row)"
        />
      </template>

      <!--
        Arbitrary nesting: each open submenu is just another instance of this
        component, referenced with the same middleware set, positioned against the row
        that opened it. The legacy implementation called its `renderChild` helper once
        and dropped any deeper `children` on the floor.
      -->
      <ContextMenu
        v-if="openRow"
        :items="openRow.children"
        :reference="submenuReference"
        placement="right-start"
        :width="width"
        :min-width="minWidth"
        :align="align"
        :busy-id="busyId"
        :z-index="zIndex"
        :depth="depthValue + 1"
        :loading="loading"
        :loading-text="loadingText"
        @activate="emit('activate', $event)"
        @keep-open="cancelSubmenuClose"
        @close="closeSubmenu"
      />
    </ul>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import { autoUpdate, flip, offset, shift, size, useFloating } from "@floating-ui/vue";
import type { Middleware } from "@floating-ui/vue";
import MenuItem from "./MenuItem.vue";
import type { ContextMenuEmits, ContextMenuProps, ContextMenuReference, ResolvedMenuItem } from "./type";

/**
 * `SContextMenu` —— 上下文菜单的展示层。
 *
 * 它渲染一个 `role="menu"` 列表，负责该列表的键盘模型，并用 Floating UI 给自己定位。
 * 它从不解析条目，也从不运行命令：这两件事由持有者（`SPopUpMenu.ts`）完成，再把解析
 * 好的行数据传下来。
 *
 * ## 定位
 *
 * `offset(4)`、`flip()`、`shift({ padding: 8 })` 和 `size({ apply })` 跑在 `fixed`
 * 策略上，并通过 `autoUpdate` 在滚动、缩放和动画时重新定位，面板被 teleport 到
 * `<body>`。旧版本只测量一次菜单，只在右侧或底部溢出时翻转，从不做边界收敛，而且每当
 * 异步 `display`/`enabled` 缩短列表时都得手动重新测量 —— 一个很大的菜单会直接跑到
 * 屏幕外面去。
 *
 * ## 键盘
 *
 * 上下方向键、Home/End 移动焦点，右方向键打开子菜单，左方向键关闭它（在根面板上则是
 * 请求持有者关闭整个菜单），Enter/Space 交给平台自身的按钮激活逻辑。这里刻意**不**
 * 处理 `Escape`：持有它的控制器在 `document` 上用捕获阶段统一监听，所以即使焦点已经
 * 跑到菜单外面，Escape 仍然能关闭菜单。
 *
 * `SContextMenu` — the presentation half of the context menu.
 *
 * It renders a `role="menu"` list, owns the keyboard model for that list, and
 * positions itself with Floating UI. It never resolves items and never runs a
 * command: the owner (`SPopUpMenu.ts`) does both, and hands the resolved rows down.
 *
 * ## Positioning
 *
 * `offset(4)`, `flip()`, `shift({ padding: 8 })` and `size({ apply })` run against a
 * `fixed` strategy with an `autoUpdate` re-position on scroll, resize and animation,
 * and the panel is teleported to `<body>`. The legacy version measured the menu once,
 * flipped only on right/bottom overflow, never clamped, and had to be re-measured by
 * hand whenever async `display`/`enabled` shrank the list — a large menu simply ran
 * off the screen.
 *
 * ## Keyboard
 *
 * Arrow Up/Down, Home/End move focus, Arrow Right opens a submenu, Arrow Left closes
 * it (or asks the owner to close the whole menu at the root), and Enter/Space are the
 * platform's own button activation. `Escape` is deliberately **not** handled here:
 * the owning controller listens once on `document` in the capture phase, so Escape
 * still closes the menu when focus has wandered out of it.
 */
defineOptions({ name: "SContextMenu" });

const props = withDefaults(defineProps<ContextMenuProps>(), {
  reference: null,
  placement: "bottom-start",
  align: "left",
  busyId: null,
  loadingText: "加载中…",
  loading: false,
  autofocus: true
});

const emit = defineEmits<ContextMenuEmits>();

/** How long a hover-opened submenu survives the pointer leaving the panel. */
const SUBMENU_CLOSE_DELAY = 250;

const listRef = ref<HTMLElement | null>(null);
const activeId = ref<string | null>(null);
const openSubmenuId = ref<string | null>(null);
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let hasFocused = false;

const depthValue = computed(() => props.depth ?? 0);

const rows = computed(() => props.items.filter((row) => row.separator || row.visible));
const showLoading = computed(() => props.loading && rows.value.length === 0);

const openRow = computed<ResolvedMenuItem | undefined>(() => {
  const id = openSubmenuId.value;
  if (id === null) return undefined;
  return props.items.find((row) => row.id === id && row.children.length > 0);
});

/**
 * The row's button element, found by iterating rather than by selector: item ids can
 * come from the caller, and interpolating one into a CSS selector is how an innocent
 * `id: "a.b"` turns into a broken query.
 */
function itemElement(id: string): HTMLElement | undefined {
  const list = listRef.value;
  if (!list) return undefined;
  return Array.from(list.querySelectorAll<HTMLElement>("[data-item-id]")).find(
    (element) => element.dataset.itemId === id
  );
}

const submenuReference = computed<ContextMenuReference>(() => {
  const row = openRow.value;
  if (!row) return null;
  return itemElement(row.id) ?? null;
});

// ---- Floating UI -----------------------------------------------------------

const referenceRef = computed<ContextMenuReference>(() => props.reference ?? null);

const middleware = computed<Middleware[]>(() => [
  offset(4),
  flip({ padding: 8 }),
  shift({ padding: 8 }),
  size({
    padding: 8,
    apply({ availableHeight, elements }) {
      // Cap the panel's height and let the list scroll. This is what makes a menu
      // with more rows than fit on screen usable instead of half off it.
      elements.floating.style.maxHeight = `${Math.max(availableHeight, 120)}px`;
    }
  })
]);

const { floatingStyles, isPositioned, update } = useFloating(referenceRef, listRef, {
  strategy: "fixed",
  placement: computed(() => props.placement),
  middleware,
  whileElementsMounted: autoUpdate
});

/**
 * Whether the panel has been placed yet.
 *
 * Until then it is `visibility: hidden`, so it can never flash in the top-left corner
 * on the frame between mount and the first measurement.
 */
const positioned = ref(false);
let revealFrame: number | undefined;
const hiddenStyle: CSSProperties = { visibility: "hidden" };

const panelStyle = computed<CSSProperties>(() => ({
  width: props.width !== undefined ? `${props.width}px` : undefined,
  minWidth: props.minWidth !== undefined ? `${props.minWidth}px` : undefined,
  textAlign: props.align,
  zIndex: props.zIndex === undefined ? undefined : props.zIndex + depthValue.value
}));

watch(
  isPositioned,
  (value) => {
    if (value) positioned.value = true;
  },
  { immediate: true }
);

// ---- focus -----------------------------------------------------------------

function focusables(): HTMLElement[] {
  const list = listRef.value;
  if (!list) return [];
  // Submenu panels are teleported out of this element, so this only ever sees this
  // panel's own rows — no cross-panel focus stealing.
  return Array.from(list.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
}

function focusAt(index: number): void {
  const items = focusables();
  if (items.length === 0) return;
  const target = items[((index % items.length) + items.length) % items.length];
  target?.focus();
}

function move(delta: number): void {
  const items = focusables();
  if (items.length === 0) return;
  const current = items.findIndex((element) => element === document.activeElement);
  if (current === -1) {
    focusAt(delta > 0 ? 0 : items.length - 1);
    return;
  }
  focusAt(current + delta);
}

function activeRow(): ResolvedMenuItem | undefined {
  const id = (document.activeElement as HTMLElement | null)?.dataset?.itemId;
  if (!id) return undefined;
  return props.items.find((row) => row.id === id);
}

// ---- keyboard --------------------------------------------------------------

function onKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      move(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      move(-1);
      break;
    case "Home":
      event.preventDefault();
      focusAt(0);
      break;
    case "End":
      event.preventDefault();
      focusAt(focusables().length - 1);
      break;
    case "ArrowRight": {
      const row = activeRow();
      if (!row || row.children.length === 0 || !row.enabled) return;
      event.preventDefault();
      openSubmenu(row.id);
      break;
    }
    case "ArrowLeft":
      event.preventDefault();
      if (openSubmenuId.value !== null) closeSubmenu();
      // No submenu of our own is open: this panel wants to go away. At the root the
      // controller closes the whole stack; inside a submenu the parent panel closes
      // this one and restores focus to the row that opened it.
      else emit("close");
      break;
    default:
      break;
  }
}

// ---- submenu open state ----------------------------------------------------

function cancelSubmenuClose(): void {
  if (closeTimer === undefined) return;
  clearTimeout(closeTimer);
  closeTimer = undefined;
}

function scheduleSubmenuClose(): void {
  cancelSubmenuClose();
  if (openSubmenuId.value === null) return;
  closeTimer = setTimeout(() => {
    closeTimer = undefined;
    openSubmenuId.value = null;
  }, SUBMENU_CLOSE_DELAY);
}

function openSubmenu(id: string): void {
  const row = props.items.find((item) => item.id === id);
  if (!row || row.children.length === 0 || !row.enabled) return;
  cancelSubmenuClose();
  activeId.value = id;
  openSubmenuId.value = id;
}

function closeSubmenu(): void {
  cancelSubmenuClose();
  const id = openSubmenuId.value;
  openSubmenuId.value = null;
  if (id === null) return;
  // Walking back up the menu should land on the row that opened the submenu.
  void nextTick(() => {
    activeId.value = id;
    itemElement(id)?.focus();
  });
}

function onItemHover(row: ResolvedMenuItem): void {
  activeId.value = row.id;
  cancelSubmenuClose();
  if (row.children.length > 0 && row.enabled) {
    openSubmenu(row.id);
    return;
  }
  if (openSubmenuId.value !== null && openSubmenuId.value !== row.id) {
    openSubmenuId.value = null;
  }
}

function onItemActivate(row: ResolvedMenuItem): void {
  if (row.children.length > 0) {
    // A row with children opens them, exactly as the legacy `handleClick` required
    // `!options.children` before running its command.
    if (openSubmenuId.value === row.id) closeSubmenu();
    else openSubmenu(row.id);
    return;
  }
  emit("activate", row.id);
}

// ---- lifecycle -------------------------------------------------------------

onMounted(() => {
  void nextTick(() => update());
  if (typeof requestAnimationFrame === "function") {
    revealFrame = requestAnimationFrame(() => {
      revealFrame = undefined;
      positioned.value = true;
    });
  } else {
    positioned.value = true;
  }
});

watch(
  rows,
  () => {
    if (!props.autofocus || hasFocused) return;
    void nextTick(() => {
      if (hasFocused || focusables().length === 0) return;
      // Focus the first row the moment one exists: rows can appear later when an
      // async `display` resolves, and a menu nobody can reach with the keyboard is
      // the same as no menu.
      hasFocused = true;
      focusAt(0);
    });
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  cancelSubmenuClose();
  if (revealFrame !== undefined && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(revealFrame);
    revealFrame = undefined;
  }
});
</script>
