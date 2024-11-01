import { createSnailModel } from "../core/snailModel";

// entity 实体类
export const BaseModel = createSnailModel();

@BaseModel({
  name: "User",
  //  可修改基础API路径，可选
  baseUrl: "https://api.example.com",
  // API端点路径，可选，默认使用modelName
  endPoint: "/user",
  // transform: {
  //   // 可覆盖默认转换行为
  //   toJson: (data: any) => {},
  //   fromJsom: (json: any) => {},
  // },
})
class User {
  name: string = "";
}
