/**
 * Display formatting: numbers, money — including the Chinese financial uppercase
 * rendering — and date patterns.
 *
 * Everything here is a pure string function over primitives. That is deliberate:
 * the legacy package formatted values while *writing them into the document*, so
 * "what does this variable look like" could only be answered by mutating a live
 * editor. Here the answer is a string, which makes it testable and lets the same
 * variable render differently in design and fill mode.
 */

import type { MoneyVariableData } from "../../typings/variable";

/**
 * The digits used for the Chinese financial uppercase rendering (大写).
 *
 * Not the everyday 一二三: a contract amount is always written in the financial
 * forms, because 一 and 二 are trivially altered on paper.
 */
const CHINESE_DIGITS = ["零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"] as const;

/** Within a four-digit group: 仟 佰 拾. Index `0` is the 仟 position. */
const GROUP_UNITS = ["仟", "佰", "拾", ""] as const;

/** One per four-digit group, least significant first. Chinese has no 万-grouping beyond 亿. */
const BIG_UNITS = ["", "万", "亿", "万亿"] as const;

/**
 * `true` when the amount needs a 零 before the 分.
 *
 * 「壹万零壹元零壹分」 — the 角 position is zero, so the 分 must be introduced by a
 * 零 or it reads as 陆分 of nothing. But 「壹佰贰拾叁元肆角伍分」 needs no 零
 * because the 角 is present, and 「壹万元整」 needs none because there is no
 * fraction at all. The 零 is *always* used here, never 零分: 零分 would restate the
 * absent digit instead of prefixing the present one.
 */
function needsLingBeforeFen(jiao: number, fen: number): boolean {
  return jiao === 0 && fen > 0;
}

/**
 * The amount in 分, rounded the way the digits are rendered.
 *
 * The locale is pinned to `"en-US"` so the string is always `1234.56`: the digits are
 * parsed back out of it, and a locale with a decimal comma (`"de-DE"`) would silently
 * destroy the fraction. `toLocaleString` is used rather than arithmetic because it
 * applies the decimal half-up rule a reader expects from a printed amount, which
 * `Math.round(amount * 100)` and `toFixed(2)` both get wrong on `1.005`.
 */
