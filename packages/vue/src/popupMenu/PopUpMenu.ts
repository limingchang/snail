import { createApp, ref, App, h } from "vue";

import { useMouse, onClickOutside } from "@vueuse/core";

// 引入@snail-js图标组件
import { SIconSvgs } from "../icon";
// 引入ElementPlus图标
import * as ElementPlusIconsVue from "@element-plus/icons-vue";

import {
  SPopUpMenuItemOptions,
  SPopUpMenuOptions,
  TComputedBoolean,
} from "./type";
import PopUpMenuItem from "./PopupMenuItem.vue";

const menus: Array<App> = [];
const { x: mouseX, y: mouseY } = useMouse();

export const SPopUpMenu = (
  options: SPopUpMenuOptions,
  items: SPopUpMenuItemOptions[]
) => {
  unmountPrevious();
  // const { x, y } = useMouse();
  // console.log("useMouse:", mouseX.value, mouseY.value);
  const { x, y } = setPositon();
  const style = {
    width: `${options.width || 90}px`,
    textAlign: options.align || "left",
    top: `${y - 2}px`,
    left: `${x - 2}px`,
    position: "fixed",
    display: "block",
    zIndex: 9999,
  };

  // console.log("menu-style:", style);
  const sPopUpMenuRef = ref(null);
  const menu = {
    render() {
      return h(
        "div",
        { class: "s-pop-up-menu", style, ref: sPopUpMenuRef },
        items.map((item) => renderItem(item))
      );
    },
  };

  const app = createApp(menu);

  registerIcons();
  const div = document.createElement("div");
  div.id = "s-pop-up-menu";
  document.body.appendChild(div);
  app.mount(div);
  menus.push(app);

  onClickOutside(sPopUpMenuRef, () => {
    unmountPrevious();
  });

  // console.log("x:", x1.value, " y:", y1.value);

  function registerIcons() {
    // 注册SIcon组件
    for (const [key, component] of Object.entries(SIconSvgs)) {
      app.component(key, component);
    }
    // 注册ElementPlus图标组件
    for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(key, component);
    }
  }

  function setPositon() {
    const pos = { x: 0, y: 0 };
    // console.log("mouse:", mouseX.value, ":", mouseY.value);
    const clientX = document.documentElement.clientWidth;
    const clientY = document.documentElement.clientHeight;
    // console.log("clientX:", clientX, "clientY:", clientY);
    // console.log("scrollTop",document.body.scrollTop,"scrollLeft",document.body.scrollLeft)
    const menuWidth = options.width || 90;
    if (mouseX.value + menuWidth > clientX) {
      pos.x = clientX - menuWidth;
    } else {
      pos.x = mouseX.value;
    }
    const menuHeight = (items.length || 0) * 35;
    // console.log("menuHeight:",menuHeight)
    if (mouseY.value + menuHeight > clientY) {
      pos.y = clientY - menuHeight;
    } else {
      pos.y = mouseY.value;
    }
    return pos;
  }

  function unmountPrevious() {
    // console.log(sPopUpMenuRef.value);
    if (menus.length > 0) {
      menus[0].unmount();
      menus.pop();
      const div = document.body.querySelector("#s-pop-up-menu");
      div && document.body.removeChild(div);
    }
  }

  function handleClick(fn: Function) {
    return () => {
      fn(options.context);
      app.unmount();
      document.body.removeChild(div);
      menus.pop();
    };
  }

  function renderItem(item: SPopUpMenuItemOptions) {
    return h(PopUpMenuItem, {
      style: {
        "--hover-color": item.hoverColor ? item.hoverColor : "#66b1ff",
      },
      options: {
        display: checkBoolean(item.display),
        enabled: checkBoolean(item.enabled),
        label: item.label,
        icon: item.icon,
        handle: handleClick(item.command),
      },
    });
  }

  function checkBoolean(
    booleanOrFunc?: TComputedBoolean | boolean
  ): () => Promise<boolean> {
    return () => {
      return new Promise((resolve) => {
        if (booleanOrFunc === undefined) return resolve(true);
        if (typeof booleanOrFunc === "boolean") return resolve(booleanOrFunc);
        return resolve(booleanOrFunc(options.context));
      });
    };
  }
};
