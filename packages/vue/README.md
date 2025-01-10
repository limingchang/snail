## `Snail-js`Vue组件库

### Why it's snail?
- Is it slow?
- no! because it's my son's nickname!
- I love my son and daughter,They always give me the motivation to programing.

### 介绍
- 基于Vue3开发的组件库
- 主要用于个人项目开发

### 安装
- npm 安装
`npm install @snail-js/vue`
- pnpm 安装
`pnpm install @snail-js/vue`

### 安装主题文件
- `npm install @snail-js/theme`
- `pnpm install @snail-js/theme`

### 使用
- main.ts
```ts
import '@snail-js/vue/index.css'
import "@snail-js/theme"
```

> 请先安装主题样式库`@snail-js/theme`

#### 若使用图标组件，请在使用页面添加如下代码
```html
<style lang="scss">
@use "@snail-js/theme/iconfont"
</style>
```

### 组件列表
- AliCaptcha 阿里图形验证码
- SIcon 图标组件
 - SElIcon 兼容Element Plus图标，可传入Element Plus图标/图标组件，也可使用iconfont图标
- SClickCopy 复制组件
- SWordCloud 3D旋转立体词云组件


### 代码仓库
- [gitee](https://gitee.com/limich/snail.git)


### 组件库文档
- 已发布，待部署

### 作者
- mc.lee