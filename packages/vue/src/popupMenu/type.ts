/**
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
 * Anything an item can use as an icon.
 *
 * - a component (`SIcon` renders it directly),
 * - the name of a bundled icon (`"IconVariable"`),
 * - the name of a globally registered component.
 */
export type ContextMenuIcon = Component | IconName | (string & {});

/** Text alignment of the menu panel. */
export type MenuTextAlign = "left" | "center" | "right";

/** Legacy alias for {@link MenuTextAlign}. */
export type TextAlign = MenuTextAlign;

/**
 * A boolean, or a callback that produces one — possibly asynchronously.
 *
 * The legacy signature's `context` parameter was typed `any` and its `Promise`
 * branch was never awaited.
 */
export type TComputedBoolean<TContext = unknown> = (
  context: TContext
) => boolean | Promise<boolean>;

/** The command an item runs when activated. */
export type HandlerCommandFunc<TContext = unknown> = (
  context: TContext
) => void | Promise<void>;

/** One row of the menu. */
export interface SPopUpMenuItemOptions<TContext = unknown> {
  /** Row text. Empty for a `separator` row, which renders no text at all. */
  label: string;

  /** Icon component or registered name; rendered through `SIcon`. */
  icon?: ContextMenuIcon;

  /**
   * Per-row hover colour.
   *
   * Kept for compatibility. Prefer theming `.s-context-menu__button` with
   * `--s-color-primary`: this is written as an inline custom property on one row.
   */
  hoverColor?: string;

  /**
   * Whether the row is shown at all. `false` removes it.
   *
   * When this is a function the row is **hidden until it resolves** — see
   * `menu.ts` for why the resolution is fail-closed rather than fail-open.
   */
  display?: TComputedBoolean<TContext> | boolean;

  /** Whether the row can be activated. A function that resolves `false` disables it. */
  enabled?: TComputedBoolean<TContext> | boolean;

  /**
   * Called when the row is activated, with `options.context` as its only argument.
   *
   * A returned promise is awaited: the menu shows a busy row, stays open if it
   * rejects, and closes on success (unless `closeOnClick` is `false`). The legacy
   * implementation called `fn(options.context)` without awaiting and unmounted the
   * menu on the same tick, so an async command had no pending state, no error
   * handling, and could be re-entered by a second click.
   */
  command?: HandlerCommandFunc<TContext>;

  /** Submenu rows. Nesting is arbitrary; the legacy `renderChild` dropped these. */
  children?: Array<SPopUpMenuItemOptions<TContext>>;

  /** Render a divider instead of a row. `label`/`command`/`display` are ignored. */
  separator?: boolean;

  /** Render the row in the danger colour (destructive commands). */
  danger?: boolean;

  /** Static disable, equivalent to `enabled: false`. */
  disabled?: boolean;

  /**
   * Per-row override of the menu's `closeOnClick`.
   *
   * The controller reads it after the command settles, so an item can stay open and
   * let the caller decide.
   */
  closeOnClick?: boolean;

  /**
   * Stable identity for keyboard/focus bookkeeping across re-resolutions.
   *
   * Generated when omitted; supply one only if you resolve the same menu twice and
   * need the rows to line up.
   */
  id?: string;
}

/** Options for one menu instance. */
export interface SPopUpMenuOptions<TContext = unknown> {
  /** Fixed panel width in pixels. Omitted means "fit the content". */
  width?: number;

  /** Minimum panel width in pixels. Defaults to the stylesheet's `120px`. */
  minWidth?: number;

  /** Text alignment inside the panel. */
  align?: TextAlign;

  /** Arbitrary payload handed to every `command` as its only argument. */
  context?: TContext;

  /** Whether activating an item closes the menu. Item-level setting wins. Defaults to `true`. */
  closeOnClick?: boolean;

  /**
   * Reports every resolution failure and every rejected `command`.
   *
   * Each failure is reported exactly once. A throwing reporter cannot break the menu.
   */
  onError?: (error: unknown, item?: SPopUpMenuItemOptions<TContext>) => void;

  /** Row text shown while the first resolution is in flight. */
  loadingText?: string;

  /** Stacking order for the root panel; defaults to `--s-z-index-context-menu`. */
  zIndex?: number;

  /**
   * Where to open when the factory is called without a pointer event.
   *
   * Coordinates are viewport-relative (as in `MouseEvent.clientX`/`clientY`).
   */
  position?: { x: number; y: number };
}

