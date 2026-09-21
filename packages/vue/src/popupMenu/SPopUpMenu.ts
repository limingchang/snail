/**
 * 上下文菜单面向 DOM 的那一半：打开一个菜单、跟踪它、关闭它。
 *
 * 与 `menu.ts` 的分工是刻意的。所有不带浏览器也能推理的东西 —— 哪些行可见、哪些行
 * 可启用、命令被拒绝时会发生什么 —— 都放在 `menu.ts` 里，它不 import 任何运行时代码。
 * 本文件负责需要 document 的部分：虚拟指针参考、独立挂载的应用、共享的已打开菜单栈，
 * 以及挂在 document 上的监听器。
 *
 * ## 旧的 `PopUpMenu.ts` 问题出在哪
 *
 * - `const { x, y } = useMouse()` 跑在**模块作用域**里，所以仅仅 import 这个模块就会
 *   给 document 挂上 `mousemove` 监听器，而且没有办法移除。这里指针来自 `contextmenu`
 *   事件本身（或 `options.position`），完全不存在全局指针监听器。
 * - 清理时对一个模块级数组用了 `if` 而不是 `while`，然后去移除
 *   `document.body.querySelector("#s-pop-up-menu")` —— 一个全局 id 查找，可能删掉
 *   无关的节点。这里每个实例拥有自己的容器，并按一个正经的栈把自己幂等地关掉。
 * - `registerIcons()` 在*每次打开*时注册 293 个 Element Plus 图标外加所有本地图标。
 *   这里不做任何图标注册：`MenuItem.vue` 通过 `SIcon` 渲染，由 `SIcon` 自己解析内置
 *   名称。
 * - `handleClick` 调用命令时不 await，并立刻卸载，于是异步命令既没有等待态、也没有
 *   错误处理，还能被重复进入。
 *
 * The DOM-facing half of the context menu: opens one, tracks it, closes it.
 *
 * The split with `menu.ts` is deliberate. Everything that can be reasoned about
 * without a browser — which rows are visible, which are enabled, what happens when a
 * command rejects — lives in `menu.ts`, which imports no runtime code at all. This
 * file owns the parts that need a document: the virtual pointer reference, the
 * detached application, the shared open-menu stack and the document listeners.
 *
 * ## What was wrong with the legacy `PopUpMenu.ts`
 *
 * - `const { x, y } = useMouse()` ran at **module scope**, so merely importing the
 *   module attached a `mousemove` listener to the document and there was no way to
 *   remove it. Here the pointer comes from the `contextmenu` event itself (or from
 *   `options.position`), and no global pointer listener exists at all.
 * - Teardown used `if` instead of `while` over a module-level array and then removed
 *   `document.body.querySelector("#s-pop-up-menu")` — a global id lookup that could
 *   remove an unrelated node. Here each instance owns its own container and closes
 *   itself out of a proper stack, idempotently.
 * - `registerIcons()` registered 293 Element Plus icons plus every local icon on
 *   *every open*. There is no icon registration here: `MenuItem.vue` renders through
 *   `SIcon`, which resolves a bundled name itself.
 * - `handleClick` called the command without awaiting and unmounted immediately, so
 *   async commands had no pending state, no error handling and could be re-entered.
 */

import { createApp, h, ref, shallowRef } from "vue";
import type { ClientRectObject, VirtualElement } from "@floating-ui/vue";
import ContextMenu from "./ContextMenu.vue";
import { createItemSnapshot, resolveItems, runCommand } from "./menu";
import type {
  ContextMenuPointer,
  ResolvedMenuItem,
  SPopUpMenuFactory,
  SPopUpMenuHandle,
  SPopUpMenuItemOptions,
  SPopUpMenuOptions
} from "./type";

/** The stack of currently open menus. Only ever holds what is actually open. */
const openMenus: Array<{ close: () => void }> = [];

/**
 * 关闭所有已打开的菜单。
 *
 * 在路由切换或打开模态框之前很有用。没有任何菜单打开时调用是安全的，从菜单自己的命令
 * 里调用也是安全的。
 *
 * Close every open menu.
 *
 * Useful before a route change or a modal open. Safe to call when nothing is open,
 * and safe to call from a menu's own command.
 */
