export interface Mark {
  type: string
}

export interface Content {
  type: string
  attrs?: Record<string, any>
  content?: Content[] | string
  marks?: Mark[]
  text?: string
}