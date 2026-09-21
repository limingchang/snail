/**
 * 右键上下文菜单的公共类型。
 *
 * 旧的 `type.ts` 把 `SPopUpMenuItemOptions` 声明为 `{ label, icon?, hoverColor?,
 * display?, enabled?, command, children? }`，其中有四处的类型是 `any`，而组件的
 * props、解析后的行数据以及返回的句柄则完全没有类型（当时也没有句柄 —— 工厂返回
 * `void`）。
 *
 * 含义没有变的名字都保留了：`SPopUpMenuItemOptions`、`SPopUpMenuOptions`、
 * `HandlerCommandFunc`、`TComputedBoolean`、`TextAlign`。
 *
 * Public types for the right-click context menu.
 *
 * The legacy `type.ts` declared `SPopUpMenuItemOptions` as `{ label, icon?,
 * hoverColor?, display?, enabled?, command, children? }` with `any` in four places
 * and no types at all for the component's props, the resolved rows or the returned
 * handle (there was no handle — the factory returned `void`).
 *
 * The names that still mean the same thing are kept: `SPopUpMenuItemOptions`,
 * `SPopUpMenuOptions`, `HandlerCommandFunc`, `TComputedBoolean`, `TextAlign`.
 */

import type { Component } from "vue";
import type { Placement, ReferenceElement } from "@floating-ui/vue";
import type { IconName } from "../icon/icons";

/**
 * 条目可以用作图标的任何东西。
 *
 * - 一个组件（`SIcon` 会直接渲染它），
 * - 内置图标的名称（`"IconVariable"`），
 * - 全局注册组件的名称。
 *
 * Anything an item can use as an icon.
 *
 * - a component (`SIcon` renders it directly),
 * - the name of a bundled icon (`"IconVariable"`),
 * - the name of a globally registered component.
 */
export type ContextMenuIcon = Component | IconName | (string & {});

/**
 * 菜单面板的文字对齐方式。
 *
 * Text alignment of the menu panel.
 */
export type MenuTextAlign = "left" | "center" | "right";

/**
 * {@link MenuTextAlign} 的旧别名。
 *
 * Legacy alias for {@link MenuTextAlign}.
 */
export type TextAlign = MenuTextAlign;

/**
 * 一个布尔值，或者一个产生布尔值的回调 —— 也可能是异步的。
 *
 * 旧签名里的 `context` 参数被标成了 `any`，而它的 `Promise` 分支从未被 await。
 *
 * A boolean, or a callback that produces one — possibly asynchronously.
 *
 * The legacy signature's `context` parameter was typed `any` and its `Promise`
 * branch was never awaited.
 */
export type TComputedBoolean<TContext = unknown> = (
  context: TContext
) => boolean | Promise<boolean>;

/**
 * 条目被激活时运行的命令。
 *
 * The command an item runs when activated.
 */
export type HandlerCommandFunc<TContext = unknown> = (
  context: TContext
) => void | Promise<void>;

/**
 * 菜单中的一行。
 *
 * One row of the menu.
 */
export interface SPopUpMenuItemOptions<TContext = unknown> {
  /**
   * 行文本。`separator` 行留空，它根本不渲染任何文字。
   *
   * Row text. Empty for a `separator` row, which renders no text at all.
   */
  label: string;

  /**
   * 图标组件或已注册的名称，由 `SIcon` 渲染。
   *
   * Icon component or registered name; rendered through `SIcon`.
   */
  icon?: ContextMenuIcon;

  /**
   * 单行的悬停颜色。
   *
   * 为兼容旧代码而保留。更推荐用 `--s-color-primary` 给
   * `.s-context-menu__button` 做主题：这里只是把内联自定义属性写在单独一行上。
   *
   * Per-row hover colour.
   *
   * Kept for compatibility. Prefer theming `.s-context-menu__button` with
   * `--s-color-primary`: this is written as an inline custom property on one row.
   */
  hoverColor?: string;

  /**
   * 这一行是否显示。传 `false` 就把它去掉。
   *
   * 当它是函数时，该行在解析完成之前**一直隐藏** —— 解析为什么是失败即关闭
   * 而不是失败即放行，见 `menu.ts`。
   *
   * Whether the row is shown at all. `false` removes it.
   *
   * When this is a function the row is **hidden until it resolves** — see
   * `menu.ts` for why the resolution is fail-closed rather than fail-open.
   */
  display?: TComputedBoolean<TContext> | boolean;

  /**
   * 这一行是否可以被激活。函数解析为 `false` 时它会被禁用。
   *
   * Whether the row can be activated. A function that resolves `false` disables it.
   */
  enabled?: TComputedBoolean<TContext> | boolean;

