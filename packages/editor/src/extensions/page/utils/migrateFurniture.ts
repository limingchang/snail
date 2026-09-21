/**
 * 读取在三区域版面配件出现之前写下的文档。
 *
 * ## 为什么不能交给 schema 处理
 *
 * 显而易见的迁移点是 `parseHTML`/`parseJSON` 规则，但两种旧形状以相反的方式失败：
 *
 * - **扁平条带**（`pageHeader` 里直接放普通块）解析得没问题——条带的内容刻意是 `block*`
 *   ——所以 schema 接受它，区域规范化流程在运行时修复它（`utils/regions.ts`）。这里
 *   无事可做。
 * - **页面级 Logo**（`pageLogo` 作为 `page` 的子节点）则*无法*解析：页面的内容表达式
 *   现在是一个序列（`pageHeader? pageContent pageFooter?`），因此 ProseMirror 会直接以
 *   `Invalid content for node page` 拒绝整个文档。Logo 会让旧模板打不开，而不只是样式
 *   丢失。
 *
 * 所以本模块做两件 schema 做不到的事：把页面级 Logo 移进它旧版 `position` 所指的区域，
 * 并把页面的子节点恢复到序列声明的顺序（`header → body → footer`）——这同样是本重建
 * 的第一版所保存的文档需要的，那一版把两个条带插在同一位置，于是页眉可能落到正文之后。
 *
 * ## 它返回拷贝，并且对此很诚实
 *
 * 这里每个函数在无需迁移时都原样返回输入（*同一个*对象），因此调用方可以通过比较引用
 * 来判断是否发生了变化。没有任何东西被就地修改。
 *
 * Reading a document written before the three-region furniture existed.
 *
 * ## Why this cannot be left to the schema
 *
 * The obvious migration point would be a `parseHTML`/`parseJSON` rule, but the two legacy shapes
 * fail in opposite ways:
 *
 * - a **flat band** (`pageHeader` holding ordinary blocks) parses fine — the band's content is
 *   `block*` on purpose — so the schema accepts it and the region normaliser repairs it at runtime
 *   (`utils/regions.ts`). Nothing to do here.
 * - a **page-level logo** (`pageLogo` as a child of `page`) does *not* parse: the page's content
 *   expression is a sequence now (`pageHeader? pageContent pageFooter?`), so ProseMirror rejects
 *   the document outright with `Invalid content for node page`. A logo would make an old template
 *   unopenable rather than merely unstyled.
 *
 * So this module does the two things a schema cannot: it moves a page-level logo into the region
 * its legacy `position` names, and it puts the page's children back in the order the sequence
 * declares (`header → body → footer`), which is also what a document saved by the first version of
 * this rebuild needs — that version inserted both bands at the same position, so a header could end
 * up after the body.
 *
 * ## It is a copy, and it is honest about that
 *
 * Every function here returns the input unchanged (the *same* object) when there is nothing to
 * migrate, so a caller can compare identity to know whether it changed anything. Nothing is mutated.
 */

import type { JSONContent } from "@tiptap/core";

import { FURNITURE_SLOTS } from "../typing/headerFooter";
import type { FurnitureSlot } from "../typing/headerFooter";

/** 本模块知道的节点名。 / The node names this module knows. */
const PAGE = "page";
const PAGE_CONTENT = "pageContent";
const PAGE_HEADER = "pageHeader";
const PAGE_FOOTER = "pageFooter";
const PAGE_LOGO = "pageLogo";
const PAGE_REGION = "pageRegion";

/**
 * 一个没有内容的段落——区域保持可点击所需的占位内容。
 *
 * A paragraph with no content — the placeholder a region needs to stay clickable.
 */
function emptyParagraph(): JSONContent {
  return { type: "paragraph" };
}

/** 带指定槽位的区域节点。 / A region node with the given slot. */
function region(slot: FurnitureSlot, content: JSONContent[]): JSONContent {
  return {
    type: PAGE_REGION,
    attrs: { slot },
    content: content.length > 0 ? content : [emptyParagraph()]
  };
}

