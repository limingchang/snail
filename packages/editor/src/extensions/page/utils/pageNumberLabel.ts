/**
 * Rendering the page number.
 *
 * Pure string substitution, kept out of the node/view files so it can be unit-tested
 * without a schema — and so the *only* place that knows about the placeholder syntax is
 * one function.
 *
 * ## Why this is not "the legacy textFormat"
 *
 * The legacy header/footer wrote the substituted string **into the document** as a real
 * text node. Every page therefore carried a frozen copy of its own number, which is why
 * adding a page left the old numbers wrong (defect 10) and why an empty `textFormat`
 * raised `RangeError: Empty text nodes are not allowed` (defect 1).
 *
 * Here the substitution runs at *render* time, from the enclosing page's `index`
 * attribute, and produces DOM text that is never serialised back. The same template
 * syntax is accepted so an existing stored template keeps rendering, but nothing is
 * written down.
 */

/** `{page}` / `{total}`, plus the legacy `#` / `&` and `$index` / `$total` spellings. */
export function formatPageNumberLabel(
  format: string | undefined,
  page: number,
  total: number,
  fallback: string
): string {
  const pattern = typeof format === "string" && format.trim() !== "" ? format : fallback;
  const pageText = String(page);
  const totalText = String(total);

  return pattern
    .replace(/\{page\}/g, pageText)
    .replace(/#/g, pageText)
    .replace(/\$index/g, pageText)
    .replace(/\{total\}/g, totalText)
    .replace(/&/g, totalText)
    .replace(/\$total/g, totalText);
}
