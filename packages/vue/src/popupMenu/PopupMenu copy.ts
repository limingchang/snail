import { h, render, ref } from "vue";
import { VNode } from "vue";
// import * as Icons from "@element-plus/icons-vue";
// import { ElIcon } from "element-plus";
import { SElIcon } from "../icon";
import { useMouse } from "@vueuse/core";
const { x, y } = useMouse();

import _ from "lodash";

// types
import { SnailPopUpMenuItemOptions, SnailPopUpMenuItem } from "./type";

const menuRef = ref<VNode>();

function generateItem(item: SnailPopUpMenuItem, disabled?: boolean): VNode;

function generateItem<T>(
  item: SnailPopUpMenuItem<typeof context>,
  context?: T
): VNode;

function generateItem<T>(
  item: SnailPopUpMenuItem<typeof disabledOrContext>,
  disabledOrContext?: T
): VNode {
  const itemClass = disabledOrContext
    ? "snail-pop-up-menu-item item-enabled"
    : "snail-pop-up-menu-item item-disabled";
  const innerVNode = item.icon
    ? [
        h(SElIcon, { icon: item.icon }),
        h("span", { class: "item-label" }, item.label),
      ]
    : [h("span", { class: "item-label" }, item.label)];
  return h(
    "div",
    {
      class: itemClass,
      style: { "--hover-color": item.hoverColor ? item.hoverColor : "#66b1ff" },
      onClick: () => {
        disabledOrContext && item.click(disabledOrContext);
        // close();
        destroyed();
      },
    },
    () => innerVNode
  );
}

const defaultOptions: SnailPopUpMenuItemOptions = {
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

export const SnailPopUpMenu = async <R = any>(
  options: SnailPopUpMenuItemOptions<typeof context>,
  context?: R
) => {
  if (menuRef.value) {
    destroyed();
  }
  const { width, align, items, permission } = _.merge(
    defaultOptions,
    options
  );
  // 权限过滤
  const menuItems = items.filter((item) => {
    if (permission && item.permission) {
      return permission(item.permission!);
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
        return [menuItem, h("div", { class: "snail-pop-up-menu-item-divider" })];
      }
      return menuItem;
    })
  );
  const newVNode = h(
    "div",
    {
      class: "snail-pop-up-menu-item",
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