/**
 * 把旧版的 `position`（Logo）或 `align`（条带）属性读作槽位。
 *
 * Read a legacy `position` (logo) or `align` (band) attribute as a slot.
 */
function legacySlot(value: unknown): FurnitureSlot | null {
  if (value === "left" || value === "center" || value === "right") return value;
  return null;
}

/**
 * 给条带补齐它的三个区域，并保留它已有的内容。
 *
 * Give a band its three regions, keeping the content it already has.
 *
 * @param content 条带的子节点 / The band's children.
 * @param preferred 条带没有对齐提示时，散落的块去往哪里 /
 *   Where a stray block goes when the band carries no alignment hint. The legacy
 *   header defaulted to right-aligned and the footer to centred, so a hint is usually present.
 */
function normaliseBand(content: JSONContent[], preferred: FurnitureSlot): JSONContent[] {
  const bySlot = new Map<FurnitureSlot, JSONContent[]>();
  const stray: JSONContent[] = [];

  for (const child of content) {
    if (child.type !== PAGE_REGION) {
      stray.push(child);
      continue;
    }
    const slot = legacySlot(child.attrs?.slot) ?? "center";
    const bucket = bySlot.get(slot);
    if (bucket) bucket.push(...(child.content ?? []));
    else bySlot.set(slot, [...(child.content ?? [])]);
  }

  const incomplete =
    bySlot.size !== FURNITURE_SLOTS.length ||
    FURNITURE_SLOTS.some((slot) => (bySlot.get(slot)?.length ?? 0) === 0);
  if (!incomplete && stray.length === 0) return content;

  // A band with no regions at all is the legacy flat shape: all of its content is one run of
  // blocks, and it belongs in the third its own alignment names.
  if (bySlot.size === 0 && stray.length > 0) bySlot.set(preferred, stray);
  else {
    const target = bySlot.get(preferred) ?? [];
    bySlot.set(preferred, [...target, ...stray]);
  }

  return FURNITURE_SLOTS.map((slot) => region(slot, bySlot.get(slot) ?? []));
}

/**
 * 把 Logo 插入到它旧版 `position` 所指的条带区域中。
 *
 * 条带会被**先**规范化：旧版页眉是扁平的，所以必须先给它的文字分配一个三分之一格，
 * 再放置 Logo——在这里从零构建三个区域会悄悄丢掉页眉自己的内容，而那是迁移绝不能做的
 * 唯一一件事。
 *
 * Insert a logo into the region of a band named by its legacy `position`.
 *
 * The band is normalised **first**: a legacy header is flat, so its text has to be given a third
 * before the logo is placed — building the three regions from scratch here would silently drop the
 * header's own content, which is the one thing a migration must never do.
 */
function placeLogo(band: JSONContent, logo: JSONContent, preferred: FurnitureSlot): JSONContent {
  const slot = legacySlot(logo.attrs?.position) ?? "center";
  const normalised = normaliseBand(band.content ?? [], preferred);

  const { position: _position, offsetX: _offsetX, offsetY: _offsetY, ...attrs } = logo.attrs ?? {};

  return {
    ...band,
    content: normalised.map((child) => {
      if ((legacySlot(child.attrs?.slot) ?? "center") !== slot) return child;
      return {
        ...child,
        // The legacy offsets are dropped: a region has nothing to offset from, and keeping them
        // would leave attributes that nothing reads.
        content: [...(child.content ?? [emptyParagraph()]), { type: PAGE_LOGO, attrs, marks: logo.marks }]
      };
    })
  };
}

