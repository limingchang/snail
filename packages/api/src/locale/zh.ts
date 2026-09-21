import type { SnailMessages } from "./types";

/**
 * 中文（zh-CN）消息目录。
 *
 * 键为点分路径，模板中的 `%s` 会按位置被 `t()` 的参数替换。
 *
 * Chinese (zh-CN) message catalogue.
 */
const zh: SnailMessages = {
  // decorator misuse / 装饰器误用
  "error.decorator.method.duplicate": "方法[%s]上只能使用一个请求方式装饰器（@Get/@Post/...）",
  "error.decorator.method.missing": "方法[%s]缺少请求方式装饰器（@Get/@Post/...），无法发送请求",
  "error.decorator.param.context": "@%s 只能用于类的实例方法参数，不能用于构造函数或静态成员",
  "error.decorator.param.empty": "方法[%s]的参数标记错误：未传入 key 时该参数必须是普通对象",
  "error.decorator.param.untyped": "参数装饰器 @%s 需要一个字符串 key，或省略 key 以展开整个对象",
  "error.decorator.class.target": "@%s 只能用于类",
  "error.decorator.server.notFound": "接口类[%s]缺少 @Api() 装饰器",
  "error.decorator.stream.duplicate": "类[%s]上只能使用一个连接类装饰器（@Sse/@WebSocket）",

  // options / 选项
  "error.options.server.missing": "服务类[%s]缺少 @Server() 装饰器",
  "error.options.server.baseURL": "@Server() 的 baseURL 必须是非空字符串",
  "error.options.api.url": "@Api() 的 url 必须是字符串",
  "error.options.plugin.notFound": "插件[%s]未在服务[%s]上注册",
  "error.options.plugin.missing": "插件[%s]依赖的插件[%s]尚未注册，请先 use() 它",
  "error.options.plugin.exists": "插件[%s]已在服务[%s]上注册，请勿重复注册",

  // hooks / 生命周期钩子
  "error.hook.next.multiple": "插件[%s]的 %s 钩子多次调用了 next()",
  "error.hook.unknown": "未知的插件生命周期钩子[%s]",

  // request / response / 请求与响应
  "error.request.failed": "[%s] 请求失败：%s",
  "error.request.timeout": "[%s] 请求超时（%sms）",
  "error.request.cancelled": "[%s] 请求已取消",
  "error.response.code": "[%s] 业务状态码校验未通过：code=%s",
  "error.response.shape": "[%s] 服务端返回数据不符合约定结构：缺少字段[%s]",
  "error.response.json": "[%s] 服务端返回的 JSON 解析失败：%s",

  // path params / 路径参数
  "error.path.missing": "路由[%s]中的占位符[:%s]没有对应的参数值，请在方法参数上添加 @Params('%s')",

  // plugins / 插件
  "error.plugin.validate.request": "[%s] 请求数据校验失败",
  "error.plugin.validate.response": "[%s] 响应数据校验失败",
  "error.plugin.transform": "[%s] 数据转换失败：%s",
  "error.plugin.cache.adapter": "未知的缓存适配器[%s]，可选：memory、localStorage、sessionStorage、indexedDB",

  // info / 提示信息
  "info.request.start": "→ %s %s [%s]",
  "info.request.success": "← %s %s [%s] %s",
  "info.request.codeError": "← %s %s [%s] 业务码异常 %s",
  "info.request.error": "← %s %s [%s] %s",
  "info.cache.hit": "[%s] 缓存命中",
  "info.cache.set": "[%s] 写入缓存",
  "info.cache.invalidate": "[%s] 缓存失效（失效源：%s）",
  "info.version.default": "[%s] 使用默认版本 %s",
  "info.version.change": "[%s] 版本切换到 %s",
  "warn.version.change": "[%s] 版本与默认版本不一致：%s → %s",
  "info.sse.open": "[%s] SSE 连接已建立",
  "info.sse.close": "[%s] SSE 连接已关闭",
  "info.ws.open": "[%s] WebSocket 连接已建立",
  "info.ws.close": "[%s] WebSocket 连接已关闭（code=%s）"
};

export default zh;
