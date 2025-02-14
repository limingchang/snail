import { Strategy } from "../typings";
// 内置JWT策略
export class JwtStrategy implements Strategy {
  async applyRequest(request: any) {
    return {
      ...request,
      headers: {
        ...request.headers,
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    };
  }
}