  /**
   * 该行被激活时调用，唯一参数是 `options.context`。
   *
   * 返回的 promise 会被 await：菜单给该行显示忙碌态，命令失败时菜单保持打开，
   * 成功时关闭（除非 `closeOnClick` 为 `false`）。旧实现调用
   * `fn(options.context)` 时既不 await，又在同一个 tick 里卸载了菜单，于是异步
   * 命令既没有等待态、也没有错误处理，还能被第二次点击重复进入。
   *
   * Called when the row is activated, with `options.context` as its only argument.
   *
   * A returned promise is awaited: the menu shows a busy row, stays open if it
   * rejects, and closes on success (unless `closeOnClick` is `false`). The legacy
   * implementation called `fn(options.context)` without awaiting and unmounted the
   * menu on the same tick, so an async command had no pending state, no error
   * handling, and could be re-entered by a second click.
   */
  command?: HandlerCommandFunc<TContext>;

  /**
   * 子菜单的行。嵌套层级不限；旧实现的 `renderChild` 会把它们丢掉。
   *
   * Submenu rows. Nesting is arbitrary; the legacy `renderChild` dropped these.
   */
  children?: Array<SPopUpMenuItemOptions<TContext>>;

  /**
   * 渲染一条分隔线而不是一行。`label`/`command`/`display` 会被忽略。
   *
   * Render a divider instead of a row. `label`/`command`/`display` are ignored.
   */
  separator?: boolean;

  /**
   * 用危险色渲染这一行（破坏性命令）。
   *
   * Render the row in the danger colour (destructive commands).
   */
  danger?: boolean;

  /**
   * 静态禁用，等价于 `enabled: false`。
   *
   * Static disable, equivalent to `enabled: false`.
   */
  disabled?: boolean;

  /**
   * 单行覆盖菜单的 `closeOnClick`。
   *
   * 控制器在命令结束之后才读它，所以某个条目可以保持打开，把决定权交回调用方。
   *
   * Per-row override of the menu's `closeOnClick`.
   *
   * The controller reads it after the command settles, so an item can stay open and
   * let the caller decide.
   */
  closeOnClick?: boolean;

  /**
   * 在多次重新解析之间，为键盘与焦点记录提供稳定的标识。
   *
   * 省略时会自动生成；只有当你把同一个菜单解析两次、并需要行与行对得上时才自己传。
   *
   * Stable identity for keyboard/focus bookkeeping across re-resolutions.
   *
   * Generated when omitted; supply one only if you resolve the same menu twice and
   * need the rows to line up.
   */
  id?: string;
}

/**
 * 一个菜单实例的配置项。
 *
 * Options for one menu instance.
 */
export interface SPopUpMenuOptions<TContext = unknown> {
  /**
   * 面板的固定宽度，单位为像素。省略表示「贴合内容」。
   *
   * Fixed panel width in pixels. Omitted means "fit the content".
   */
  width?: number;

  /**
   * 面板的最小宽度，单位为像素。默认为样式表里的 `120px`。
   *
   * Minimum panel width in pixels. Defaults to the stylesheet's `120px`.
   */
  minWidth?: number;

  /**
   * 面板内部的文字对齐方式。
   *
   * Text alignment inside the panel.
   */
  align?: TextAlign;

  /**
   * 任意载荷，作为唯一参数传给每个 `command`。
   *
   * Arbitrary payload handed to every `command` as its only argument.
   */
  context?: TContext;

  /**
   * 激活某个条目后是否关闭菜单。条目自身的设置优先。默认为 `true`。
   *
   * Whether activating an item closes the menu. Item-level setting wins. Defaults to `true`.
   */
  closeOnClick?: boolean;

  /**
   * 上报每一次解析失败和每一次被拒绝的 `command`。
   *
   * 每个失败只上报一次。上报函数自身抛错不会弄坏菜单。
   *
   * Reports every resolution failure and every rejected `command`.
   *
   * Each failure is reported exactly once. A throwing reporter cannot break the menu.
   */
  onError?: (error: unknown, item?: SPopUpMenuItemOptions<TContext>) => void;

  /**
   * 第一次解析还在进行时显示的行文本。
   *
   * Row text shown while the first resolution is in flight.
   */
  loadingText?: string;

  /**
   * 根面板的堆叠层级；默认为 `--s-z-index-context-menu`。
   *
   * Stacking order for the root panel; defaults to `--s-z-index-context-menu`.
   */
  zIndex?: number;