export function closeAllContextMenus(): void {
  // Iterate a copy: each `close()` splices itself out of the stack.
  for (const entry of [...openMenus]) entry.close();
}

/** Read a viewport-relative point out of whatever the caller had to hand. */
function readPointer(pointer: ContextMenuPointer | undefined): { x: number; y: number } | undefined {
  if (!pointer) return undefined;
  if ("clientX" in pointer) return { x: pointer.clientX, y: pointer.clientY };
  if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return undefined;
  return { x: pointer.x, y: pointer.y };
}

/**
 * A zero-size virtual element at the pointer.
 *
 * `contextElement` is deliberately omitted: Floating UI then measures the clipping
 * boundary from the *floating* element's document, so `flip()`/`shift()` react to the
 * viewport. Pointing `contextElement` at the right-clicked element instead would make
 * the menu flip around that element's own `overflow: hidden` ancestors — the exact
 * clipping behaviour this rewrite exists to avoid.
 */
function createPointerReference(getPoint: () => { x: number; y: number }): VirtualElement {
  return {
    getBoundingClientRect(): ClientRectObject {
      const { x, y } = getPoint();
      return { x, y, width: 0, height: 0, top: y, right: x, bottom: y, left: x };
    }
  };
}

/**
 * Where to open when the caller passed no pointer.
 *
 * The focused element's bottom edge is the right answer for a keyboard-invoked menu,
 * and the viewport centre is the only sensible answer when nothing is focused. The
 * legacy code had neither: it read a module-level mouse position that could be
 * anywhere on the page.
 */
function fallbackAnchor(): { x: number; y: number } {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    const rect = active.getBoundingClientRect();
    return { x: rect.left, y: rect.bottom };
  }
  return { x: document.documentElement.clientWidth / 2, y: document.documentElement.clientHeight / 2 };
}

/** Map every resolved row id back to the caller's source row. */
function collectSources<TContext>(
  rows: readonly ResolvedMenuItem[],
  items: ReadonlyArray<SPopUpMenuItemOptions<TContext>>,
  target: Map<string, SPopUpMenuItemOptions<TContext>>
): void {
  rows.forEach((row, index) => {
    const source = items[index];
    if (source) target.set(row.id, source);
    if (source?.children) collectSources(row.children, source.children, target);
  });
}

/** A handle for the server / no-DOM case, so an SSR render cannot throw. */
function inertHandle(): SPopUpMenuHandle {
  return { close: () => undefined, isOpen: false };
}

/**
 * 打开一个上下文菜单。
 *
 * 菜单立刻出现在指针处，行数据则惰性解析：哪些行可见、哪些行可启用由 `menu.ts` 判定。
 *
 * Open a context menu.
 *
 * @param options 菜单选项；`context` 会传给每个 `command`。 /
 *   Menu options; `context` is handed to every `command`.
 * @param items 这些行会惰性解析：菜单立刻在指针处打开，异步的
 *   `display`/`enabled` 行会在它们落定后出现 /
 *   The rows, resolved lazily — the menu opens at the pointer immediately
 *   and rows whose `display`/`enabled` are async appear once they settle.
 * @param pointer 指针：`contextmenu` 事件（或任何 `{ x, y }` /
 *   `{ clientX, clientY }`）。键盘触发的菜单请省略它，菜单会锚定到聚焦的元素 /
 *   The `contextmenu` event (or any `{ x, y }` / `{ clientX, clientY }`).
 *   Omit it for a keyboard-triggered menu; the menu then anchors to the focused
 *   element.
 * @returns 句柄；它的 `close()` 是幂等的 /
 *   A handle whose `close()` is idempotent.
 */
