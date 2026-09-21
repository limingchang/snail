import en from "./en";
import zh from "./zh";
import type { SnailLanguage, SnailLocaleInput, SnailMessages } from "./types";

const BUILT_IN: Record<string, SnailMessages> = { zh, en };

/**
 * 在没有浏览器假设的前提下探测当前语言。
 *
 * 重写前的实现无条件读取 `navigator.language`，在 Node、worker 与 SSR 中会抛出
 * `ReferenceError`。这里的每一次探测都有守卫，兜底值为 `en`。
 *
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

/**
 * 把 `zh-CN` / `zh_TW` / `en-US` 归一到随包发布的消息目录。
 *
 * Resolve `zh-CN` / `zh_TW` / `en-US` down to a shipped catalogue.
 */
function resolveBuiltIn(language: SnailLanguage): SnailMessages | undefined {
  const normalized = language.toLowerCase().replace("_", "-");
  if (normalized.startsWith("zh")) return zh;
  if (normalized.startsWith("en")) return en;
  return undefined;
}

/**
 * 极简消息目录，支持 `%s` 占位符。
 *
 * 模块级 `t()` 辅助函数共用一个实例，插件因此可以通过 `registerMessages()`
 * 追加自己的文案。
 *
 * Tiny message catalogue with `%s` placeholders.
 *
 * A single shared instance backs the module-level `t()` helper, so plugins can
 * contribute their own messages with `registerMessages()`.
 */
export class Localization {
  private language: SnailLanguage;
  private catalogue: SnailMessages;

  /**
   * 创建目录；未显式传入时自动探测当前运行环境的语言。
   *
   * Creates a catalogue, detecting the ambient language when none is passed.
   *
   * @param language 语言标签或消息目录 / Language tag or message catalogue
   */
  constructor(language?: SnailLocaleInput) {
    this.language = "en";
    this.catalogue = en;
    this.setLocale(language ?? detectLanguage());
  }

  /**
   * 当前生效的语言标签（或目录名）。
   *
   * Currently active language tag or catalogue name.
   */
  get locale(): SnailLanguage {
    return this.language;
  }

  /**
   * 切换语言。
   *
   * - `"zh"`、`"zh-CN"`、`"en-US"` → 选中已内置的目录
   * - 消息对象 → 覆盖合并到当前目录（插件与自定义文案常用）
   *
   * 无法识别的标签只更新语言名，目录保持不变。
   *
   * Switch language.
   *
   * - `"zh"`, `"zh-CN"`, `"en-US"` → pick a shipped catalogue
   * - a message object → merge over the current catalogue (great for plugins
   *   and for applications that want their own wording)
   *
   * @param input 语言标签或消息目录 / Language tag or message catalogue
   * @returns 当前实例，便于链式调用 / This instance, for chaining
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

  /**
   * 把额外文案合并进当前目录。
   *
   * Merge extra messages into the active catalogue.
   *
   * @param messages 要合并的消息目录 / Messages to merge in
   * @returns 当前实例，便于链式调用 / This instance, for chaining
   */
  registerMessages(messages: SnailMessages): this {
    this.catalogue = { ...this.catalogue, ...messages };
    return this;
  }

  /**
   * 当前目录内容（返回快照副本，外部修改不会影响内部目录）。
   *
   * Current catalogue contents (a snapshot copy).
   */
  get messages(): SnailMessages {
    return { ...this.catalogue };
  }

  /**
   * 翻译 `key`，把每个 `%s` 依次替换为对应的额外参数。
   *
   * 找不到键时返回键名本身而不是空串：旧实现返回 `""`，会悄悄吞掉拼写
   * 错误并产生空白的错误信息。占位符多于参数时，多出的替换为空串。
   *
   * Translate `key`, replacing each `%s` with the matching extra argument.
   *
   * A missing key returns the key itself rather than an empty string: the old
   * implementation returned `""`, which silently swallowed typos and produced
   * blank error messages.
   *
   * @param key 消息键 / Message key
   * @param args 依次替换 `%s` 的值 / Values substituted for each `%s`
   * @returns 翻译结果，键缺失时为键名 / The translation, or the key when missing
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

/**
 * 共享消息目录实例。
 *
 * 整个库共用一个实例，插件因此可以通过 registerMessages() 追加自己的文案。
 *
 * Shared catalogue instance used by the whole library.
 */
export const localization = new Localization();

/**
 * 用共享目录翻译一条消息。
 *
 * Translate a message using the shared catalogue.
 *
 * @param key 消息键 / Message key
 * @param args 依次替换 `%s` 的值 / Values substituted for each `%s`
 * @returns 翻译结果，键缺失时为键名 / The translation, or the key when missing
 *
 * @example
 * ```ts
 * t("info.cache.hit", "default.UserApi.list"); // "[…] cache hit"
 * ```
 */
export function t(key: string, ...args: Array<string | number>): string {
  return localization.t(key, ...args);
}

/**
 * 切换共享目录的语言。
 *
 * Switch the language of the shared catalogue.
 *
 * @param input 语言标签或消息目录 / Language tag or message catalogue
 */
export function setLocale(input: SnailLocaleInput): void {
  localization.setLocale(input);
}

/**
 * 读取共享目录当前的语言。
 *
 * Read the active language of the shared catalogue.
 *
 * @returns 当前语言标签 / The active language tag
 */
export function getLocale(): SnailLanguage {
  return localization.locale;
}

/**
 * 向共享目录追加文案（供插件使用）。
 *
 * Contribute extra messages to the shared catalogue (used by plugins).
 *
 * @param messages 要合并的消息目录 / Messages to merge in
 */
export function registerMessages(messages: SnailMessages): void {
  localization.registerMessages(messages);
}

export { en, zh };
export type { SnailLanguage, SnailLocaleInput, SnailMessages };
/**
 * 内置目录的语言名列表，顺序与 `Object.keys(BUILT_IN)` 一致。
 *
 * Language names of the built-in catalogues, in `Object.keys` order.
 */
export const languages: string[] = Object.keys(BUILT_IN);