/**
 * The presentation-layer view of a row.
 *
 * Produced by `createItemSnapshot` (sync, everything unresolved and therefore hidden
 * or disabled) and by `resolveItems` (after every async `display`/`enabled` has
 * settled). The renderer only ever sees this shape, which is why it carries no
 * `command` and no context type.
 */
export interface ResolvedMenuItem {
  /** Stable id, used as the DOM key and to route activation back to the source row. */
  id: string;
  label: string;
  icon?: ContextMenuIcon;
  /** Render as a divider. */
  separator: boolean;
  /** Render in the danger colour. */
  danger: boolean;
  /** Whether the row should be rendered at all. */
  visible: boolean;
  /** Whether the row can be activated right now. */
  enabled: boolean;
  /**
   * `true` while an async `display`/`enabled` has not settled.
   *
   * A pending row is never `visible` (fail-closed) — the menu renders a loading row
   * instead — and never `enabled`.
   */
  pending: boolean;
  /** Per-row override carried through to the command runner. */
  closeOnClick: boolean | undefined;
  /** Nested rows, resolved alongside their parent. */
  children: ResolvedMenuItem[];
}

/** What running an item's command produced. */
export interface RunCommandOutcome {
  /** `skipped` when the row had no command (a submenu parent). */
  status: "success" | "error" | "skipped";
  /** Whether the menu should now close. Always `false` for a failure. */
  close: boolean;
  /** The rejection, when `status` is `"error"`. */
  error?: unknown;
}

/**
 * Imperative handle returned by `createContextMenu`/`SPopUpMenu`.
 *
 * Closing is idempotent and safe to call after the menu has already closed. The
 * legacy factory returned `void`, so a caller had no way to close the menu it opened.
 */
export interface SPopUpMenuHandle {
  /** Close this menu (and any open submenu). Safe to call more than once. */
  close: () => void;
  /** Whether this menu is still open. */
  readonly isOpen: boolean;
}

/** Alias for {@link SPopUpMenuHandle} under the new name. */
export type ContextMenuHandle = SPopUpMenuHandle;

/** Accepted pointer sources for opening at a specific place. */
export type ContextMenuPointer =
  | MouseEvent
  | { clientX: number; clientY: number }
  | { x: number; y: number };

/** Signature of the programmatic factory. */
export type SPopUpMenuFactory = <TContext = unknown>(
  options: SPopUpMenuOptions<TContext>,
  items: Array<SPopUpMenuItemOptions<TContext>>,
  pointer?: ContextMenuPointer
) => SPopUpMenuHandle;

/** The floating element's positioning reference. */
export type ContextMenuReference = ReferenceElement | null;

/** Placement of a menu panel relative to its reference. */
export type ContextMenuPlacement = Placement;

/** Props of the `SContextMenu` presentation component. */
export interface ContextMenuProps {
  /** Rows to render. */
  items: ResolvedMenuItem[];
  /** Virtual element (opened at the pointer) or real element (a submenu). */
  reference?: ContextMenuReference;
  /** Where to prefer placing the panel. Defaults to `bottom-start`. */
  placement?: ContextMenuPlacement;
  /** Fixed width in pixels. */
  width?: number;
  /** Minimum width in pixels. */
  minWidth?: number;
  /** Text alignment inside the panel. */
  align?: MenuTextAlign;
  /** Id of the row currently running a command. */
  busyId?: string | null;
  /** Row text shown while nothing is visible yet and resolution is in flight. */
  loadingText?: string;
  /** Whether a resolution pass is still in flight. */
  loading?: boolean;
  /** Stacking order for this panel. */
  zIndex?: number;
  /** Focus the first enabled row on mount. Defaults to `true`. */
  autofocus?: boolean;
  /** Nesting depth, used only to keep submenus above their parent. */
  depth?: number;
}

/** Events of the `SContextMenu` presentation component. */
export interface ContextMenuEmits {
  /** A row was activated; carries the row id. */
  activate: [id: string];
  /** The surface asked to be closed (Arrow Left on the root list). */
  close: [];
  /** The pointer entered this panel, cancelling a pending hover-close. */
  keepOpen: [];
}

/** Props of the row component. */
export interface MenuItemProps {
  /** The row to render. */
  item: ResolvedMenuItem;
  /** Whether this row is the keyboard/hover highlight. */
  active: boolean;
  /** Whether this row is running its command. */
  busy: boolean;
  /** Whether this row's submenu is open. Drives `aria-expanded`. */
  expanded?: boolean;
}

/** Events of the row component. */
export interface MenuItemEmits {
  /** The row was clicked. */
  activate: [];
  /** The pointer entered the row. */
  hover: [];
}
