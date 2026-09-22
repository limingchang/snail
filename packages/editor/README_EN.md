# `@snail-js/editor`

<p>
  <img src="https://img.shields.io/npm/v/%40tiptap%2Fcore?label=Tiptap&color=67C23A&labelColor=1e80ff"></img>
  <img src="https://img.shields.io/npm/v/element-plus?label=ElementPlus&color=67C23A"></img>
</p>

## [官方文档 | Document](https://limingchang.github.io/snail/editor)

A Tiptap 3 + Vue 3 template document editor: a Word-like workspace with real pages, headers and
footers, automatic pagination, variables, a QR code, a watermark and browser printing.
The UI framework is **Element Plus**.

```bash
pnpm add @snail-js/editor element-plus vue
```

```ts
import { createApp } from "vue";

import { SnailEditor } from "@snail-js/editor";
import "@snail-js/editor/style.css";

createApp(App).use(SnailEditor).mount("#app");
```

`element-plus` is a **peer** dependency (you provide it, the package never bundles a second copy),
and the editor imports the Element Plus components and component styles it actually renders. So
there is **no** `app.use(ElementPlus)` and **no** `element-plus/dist/index.css` in the snippet: the
one stylesheet above carries both the editor's theme and the Element Plus rules it needs. If your
application already registers Element Plus globally, that keeps working — the imports resolve to
your installed copy.

Element Plus's own strings (the colour picker's confirm / clear buttons, a select's empty state)
come from a `el-config-provider` the editor renders internally, defaulting to Chinese. Pass
`element-locale` to use another language pack.

`SnailEditor` registers `SEditor` globally. You can equally import the component:

```ts
import { SEditor } from "@snail-js/editor";
```

The stylesheet is opt-in at the *package* level but required for the editor to look like
the editor: it carries the palette, the paper and the variable badges. It is scoped to
`.s-editor-scope` (which the component puts on its own root), so importing it does **not**
restyle the rest of an Element Plus application.

---

## The two modes

|  | `design` | `fill` |
| --- | --- | --- |
| purpose | author a template | fill it in and print it |
| document | editable | read-only |
| toolbar | shown | hidden |
| variables | labelled badges | their values |
| actions | 保存 | 填写 + 打印 |

### Design mode

```vue
<script setup lang="ts">
import { ref } from "vue";
import { SEditor } from "@snail-js/editor";
import type { SEditorExposed } from "@snail-js/editor";

const editor = ref<SEditorExposed>();

function save() {
  const template = editor.value?.getTemplate();
  // `template` is a TemplateDocument: { version, doc, variables, page, watermark }.
  console.log(JSON.stringify(template));
}
</script>

<template>
  <SEditor
    ref="editor"
    mode="design"
    :tools="['font', 'paragraph', 'insert', 'table', 'page', 'variable', 'qrcode', 'watermark']"
    :save="{ kind: 'local', storageKey: 'my-contract' }"
    @save="save"
  />
</template>
```

### Fill mode

```vue
<template>
  <!--
    `data` is the fill data, keyed by variable key. In fill mode the document renders the
    values instead of the labels, the toolbar is absent, and 填写 opens the fill dialog.
  -->
  <SEditor
    mode="fill"
    :data="{ 'party.name': '张三', amount: 128000, signed: true }"
    :print="{ marginBoxes: true, documentTitle: '劳动合同' }"
    @ready="(editor) => editor.chain().focus().printDocument().run()"
  />
</template>
```

Fill values can also be supplied programmatically, through the exposed surface:

```ts
editor.value?.openFillDialog();
editor.value?.fill({ "party.name": "李四" });
editor.value?.print();
```

---

## Templates

### Where the content comes from — `template`

```ts
// 1. Inline. The simplest case.
{ kind: "local", content: templateDocument }

// 2. One template, fetched once on ready. A failure shows an alert above the document and
//    leaves the editor usable.
{ kind: "remote", url: "/api/templates/7", headers: { Authorization: "…" } }

// 3. A list. `load` decides what happens on ready:
//    "auto"   — fetch the list, then fetch and render its FIRST entry.
//    "manual" — (default) fetch the list, render nothing, and show a 载入 button after it.
//               This is what fill mode wants: the operator picks the template.
{
  kind: "remote-list",
  url: "/api/templates",
  contentUrl: (item) => `/api/templates/${item.id}/content`, // defaults to `${url}/${id}`
  load: "manual"
}
```

A list response may be a bare array, a `{ data: [...] }` envelope, or an array of
`{ id, name, doc }` — an entry that carries its own document needs no second request.
Entries without an `id` are skipped rather than blanking the list.

### Where it goes — `save`

```ts
{ kind: "local", storageKey: "my-contract", session: false }   // localStorage / sessionStorage
{ kind: "remote", url: "/api/templates", method: "POST" }      // the TemplateDocument as JSON
{ kind: "remote", url: "/api/templates", structured: false }   // the HTML string instead
```

`onSave({ template, design })` is called for **every** save, whatever target is configured
— a consumer that persists through its own API passes `onSave` alone and no `save` target
at all.

### What is stored

`getTemplate()` returns a `TemplateDocument`:

```ts
{
  version: 1,
  doc: { /* ProseMirror JSON */ },
  variables: [{ key, label, type, required }],
  page: { paperFormat, orientation, margins, pageCount },
  watermark: { enabled, text, angle, … }
}
```

