/**
 * 渲染页码。
 *
 * 纯粹的字符串替换，放在节点/视图文件之外，这样不需要 schema 就能单元测试——也为了让
 * *唯一*了解占位符语法的代码只有这一个函数。
 *
 * ## 为什么这不是「旧版的 textFormat」
 *
 * 旧版页眉/页脚把替换后的字符串**写进文档**，成为一个真实的文本节点。于是每一页都带着
 * 自己页码的一份冻结副本，这就是为什么增加页面后旧的页码仍是错的（缺陷 10），也是为什么
 * 空的 `textFormat` 会抛出 `RangeError: Empty text nodes are not allowed`（缺陷 1）。
 *
 * 这里替换发生在*渲染*时，取自所属页面的 `index` 属性，产生的 DOM 文本永远不会被序列化
 * 回去。同样的模板语法仍被接受，因此已保存的模板继续可渲染，但什么都不会被写下来。
 *
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

/**
 * `{page}` / `{total}`，外加旧版的 `#` / `&` 与 `$index` / `$total` 写法。
 *
 * `{page}` / `{total}`, plus the legacy `#` / `&` and `$index` / `$total` spellings.
 */
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
