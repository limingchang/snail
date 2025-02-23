import { createApp, ref, App, h, computed, Ref, onMounted } from "vue";

import { useMouse, onClickOutside } from "@vueuse/core";

// 引入@snail-js图标组件
import { SIconSvgs } from "@snail-js/vue";
// 引入ElementPlus图标
import * as ElementPlusIconsVue from "@element-plus/icons-vue";

import {
  SPopUpMenuItemOptions,
  SPopUpMenuOptions,
  TComputedBoolean,
} from "./type";

import PopUpMenu from "./PopupMenu.vue";
import PopUpMenuItem from "./PopupMenuItem.vue";
import { SIcon } from "../icon";

export const SPopUpMenu = (
  options: SPopUpMenuOptions,
  items: SPopUpMenuItemOptions[]
) => {
  const style = computed(() => {
    return {
      width: `${options.width}px`,
      textAlign: options.align,
      top: `${x.value - 5}px`,
      left: `${y.value - 5}px`,
      display: "block",
    };
  });
  const sPopUpMenuRef = ref(null);
  const menuItems = ref();

  const menu = {
    setup() {
      onMounted(async () => {
        menuItems.value = await Promise.all(
          items
            .map(async (item, index) => {
              const display = await checkBoolean(item.display);
              return display ? await renderItem(item) : null;
            })
            .filter((item) => item !== null)
        );
      });
    },
    render() {
      return h(
        "div",
        { class: "s-pop-up-menu", style, ref: sPopUpMenuRef },
        menuItems.value
      );
    },
  };

  const app = createApp(menu);

  registerIcons();
  const div = document.createElement("div");
  div.id = "s-pop-up-menu";
  document.body.appendChild(div);
  app.mount(div);
  console.log("mounted:", sPopUpMenuRef.value);
  const { x, y } = setPositon();
  console.log("x:", x.value, " y:", y.value);

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
    console.log("ref:", sPopUpMenuRef);
    const posX = ref(0);
    const posY = ref(0);
    const { x, y } = useMouse({ touch: false });
    const clientX = document.documentElement.clientWidth;
    const clientY = document.documentElement.offsetHeight;
    if (sPopUpMenuRef.value) {
      const timer = setTimeout(() => {
        const menuWidth = (sPopUpMenuRef.value! as HTMLElement).offsetWidth;
        if (x.value + menuWidth > clientX) {
          posX.value = clientX - menuWidth;
        } else {
          posX.value = x.value;
        }
        const menuHeight = (sPopUpMenuRef.value! as HTMLElement).offsetHeight;
        if (y.value + menuHeight > clientY) {
          posY.value = clientY - menuHeight;
        } else {
          posY.value = y.value;
        }
        clearTimeout(timer);
      }, 50);
    }

    return {
      x: posX,
      y: posY,
    };
  }

  function handleClick(fn: Function) {
    fn(options.context);
    app.unmount();
  }

  async function renderItem(item: SPopUpMenuItemOptions) {
    const itemClass = {
      "s-pop-up-menu-item": true,
      "item-disabled": !(await checkBoolean(item.enabled)),
      "item-enabled": await checkBoolean(item.enabled),
    };
    console.log("itemClass:", itemClass);
    return h(
      "div",
      {
        class: itemClass,
        style: {
          "--hover-color": item.hoverColor ? item.hoverColor : "#66b1ff",
        },
        onClick: handleClick(item.command),
      },
      [
        item.icon ? h(SIcon, { icon: item.icon }) : "",
        h("span", { class: "item-label" }, item.label),
      ]
    );
  }

  async function checkBoolean(booleanOrFunc?: TComputedBoolean | boolean) {
    if (booleanOrFunc === undefined) return true;
    if (typeof booleanOrFunc === "boolean") return booleanOrFunc;
    return await booleanOrFunc(options.context);
  }
};
