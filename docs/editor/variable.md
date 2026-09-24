# 变量

变量是文档里的**内联原子节点**（`inline`、`atom`、不可拖动）。它的类型和配置是同一个字段
`data`，而 `data.type` 就是判别式 —— 不存在「类型和配置对不上」的第二种可能：

## 两种模式画的是两种东西

| | `design` | `fill` |
| --- | --- | --- |
| 画什么 | 变量名 | 已填：值；未填：变量名 |
| 底色 | 按 `data.type` 分的主题色 | 无（`background: transparent`） |
| 文字颜色 | 白（配底色） | 继承所在段落（`color: inherit`） |
| 字号 / 行高 | `0.8em`（标签） | 继承所在段落（`font-size: inherit`） |
| 内边距 | 有（徽标的形状） | 无（值就是正文的一部分） |
| 悬停提示 | 有 | 未填时有，已填没有 |
| 点击 | 打开设计对话框 | 不做任何事 |

设计模式要给设计者看见「这里有个变量」，所以徽标有底色；填写模式输出的是给填写者看的成品，一个
带底色的色块只会让人以为那是高亮。唯一保留颜色的填写状态是「填过又清空了」：那时画的是
`(未填写)`，需要一个提示性的灰（DOM 上是 `data-variable-painted="empty"`，而「还没填所以显示名称」
是 `"label"`、画出值是 `"value"`）。

徽标上有一条 `text-indent: 0`，它修的是「变量左侧有大量空白」：`text-indent` 是**继承**的，而徽标是
`inline-block`（一个块容器），所以合同条款上的 `text-indent: 2em` 会落在徽标内部的**第一行**上，把
变量名（以及填写模式下的值）向右推两个字符。缩进属于段落的第一行，不属于段落里的一个原子。

悬停提示的背景用的是变量自己的那个颜色（每类通过 `--se-variable-surface` 发布一次，徽标与提示共用），
文字靠左（`text-align: left` —— `text-align` 同样是继承的，否则居中标题里的变量会把提示也居中），三行
之间用一条分隔线分开。

```ts
import type { VariableAttrs } from "@snail-js/editor";

const attrs: VariableAttrs = {
  label: "甲方名称",
  key: "company.name",
  desc: "营业执照上的全称",
  defaultValue: "",
  data: { type: "text", placeholder: "请输入甲方全称", maxLength: 60 },
  keySource: "manual"
};
```

### 九种类型

<script setup>
import VariableTypes from "./examples/variable-types.vue";
import variableTypesSource from "./examples/variable-types.vue?raw";
</script>

<DemoBlock title="变量类型" description="表格由 VARIABLE_TYPES 生成，所以不会和源码里的类型集合脱节。" :code="variableTypesSource">
  <VariableTypes />
</DemoBlock>

各类型的关键字段：

| 类型 | 关键字段 | 说明 |
| --- | --- | --- |
| `text` | `placeholder`、`maxLength` | `maxLength` 是软上限，只影响对话框的计数与渲染时的省略 |
| `number` | `precision`、`thousands`、`min`、`max` | `precision` 缺省时「按原样」渲染：填 `3.50` 就不会变成 `3.5` |
| `money` | `precision`（默认 2）、`currency`、`thousands`（默认 `true`）、`chineseUppercase` | 见下文中文大写 |
| `boolean` | `trueText`（默认「是」）、`falseText`（默认「否」） | 把 `true` / `false` 写成词 |
| `date` | `format`（默认 `YYYY年MM月DD日`）、`resolveToday` | 字面值 `"today"` 在 `resolveToday` 为真时解析为当天 |
| `select` | `options`、`multiple`、`joinWith`（默认「、」） | `options` 为空时对话框退化为自由输入 |
| `image` | `source`（`upload` / `signature`）、`accept`、`maxSizeMb`（默认 2）、`width` | 签名板画出来的也是一张图 |
| `formula` | `expression`、`precision`、`prefix`、`suffix` | 由其他变量算出来的值 |
| `system` | `systemKey`、`format` | 由文档自己提供的值 |

### 解析出来的两种类型

`formula` 和 `system` 用户填不了，它们的值由文档算出来：