function centsOf(amount: number): number {
  const rounded = Number(
    amount.toLocaleString("en-US", {
      // Grouping off, so `Number()` can read the string back: `"1,000.00"` parses as
      // `NaN`, which is how this first went wrong for every amount of 1000 or more.
      useGrouping: false,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
  if (!Number.isFinite(rounded)) return 0;
  return Math.round(rounded * 100);
}

/**
 * The Chinese financial uppercase rendering of a non-negative amount.
 *
 * @param value - the amount. Callers pass an already-rounded number, so the digits
 * printed here are the digits of the settled amount — rounding after conversion
 * would produce a 大写 that disagrees with the digits beside it.
 *
 * Cases that are checked by `format.spec.ts`, because each has historically been
 * got wrong: `0` → 零元整; `10` → 壹拾元整 (not 拾元整 — a contract amount keeps its
 * placeholder 拾); `10000` → 壹万元整; `1000001` → 壹佰万零壹元整 (one 零, not four);
 * `20000000.06` → 贰仟万元零陆分.
 */
export function renderChineseMoney(value: number): string {
  const amount = Math.abs(value);
  if (!Number.isFinite(amount)) return "";

  // Round to 分 through *the same* formatter the digits use. `toFixed(2)` and
  // `toLocaleString(…, 2)` disagree on a value like `1.005` — `toFixed` looks at the
  // binary approximation and rounds down, `toLocaleString` applies the decimal
  // half-up rule and rounds up — so mixing them would print ￥1.01 beside 壹元整.
  const totalFen = centsOf(amount);
  if (totalFen === 0) return "零元整";

  const yuan = Math.floor(totalFen / 100);
  const jiao = Math.floor((totalFen % 100) / 10);
  const fen = totalFen % 10;

  const integerPart = yuan === 0 ? "" : `${groupToChinese(yuan)}元`;

  let fractionPart = "";
  if (jiao === 0 && fen === 0) {
    fractionPart = "整";
  } else {
    if (jiao > 0) fractionPart += `${CHINESE_DIGITS[jiao]}角`;
    else if (needsLingBeforeFen(jiao, fen)) fractionPart += "零";
    if (fen > 0) fractionPart += `${CHINESE_DIGITS[fen]}分`;
  }

  return `${integerPart}${fractionPart}`;
}

/**
 * Convert a non-negative integer to Chinese numerals with units.
 *
 * Split into four-digit groups because that is the only unit structure Chinese has:
 * 个 / 万 / 亿, and walk them from the most significant down. A 零 is emitted between
 * two non-zero groups whenever the digits that would sit between them are empty, which
 * is true in two cases:
 *
 * - a whole group was skipped because it was zero (`1000000001` → 壹拾亿零壹);
 * - the current group's own 仟 position is empty (`1000001` → 壹佰万零壹).
 *
 * Getting this wrong is easy and quiet: emitting the 零 in a
 * most-significant-first pass that appends it *after* the preceding group's unit
 * produced `壹零壹佰万`, and testing only group *indices* for adjacency missed
 * `1000001` entirely (its groups are 1 and 100 — adjacent, yet separated by four zero
 * digits).
 */
function groupToChinese(value: number): string {
  if (value === 0) return "零";

  // Least-significant group first; `1000001` is `[1, 100]`.
  const groups: number[] = [];
  let rest = value;
  while (rest > 0) {
    groups.push(rest % 10000);
    rest = Math.floor(rest / 10000);
  }

  let output = "";
  let skippedAZeroGroup = false;

  for (let index = groups.length - 1; index >= 0; index--) {
    const group = groups[index];
    // `noUncheckedIndexedAccess` is off, but an explicit fallback keeps the loop honest
    // without a non-null assertion.
    if (group === undefined) continue;

    if (group === 0) {
      skippedAZeroGroup = true;
      continue;
    }

    // One 零 for the whole empty run. Nothing precedes the first group, so the
    // `group < 1000` case only applies once something has been written.
    if (output.length > 0 && (skippedAZeroGroup || group < 1000)) output += "零";

    output += `${fourDigitGroup(group)}${BIG_UNITS[index] ?? ""}`;
    skippedAZeroGroup = false;
  }

  return output;
}

/** One group of at most four digits: `100` → 壹佰, `1001` → 壹仟零壹, `10` → 壹拾. */
function fourDigitGroup(group: number): string {
  const thousands = Math.floor(group / 1000) % 10;
  const hundreds = Math.floor(group / 100) % 10;
  const tens = Math.floor(group / 10) % 10;
  const ones = group % 10;
  const digits = [thousands, hundreds, tens, ones];

  let output = "";
  let zeroPending = false;

  for (let index = 0; index < digits.length; index++) {
    const digit = digits[index] ?? 0;
    if (digit === 0) {
      // Only a zero *between* digits becomes 零: `1010` → 壹仟零壹拾, but `1000`
      // → 壹仟 and `10` → 壹拾.
      if (output.length > 0) zeroPending = true;
      continue;
    }
    if (zeroPending) {
      output += "零";
      zeroPending = false;
    }
    output += `${CHINESE_DIGITS[digit]}${GROUP_UNITS[index] ?? ""}`;
  }

  return output;
}

/**
 * Format a finite number with an optional fixed precision and thousands grouping.
 *
 * `precision === undefined` renders "as supplied" — the point being that a number a
 * user typed as `3.50` must not silently become `3.5`, and one typed as `3` must not
 * gain `.00`. When a precision *is* given it is authoritative, including its
 * trailing zeros, because it was chosen by the template author.
 *
 * `toLocaleString` is used rather than a hand-rolled grouping loop: it handles the
 * sign, and grouping is locale data, not arithmetic.
 */
export function formatNumber(value: number, precision?: number, thousands?: boolean): string {
  if (!Number.isFinite(value)) return "";

  const options: Intl.NumberFormatOptions =
    precision === undefined
      ? { useGrouping: thousands === true }
      : {
          minimumFractionDigits: Math.max(0, Math.trunc(precision)),
          maximumFractionDigits: Math.max(0, Math.trunc(precision)),
          useGrouping: thousands === true
        };

  // `zh-CN` groups as `1,234,567.89` — the same digits a Chinese contract shows,
  // with no currency symbol of its own to conflict with `MoneyVariableData.currency`.
  return value.toLocaleString("zh-CN", options);
}

/** Format an amount as money, honouring `precision` (default 2) and `thousands` (default true). */
export function formatMoney(value: number, data: MoneyVariableData): string {
  const digits = data.precision === undefined ? 2 : Math.max(0, Math.trunc(data.precision));
  const grouped = formatNumber(value, digits, data.thousands !== false);
  return grouped;
}

/** One substitution in a date pattern. */
export interface DateToken {
  token: string;
  value: string;
}

/**
 * Apply `YYYY MM DD HH mm ss` substitutions to a pattern.
 *
 * A hand-written scanner rather than a chain of `String.replace` calls because the
 * two-digit tokens (`MM`, `mm`, `ss`) overlap the four-digit one (`YYYY`) and each
 * other, and because a pattern is user data: the obvious `replace(/mm/, …)` also
 * rewrites the `mm` inside an unrelated word.
 *
 * Longest-match wins, so `YYYY` is never read as `YY`, which is not a token and
 * would otherwise be left literal while its first two characters vanished.
 */
export function applyDatePattern(pattern: string, tokens: readonly DateToken[]): string {
  // Pre-sorted longest-first so the scanner never has to care about order.
  const sorted = [...tokens].sort((left, right) => right.token.length - left.token.length);
  let output = "";
  let index = 0;

  while (index < pattern.length) {
    let matched = false;
    for (const { token, value } of sorted) {
      if (pattern.startsWith(token, index)) {
        output += value;
        index += token.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      output += pattern[index] ?? "";
      index++;
    }
  }

  return output;
}

/** The `YYYY MM DD HH mm ss` values of a moment, zero-padded. */
export function dateTokens(date: Date): DateToken[] {
  return [
    { token: "YYYY", value: String(date.getFullYear()) },
    { token: "MM", value: pad2(date.getMonth() + 1) },
    { token: "DD", value: pad2(date.getDate()) },
    { token: "HH", value: pad2(date.getHours()) },
    { token: "mm", value: pad2(date.getMinutes()) },
    { token: "ss", value: pad2(date.getSeconds()) }
  ];
}

/** Zero-pad to two digits. `10` stays `10`; `9` becomes `09`. */
export function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** The default date pattern, in the form a Chinese contract uses. */
export const DEFAULT_DATE_FORMAT = "YYYY年MM月DD日";

/** The default money precision, mirroring {@link MoneyVariableData.precision}. */
export const DEFAULT_MONEY_PRECISION = 2;
