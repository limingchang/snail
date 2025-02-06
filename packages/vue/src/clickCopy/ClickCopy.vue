<template>
  <div ref="clickCopyRef" class="s-click-copy" @click="handleCopy">
    <SIcon>
      <IconCopy />
    </SIcon>
    <span>{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { SIcon } from "../icon";
import { IconCopy } from "../icon/icons";

// const clickCopyRef = useTemplateRef("clickCopyRef");
const clickCopyRef = ref(null)

const props = defineProps({
  label: {
    type: String,
    default: () => "复制",
  },
  text: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    default: () => "复制成功",
  },
});

onMounted(() => {
  const parent = (clickCopyRef.value! as HTMLElement).parentElement!;
  // console.log(parent);
  parent.classList.add("s-click-copy-parent");
});

const handleCopy = async () => {
  await navigator.clipboard.writeText(props.text);
  ElMessage.success({
    message: props.message || "复制成功",
  });
};

defineOptions({
  name: "s-click-copy",
});
</script>

<style lang="scss" scoped></style>
