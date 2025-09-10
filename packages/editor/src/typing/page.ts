// 页边距预设接口
export interface MarginPreset {
  name: string
  iconClass: string
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

// 纸张方向接口
export interface PaperOrientation {
  value: 'portrait' | 'landscape'
  label: string
  icon: any
}

// 纸张大小接口
export interface PaperSize {
  name: string
  width: number
  height: number
  label: string
}

// 页面设置状态接口
export interface PageSettings {
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
  orientation: 'portrait' | 'landscape'
  paperSize: string
}