/**
 * `PageLogo`——放在页眉或页脚某个区域里的标记。
 *
 * 这个节点以前是 `page` 的子节点，由页面的节点视图画成绝对定位的浮层，位置由 `position` 加毫米偏移
 * 决定。那种模型表达不了「Logo 占据页脚左三分之一」：页面的子节点没有三分之一，标记浮在纸上而不是
 * 活在页眉 / 页脚里，偏移量还构成第二套互相冲突的坐标系。
 *
 * 现在它是 **`pageRegion` 里的一个块**，和页码完全一样：它所在的区域*就是*它的位置，该区域随之
 * 被锁定（不可编辑），两个功能共用一套模型而不是两套。旧的 `position` / `offsetX` / `offsetY`
 * 属性由 `utils/migrateFurniture.ts` 读取并变成一个区域。
 *
 * 旧节点视图返回一个隐藏的 `div`，把绘制留给页面；这里的节点视图自己渲染 `<img>`，因为 Logo 就是
 * 普通的页眉 / 页脚内容：它随所在的区域一起流动、一起打印，区域被移除它也就没了。
 *
 * `PageLogo` — a mark placed in one region of a header or footer.
 *
 * ## What changed, and why
 *
 * The node used to be a child of the `page` and was drawn as an absolutely positioned overlay by
 * the page's node view, with `position` plus millimetre offsets deciding where. That model cannot
 * express "the logo occupies the left third of the footer": a page child has no third, the mark
 * floated over the paper instead of living in the furniture, and the offsets were a second,
 * competing coordinate system.
 *
 * It is a **block inside a `pageRegion`** now, exactly like the page number: the region it sits in
 * *is* its placement, that region becomes locked (not editable), and the two features share one
 * model instead of two. The legacy `position`/`offsetX`/`offsetY` attributes are read by
 * `utils/migrateFurniture.ts` and turned into a region.
 *
 * ## It is a real image node, not a placeholder
 *
 * The old node view returned a hidden `div` and left the drawing to the page. Here the node view
 * renders the `<img>` itself, because the logo is ordinary furniture content: it flows with the
 * region it is in, it prints with it, and removing the region removes it.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import { DATA_TYPE, PAGE_LOGO_CLASS } from "../constant/dom";
import { DEFAULT_FURNITURE_HEIGHT, DEFAULT_LOGO_ATTRIBUTES } from "../constant/defaults";
import type { FurnitureAttributes, FurnitureSide } from "../typing/headerFooter";
import type { LogoAttributes, LogoPlacement, PageLogoOptions } from "../typing/pageLogo";
import { readCss, readString } from "../utils/attributes";
import { ensureBand } from "../utils/furniture";
import { FURNITURE_META } from "../utils/furnitureEditing";
import type { FurnitureMeta } from "../utils/furnitureEditing";
import {
  PAGE_FOOTER_NODE,
  PAGE_HEADER_NODE,
  PAGE_LOGO_NODE,
  collectPages,
  findChild
} from "../utils/nodes";
import type { PageChildRef, PageRef } from "../utils/nodes";
import { collectRegions, findLogo, regionContentEnd, regionMap } from "../utils/regions";

/**
 * `pageLogo` 扩展：页眉 / 页脚区域里的一个块级图片节点。
 *
 * The `pageLogo` extension: a block-level image node inside a header/footer region.
 */
