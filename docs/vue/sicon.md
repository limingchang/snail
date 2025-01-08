# 小图标组件

## 描述

小图标组件，用于显示小图标，支持自定义图标。

## 使用方法

- 在页面中引入组件：

```html
<SIcon icon="icon-hetongqianshu"></SIcon>
```

- 点击下列图标可复制 icon 名称

<div class='icon-box'>
  <div v-for="(icon,index) in IconNames" :key="index" class='icon-item'>
    <SIcon :icon="icon" class='icon'></SIcon>
    <span class='text'>{{ icon }}</span>
    <SClickCopy :text='icon' :display='false'></SClickCopy>
  </div>
</div>

## 可用图标

- 兼容 Element Plus 图标库, 可直接使用
- `icon`传入对应的图标名称即可
- 兼容阿里矢量图标库, 可直接使用
- `icon`传入对应的图标名称即可

## 可选属性

- `icon` 图标名称
- `size` 图标大小，类型：`large`,`normal`,`small`

<script setup>
import { SIcon,SClickCopy } from "@snail-js/vue";
import { IconNames } from "@snail-js/theme-chalk"
</script>

<style scoped lang='scss'>
.icon-box {
  width: 660px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  .icon-item {
    width: 110px;
    height: 120px;
    margin-top: -1px;
    margin-left: -1px;
    cursor: pointer;
    border: 1px solid #333;
    text-align: center;
    .icon {
      display: inline-block;
      width: 100%;
      text-align: center;
    }
    .text {
      font-size: 0.8em;
      overflow-wrap: break-word;
      display: inline-block;
      width: 100%;
    }
  }
} 
</style>