  /**
   * 工厂在没有指针事件时从哪里打开。
   *
   * 坐标相对于视口（与 `MouseEvent.clientX`/`clientY` 一致）。
   *
   * Where to open when the factory is called without a pointer event.
   *
   * Coordinates are viewport-relative (as in `MouseEvent.clientX`/`clientY`).
   */
  position?: { x: number; y: number };
}

/**
 * 一行在展示层的视图。
 *
 * 由 `createItemSnapshot`（同步，一切都尚未解析，因此处于隐藏或禁用状态）和
 * `resolveItems`（在每个异步 `display`/`enabled` 都落定之后）生成。渲染器只会看到
 * 这个形状，所以它既不携带 `command`，也不携带 context 类型。
 *
 * The presentation-layer view of a row.
 *
 * Produced by `createItemSnapshot` (sync, everything unresolved and therefore hidden
 * or disabled) and by `resolveItems` (after every async `display`/`enabled` has
 * settled). The renderer only ever sees this shape, which is why it carries no
 * `command` and no context type.
 */
export interface ResolvedMenuItem {
  /**
   * 稳定的 id，用作 DOM key，并把激活事件路由回原始行。
   *
   * Stable id, used as the DOM key and to route activation back to the source row.
   */
  id: string;
  /** 行文本。 / Row text. */
  label: string;
  /** 图标组件或已注册的名称。 / Icon component or registered name. */
  icon?: ContextMenuIcon;
  /**
   * 渲染为一条分隔线。
   *
   * Render as a divider.
   */
  separator: boolean;
  /**
   * 用危险色渲染。
   *
   * Render in the danger colour.
   */
  danger: boolean;
  /**
   * 这一行是否应该被渲染出来。
   *
   * Whether the row should be rendered at all.
   */
  visible: boolean;
  /**
   * 这一行此刻是否可以被激活。
   *
   * Whether the row can be activated right now.
   */
  enabled: boolean;
  /**
   * 当异步的 `display`/`enabled` 尚未落定时为 `true`。
   *
   * 处于等待中的行永远不会 `visible`（失败即关闭）—— 菜单会改为渲染一个加载行 ——
   * 也永远不会 `enabled`。
   *
   * `true` while an async `display`/`enabled` has not settled.
   *
   * A pending row is never `visible` (fail-closed) — the menu renders a loading row
   * instead — and never `enabled`.
   */
  pending: boolean;
  /**
   * 单行的覆盖值，会一直传到命令执行器。
   *
   * Per-row override carried through to the command runner.
   */
  closeOnClick: boolean | undefined;
  /**
   * 嵌套的行，与它们的父行一起解析。
   *
   * Nested rows, resolved alongside their parent.
   */
  children: ResolvedMenuItem[];
}

/**
 * 运行某个条目的命令所得到的结果。
 *
 * What running an item's command produced.
 */
export interface RunCommandOutcome {
  /**
   * 当该行没有命令（子菜单的父行）时为 `skipped`。
   *
   * `skipped` when the row had no command (a submenu parent).
   */
  status: "success" | "error" | "skipped";
  /**
   * 菜单现在是否应该关闭。失败时始终为 `false`。
   *
   * Whether the menu should now close. Always `false` for a failure.
   */
  close: boolean;
  /**
   * 当 `status` 为 `"error"` 时的拒绝原因。
   *
   * The rejection, when `status` is `"error"`.
   */
  error?: unknown;
}

/**
 * `createContextMenu`/`SPopUpMenu` 返回的命令式句柄。
 *
 * 关闭是幂等的，在菜单已经关闭之后再调用也是安全的。旧的工厂返回 `void`，所以调用方
 * 没有办法关掉自己打开的菜单。
 *
 * Imperative handle returned by `createContextMenu`/`SPopUpMenu`.
 *
 * Closing is idempotent and safe to call after the menu has already closed. The
 * legacy factory returned `void`, so a caller had no way to close the menu it opened.
 */
export interface SPopUpMenuHandle {
  /**
   * 关闭这个菜单（以及任何已打开的子菜单）。可以重复调用。
   *
   * Close this menu (and any open submenu). Safe to call more than once.
   */
  close: () => void;
  /**
   * 这个菜单是否仍然打开着。
   *
   * Whether this menu is still open.
   */
  readonly isOpen: boolean;
}

/**
 * {@link SPopUpMenuHandle} 在新名字下的别名。
 *
 * Alias for {@link SPopUpMenuHandle} under the new name.
 */
export type ContextMenuHandle = SPopUpMenuHandle;

