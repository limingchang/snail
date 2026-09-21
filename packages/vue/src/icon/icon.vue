<template>
  <i class="s-icon" :class="{ 'is-spin': spin }" :style="iconStyle" @click="onClick">
    <component :is="icon" v-if="icon" />
    <slot v-else />
  </i>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Component, CSSProperties } from "vue";
import type { IconName } from "./icons";

/**
 * `SIcon` —— 所有图标都会经过的唯一包装组件。
 *
 * 它存在的理由是普通 SVG 覆盖不到的场景：图标在**构建时并不确定**，必须在运行时解析。
 * 典型用法：
 *
 * ```vue
 * <!-- 本包内的图标，直接导入 -->
 * <SIcon :icon="IconVariable" />
 *
 * <!-- Element Plus 的图标，直接使用 -->
 * <SIcon :icon="ElIconEdit" />
 *
 * <!-- Element Plus 图标放在它自己的包装里 -->
 * <el-icon><SIcon :icon="ElIconEdit" /></el-icon>
 *
 * <!-- 全局注册的名字，例如 app.use(SnailVue) 之后 -->
 * <SIcon icon="IconVariable" />
 *
 * <!-- 任何内容，通过插槽 -->
 * <SIcon color="#1e80ff"><svg …/></SIcon>
 * ```
 *
 * ## 为什么包装元素是普通的 `<i>` 而不是 `ElIcon`
 *
 * 本包的全部意义在于提供 Element Plus **没有**的图标，因此渲染它们时绝不能依赖
 * Element Plus。所以 `<SIcon>` 像 `<el-icon>` 一样继承 `color`/`font-size`，也能愉快地
 * 嵌在 `<el-icon>` 里，但在从未安装 Element Plus 的应用中同样可用。
 *
 * ## 尺寸
 *
 * 每个内置图标本身都带有 `width="1em" height="1em"`，因此不需要任何样式表就能正确
 * 定尺寸。`size` 只覆盖当前这一处调用点的盒子；`inheritAttrs` 保持开启，使 `class`、
 * `style` 和 ARIA 属性按使用方的预期落到根元素上。
 *
 * `SIcon` — the one wrapper every icon goes through.
 *
 * It exists for the case a plain SVG cannot cover: the icon is *not known at build
 * time*, so it has to be resolved at runtime. Typical uses:
 *
 * ```vue
 * <!-- an icon from this package, imported -->
 * <SIcon :icon="IconVariable" />
 *
 * <!-- an Element Plus icon, used directly -->
 * <SIcon :icon="ElIconEdit" />
 *
 * <!-- an Element Plus icon inside Element Plus's own wrapper -->
 * <el-icon><SIcon :icon="ElIconEdit" /></el-icon>
 *
 * <!-- a globally registered name, e.g. after `app.use(SnailVue)` -->
 * <SIcon icon="IconVariable" />
 *
 * <!-- anything at all, via the slot -->
 * <SIcon color="#1e80ff"><svg …/></SIcon>
 * ```
 *
 * ## Why the wrapper is a plain `<i>` and not an `ElIcon`
 *
 * The package's whole point is to supply icons Element Plus does **not** have, so it
 * must not depend on Element Plus to render them. `<SIcon>` therefore inherits
 * `color`/`font-size` like `<el-icon>` does and nests inside one happily, but works
 * in an application that never installs Element Plus.
 *
 * ## Sizing
 *
 * Every bundled icon already carries `width="1em" height="1em"`, so an icon is
 * correctly sized with no stylesheet at all. `size` overrides that box for the one
 * call site; `inheritAttrs` is left on so `class`, `style` and ARIA attributes land
 * on the root element as a consumer expects.
 */
defineOptions({ name: "SIcon" });

const props = withDefaults(
  defineProps<{
    /**
     * 组件（导入的图标、Element Plus 图标或任何其他组件），或**全局注册**的图标组件名。
     *
     * `IconName` 是本包自身图标名的联合类型，因此传字符串字面量会有自动补全；
     * `string & {}` 这一支让其他已注册的名字同样合法。
     *
     * A component (imported icon, Element Plus icon, or anything else) or the name
     * of a globally registered icon component.
     *
     * `IconName` is the union of this package's own icon names, so a string literal
     * gets autocomplete; the `string & {}` arm keeps any other registered name legal.
     */
    icon?: IconName | Component | (string & {});

    /** 覆盖继承来的文字颜色。 / Overrides the inherited text colour. */
    color?: string;

    /**
     * 设置图标盒子的大小；数字按像素处理。
     *
     * Sets the icon box; a number is read as pixels.
     */
    size?: string | number;

    /**
     * 持续旋转，用于加载或进度图标。
     *
     * Continuous rotation, for a loading or progress icon.
     */
    spin?: boolean;
  }>(),
  {
    icon: undefined,
    color: undefined,
    size: undefined,
    spin: false
  }
);

const emit = defineEmits<{
  /**
   * 图标被点击；原生事件原样转发出去。
   *
   * The icon was clicked; the native event is forwarded unchanged.
   */
  click: [event: MouseEvent];
}>();

const iconStyle = computed<CSSProperties>(() => ({
  color: props.color,
  fontSize: typeof props.size === "number" ? `${props.size}px` : props.size
}));

function onClick(event: MouseEvent): void {
  emit("click", event);
}
</script>