The `version` is what makes a template written by one release readable by the next, and
volatile bookkeeping attributes (`_updateTimestamp` and anything else underscore-prefixed)
are stripped, so saving an unchanged document twice produces byte-identical JSON.

---

## The extension opt-in rule

**Importing and configuring an extension is what makes its toolbar section appear.** A
section renders only when the caller names it in `tools` **and** the extension is
registered in the schema:

```ts
// No `qrcode` option and `disable: ["qrcode"]` ⇒ no `qrcode` node type,
// no command, and no 二维码 section — even if `tools` names it.
<SEditor :tools="['font', 'qrcode']" :extensions="{ disable: ['qrcode'] }" />
```

The registered set is what the toolbar gates on (`editor.extensionManager.extensions`),
never the `tools` string list alone — the legacy toolbar checked the list only, so a
section could render with nothing behind it and every command in it resolved to `false`.

| section | needs |
| --- | --- |
| 格式 `font` | `textStyle` |
| 段落 `paragraph` | `paragraphStyle` |
| 插入 `insert` | `variable`, `qrcode`, `page` or `image` (any one) |
| 表格 `table` | `table` |
| 页面 `page` | `page` |
| 变量 `variable` | `variable` |
| 二维码 `qrcode` | `qrcode` |
| 水印 `watermark` | `watermark` |
| 打印 `print` | `print` |

`multiPage: false` removes the page **nodes** but never the document: the top node is then
the standard `block+` `Document` instead of the `page+` one, so ProseMirror's
`Schema is missing its top node type (doc)` cannot happen.

---

## Publishing an update to the theme

Every colour, size and family is a CSS custom property on `.s-editor-scope`, so an
application can retheme one editor instance without a rebuild:

```css
.my-contract-editor.s-editor-scope {
  --se-color-primary: #1677ff;
  --se-color-print: #f53f3f;
  --se-variable-money: #0f9b8e;
  --se-font-size-body: 14pt;
}
```

`--se-*` are this package's own values; `--el-*` inside the same scope are the Element
Plus tokens it overrides so Element Plus's own controls match the legacy design.

---

## 与 0.1.x 的差异

**UI framework.** `ant-design-vue` was replaced by **Element Plus**. The colours are kept
as close to the legacy design as Element Plus allows, through the scoped `--se-*`/`--el-*`
layer described above: Ant Design's `#1677ff` is still the toolbar's blue, but Element
Plus's own `#409eff` is no longer a second, accidental primary.

**Dropped types.** The variable types `object`, `list` and `checkbox` are gone. `object`
had no sub-field editor and rendered `[object Object]`; `list` stringified an array with
commas and had no repeat semantics; `checkbox` was a single boolean dressed up as a
multi-select. The legacy `innerVariable` survives, but as an *input method*
(`keySource: "inner"`, a picker over the caller's tree), not as a type.

**New types.** `select`, `image`/signature, `formula` and `system` (page/total/date) join
`text`, `number`, `money`, `boolean` and `date`. Each carries its own configuration inside
one discriminated union, so the type can no longer disagree with its payload — the legacy
package stored `type` and `data` as siblings and nothing kept them in step.

**Renamed props and commands.**

| 0.1.x | 1.0 |
| --- | --- |
| `design?: boolean` | `mode: "design" \| "fill"` (`design` still accepted, deprecated) |
| `mutilPage` (sic) | `multiPage` |
| `browserPrint()` | `printDocument()` (and the alias `print()`) |
| `editor.storage.qrcode.hasQRCode` | `editor.commands.hasQRCode()` |
| header/footer `textFormat` | a real `pageNumber` node with a `format` attribute |

**Behavioural fixes worth knowing about.**

- The mode, the document and the extension set are **watched**, not frozen at creation.
- Undo/redo exists. Pagination transactions are marked `addToHistory: false`, so undo
  never replays a page split.
- Selecting 正文 produces a paragraph, not `<h0>`.
- Page-number patterns are free-form (`{page}`/`{total}`, with `#`/`&` accepted for old
  templates) instead of three hard-coded presets.
- Margins are edited in the model's own units; the legacy panel edited centimetres against
  a millimetre model, so a 20 mm page displayed as 2.54 cm.
- A failed remote template shows an error above the document and leaves the editor usable,
  instead of rendering nothing.
- A second editor instance, or a remount, works. The legacy extension factory pushed onto
  a module-level array, so the second instance failed with
  `Duplicate extension names found`.

---

## Development

```bash
pnpm build       # bundle + emit dist/style.css
pnpm typecheck   # vue-tsc --noEmit
pnpm test        # vitest, Node environment
```

The editor's own testable core is the pure template layer (`src/editor/template.ts`) and
the pagination engine and variable resolver inside the extensions. There is deliberately no
jsdom: pagination depends on real layout, and a jsdom test would assert a fiction.



### 代码仓库
- ![Static Badge](https://img.shields.io/badge/snail-js?style=flat&label=gitee&labelColor=F56C6C&link=https%3A%2F%2Fgitee.com%2Flimich%2Fsnail)
- ![Static Badge](https://img.shields.io/badge/snail-js?style=flat&label=github&labelColor=F56C6C&link=https%3A%2F%2Fgihub.com%2Flimingchang%2Fsnail)

### 作者
- mc.lee