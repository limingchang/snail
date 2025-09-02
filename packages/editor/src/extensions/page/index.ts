import { Node, mergeAttributes } from "@tiptap/core";

import { PageOptions } from "./typing";
// import { PageStorage } from '../../typing';

import { PageHeader } from "./pageHeader/index";
import { PageFooter } from "./pageFooter/index";
import {
  HeaderFooterLeft,
  HeaderFooterCenter,
  HeaderFooterRight,
  PageContent,
} from "./content";

export const Page = Node.create<PageOptions>({
  name: "page",
  // 页面可以包含多个块级元素，如段落、标题等
  content: "(pageHeader | block | pageFooter)+",

  // 页面属于block组，使其可以作为文档的直接子元素
  group: "block",

  // 不是顶级节点，顶级节点仍然是doc
  topNode: false,
  // 优先级高于其他块级元素，确保页面在文档结构中正确排序
  priority: 10002,

  addOptions() {
    return {
      pageHeaderText: "",
      pageHeaderHeight: 30,
      pageHeaderPositon: "left",
      pageHeaderLine: false,
      pageFooterText: "",
      pageFooterHeight: 30,
      pageFooterPositon: "center",
      pageFooterLine: false,
      HTMLAttributes: {},
    };
  },

  // 监听文档变化
  onUpdate({ editor }) {
    const total = editor.$nodes("page")?.length || 0;
    console.log("total[page-update]", total);
    // 延迟触发更新，避免频繁计算
    // setTimeout(() => {
    //   const storage = this.storage as any;
    //   storage.triggerPageUpdate();
    // }, 100);
  },

  onCreate() {
    // 初始化时计算页码
    // setTimeout(() => {
    //   const storage = this.storage as any;
    //   storage.triggerPageUpdate();
    // }, 0);
  },

  addExtensions() {
    return [
      PageHeader.configure({
        height: this.options.pageHeaderHeight,
        position: this.options.pageHeaderPositon,
        underline: this.options.pageHeaderLine,
        text: this.options.pageHeaderText,
      }),
      PageFooter.configure({
        height: this.options.pageFooterHeight,
        position: this.options.pageFooterPositon,
        upline: this.options.pageFooterLine,
        text: this.options.pageFooterText,
      }),
      HeaderFooterLeft,
      HeaderFooterCenter,
      HeaderFooterRight,
      PageContent,
    ];
  },

  addAttributes() {
    return {
      // 添加自定义属性
      index: {
        default: 0,
      },
      marginTop: {
        default: "19mm",
        parseHTML: (element) => element.getAttribute("margin-top"),
        renderHTML: (attributes) => ({
          style: `margin-top: ${attributes.padding}`,
        }),
      },
      marginBottom: {
        default: "19mm",
        parseHTML: (element) => element.getAttribute("margin-bottom"),
        renderHTML: (attributes) => ({
          style: `margin-bottom: ${attributes.padding}`,
        }),
      },
      marginLeft: {
        default: "20mm",
        parseHTML: (element) => element.getAttribute("margin-left"),
        renderHTML: (attributes) => ({
          style: `margin-left: ${attributes.padding}`,
        }),
      },
      marginRight: {
        default: "20mm",
        parseHTML: (element) => element.getAttribute("margin-right"),
        renderHTML: (attributes) => ({
          style: `margin-right: ${attributes.padding}`,
        }),
      },
    };
  },

  addNodeView() {
    return ({ editor, node }) => {
      // 创建页面容器
      const pageContiner = document.createElement("div");
      pageContiner.classList.add("tiptap-page-wrapper");
      // 样式
      pageContiner.style.position = "relative";
      pageContiner.style.width = "100%";
      pageContiner.style.overflow = "hidden";
      pageContiner.style.height = "100%";

      // 创建内容容器
      const contentArea = document.createElement("div");
      contentArea.classList.add("tiptap-page");
      // 设置边距
      const marginTop = node.attrs.marginTop;
      contentArea.style.marginTop = `calc(${marginTop} - ${this.options.pageHeaderHeight || 0}px)`;
      const marginBottom = node.attrs.marginBottom;
      contentArea.style.marginBottom = `calc(${marginBottom} - ${this.options.pageFooterHeight || 0}px)`;
      contentArea.style.marginLeft = node.attrs.marginLeft;
      contentArea.style.marginRight = node.attrs.marginRight


      pageContiner.appendChild(contentArea);

      return {
        dom: pageContiner,
        contentDOM: contentArea,
      };
    };
  },
  // 解析HTML
  parseHTML() {
    return [
      {
        tag: "page",
      },
    ];
  },
  // 渲染HTML
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page",
      }),
    ];
  },

  addGlobalAttributes() {
    return [
      {
        types: ["page"],
        attributes: {
          padding: {
            default: "20",
            parseHTML: (element) => element.getAttribute("padding"),
            renderHTML: (attributes) => ({
              style: `margin: ${attributes.padding}mm`,
            }),
          },
        },
      },
    ];
  },
});
