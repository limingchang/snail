import en from "./en";
import zh from "./zh";
import type { SnailLanguage, SnailLocaleInput, SnailMessages } from "./types";

const BUILT_IN: Record<string, SnailMessages> = { zh, en };

/**
 * Detects the ambient language without assuming a browser.
 *
 * The pre-rewrite implementation read `navigator.language` unconditionally,
 * which threw a `ReferenceError` in Node, in a worker and during SSR. Every
 * probe here is guarded, and the fallback is `en`.
 */
function detectLanguage(): SnailLanguage {
  const globals = globalThis as {
    navigator?: { language?: string; languages?: readonly string[] };
    process?: { env?: Record<string, string | undefined> };
  };

  const fromNavigator =
    globals.navigator?.languages?.[0] ?? globals.navigator?.language;
  if (typeof fromNavigator === "string" && fromNavigator.length > 0) {
    return fromNavigator;
  }

  const fromEnv =
    globals.process?.env?.SNAIL_LOCALE ??
    globals.process?.env?.LC_ALL ??
    globals.process?.env?.LC_MESSAGES ??
    globals.process?.env?.LANG;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;

  return "en";
}

function isCatalogue(value: SnailLocaleInput): value is SnailMessages {
  return typeof value === "object" && value !== null;
}

/** Resolve `zh-CN` / `zh_TW` / `en-US` down to a shipped catalogue. */
function resolveBuiltIn(language: SnailLanguage): SnailMessages | undefined {
  const normalized = language.toLowerCase().replace("_", "-");
  if (normalized.startsWith("zh")) return zh;
  if (normalized.startsWith("en")) return en;
  return undefined;
}

/**
 * Tiny message catalogue with `%s` placeholders.
 *
 * A single shared instance backs the module-level `t()` helper, so plugins can
 * contribute their own messages with `registerMessages()`.
 */
export class Localization {
  private language: SnailLanguage;
  private catalogue: SnailMessages;

  constructor(language?: SnailLocaleInput) {
    this.language = "en";
    this.catalogue = en;
    this.setLocale(language ?? detectLanguage());
  }

  /** Currently active language tag or catalogue name. */
  get locale(): SnailLanguage {
    return this.language;
  }

  /**
   * Switch language.
   *
   * - `"zh"`, `"zh-CN"`, `"en-US"` → pick a shipped catalogue
   * - a message object → merge over the current catalogue (great for plugins
   *   and for applications that want their own wording)
   */
  setLocale(input: SnailLocaleInput): this {
    if (typeof input === "string") {
      this.language = input;
      const builtIn = resolveBuiltIn(input);
      if (builtIn) this.catalogue = builtIn;
      return this;
    }

    if (isCatalogue(input)) {
      this.catalogue = { ...this.catalogue, ...input };
      return this;
    }

    return this;
  }

  /** Merge extra messages into the active catalogue. */
  registerMessages(messages: SnailMessages): this {
    this.catalogue = { ...this.catalogue, ...messages };
    return this;
  }

  /** Current catalogue contents (a snapshot copy). */
  get messages(): SnailMessages {
    return { ...this.catalogue };
  }

  /**
   * Translate `key`, replacing each `%s` with the matching extra argument.
   *
   * A missing key returns the key itself rather than an empty string: the old
   * implementation returned `""`, which silently swallowed typos and produced
   * blank error messages.
   */
  t(key: string, ...args: Array<string | number>): string {
    const template = this.catalogue[key];
    if (template === undefined) return key;

    let index = 0;
    return template.replace(/%s/g, () => {
      const value = args[index++];
      return value === undefined ? "" : String(value);
    });
  }
}

/** Shared catalogue instance used by the whole library. */
export const localization = new Localization();

/**
 * Translate a message using the shared catalogue.
 *
 * @example
 * ```ts
 * t("info.cache.hit", "default.UserApi.list"); // "[…] cache hit"
 * ```
 */
export function t(key: string, ...args: Array<string | number>): string {
  return localization.t(key, ...args);
}

/** Switch the language of the shared catalogue. */
export function setLocale(input: SnailLocaleInput): void {
  localization.setLocale(input);
}

/** Read the active language of the shared catalogue. */
export function getLocale(): SnailLanguage {
  return localization.locale;
}

/** Contribute extra messages to the shared catalogue (used by plugins). */
export function registerMessages(messages: SnailMessages): void {
  localization.registerMessages(messages);
}

export { en, zh };
export type { SnailLanguage, SnailLocaleInput, SnailMessages };
export const languages: string[] = Object.keys(BUILT_IN);
