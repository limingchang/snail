<script setup lang="ts">
import { ref } from "vue";
import { createContextMenu } from "@snail-js/vue";
import type { SPopUpMenuItemOptions, SPopUpMenuOptions } from "@snail-js/vue";

interface RowContext {
  docId: string;
}

const message = ref("在下面的区域里点右键。权限是异步查的，命令也是异步执行的");

/** 模拟一次慢请求：350ms 后返回结果。 */
function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

const options: SPopUpMenuOptions<RowContext> = {
  minWidth: 200,
  context: { docId: "doc-7" },
  loadingText: "读取权限中…",
  onError: (error, item) => {
    message.value = `onError（${item?.label ?? "菜单"}）：${String(error)}`;
  }
};

const items: Array<SPopUpMenuItemOptions<RowContext>> = [
  {
    label: "编辑",
    // display / enabled 是函数时：这一行先隐藏、先禁用，解析完才出现（fail-closed）
    display: () => delay(true),
    enabled: () => delay(true),
    command: async ({ docId }) => {
      await delay(undefined);
      message.value = `编辑 ${docId} 完成，菜单已关闭`;
    }
  },
  {
    label: "审批",
    display: () => delay(true),
    enabled: () => delay(false), // 解析后置灰：有权限看，没权限点
    command: () => {
      message.value = "不该走到这里";
    }
  },
  {
    label: "归档（一定会失败）",
    display: () => delay(true),
    command: async () => {
      await delay(undefined);
      throw new Error("服务端拒绝了归档");
    }
  },
  {
    label: "导出",
    closeOnClick: false, // 单行覆盖菜单级的 closeOnClick
    command: () => {
      message.value = "导出已排队，菜单保持打开";
    }
  }
];

function openAt(event: MouseEvent): void {
  createContextMenu<RowContext>(options, items, event);
}
</script>

<template>
  <div class="stack">
    <div class="zone" @contextmenu.prevent="openAt">在这里点右键</div>
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

.message {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--vp-c-text-2);
}
</style>
