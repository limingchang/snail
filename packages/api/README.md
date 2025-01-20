### 项目结构
- cache 缓存管理器
- core 核心功能，提供Snail类和Api类
- typings 类型定义
- utils 公共方法
- versing api版本管理器

### 项目功能
- 项目基于axios二次开发
- 创建Snail实例，传入基本配置
 - 配置项：
```
baseUrl：api地址,类型：string
timeout：超时(ms)，类型：number
requestIntercept?：Axios请求拦截器，类型和Axios拦截器一致
responstIntercept?：Axios响应拦截器，类型和Axios拦截器一致
Versioning?：版本管理器,类型：VersioningConfig(typings/versioning.config.ts)
CacheManage?：缓存管理 ,类型：MemoryCacheConfig(typings/cache.management.config.ts)
```

- 创建请求Api实例，传入请求配置
- 配置项：
```
url：请求地址
timeout?:超时,覆盖Snail实例的timeout
pipes?：请求前数据处理，在Axios请求拦截器前触发
version?：请求版本，覆盖Snail实例的versing.defaultVersion项
transformer?：响应数据翻译器，在Axios响应拦截器后触发
```

### 生命周期
1. 创建Snail实例
2. 配置Axios实例
3. 配置版本管理器
4. 配置缓存管理器
5. Snail实例暴露请求方法（Get、Put、Head、Catch、Delete、Options），返回Api类实例
6. 合并Api配置，如:API单独设置的timeout
7. 执行版本管理器
8. 执行pipes,请求前处理（处理数据、head等）
9. Axions请求拦截
10. 执行Axions请求
11. Axions响应拦截
12. 判断返回类型是否是json
13. 非json数据直接返回
14. json数据{code:number,message:string,data:any}执行错误捕捉,code==0无错误，非0有错误
15. 无错误，执行transformer，返回{error:null,data:transformer后的数据}
16. 有错误，返回{error,data:null}
