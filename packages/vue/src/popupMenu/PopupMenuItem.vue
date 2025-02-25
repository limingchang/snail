<template>
  <div v-if="itemDisplay" class="s-pop-up-menu-item" :class="setClass" @click="handleClick">
    <SIcon v-if="props.options.icon">
      <component :is="props.options.icon"></component>
    </SIcon>
    <span class="item-label">{{ props.options.label }}</span>
    <SIcon v-if="props.options.children" icon="CaretRight"></SIcon>
    <ul v-if="itemEnabled && props.options.children" class="child-item s-pop-up-menu">
      <slot name="child"></slot>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { SIcon } from "../icon";

interface ItemOptions {
  icon?: string;
  label: string;
  display: () => Promise<boolean>;
  enabled: () => Promise<boolean>;
  handle: () => any;
  children?: boolean
}

const props = defineProps<{
  options: ItemOptions
}>()

const itemEnabled = ref(true);
const itemDisplay = ref(true);
const hasChild = ref(false)

const setClass = computed(() => {
  const itemClass = {
    "item-disabled": !itemEnabled.value,
    "item-enabled": itemEnabled.value,
  };
  return itemClass;
});

onMounted(() => {
  props.options.display().then((data) => {
    itemDisplay.value = data
  });
  props.options.enabled().then((data) => {
    itemEnabled.value = data
  });
  hasChild.value = props.options.children ? true : false
});

const handleClick = () => {
  if (itemEnabled.value && !props.options.children) {
    props.options.handle()
  }
}

</script>

<style scoped></style>
