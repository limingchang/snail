/**
 * 库内置支持的语言标签。
 *
 * `zh` 与 `en` 为内置目录；`(string & {})` 让自定义标签同样合法，
 * 查找时按 `zh` / `en` 前缀归一化（如 `zh-CN`、`en_US`）。
 *
 * Languages shipped with the library.
 */
export type SnailLanguage = "zh" | "en" | (string & {});

/**
 * 消息目录：点分键 → 含 `%s` 占位符的模板。
 *
 * A message catalogue: dotted key → template containing `%s` placeholders.
 */
export type SnailMessages = Record<string, string>;

/**
 * `setLocale` 接受的入参：
 * - 语言标签（`"zh-CN"`、`"en"`），按内置目录解析
 * - 完整消息目录，覆盖合并到当前目录
 *
 * Anything accepted by `setLocale`:
 * - a language tag (`"zh-CN"`, `"en"`) resolved against the built-in catalogues
 * - a full message catalogue, merged over the current one
 */
export type SnailLocaleInput = SnailLanguage | SnailMessages;
