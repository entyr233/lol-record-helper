export const API_ERROR = {
  /** 未登录 / 登录态失效（旧接口实测返回） */
  UNAUTHENTICATED: 8000102,
  /** 战绩被隐藏 */
  HIDDEN: "WG_COMM_ERR_USER_CONFIG_LIMIT"
} as const;

/**
 * 服务端错误码 → 可读文案。
 * 前 6 条来自 WeGame LOL 助手前端（2026 年版）内置的映射表，其余为本项目补充。
 */
const FRIENDLY: Record<string, string> = {
  "8000004": "当前大区没有查询到角色，请更换大区重试",
  "8000009": "这位召唤师设置了查询权限",
  "8000021": "这位召唤师设置了查询权限",
  "8000022": "需要人机校验，请先在 LOL 助手页刷新后重试",
  "8000023": "该用户已注销",
  "8000101": "请求被拒绝（参数不合法），请重新选择区服后重试",
  "8000102": "登录状态已失效，请在 WeGame 页面重新登录"
};

export class ApiError extends Error {
  readonly code: number | string;
  readonly method: string;
  /** 服务端原文（可能为空） */
  readonly serverMessage: string;

  constructor(code: number | string, method: string, message?: string) {
    // 映射表优先（服务端常返回 WG_COMM_ERR_XXX 这类不可读码串），服务端文案兜底
    super(FRIENDLY[String(code)] || message || "请求失败(" + method + "，" + code + ")");
    this.name = "ApiError";
    this.code = code;
    this.method = method;
    this.serverMessage = message || "";
  }

  get needsCaptcha(): boolean {
    return String(this.code) === "8000022";
  }

  get isUnauthenticated(): boolean {
    return String(this.code) === String(API_ERROR.UNAUTHENTICATED);
  }

  get isHidden(): boolean {
    return String(this.code).includes(String(API_ERROR.HIDDEN));
  }

  /** 给 UI 的诊断串：文案 + 错误码 + 接口名 */
  get displayMessage(): string {
    const code = String(this.code);
    const base = this.message;
    return code && code !== "undefined" ? base + "（错误码 " + code + "）" : base;
  }
}

export function isAbortError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { name?: string }).name === "AbortError";
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.displayMessage;
  if (error instanceof Error) return error.message;
  return String(error);
}
