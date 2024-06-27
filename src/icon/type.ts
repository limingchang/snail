// 引入图标元数据
import iconFontMeta from './iconFont/iconfont.json'

const icons = iconFontMeta.glyphs.map(icon => `${iconFontMeta.css_prefix_text}${icon.font_class}`)

enum EIcons<T>{
  [typeof keyof  T]: string
}

type Icons = EIcons<icons>

export interface IconPropsType {
  icon: typeof icons;
  class?: string;
  color?: string;
}