/**
 * 可以在指定位置打开菜单的指针来源。
 *
 * Accepted pointer sources for opening at a specific place.
 */
export type ContextMenuPointer =
  | MouseEvent
  | { clientX: number; clientY: number }
  | { x: number; y: number };

/**
 * 命令式工厂的签名。
 *
 * Signature of the programmatic factory.
 */
export type SPopUpMenuFactory = <TContext = unknown>(
  options: SPopUpMenuOptions<TContext>,
  items: Array<SPopUpMenuItemOptions<TContext>>,
  pointer?: ContextMenuPointer
) => SPopUpMenuHandle;

/**
 * 浮动元素的定位参考。
 *
 * The floating element's positioning reference.
 */
export type ContextMenuReference = ReferenceElement | null;

/**
 * 菜单面板相对于其参考元素的位置。
 *
 * Placement of a menu panel relative to its reference.
 */
export type ContextMenuPlacement = Placement;

/**
 * `SContextMenu` 展示组件的 props。
 *
 * Props of the `SContextMenu` presentation component.
 */
export interface ContextMenuProps {
  /**
   * 要渲染的行。
   *
   * Rows to render.
   */
  items: ResolvedMenuItem[];
  /**
   * 虚拟元素（在指针处打开）或真实元素（子菜单）。
   *
   * Virtual element (opened at the pointer) or real element (a submenu).
   */
  reference?: ContextMenuReference;
  /**
   * 更倾向于把面板放在哪里。默认为 `bottom-start`。
   *
   * Where to prefer placing the panel. Defaults to `bottom-start`.
   */
  placement?: ContextMenuPlacement;
  /**
   * 固定宽度，单位为像素。
   *
   * Fixed width in pixels.
   */
  width?: number;
  /**
   * 最小宽度，单位为像素。
   *
   * Minimum width in pixels.
   */
  minWidth?: number;
  /**
   * 面板内部的文字对齐方式。
   *
   * Text alignment inside the panel.
   */
  align?: MenuTextAlign;
  /**
   * 当前正在运行命令的行的 id。
   *
   * Id of the row currently running a command.
   */
  busyId?: string | null;
  /**
   * 当还什么都不可见、解析仍在进行时显示的行文本。
   *
   * Row text shown while nothing is visible yet and resolution is in flight.
   */
  loadingText?: string;
  /**
   * 是否还有一轮解析正在进行。
   *
   * Whether a resolution pass is still in flight.
   */
  loading?: boolean;
  /**
   * 这个面板的堆叠层级。
   *
   * Stacking order for this panel.
   */
  zIndex?: number;
  /**
   * 挂载时聚焦第一个可启用的行。默认为 `true`。
   *
   * Focus the first enabled row on mount. Defaults to `true`.
   */
  autofocus?: boolean;
  /**
   * 嵌套深度，仅用于让子菜单盖在父面板之上。
   *
   * Nesting depth, used only to keep submenus above their parent.
   */
  depth?: number;
}

/**
 * `SContextMenu` 展示组件的事件。
 *
 * Events of the `SContextMenu` presentation component.
 */
export interface ContextMenuEmits {
  /**
   * 某一行被激活；携带该行的 id。
   *
   * A row was activated; carries the row id.
   */
  activate: [id: string];
  /**
   * 界面请求关闭（根列表上按左方向键）。
   *
   * The surface asked to be closed (Arrow Left on the root list).
   */
  close: [];
  /**
   * 指针进入这个面板，取消待执行的悬停关闭。
   *
   * The pointer entered this panel, cancelling a pending hover-close.
   */
  keepOpen: [];
}

/**
 * 行组件的 props。
 *
 * Props of the row component.
 */
export interface MenuItemProps {
  /**
   * 要渲染的行。
   *
   * The row to render.
   */
  item: ResolvedMenuItem;
  /**
   * 这一行是否是键盘/悬停高亮项。
   *
   * Whether this row is the keyboard/hover highlight.
   */
  active: boolean;
  /**
   * 这一行是否正在运行它的命令。
   *
   * Whether this row is running its command.
   */
  busy: boolean;
  /**
   * 这一行的子菜单是否打开。驱动 `aria-expanded`。
   *
   * Whether this row's submenu is open. Drives `aria-expanded`.
   */
  expanded?: boolean;
}

/**
 * 行组件的事件。
 *
 * Events of the row component.
 */
export interface MenuItemEmits {
  /**
   * 这一行被点击了。
   *
   * The row was clicked.
   */
  activate: [];
  /**
   * 指针进入了这一行。
   *
   * The pointer entered the row.
   */
  hover: [];
}
