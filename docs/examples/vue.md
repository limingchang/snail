# Vue 3 完整示例

一个可以照抄的最小 Vue 3 应用：服务定义、api 定义、一个通用组合式函数，以及视图层。
全文只用核心能力（不依赖任何可选插件）。

## 目录结构

```text
src/
  service.ts             # server 实例
  api/
    user.api.ts          # api 类与代理
  composables/
    useMethod.ts         # 基于 SnailMethod 的组合式函数
  views/
    UserList.vue         # 视图
```

## 1. `src/service.ts`

```ts
import { Server, SnailServer } from "@snail-js/api";

@Server({
  baseURL: import.meta.env.VITE_API_BASE ?? "/api",
  timeout: 10000,
  logLevel: import.meta.env.DEV ? "warn" : "silent"
})
class BackEnd extends SnailServer {}

export const Service = new BackEnd();
```

## 2. `src/api/user.api.ts`

```ts
import { Api, Data, Delete, Get, Params, Post, Put, Query } from "@snail-js/api";
import { Service } from "../service";

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Page<T> {
  total: number;
  items: T[];
}

export interface QueryUser {
  page: number;
  size: number;
  keyword?: string;
}

@Api("/user")
class UserApi {
  @Get("/")
  list(@Query() query: QueryUser): Promise<Page<User>> {
    return null!;
  }

  @Get("/:id")
  detail(@Params("id") id: string): Promise<User> {
    return null!;
  }

  @Post("/")
  create(@Data() body: Omit<User, "id">): Promise<User> {
    return null!;
  }

  @Put("/:id")
  update(@Params("id") id: string, @Data() body: Partial<User>): Promise<User> {
    return null!;
  }

  @Delete("/:id")
  remove(@Params("id") id: string): Promise<null> {
    return null!;
  }
}

export const userApi = Service.createApi(UserApi);
```

## 3. `src/composables/useMethod.ts`

被装饰的方法返回的是 `SnailMethod`（还没发请求），所以「取句柄 → 订阅事件 → 发送」可以自然地
包进一个组合式函数。这里用 Vue 的 `ref` 保存要渲染的状态：

```ts
import type { SnailEnvelopeSchema, SnailMethod } from "@snail-js/api";
import { onScopeDispose, ref, type Ref } from "vue";

/**
 * 把任意一个被装饰的 api 方法包成「data / loading / error + run」。
 *
 * 每次 run() 都会新建一个 SnailMethod，因此不会和上一次请求共享状态；
 * 作用域销毁时会 abort 进行中的请求并取消所有事件订阅。
 */
export function useMethod<TArgs extends unknown[], TData>(
  factory: (...args: TArgs) => SnailMethod<SnailEnvelopeSchema, TData>
) {
  const data = ref<TData>() as Ref<TData | undefined>;
  const loading = ref(false);
  const error = ref<unknown>();

  let current: SnailMethod<SnailEnvelopeSchema, TData> | undefined;
  let offs: Array<() => void> = [];

  async function run(...args: TArgs): Promise<TData | undefined> {
    loading.value = true;
    error.value = undefined;

    // 同一时刻只保留最新一次请求
    current?.abort();
    offs.forEach((off) => off());
    offs = [];

    const method = factory(...args);
    current = method;

    offs.push(
      method.onSuccess((result) => {
        data.value = result.data;
      }),
      method.onError((err) => {
        error.value = err;
      }),
      method.onFinish(() => {
        loading.value = false;
      })
    );

    try {
      const result = await method.send();
      return result.data;
    } catch {
      // 失败已经通过 onError 上报，这里只负责让调用方拿到 undefined
      return undefined;
    }
  }

  function abort(): void {
    current?.abort();
  }

  onScopeDispose(() => {
    abort();
    offs.forEach((off) => off());
    offs = [];
  });

  return { data, loading, error, run, abort };
}
```

::: tip 为什么要 `onFinish` 而不是在 `try/finally` 里收尾
`onFinish` 在 `finally` 里触发，**取消**（`abort()`）也会走到，所以「关闭 loading」这件事只写
一次就够。这也是把 `loading` 放在事件里而不是 `try` 块里的原因。
:::

## 4. `src/views/UserList.vue`

```vue
<script setup lang="ts">
import { ref, watch } from "vue";
import { userApi, type QueryUser } from "../api/user.api";
import { useMethod } from "../composables/useMethod";

const query = ref<QueryUser>({ page: 1, size: 20, keyword: "" });

const { data, loading, error, run } = useMethod(userApi.list);

watch(query, (value) => void run({ ...value }), {
  immediate: true,
  deep: true
});
</script>

<template>
  <section>
    <input v-model="query.keyword" placeholder="搜索用户名" />

    <p v-if="loading">加载中…</p>
    <p v-else-if="error">请求失败，请稍后重试</p>

    <ul v-else>
      <li v-for="user in data?.items ?? []" :key="user.id">
        {{ user.name }} —— {{ user.email }}
      </li>
    </ul>

    <footer v-if="data">共 {{ data.total }} 条</footer>
  </section>
</template>
```

## 5. 写操作：表单提交

写操作通常不需要 `loading` 之外的状态，直接拿 `SnailMethod` 用即可：

```vue
<script setup lang="ts">
import { ref } from "vue";
import { userApi, type User } from "../api/user.api";

const name = ref("");
const email = ref("");
const submitting = ref(false);
const created = ref<User>();

async function submit(): Promise<void> {
  submitting.value = true;

  const method = userApi.create({ name: name.value, email: email.value });
  method.onError((error) => console.error("创建失败", error));

  try {
    created.value = (await method.send()).data;
    name.value = "";
    email.value = "";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form @submit.prevent="submit">
    <input v-model="name" placeholder="姓名" />
    <input v-model="email" placeholder="邮箱" />
    <button :disabled="submitting">创建</button>
  </form>
  <p v-if="created">已创建 #{{ created.id }}</p>
</template>
```

## 6. 组件卸载时的取消

`useMethod` 已经用 `onScopeDispose` 处理了。手写时请自己收尾：

```ts
import { onBeforeUnmount } from "vue";

const method = userApi.list({ page: 1, size: 20 });
void method.send();

onBeforeUnmount(() => {
  method.abort();   // send() 会以 SnailCancelledError reject，这是预期控制流
});
```

::: warning 取消会让 `send()` reject
`abort()` 之后 `send()` 抛 `SnailCancelledError`。不要让这个错误冒泡成「请求失败」的提示 ——
它在语义上是「这次请求不再需要了」。详见[错误处理](/guide/errors#取消)。
:::

## 7. 可选：让插件帮你管理响应式状态

上面的组合式函数是手写版本。本库也提供了框架适配器插件：

```ts
import { VueAdapter } from "@snail-js/api/plugins/vue";

Service.use(VueAdapter());
```

它通过插件的 `initMeta` 钩子把 server 声明的 `data` / `code` / `message` 与固定的
`loading` / `error` 直接挂到 `method.meta` 上，成为 `ref`。注意它**不在**
`@snail-js/api/plugins` 里 —— 那个 barrel 一旦静态引入 `vue`，只想要 `Cache` 的应用就会被拖上
Vue。参考手册见[框架适配器](/guide/adapters)；本页的组合式函数与它并不冲突，两者可以共存。
