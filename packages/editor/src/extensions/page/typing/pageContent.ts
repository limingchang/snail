/**
 * Page-body contracts: the pagination engine's controls and the diagnostics it leaves
 * behind for the toolbar.
 */

/**
 * Options accepted by `PageContent.configure(...)`.
 *
 * Reachable from the page as `Page.configure({ pagination: { tolerance: 2 } })`, or
 * `Page.configure({ pagination: false })` to keep the `pageContent` node in the schema
 * but never split anything.
 */
export interface PageContentOptions {
  /**
   * Whether the automatic pass runs at all. Default `true`.
   *
   * Turning it off keeps the node and every command: only the scheduled measurement pass
   * stops, so a consumer can drive pagination itself from a toolbar button
   * (`paginate`) or from stored settings.
   */
  autoPagination?: boolean;

  /**
   * Pixels of slack tolerated before a page is considered to overflow. Default `1`.
   *
   * `getBoundingClientRect()` returns fractional pixels and the error accumulates over a
   * long contract, so a page measured at 1000.4px against a 1000px box must not shed its
   * last paragraph.
   */
  tolerance?: number;

  HTMLAttributes?: Record<string, string>;
}

/** What the last pagination pass did. Purely informational; never `console.log`ed. */
export interface PaginationDiagnostics {
  /** How many pages the document had when the pass finished. */
  pages: number;
  /** How many ranges the pass moved. */
  moved: number;
  /** How many blocks the engine reported as unplaceable. */
  oversized: number;
  /** Whether the pass dispatched a transaction. */
  changed: boolean;
}

/**
 * The handle a command uses to poke the pagination plugin.
 *
 * The plugin owns the schedule; the command only asks for a pass, so a toolbar button
 * can never run a second pass while one is in flight (defect 7's re-entrancy).
 */
export interface PaginationController {
  /** Ask for a pass on the next animation frame. Repeated calls coalesce into one. */
  request(): void;

  /** Run a pass now (still guarded). Returns whether the document changed. */
  flush(): boolean;

  /** Whether a pass is currently in flight. */
  isRunning(): boolean;
}

/** `editor.storage.pageContent`. */
export interface PageContentStorage {
  /** Mirrors {@link PageContentOptions.autoPagination}. */
  autoPagination: boolean;

  /** Mirrors {@link PageContentOptions.tolerance}. */
  tolerance: number;

  /** Set once the plugin's view is created; `null` in an unmounted editor. */
  controller: PaginationController | null;

  /** What the last pass did, for a status bar or a test. */
  lastPlan: PaginationDiagnostics | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageContent: {
      /**
       * Run a pagination pass now, coalesced with any pass already scheduled.
       *
       * This is the handler the legacy 「分页」 toolbar button never had (defect 21).
       */
      paginate: () => ReturnType;

      /**
       * Turn the automatic pass on or off. Returns `false` when it was already in that
       * state, so a toolbar can render it as a real toggle (defect 17).
       */
      setAutoPagination: (enabled: boolean) => ReturnType;
    };
  }

  interface Storage {
    pageContent: PageContentStorage;
  }
}
