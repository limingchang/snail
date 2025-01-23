<template>
  <i class="s-icon" :style="iconStyle" @click="clickhandle">
    <component v-if="icon" :is="icon"></component>
    <slot v-if="!icon"></slot>
  </i>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  color?: string;
  icon?: string
}>();
const emits = defineEmits(["click"]);

const iconStyle = computed(() => {
  return {
    color: props.color || "inherit",
    height: '1em',
    width: '1em'
  };
});

const clickhandle = () => {
  emits("click");
};

defineOptions({
  name: "s-icon",
});
</script>
<style scoped lang="scss"></style>