export function createContextMenu<TContext = unknown>(
  options: SPopUpMenuOptions<TContext> = {},
  items: ReadonlyArray<SPopUpMenuItemOptions<TContext>> = [],
  pointer?: ContextMenuPointer
): SPopUpMenuHandle {
  if (typeof document === "undefined" || !document.body) return inertHandle();

  // One menu at a time — the legacy behaviour, and what a right-click menu should do.
  // The stack still matters: closing is order-independent and idempotent, and a
  // submenu or a second caller can never remove somebody else's node.
  closeAllContextMenus();

  const point = readPointer(pointer) ?? options.position ?? fallbackAnchor();
  const reference = shallowRef<VirtualElement | null>(createPointerReference(() => point));
  const sources = new Map<string, SPopUpMenuItemOptions<TContext>>();
  const rows = shallowRef<ResolvedMenuItem[]>(createItemSnapshot(items));
  const busyId = ref<string | null>(null);
  const loading = ref(true);
  collectSources(rows.value, items, sources);

  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const container = document.createElement("div");
  container.className = "s-context-menu-portal";
  document.body.appendChild(container);

  let closed = false;

  const app = createApp({
    setup() {
      return () =>
        h(ContextMenu, {
          items: rows.value,
          reference: reference.value,
          placement: "bottom-start",
          width: options.width,
          minWidth: options.minWidth,
          align: options.align ?? "left",
          busyId: busyId.value,
          loading: loading.value,
          loadingText: options.loadingText,
          zIndex: options.zIndex,
          onActivate: (id: string) => {
            void activate(id);
          },
          onClose: () => close()
        });
    }
  });
  app.mount(container);

  const entry = { close };
  openMenus.push(entry);

  // Capture phase, so the menu closes before the click reaches whatever the user
  // clicked on. Bound per menu and unbound in `close()`, so nothing outlives it.
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeydown, true);

  void resolveItems(items, options)
    .then((resolved) => {
      if (closed) return;
      rows.value = resolved;
      loading.value = false;
      collectSources(resolved, items, sources);
    })
    .catch((error: unknown) => {
      // `resolveItems` catches everything it can, but an unhandled rejection here
      // would strand the menu in its loading state forever.
      loading.value = false;
      try {
        options.onError?.(error);
      } catch {
        /* the reporter is the caller's problem */
      }
    });

  function onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    // The panel is teleported to `<body>`, so it is *not* a descendant of
    // `container`; matching the menu's own class is what keeps a click on the menu
    // (or on a submenu) from closing it.
    if (target instanceof Element && target.closest(".s-context-menu")) return;
    closeAllContextMenus();
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    // The panel handles arrows, Home/End and Enter/Space, but not Escape: doing it
    // here means Escape closes the whole stack even when focus has left the panel.
    event.preventDefault();
    closeAllContextMenus();
  }

  /** Run a row's command. Guarded against re-entry while one is already running. */
  async function activate(id: string): Promise<void> {
    if (closed || busyId.value !== null) return;
    const source = sources.get(id);
    if (!source) return;
    // A row with children opens them instead of running a command.
    if (source.children && source.children.length > 0) return;

    busyId.value = id;
    try {
      const outcome = await runCommand(source, options);
      // A failure keeps the menu open — `runCommand` has already reported it — so the
      // user can retry, which is exactly what the legacy fire-and-forget path made
      // impossible.
      if (outcome.status !== "error" && outcome.close) close();
    } finally {
      busyId.value = null;
    }
  }

  /** Close this menu. Idempotent. */
  function close(): void {
    if (closed) return;
    closed = true;

    const index = openMenus.indexOf(entry);
    if (index >= 0) openMenus.splice(index, 1);

    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeydown, true);

    app.unmount();
    container.remove();

    // Keyboard users must not be dumped on `<body>`: the legacy `success`-style
    // teardown lost focus entirely, because the element that had it was removed
    // without a replacement.
    if (previousFocus && previousFocus.isConnected) previousFocus.focus();
  }

  return {
    close,
    get isOpen(): boolean {
      return !closed;
    }
  };
}

/**
 * 旧名字。
 *
 * `SPopUpMenu(options, items, event)` 是同一个函数：现有只传两个参数的调用点仍然可以
 * 编译通过，把事件作为第三个参数传进来就能获得正确的定位。
 *
 * The legacy name.
 *
 * `SPopUpMenu(options, items, event)` is the same function: existing call sites that
 * pass two arguments still compile, and gain correct placement by passing the event
 * as a third.
 */
export const SPopUpMenu: SPopUpMenuFactory = createContextMenu;
