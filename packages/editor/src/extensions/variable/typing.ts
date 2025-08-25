export enum VariableType {
  Text = "text",
  Number = "number",
  Boolean = "boolean",
  Object = "object",
  Array = "array",
  Date = "date",
}

export type TOptions = {
  name: string;
  type: VariableType;
  key: string;
  desc: string;
  defaultValue: any;
  value?: any;
};

// 字体大小与pt对应关系
export const FontSizeList = {
  一号: "26pt",
  小一: "24pt",
  二号: "22pt",
  小二: "18pt",
  三号: "16pt",
  小三: "15pt",
  四号: "14pt",
  小四: "12pt",
  五号: "10.5pt",
  小五: "9pt",
};

// 常用中文字体名称与fontFamily对应关系
export const FontFamilyList = {
  宋体: "SimSun, serif",
  黑体: "SimHei, sans-serif",
  微软雅黑: "Microsoft YaHei, sans-serif",
  微软正黑: "Microsoft JhengHei, sans-serif",
  楷体: "KaiTi, serif",
  仿宋: "FangSong, serif",
  隶书: "LiSu, serif",
  幼圆: "YouYuan, sans-serif",
  // 公文常用GB2132字体
  仿宋_GB2312: "FangSong_GB2312, serif",
  楷体_GB2312: "KaiTi_GB2312, serif",
  黑体_GB2312: "Heiti_GB2312, sans-serif",
  宋体_GB2312: "SimSun_GB2312, serif",
};
