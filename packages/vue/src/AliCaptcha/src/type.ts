export interface CaptchaConfig {
  captchaId: string;
  product: "bind";
}

export type TCallBack = () => void;
export type TErrorCallBack = (error?: {
  code: number;
  msg: string;
  desc: any;
}) => void;

export interface CaptchaSuccessResult {
  captcha_id: string; //验证ID。
  lot_number: string; //验证流水号。
  captcha_output: string; //验证输出信息。
  pass_token: string; //验证通过标识。
  gen_time: string; //验证通过时间戳。
}

export interface CaptchaObj {
  /**
   * 验证成功
   * @param callback 回调函数
   */
  onSuccess(callback: TCallBack): void;
  /**
   * 获取结果进行服务端二次校验
   */
  getValidate(): CaptchaSuccessResult;
  /**
   *  调起验证码
   */
  showCaptcha(): void;

  // 可选
  /**
   * 按钮DOM生成完毕
   * @param callback 回调函数
   */
  onReady(callback: TCallBack): void;
  /**
   * 验证码下一步资源加载完毕
   * @param callback 回调函数
   */
  onNextReady(callback: TCallBack): void;
  /**
   * 验证失败
   * @param callback 回调函数
   */
  onFail(callback: TCallBack): void;
  /**
   * 验证出错
   * @param callback 回调函数
   */
  onError(callback: TErrorCallBack): void;
  /**
   * 验证被用户关闭
   * @param callback 回调函数
   */
  onClose(callback: TCallBack): void;
  /**
   * 重置验证状态
   */
  reset(): void;
  /**
   * 移除验证实例
   */
  destroy(): void;
}

export type CaptchaHandle = (captchaObj: CaptchaObj) => void;
