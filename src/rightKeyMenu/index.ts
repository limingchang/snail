import { h, render, ref } from "vue";
import { VNode } from "vue";

import * as Icons from "@element-plus/icons-vue";

import { ElIcon } from "element-plus";

// import { useUserStore } from "@/stores";

import { useMouse } from "@vueuse/core";
const { x, y } = useMouse();

import _ from "lodash";

type HandlerCommand<T> = (context: T) => void;
type SetDisabled<T> = (context: T) => boolean | Promise<boolean>;

type TextAlign = "left" | "center" | "right" | "justify";

export interface SnailRightKeyMenuItem<T = any> {
  label: string;
  icon?: string;
  divider?: boolean;
  hoverColor?: string;
  permission?: string;
  disabled?: boolean | SetDisabled<T>;
  command: HandlerCommand<T>;
}

export interface SnailRightKeyMenuOptions<T = any> {
  width?: number;
  align?: TextAlign;
  items: SnailRightKeyMenuItem<T>[];
  checkPermission?: (permissionFlag: string) => boolean;
}

const menuRef = ref<VNode>();

function generateItem(item: SnailRightKeyMenuItem, disabled?: boolean): VNode;

function generateItem<T>(
  item: SnailRightKeyMenuItem<typeof context>,
  context?: T
): VNode;

function generateItem<T>(
  item: SnailRightKeyMenuItem<typeof disabledOrContext>,
  disabledOrContext?: T
): VNode {
  const itemClass = disabledOrContext
    ? "snail-right-key-menu-item item-enabled"
    : "snail-right-key-menu-item item-disabled";
  const innerElements = item.icon
    ? [
        h(ElIcon, null, () => h(Icons[item.icon as keyof typeof Icons])),
        h("span", { class: "item-label" }, item.label),
      ]
    : [h("span", { class: "item-label" }, item.label)];
  return h(
    "div",
    {
      class: itemClass,
      style: { "--hover-color": item.hoverColor ? item.hoverColor : "#66b1ff" },
      onClick: () => {
        disabledOrContext && item.command(disabledOrContext);
        // close();
        destroyed();
      },
    },
    innerElements
  );
}

const defaultOptions: SnailRightKeyMenuOptions = {
  width: 100,
  align: "left",
  items: [],
};

const destroyed = () => {
  if (menuRef.value?.el) {
    render(null, document.body);
  }
  document.body.removeEventListener("click", destroyed);
};

export const SnailRightKeyMenu = async <R = any>(
  options: SnailRightKeyMenuOptions<typeof context>,
  context?: R
) => {
  if (menuRef.value) {
    // close();

    destroyed();
  }
  const { width, align, items, checkPermission } = _.merge(
    defaultOptions,
    options
  );
  // 权限过滤
  const menuItems = items.filter((item) => {
    if (checkPermission && item.permission) {
      return checkPermission(item.permission!);
    }
    return true;
  });
  // console.log(x.value, y.value);
  document.body.addEventListener("click", destroyed);
  const menuItemVNodes = await Promise.all(
    menuItems.map(async (item) => {
      let menuItem = null;
      if (item.disabled && typeof item.disabled === "function") {
        const disabled = await item.disabled?.(context);
        menuItem = generateItem(item, disabled ? context : disabled);
      } else {
        menuItem = generateItem(
          item,
          item.disabled === undefined ? context : item.disabled
        );
      }
      if (item.divider) {
        return [menuItem, h("div", { class: "snail-right-key-menu-divider" })];
      }
      return menuItem;
    })
  );
  const newVNode = h(
    "div",
    {
      class: "snail-right-key-menu",
      style: {
        width: `${width}px`,
        textAlign: align,
        top: `${y.value - 5}px`,
        left: `${x.value - 5}px`,
        display: "block",
      },
    },
    menuItemVNodes
  );
  // renderMenu()
  render(newVNode, document.body);
  menuRef.value = newVNode;
  // console.log(menuRef.value);
};
