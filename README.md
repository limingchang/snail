# Vue 3 + TypeScript 组件库

## 组件库
<img src="https://img.shields.io/npm/v/%40snail-js%2Fvue?&label=%40snail-js%2Fvue&labelColor=1e80ff&color=67C23A&link=https%3A%2F%2Fgitee.com%2Flimich%2Fsnail"></img>

- [@snail-js/vue](./packages/vue/)



## Api请求库
<img src="https://img.shields.io/npm/v/%40snail-js%2Fapi?label=%40snail-js%2Fapi&labelColor=1e80ff&color=67C23A"></img>

- [@snail-js/api](./packages/api/)

- 以`reflect-metadata`为核心的装饰器风格创建请求

- 以`axios`为请求基本库，提供：

  - 请求类型装饰器`@Get,@Post,@Head,@Put,@Delete,@Patch,@Options`
  - 请求参数装饰器`@Params、@Data`
  - 请求策略装饰器`@UseStrategy`
  - 缓存控制装饰器`@Cache`
  - 版本管理装饰器`@Versioning`和`@Version`