/** 迁移一个 `page` 节点，或原样返回它。 / Migrate one `page` node, or return it unchanged. */
function migratePage(node: JSONContent): JSONContent {
  const children = node.content;
  if (!children || children.length === 0) return node;

  let header: JSONContent | undefined;
  let footer: JSONContent | undefined;
  const bodies: JSONContent[] = [];
  const logos: JSONContent[] = [];
  const others: JSONContent[] = [];

  for (const child of children) {
    if (child.type === PAGE_HEADER) header = child;
    else if (child.type === PAGE_FOOTER) footer = child;
    else if (child.type === PAGE_CONTENT) bodies.push(child);
    else if (child.type === PAGE_LOGO) logos.push(child);
    else others.push(child);
  }

  let headerContent = header?.content;
  const footerContent = footer?.content;

  // A logo needs a band to live in: the header if there is one, otherwise the footer, otherwise a
  // header created for it. Creating furniture is what makes an old template open *and* keep its
  // logo rather than losing it.
  const headerHint = legacySlot(header?.attrs?.align) ?? "center";
  const footerHint = legacySlot(footer?.attrs?.align) ?? "center";

  if (logos.length > 0) {
    let built = header ?? { type: PAGE_HEADER, attrs: {}, content: [] };
    for (const logo of logos) built = placeLogo(built, logo, headerHint);
    header = built;
    headerContent = built.content;
  }

  // A band that is flat, incomplete or duplicated is repaired here rather than at runtime, because
  // this is the last moment the legacy attributes that say *where* the content went are readable.
  // The band object is only replaced when its content actually changed, so a document that is
  // already in the current shape keeps its node identity (and `migrated` stays `false`).
  if (header && headerContent) {
    const normalised = normaliseBand(headerContent, headerHint);
    if (normalised !== headerContent) header = { ...header, content: normalised };
  }

  if (footer && footerContent) {
    const normalised = normaliseBand(footerContent, footerHint);
    if (normalised !== footerContent) footer = { ...footer, content: normalised };
  }

  // The sequence the page's content expression declares: header, body, footer. Unknown children
  // (a node a consumer added) keep their relative order at the end rather than being dropped.
  const ordered = [
    ...(header ? [header] : []),
    ...bodies,
    ...(footer ? [footer] : []),
    ...others
  ];

  const unchanged =
    ordered.length === children.length && ordered.every((child, index) => child === children[index]);
  return unchanged ? node : { ...node, content: ordered };
}

/**
 * 迁移整个文档；无需迁移时返回**同一个对象**。
 *
 * 遍历是深度优先的，只在通往变化的路径上返回新对象，因此形状已经正确的文档只需一次
 * 遍历、不产生任何分配。
 *
 * Migrate a document, returning the **same object** when nothing needed migrating.
 *
 * The walk is depth-first and returns new objects only along the path to a change, so a document
 * that is already in the current shape costs one traversal and no allocation.
 */
export function migrateFurnitureDocument(content: JSONContent): JSONContent {
  const children = content.content;
  if (!children || children.length === 0) return content;

  let changed = false;
  const next = children.map((child) => {
    const migratedChild = migrateFurnitureDocument(child);
    const result = child.type === PAGE ? migratePage(migratedChild) : migratedChild;
    if (result !== child) changed = true;
    return result;
  });

  return changed ? { ...content, content: next } : content;
}

/**
 * {@link migrateFurnitureDocument} 做了什么，供想报告结果的调用方使用。
 *
 * What {@link migrateFurnitureDocument} did, for a caller that wants to report it.
 */
export interface FurnitureMigrationResult {
  /**
   * 要打开的文档——没有变化时就是输入本身。
   *
   * The document to open — the input itself when nothing changed.
   */
  content: JSONContent;
  /**
   * 文档是在三区域版面配件出现之前写下的时为 `true`。
   *
   * `true` when the document was written before the three-region furniture.
   */
  migrated: boolean;
}

/**
 * {@link migrateFurnitureDocument}，外加「是否发生了变化」的答案。
 *
 * {@link migrateFurnitureDocument} plus the "did it change" answer.
 */
export function migrateFurnitureContent(content: JSONContent): FurnitureMigrationResult {
  const migrated = migrateFurnitureDocument(content);
  return { content: migrated, migrated: migrated !== content };
}
