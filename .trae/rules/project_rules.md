# Snail-JS 项目开发规范

## 1. 项目架构与组织原则

### 1.1 Monorepo 结构规范
- **工作空间管理**：使用 pnpm workspace 管理多包结构
- **包依赖关系**：内部包使用 `workspace:` 协议进行依赖声明
- **清晰边界**：各包(`@snail-js/vue`, `@snail-js/api`, `@snail-js/shared`)保持职责单一
- **共享代码**：公共工具和类型定义放在 `@snail-js/shared` 包中

### 1.2 目录结构标准

```
snail-js/
├── packages/ # 多包目录
│ ├── vue/ # Vue组件库
│ ├── api/ # 核心API
│ ├── shared/ # 共享工具和类型
│ └── editor-vue/ # Vue编辑器组件
├── examples/ # 开发示例
├── docs/ # 文档网站
├── scripts/ # 构建脚本
└── dist/ # 构建输出目录
```


## 2. 开发与构建规范

### 2.1 开发环境配置
- **ES模块**：使用 `"type": "module"` 支持ES模块
- **现代浏览器**：以支持ES模块的现代浏览器为目标
- **开发服务器**：使用 Vite 作为开发服务器和构建工具

### 2.2 文档开发规范
- Vitepress：使用 Vitepress 构建文档网站
- 开发预览：pnpm run docs:dev 启动文档开发服务器
- 构建发布：pnpm run docs:build 构建生产版本文档

## 3 代码质量与类型安全
#### 3.1 TypeScript 规范
- 严格模式：启用 TypeScript 严格类型检查
- 类型声明：所有包必须提供完整的类型声明文件
- Vue类型：使用 vue-tsc 进行 Vue 组件的类型检查
- 复合构建：使用 --composite false 避免不必要的复合构建

#### 3.2 组件开发规范
- 组合式API：优先使用 Vue 3 组合式 API
- 组件设计：遵循单一职责原则，组件功能专注
- Props设计：使用 TypeScript 接口定义组件 Props 类型
- 事件处理：使用强类型的事件处理系统

### 4. 依赖管理规范
#### 4.1 生产依赖
- Vue 3：使用 Vue 3.5+ 版本
- Element Plus：使用 Element Plus 2.9+ 作为UI基础
- Tiptap：使用 Tiptap 3.0+ 作为富文本编辑器
- Ant Design Vue：使用 Ant Design Vue 4.0+ 作为UI组件库
- 内部包：使用 workspace 协议引用内部包

#### 4.2 开发依赖
- 构建工具：Vite 5.3+ 作为构建工具
- 类型检查：TypeScript 5.5+ 和 vue-tsc 用于类型检查
- 文档工具：Vitepress 1.2+ 用于文档生成
- 脚本工具：tsx 用于运行 TypeScript 脚本

### 5. 组件设计原则
#### 5.1 API 设计原则
- 一致性：保持所有组件API设计风格一致
- 简单性：API设计简单直观，易于理解和使用
- 灵活性：提供适当的配置选项和扩展点
- 可访问性：遵循无障碍访问标准

#### 5.2 样式与主题
- Sass/SCSS：使用 Sass 作为样式预处理器
- 设计令牌：使用统一的颜色、间距、字体等设计令牌
- 主题支持：提供明暗主题切换能力
- 样式封装：使用 CSS Modules 或 Scoped CSS 避免样式冲突


## 子项目说明
- api 子项目，基于`reflect-metadata`封装的类`nestjs`风格的API请求框架
- vue 子项目，基于`vue3`的组件库,不依赖其他基于vue开发的UI框架
- editor 子项目，基于`tiptap`、`vue3`的富文本编辑器

## 项目开发设计模式
- 采用微内核设计模式，将项目的核心功能抽离出来，作为项目的内核，其他功能可以通过插件的方式进行扩展
- 采用面向切面编程设计模式，将项目的核心功能进行切面处理，从而实现项目的功能扩展

## 代码规范
- 完全使用TypeScript开发，对于每个函数、类、接口、类型等都要进行类型标注
- vue组件使用`vue3`的`setup`语法糖开发