export const PageLogo = Node.create<PageLogoOptions>({
  name: PAGE_LOGO_NODE,
  // A `block`, because it lives in a region (`block*`) and occupies it: the logo is not a run of
  // text that happens to be a picture.
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      src: DEFAULT_LOGO_ATTRIBUTES.src,
      width: DEFAULT_LOGO_ATTRIBUTES.width,
      height: DEFAULT_LOGO_ATTRIBUTES.height,
      maxBytes: DEFAULT_MAX_LOGO_BYTES,
      HTMLAttributes: {}
    };
  },

  addAttributes() {
    const defaults = resolveDefaults(this.options);

    return {
      src: {
        default: defaults.src,
        parseHTML: (element) => element.getAttribute("data-src"),
        renderHTML: (attributes) =>
          typeof attributes.src === "string" && attributes.src !== ""
            ? { "data-src": attributes.src }
            : {}
      },
      width: {
        default: defaults.width,
        parseHTML: (element) => element.getAttribute("data-width"),
        renderHTML: (attributes) => ({ "data-width": attributes.width })
      },
      height: {
        default: defaults.height,
        parseHTML: (element) => element.getAttribute("data-height"),
        renderHTML: (attributes) => ({ "data-height": attributes.height })
      }
    };
  },

  parseHTML() {
    return [{ tag: `img[data-type="${DATA_TYPE.pageLogo}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    // A leaf node: no content hole in the spec.
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes ?? {}, HTMLAttributes, {
        class: PAGE_LOGO_CLASS,
        "data-type": DATA_TYPE.pageLogo,
        alt: ""
      })
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("img");
      dom.className = PAGE_LOGO_CLASS;
      dom.setAttribute("data-type", DATA_TYPE.pageLogo);
      dom.alt = "";

      const apply = (current: PMNode): void => {
        const src = readString(current.attrs.src, "");
        if (src === "") dom.removeAttribute("src");
        else if (dom.getAttribute("src") !== src) dom.src = src;

        dom.style.width = readCss(current.attrs.width, DEFAULT_LOGO_ATTRIBUTES.width);
        dom.style.height = readCss(current.attrs.height, DEFAULT_LOGO_ATTRIBUTES.height);
        dom.hidden = src === "";
      };
      apply(node);

      return {
        dom,
        update: (updated: PMNode) => {
          if (updated.type.name !== PAGE_LOGO_NODE) return false;
          apply(updated);
          return true;
        },
        destroy: () => {
          // An `<img>` holds no timers and no listeners of ours.
        },
        // The element is a leaf the editor draws: no mutation inside it is content.
        ignoreMutation: () => true
      };
    };
  },

  addCommands() {
    const defaults = resolveDefaults(this.options);

    return {
      setLogo:
        (placement: LogoPlacement, attributes?: Partial<LogoAttributes>, pageIndex?: number) =>
        (props: CommandProps): boolean =>
          placeLogo(props, defaults, placement, attributes, pageIndex),

      removeLogo:
        (pageIndex?: number) =>
        (props: CommandProps): boolean =>
          removeLogo(props, pageIndex),

      setLogoSize:
        (attributes: Partial<LogoAttributes>, pageIndex?: number) =>
        (props: CommandProps): boolean =>
          resizeLogo(props, attributes, pageIndex)
    };
  }
});

/**
 * 200 KB：这种大小的 `data:` URL 每次保存都已经是 270 000 个字符。
 *
 * 200 KB: a `data:` URL of this size is already 270 000 characters in every save.
 */
export const DEFAULT_MAX_LOGO_BYTES = 200 * 1024;

/**
 * 新 Logo 解析后的默认值。
 *
 * The resolved defaults for a fresh logo.
 */
function resolveDefaults(options: PageLogoOptions): LogoAttributes {
  return {
    src: readString(options.src, DEFAULT_LOGO_ATTRIBUTES.src),
    width: readCss(options.width, DEFAULT_LOGO_ATTRIBUTES.width),
    height: readCss(options.height, DEFAULT_LOGO_ATTRIBUTES.height)
  };
}

/**
 * 为 Logo *而创建*的栏拿到的属性。
 *
 * Logo 自己没有高度可以提供，所以新建的栏取标准页眉 / 页脚高度；已经存在的栏保留自己的。
 *
 * The band attributes a band created *for a logo* gets.
 *
 * The logo has no height of its own to offer, so a created band takes the standard furniture
 * height; a band that already exists keeps its own.
 */
function bandDefaults(): FurnitureAttributes {
  return { height: DEFAULT_FURNITURE_HEIGHT, showLine: false };
}

/**
 * 把 Logo 放进每一个目标页面的某个区域。
 *
 * 页面按**从后往前**的顺序处理，这样插入不会让还没处理的页面位置失效；每次编辑之后所有位置都从事务
 * 自己的文档重新读取——删掉旧 Logo 会移动新 Logo 要进入的那个区域（缺陷 11 正是这一类位置过期）。
 *
 * Place the logo in one region of every target page.
 *
 * Pages are visited **last to first** so an insertion cannot invalidate a page that has not been
 * handled yet, and every position is re-read from the transaction's own document after each edit —
 * deleting the old logo moves the region the new one goes into (defect 11 is exactly this class of
 * stale position).
 */
function placeLogo(
  props: CommandProps,
  defaults: LogoAttributes,
  placement: LogoPlacement,
  attributes: Partial<LogoAttributes> | undefined,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const logoType = state.schema.nodes[PAGE_LOGO_NODE];
  if (!logoType) return false;

  const patch = definedOnly(attributes);
  const ordinals = selectPages(state.doc, pageIndex).map((page) => page.ordinal);
  let changed = false;

  for (let index = ordinals.length - 1; index >= 0; index -= 1) {
    const ordinal = ordinals[index];
    let page = pageAt(tr.doc, ordinal);
    if (!page) continue;

    // "Put the logo in the footer" on a document with no footer creates the footer.
    if (ensureBand(tr, page, placement.side, state.schema, bandDefaults())) {
      changed = true;
      page = pageAt(tr.doc, ordinal);
      if (!page) continue;
    }

    let band = findBand(page, placement.side);
    if (!band) continue;

    const existing = findLogo(band.node, band.pos);
    // **Moving a logo must not lose the image.** The source lives on the node, so a placement with
    // no `src` of its own inherits the one already in the document — otherwise "put it in the
    // footer's left third" would delete the picture and insert an empty `<img>` in its place. When
    // an `src` *is* given (the upload path), it wins.
    const attributesToWrite: LogoAttributes = {
      ...defaults,
      ...readExistingLogoAttributes(existing?.node),
      ...patch
    };

    if (existing) {
      // A logo that is already in the right region only needs its attributes refreshed.
      if (existing.region.slot === placement.slot) {
        for (const [key, value] of Object.entries(attributesToWrite)) {
          if (existing.node.attrs[key] === value) continue;
          tr.setNodeAttribute(existing.pos, key, value);
          changed = true;
        }
        continue;
      }
      tr.delete(existing.pos, existing.pos + existing.node.nodeSize);
      changed = true;
    }

    page = pageAt(tr.doc, ordinal);
    if (!page) continue;
    band = findBand(page, placement.side);
    if (!band) continue;

    const region = regionMap(collectRegions(band.node, band.pos))[placement.slot];
    if (!region) continue;

    tr.insert(regionContentEnd(region), logoType.create(attributesToWrite));
    changed = true;
  }

  if (changed) {
    tr.setMeta(FURNITURE_META, { type: "command", command: true } satisfies FurnitureMeta);
    if (dispatch) dispatch(tr);
  }
  return changed;
}

/**
 * 从选中的页面上移除 Logo；本来就没有时以 `false` 返回（这不是失败）。
 *
 * Remove the logo from the selected pages. Succeeds (with `false`) where there is none.
 */
function removeLogo(props: CommandProps, pageIndex: number | undefined): boolean {
  const { state, tr, dispatch } = props;
  const ordinals = selectPages(state.doc, pageIndex).map((page) => page.ordinal);
  let changed = false;

  for (let index = ordinals.length - 1; index >= 0; index -= 1) {
    const page = pageAt(tr.doc, ordinals[index]);
    if (!page) continue;

    for (const side of ["top", "bottom"] as const) {
      const band = findBand(page, side);
      if (!band) continue;
      const existing = findLogo(band.node, band.pos);
      if (!existing) continue;
      tr.delete(existing.pos, existing.pos + existing.node.nodeSize);
      changed = true;
    }
  }

  if (changed) {
    tr.setMeta(FURNITURE_META, { type: "command", command: true } satisfies FurnitureMeta);
    if (dispatch) dispatch(tr);
  }
  return changed;
}

/**
 * 设置已经放好的 Logo 的尺寸；每一个都已经是该尺寸时返回 `false`。
 *
 * Set the size of the logo that is already placed; `false` when every one already has it.
 */
function resizeLogo(
  props: CommandProps,
  attributes: Partial<LogoAttributes>,
  pageIndex: number | undefined
): boolean {
  const { state, tr, dispatch } = props;
  const patch = definedOnly(attributes);
  if (Object.keys(patch).length === 0) return false;

  let changed = false;
  for (const page of selectPages(state.doc, pageIndex)) {
    for (const side of ["top", "bottom"] as const) {
      const band = findBand(page, side);
      if (!band) continue;
      const existing = findLogo(band.node, band.pos);
      if (!existing) continue;
      for (const [key, value] of Object.entries(patch)) {
        if (existing.node.attrs[key] === value) continue;
        tr.setNodeAttribute(existing.pos, key, value);
        changed = true;
      }
    }
  }

  if (changed) {
    tr.setMeta(FURNITURE_META, { type: "command", command: true } satisfies FurnitureMeta);
    if (dispatch) dispatch(tr);
  }
  return changed;
}

/**
 * 文档中 1 起序号为给定值的页面，没有则为 `null`。
 *
 * The page with this 1-based ordinal in a document, or `null`.
 */
function pageAt(doc: PMNode, ordinal: number): PageRef | null {
  return collectPages(doc).find((page) => page.ordinal === ordinal) ?? null;
}

/** 页面上某一侧的栏。 / The band of one side on a page. */
function findBand(page: PageRef, side: FurnitureSide): PageChildRef | null {
  return findChild(page, side === "top" ? PAGE_HEADER_NODE : PAGE_FOOTER_NODE);
}

/**
 * 命令作用的页面：全部，或给定的那一个 1 起页码。
 *
 * The pages a command targets: all of them, or the one with the given 1-based number.
 */
function selectPages(doc: PMNode, pageIndex: number | undefined): PageRef[] {
  const pages = collectPages(doc);
  if (pageIndex === undefined) return pages;
  return pages.filter((page) => page.ordinal === pageIndex);
}

/**
 * 丢掉值为 `undefined` 的键，这样部分补丁永远不会写入 `undefined`。
 *
 * Drop keys whose value is `undefined`, so a partial patch never writes `undefined`.
 */
function definedOnly(attributes: Partial<LogoAttributes> | undefined): Partial<LogoAttributes> {
  if (!attributes) return {};
  const defined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) defined[key] = value;
  }
  return defined as Partial<LogoAttributes>;
}

/**
 * 已有 Logo 节点携带的属性，用于「移动」时保留它们。
 *
 * 只读这三个已声明的属性：从旧模板恢复的节点可能还带着旧的 `position` / `offsetX` /
 * `offsetY`，把它们复制过来只会留下一堆没人读的属性 —— Logo 所在的**区域**就是它的位置。
 *
 * The attributes an existing logo already carries, so a move keeps them. Only the three declared
 * attributes are read: a node restored from an older template can still carry the legacy
 * `position`/`offsetX`/`offsetY`, and copying those forward would keep attributes nothing reads
 * (the region a logo sits in *is* its placement).
 */
function readExistingLogoAttributes(node: PMNode | undefined): Partial<LogoAttributes> {
  if (!node) return {};
  const attributes: Partial<LogoAttributes> = {};
  if (typeof node.attrs.src === "string") attributes.src = node.attrs.src;
  if (typeof node.attrs.width === "string") attributes.width = node.attrs.width;
  if (typeof node.attrs.height === "string") attributes.height = node.attrs.height;
  return attributes;
}