**`formula`** 的表达式只允许数字、`+ - * / ( )`、逗号、变量 key，以及固定表里的函数：

```text
SUM(item1.price, item2.price) * 1.06
```

函数是 `SUM`、`AVG`、`MIN`、`MAX`、`ROUND`、`IF`、`ABS`（即 `FORMULA_FUNCTIONS`）。
不使用 `eval` / `new Function`：表达式来自存下来的模板数据，如果按 JavaScript 求值，
打开一份模板就等于运行它。公式可以引用另一个公式（`total = SUM(sub1, sub2)`），
环会在解析时被检出并报成一条 `VariableIssue`，而不是把编辑器挂住。

**`system`** 的 `systemKey` 决定取值：

| `systemKey` | 渲染 |
| --- | --- |
| `page` | `3` |
| `total` | `12` |
| `pageLabel` | `第 3 页` |
| `pageOfTotal` | `第 3 页，共 12 页` |
| `date` | 按 `format`（默认 `YYYY年MM月DD日`） |
| `time` | 按 `format`（默认 `HH:mm:ss`） |

「现在」是**注入**的，不是现读时钟：这样解析是确定的，同一份文档在填写和打印之间也不会
出现两个不同的时间。文档里的页码不靠 `system` 变量，而是靠 `pageNumber` 节点，
原因见[页眉页脚与页码](#页眉页脚与页码)。

### `money` 与中文大写

`chineseUppercase` 不是另一个类型，而是**同一个数字的另一种渲染** —— 合同通常同时需要
小写数字和大写金额。大写用的是财务体：

```text
1234500  →  壹拾贰万叁仟肆佰伍拾元整
1000001  →  壹佰万零壹元整
0        →  零元整
```

「壹拾」不是「拾」：合同金额保留占位符。转换在整数「分」上做，所以 `0.1 + 0.2` 这类
二进制噪声不会改变印出来的数字。

### `keySource`：`innerVariable` 是一种输入方式，不是类型

旧版把 `innerVariable` 当成一个变量**类型**。它其实只回答「用户怎么挑这个 key」：

- `keySource: "manual"`（默认）：用户手写一个 key，`company.name` 这样的点号路径按嵌套取。
- `keySource: "inner"`：key 来自调用方通过 `variable.innerVariable` 传进来的一棵树
  （`{ label, key, children? }`）。

值长什么样、怎么校验、怎么渲染，两种方式完全一样。所以它住在 `VariableAttrs.keySource`，
不在 `VariableData` 里。

### 填写数据的解析与校验

`data` 是按 key 查表的对象（`VariableFillData`），多出来的 key 会被忽略。填写的顺序是：

1. `data` 里有值就用它；
2. 没有就用 `defaultValue`；
3. 还没有就按类型给一个「空」——`number` / `money` / `formula` 给 `0`，`boolean` 给 `否`，
   文本给空串。

`validateFill` 决定什么会挡住提交（`severity: "error"`），什么只是提示（`"warning"`），
并把问题挂在对应字段上：

| 检查 | 结果 |
| --- | --- |
| `text` / `number` / `money` / `date` / `select` / `image` 既没有填写值也没有 `defaultValue` | error「必填项未填写」 |
| `number` 超出 `min` / `max` | error「超出允许的范围」 |
| `select` 的值不在 `options` 里（`options` 为空时不检查） | error「选项不在允许的范围内」 |
| `image` 值为空，或按体积估算超过 `maxSizeMb` | error |
| `text` 超过 `maxLength` | **warning**，因为渲染时会省略，文档仍然可出 |
| `formula` 语法错、引用了不存在的变量、或存在循环引用 | 按情况给 error |

`boolean`、`formula`、`system` 不会被判「必填」：`boolean` 的空值有明确的渲染（否），
`formula` 的值是算出来的，`system` 的值由文档提供。公式的检查是结构性的 ——
表达式能不能解析、它读到的名字在不在、引用图有没有环 —— 三件事都能只靠模板回答，
所以用户还没输入任何东西时对话框就能把问题指出来。
对话框和纸张用的是同一套解析函数，所以两者不可能给出不同的答案。