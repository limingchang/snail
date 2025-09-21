import { NodeViewRenderer, NodeConfig } from "@tiptap/core";
import { defaultMargins } from "../constant/defaultMargins";
export const PageContentView: NodeConfig["addNodeView"] = () => {
  return ({ editor, node, getPos }) => {
    // 创建页面内容容器
    const pageContent = document.createElement("div");
    pageContent.classList.add("page-content");
    // 获取当前总页数
    const total = editor.$nodes("paper")?.length || 0;
    pageContent.setAttribute("data-index", total.toString());
    // 样式设置

    // console.log("page-content", editor.$pos(getPos() || 1));
    const pageNodePos = editor.$pos(getPos() || 1);
    const  margins  = pageNodePos.attributes.margins || defaultMargins;
    pageContent.style.padding = `${margins.top} ${margins.right} ${margins.bottom} ${margins.left}`;
    pageContent.style.boxSizing = "border-box";
    pageContent.style.height = "100%";
    // console.log(node.attrs);
    return {
      dom: pageContent,
      contentDOM: pageContent,
    };
  };
};
