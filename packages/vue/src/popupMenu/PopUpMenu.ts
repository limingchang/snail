import {
  createApp,
  ref,
  App,
  h,
  computed,
  defineComponent,
  Ref,
  watch,
} from "vue";

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
const { x: mouseX, y: mouseY } = useMouse({ type: "client" });

export const SPopUpMenu = (
  options: SPopUpMenuOptions,
  items: SPopUpMenuItemOptions[]
) => {
  unmountPrevious();
  const sPopUpMenuRef = ref<null | HTMLElement>(null);
  const menu = defineComponent({
    setup() {
      const top = ref(0);
      const left = ref(0);
      const style = computed(() => {
        return {
          width: options.width ? `${options.width}px` : "auto",
          minWidth: "90px",
          textAlign: options.align || "left",
          top: `${top.value - 2}px`,
          left: `${left.value - 2}px`,
          position: "fixed",
          display: "block",
          zIndex: 9999,
        };
      });

      onClickOutside(sPopUpMenuRef, () => {
        unmountPrevious();
      });
      watch(
        () => sPopUpMenuRef.value,
        () => {
          const { x, y } = setPositon(sPopUpMenuRef);
          left.value = x;
          top.value = y;
        }
      );
      return {
        style,
      };
    },
    render() {
      return h(
        "div",
        { class: "s-pop-up-menu", style: this.style, ref: sPopUpMenuRef },
        items.map((item) => renderItem(item))
      );
    },
  });
  const app = createApp(menu);
  registerIcons();
  const div = document.createElement("div");
  div.id = "s-pop-up-menu";
  document.body.appendChild(div);
  app.mount(div);
  menus.push(app);

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

  function setPositon(eleRef: Ref) {
    const pos = { x: 0, y: 0 };
    const clientX = document.documentElement.clientWidth;
    const clientY = document.documentElement.clientHeight;
    const menuWidth =
      options.width || (eleRef.value as HTMLElement).offsetWidth;
    if (mouseX.value + menuWidth > clientX) {
      pos.x = clientX - menuWidth;
    } else {
      pos.x = mouseX.value;
    }
    const menuHeight = (eleRef.value as HTMLElement).offsetHeight;
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
    return h(
      PopUpMenuItem,
      {
        style: {
          "--hover-color": item.hoverColor ? item.hoverColor : "#66b1ff",
        },
        options: {
          display: checkBoolean(item.display),
          enabled: checkBoolean(item.enabled),
          label: item.label,
          icon: item.icon,
          handle: handleClick(item.command),
          children: item.children ? true : false,
        },
      },
      {
        child: item.children ? () => item.children!.map(renderChild) : () => undefined,
      }
    );
  }

  function renderChild(child: Omit<SPopUpMenuItemOptions, "children">) {
    return h(PopUpMenuItem, {
      style: {
        "--hover-color": child.hoverColor ? child.hoverColor : "#66b1ff",
      },
      options: {
        display: checkBoolean(child.display),
        enabled: checkBoolean(child.enabled),
        label: child.label,
        icon: child.icon,
        handle: handleClick(child.command),
        // children:false
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
