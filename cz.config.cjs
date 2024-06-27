const fs = require('node:fs');
const path = require('node:path');
const packages = fs.readdirSync(path.resolve(__dirname));
const { execSync } = require('child_process');

// precomputed scope
const defaultScope = execSync('git status --porcelain || true')
  .toString()
  .trim()
  .split('\n')
  .find((r) => ~r.indexOf('M  src'))
  ?.replace(/(\/)/g, '%%')
  ?.match(/src%%((\w|-)*)/)?.[1];

const gitStatus = execSync('git status --porcelain || true')
  .toString()
  .trim()
  .split('\n');

const scopeComplete = gitStatus.map((r) => r.replace(/\w  |\w\w /g, ''));
// console.log(gitStatus, scopeComplete);

/** @type {import('cz-git').UserConfig} */
module.exports = {
  // defaultSubject: subjectComplete && `[${subjectComplete}] `,
  defaultScope,
  customScopesAlign: !scopeComplete ? 'top-bottom' : 'bottom',
  scopes: [...scopeComplete],
  messages: {
    type: '选择你要提交的类型 :',
    scope: '选择一个提交范围（可选）:',
    customScope: '请输入自定义的提交范围 :',
    subject: '请简要描述提交(必填) :\n',
    body: '请输入详细描述(可选)。使用 "|" 换行 :\n',
    breaking: '列举非兼容性重大的变更（可选）。使用 "|" 换行 :\n',
    footerPrefixesSelect: '选择关联issue前缀（可选）:',
    customFooterPrefix: '输入自定义issue前缀 :',
    footer: '列举关联issue (可选) 例如: #31, #I3244 :\n',
    confirmCommit: '确认使用以上信息提交？(y/n)：',
  },
  types: [
    {
      value: 'feat',
      name: 'feat:     ✨  新增功能 | A new feature',
      emoji: ':sparkles:',
    },
    {
      value: 'fix',
      name: 'fix:      🐛  修复缺陷 | A bug fix',
      emoji: ':bug:',
    },
    {
      value: 'docs',
      name: 'docs:     📝  文档更新 | Documentation only changes',
      emoji: ':memo:',
    },
    {
      value: 'style',
      name: 'style:    💄  代码格式 | Changes that do not affect the meaning of the code',
      emoji: ':lipstick:',
    },
    {
      value: 'refactor',
      name: 'refactor: ♻️   代码重构 | A code change that neither fixes a bug nor adds a feature',
      emoji: ':recycle:',
    },
    {
      value: 'perf',
      name: 'perf:     ⚡️  性能提升 | A code change that improves performance',
      emoji: ':zap:',
    },
    {
      value: 'test',
      name: 'test:     ✅  测试相关 | Adding missing tests or correcting existing tests',
      emoji: ':white_check_mark:',
    },
    {
      value: 'build',
      name: 'build:    📦️   构建相关 | Changes that affect the build system or external dependencies',
      emoji: ':package:',
    },
    {
      value: 'ci',
      name: 'ci:       🎡  持续集成 | Changes to our CI configuration files and scripts',
      emoji: ':ferris_wheel:',
    },
    {
      value: 'chore',
      name: "chore:    🔨  构建/工程依赖/工具 | Other changes that don't modify src or test files",
      emoji: ':hammer:',
    },
    {
      value: 'revert',
      name: 'revert:   ⏪️  回退代码 | Reverts a previous commit',
      emoji: ':rewind:',
    },
    {
      value: 'config',
      name: 'config:   🔧  配置修改 | Reverts a previous commit',
      emoji: ':wrench:',
    },
  ],
  useEmoji: true,
  emojiAlign: 'left',
  enableMultipleScopes: true, // 是否开启在选择 模块范围 时使用多选模式
  allowCustomScopes: true, // 是否在选择 模块范围 显示自定义选项
};
