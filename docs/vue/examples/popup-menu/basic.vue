<script setup lang="ts">
import { ref } from "vue";
import { closeAllContextMenus, createContextMenu } from "@snail-js/vue";
import type { SPopUpMenuHandle, SPopUpMenuItemOptions, SPopUpMenuOptions } from "@snail-js/vue";

/** 每个 command 都拿到同一份 context —— 这里是这一行的数据。 */
interface RowContext {
  id: number;
  name: string;
}

const handle = ref<SPopUpMenuHandle | null>(null);
const message = ref("在下面的区域里点右键，或者点「键盘打开」");

const options: SPopUpMenuOptions<RowContext> = {
  minWidth: 160,
  context: { id: 42, name: "合同 A" },
  closeOnClick: true,
  onError: (error, item) => {
    message.value = `onError（${item?.label ?? "菜单"}）：${String(error)}`;
  }
};

const items: Array<SPopUpMenuItemOptions<RowContext>> = [
  {
    label: "查看详情",
    // 名字先在本包图标集里查，查不到再交给 Vue 的全局注册表
    icon: "IconData",
    command: ({ name }) => {
      message.value = `查看详情：${name}`;
    }
  },
  {
    label: "复制 ID",
    icon: "IconCard",
    command: ({ id }) => {
      message.value = `复制 ID：${id}`;
    }
  },
  { label: "", separator: true },
  {
    label: "删除",
    icon: "IconDeleteRow",
    danger: true,
    command: () => {
      message.value = "已请求删除，菜单会关闭";
    }
  }
];

/** 事件既提供了打开位置，也是 Floating UI 的参考点。 */
function openAt(event: MouseEvent): void {
  handle.value = createContextMenu<RowContext>(options, items, event);
}

/** 不传指针：菜单锚定到当前获得焦点的元素，适合键盘调用。 */
function openHere(): void {
  handle.value = createContextMenu<RowContext>(options, items);
}

/** 关闭是幂等的：连调两次不会出错，isOpen 也会立刻变成 false。 */
function closeFromHandle(): void {
  message.value = `close() 之前 isOpen = ${handle.value?.isOpen}`;
  handle.value?.close();
  handle.value?.close();
  message.value += `，之后 isOpen = ${handle.value?.isOpen}`;
}
</script>

<template>
  <div class="stack">
    <div class="zone" @contextmenu.prevent="openAt">在这里点右键</div>

    <p class="actions">
      <button type="button" @click="openHere">键盘打开</button>
      <button type="button" @click="closeFromHandle">handle.close()（幂等）</button>
      <button type="button" @click="closeAllContextMenus()">closeAllContextMenus()</button>
    </p>

    <p class="message">{{ message }}</p>
  </div>
</template>

<style scoped>
.zone {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88px;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  user-select: none;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}

.actions button {
  padding: 3px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.message {
  margin: 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>
