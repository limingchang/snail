/** Languages shipped with the library. */
export type SnailLanguage = "zh" | "en" | (string & {});

/** A message catalogue: dotted key → template containing `%s` placeholders. */
export type SnailMessages = Record<string, string>;

/**
 * Anything accepted by `setLocale`:
 * - a language tag (`"zh-CN"`, `"en"`) resolved against the built-in catalogues
 * - a full message catalogue, merged over the current one
 */
export type SnailLocaleInput = SnailLanguage | SnailMessages;
